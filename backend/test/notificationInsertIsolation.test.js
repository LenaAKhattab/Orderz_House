/**
 * Best-effort notification INSERT isolation: a failing notification write inside a business transaction rolls
 * back to its own SAVEPOINT instead of aborting the transaction (PostgreSQL semantics simulated below; the real
 * PostgreSQL proof runs on Staging). Also: field limits / Unicode normalization, bounded sanitized logging,
 * afterCommit consistency across savepoints, and source guards.
 * Run: node --test test/notificationInsertIsolation.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/notification_insert_isolation_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const afterCommit = require("../src/config/afterCommit");

const SRC = path.join(__dirname, "..", "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

/**
 * Minimal PostgreSQL transaction simulator: after a failed statement the transaction is aborted — every
 * statement except ROLLBACK / ROLLBACK TO SAVEPOINT fails with 25P02 and COMMIT answers ROLLBACK.
 * Savepoints snapshot business + notification rows. `failInsert(params)` decides which notification INSERT fails.
 */
function pgSim({ failInsert = () => false } = {}) {
  const committed = { business: [], notifications: [] };
  const statements = [];
  let tx = null;
  let id = 0;
  const pgError = (code, message) => Object.assign(new Error(message), { code });
  const all = () => [...committed.notifications, ...(tx ? tx.notifications : [])];
  async function query(sql, params = []) {
    const text = String(typeof sql === "string" ? sql : sql.text).trim();
    const U = text.replace(/;\s*$/, "").replace(/\s+/g, " ").toUpperCase();
    statements.push(U);
    if (U === "BEGIN") {
      tx = { status: "active", business: [], notifications: [], savepoints: [] };
      return { command: "BEGIN", rows: [] };
    }
    if (U === "COMMIT") {
      if (!tx) return { command: "COMMIT", rows: [] };
      const ok = tx.status === "active";
      if (ok) {
        committed.business.push(...tx.business);
        committed.notifications.push(...tx.notifications);
      }
      tx = null;
      return { command: ok ? "COMMIT" : "ROLLBACK", rows: [] };
    }
    if (U === "ROLLBACK") {
      tx = null;
      return { command: "ROLLBACK", rows: [] };
    }
    let m = U.match(/^ROLLBACK TO SAVEPOINT (\w+)$/);
    if (m && tx) {
      const at = tx.savepoints.map((s) => s.name).lastIndexOf(m[1]);
      if (at < 0) {
        tx.status = "failed";
        throw pgError("3B001", "savepoint does not exist");
      }
      const sp = tx.savepoints[at];
      tx.business.length = sp.b;
      tx.notifications.length = sp.n;
      tx.savepoints.length = at + 1;
      tx.status = "active";
      return { command: "ROLLBACK", rows: [] };
    }
    if (tx && tx.status === "failed") throw pgError("25P02", "current transaction is aborted");
    m = U.match(/^SAVEPOINT (\w+)$/);
    if (m) {
      if (!tx) throw pgError("25P01", "SAVEPOINT can only be used in transaction blocks");
      tx.savepoints.push({ name: m[1], b: tx.business.length, n: tx.notifications.length });
      return { command: "SAVEPOINT", rows: [] };
    }
    m = U.match(/^RELEASE SAVEPOINT (\w+)$/);
    if (m) {
      const at = tx ? tx.savepoints.map((s) => s.name).lastIndexOf(m[1]) : -1;
      if (at < 0) {
        if (tx) tx.status = "failed";
        throw pgError("3B001", "savepoint does not exist");
      }
      tx.savepoints.length = at;
      return { command: "RELEASE", rows: [] };
    }
    if (/^INSERT INTO NOTIFICATIONS\b/.test(U)) {
      const rows = [];
      for (let i = 0; i < params.length; i += 12) {
        const p = params.slice(i, i + 12);
        if (failInsert(p)) {
          if (tx) tx.status = "failed";
          throw pgError("23503", "insert or update on table violates foreign key constraint");
        }
        if (/ON CONFLICT/.test(U) && p[11] && all().some((n) => n.dedupe_key === p[11])) continue;
        id += 1;
        rows.push({ id, recipient_user_id: p[0], recipient_role: p[1], actor_user_id: p[2], type: p[3], title: p[4], message: p[5], entity_type: p[6], entity_id: p[7], link: p[8], priority: p[9], metadata: JSON.parse(p[10]), dedupe_key: p[11] });
      }
      (tx ? tx.notifications : committed.notifications).push(...rows);
      return { command: "INSERT", rows, rowCount: rows.length };
    }
    if (/^SELECT \* FROM NOTIFICATIONS WHERE DEDUPE_KEY/.test(U)) {
      return { command: "SELECT", rows: all().filter((n) => n.dedupe_key === params[0]).slice(0, 1) };
    }
    if (/^INSERT INTO BUSINESS\b/.test(U)) {
      (tx ? tx.business : committed.business).push(params[0]);
      return { command: "INSERT", rows: [], rowCount: 1 };
    }
    if (/^SELECT 1\/0/.test(U)) {
      if (tx) tx.status = "failed";
      throw pgError("22012", "division by zero");
    }
    if (/^SELECT DISTINCT U.ID/.test(U)) return { command: "SELECT", rows: [{ id: 11 }, { id: 12 }] };
    return { command: U.split(" ")[0], rows: [] };
  }
  return {
    client: afterCommit.instrumentClient({ query }),
    committed,
    statements,
    status: () => (tx ? tx.status : "idle"),
  };
}

const FAIL_RECIPIENT = 999999;
const failRecipient = (p) => Number(p[0]) === FAIL_RECIPIENT;
const tick = () => new Promise((r) => setImmediate(r));

describe("afterCommit.runInSavepoint", () => {
  it("outside a transaction runs fn directly — no SAVEPOINT round trips", async () => {
    const sim = pgSim();
    const out = await afterCommit.runInSavepoint(sim.client, async () => 42);
    assert.equal(out, 42);
    assert.deepEqual(sim.statements, []);
    assert.equal(await afterCommit.runInSavepoint(null, () => "pool"), "pool");
  });

  it("inside a transaction: SAVEPOINT → fn → RELEASE with unique internal names", async () => {
    const sim = pgSim();
    await sim.client.query("BEGIN");
    await afterCommit.runInSavepoint(sim.client, async () => {
      await afterCommit.runInSavepoint(sim.client, async () => sim.client.query("SELECT 1"));
    });
    await afterCommit.runInSavepoint(sim.client, async () => null);
    const sps = sim.statements.filter((s) => s.startsWith("SAVEPOINT")).map((s) => s.split(" ")[1]);
    assert.equal(sps.length, 3);
    assert.equal(new Set(sps).size, 3, "no name collision, even nested");
    for (const name of sps) assert.match(name, /^OH_ISO_SP_\d+$/);
    assert.equal(sim.statements.filter((s) => s.startsWith("RELEASE")).length, 3);
    assert.equal(sim.status(), "active");
  });

  it("failure: ROLLBACK TO + RELEASE, error rethrown unchanged, transaction survives", async () => {
    const sim = pgSim();
    await sim.client.query("BEGIN");
    let state;
    const boom = await afterCommit
      .runInSavepoint(sim.client, () => sim.client.query("SELECT 1/0"), { onError: (_e, s) => { state = s; } })
      .catch((e) => e);
    assert.equal(boom.code, "22012");
    assert.ok(sim.statements.some((s) => /^ROLLBACK TO SAVEPOINT OH_ISO_SP_\d+$/.test(s)));
    assert.equal(state, "survived");
    assert.equal(sim.status(), "active");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["after"]);
    assert.equal((await sim.client.query("COMMIT")).command, "COMMIT");
    assert.deepEqual(sim.committed.business, ["after"]);
  });

  it("already-aborted transaction: SAVEPOINT fails → onError(aborted), error rethrown", async () => {
    const sim = pgSim();
    await sim.client.query("BEGIN");
    await sim.client.query("SELECT 1/0").catch(() => {});
    let state;
    const err = await afterCommit
      .runInSavepoint(sim.client, async () => "never", { onError: (_e, s) => { state = s; } })
      .catch((e) => e);
    assert.equal(err.code, "25P02");
    assert.equal(state, "aborted");
  });

  it("savepoint names never derive from input", () => {
    const src = read("config/afterCommit.js");
    const uses = [...src.matchAll(/(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT) \$\{(\w+)\}/g)].map((m) => m[2]);
    assert.ok(uses.length >= 3);
    assert.ok(uses.every((v) => v === "name"));
    assert.match(src, /const name = nextIsolationSavepointName\(\);/);
    assert.match(src, /return `\$\{ISOLATION_SAVEPOINT_PREFIX\}\$\{isolationSeq\}`;/);
  });
});

describe("notificationService — best-effort insert isolation (PostgreSQL semantics)", () => {
  const ids = {
    db: require.resolve("../src/config/db"),
    prefs: require.resolve("../src/services/notificationPreferenceCache"),
    hub: require.resolve("../src/services/notificationRealtimeHub"),
    fcm: require.resolve("../src/services/fcmPushService"),
    svc: require.resolve("../src/services/notificationService"),
    events: require.resolve("../src/services/notificationEventsService"),
  };
  let realtime;
  let pushes;
  let logs;
  let originalError;
  let prefsFail;
  let poolSim;

  function stub(id, exports) {
    require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  function load() {
    for (const id of Object.values(ids)) delete require.cache[id];
    poolSim = pgSim({ failInsert: failRecipient });
    stub(ids.db, { pool: { query: (...a) => poolSim.client.query(...a) } });
    stub(ids.prefs, {
      getUserNotificationPreferences: async () => ({}),
      getManyUserNotificationPreferences: async (uids, runner) => {
        if (prefsFail) await runner.query("SELECT 1/0");
        return new Map(uids.map((u) => [u, {}]));
      },
      invalidateUserNotificationPreferences: () => {},
    });
    stub(ids.hub, { publish: (_uid, n) => realtime.push(String(n.id)) });
    stub(ids.fcm, { queuePushForNotification: (n) => pushes.push(String(n.id)) });
    // eslint-disable-next-line global-require
    return require("../src/services/notificationService");
  }
  async function safeNotify(run) {
    try {
      await run();
    } catch {
      /* best-effort, like the services' safeNotify */
    }
  }
  const note = (recipientUserId, extra = {}) => ({
    recipientUserId,
    recipientRole: "client",
    type: "order.created",
    title: "تم استلام طلبك",
    message: "سنراجع طلبك قريباً.",
    entityType: "order",
    entityId: 5,
    priority: "medium",
    ...extra,
  });
  const dispatched = (n) => (n ? realtime.filter((x) => x === n.id).length + pushes.filter((x) => x === n.id).length : 0);

  beforeEach(() => {
    realtime = [];
    pushes = [];
    logs = [];
    prefsFail = false;
    originalError = console.error;
    console.error = (...a) => logs.push(a.join(" "));
  });
  afterEach(() => {
    console.error = originalError;
    for (const id of Object.values(ids)) delete require.cache[id];
  });

  it("CORE: business insert → notification fails → 2nd business query OK → COMMIT → business kept, no row, no dispatch", async () => {
    const svc = load();
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["first"]);
    await safeNotify(() => svc.createNotification(note(FAIL_RECIPIENT), sim.client));
    await sim.client.query("INSERT INTO business VALUES ($1)", ["second"]);
    const res = await sim.client.query("COMMIT");
    await tick();
    assert.equal(res.command, "COMMIT");
    assert.deepEqual(sim.committed.business, ["first", "second"]);
    assert.equal(sim.committed.notifications.length, 0);
    assert.deepEqual([realtime, pushes], [[], []]);
    assert.ok(sim.statements.some((s) => /^ROLLBACK TO SAVEPOINT OH_ISO_SP_\d+$/.test(s)));
  });

  it("control: the same failure without the savepoint aborts the transaction (the original defect)", async () => {
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["first"]);
    await sim.client.query("INSERT INTO notifications VALUES ($1)", [FAIL_RECIPIENT, ...Array(11).fill(null)]).catch(() => {});
    const second = await sim.client.query("INSERT INTO business VALUES ($1)", ["second"]).catch((e) => e.code);
    const res = await sim.client.query("COMMIT");
    assert.equal(second, "25P02");
    assert.equal(res.command, "ROLLBACK");
    assert.deepEqual(sim.committed.business, []);
  });

  it("success: row once; realtime once + push once, only after COMMIT; no duplicate callback", async () => {
    const svc = load();
    const sim = pgSim();
    await sim.client.query("BEGIN");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["b"]);
    const n = await svc.createNotification(note(7), sim.client);
    await tick();
    assert.equal(dispatched(n), 0);
    await sim.client.query("COMMIT");
    await tick();
    assert.equal(sim.committed.notifications.length, 1);
    assert.deepEqual([realtime, pushes], [[n.id], [n.id]]);
  });

  it("success / failure / success in one transaction: 1 and 3 persist + dispatch once, 2 neither", async () => {
    const svc = load();
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["d"]);
    const n1 = await svc.createNotification(note(1), sim.client);
    await safeNotify(() => svc.createIfNotExists(note(FAIL_RECIPIENT), "k2", sim.client));
    const n3 = await svc.createIfNotExists(note(3), "k3", sim.client);
    const res = await sim.client.query("COMMIT");
    await tick();
    assert.equal(res.command, "COMMIT");
    assert.deepEqual(sim.committed.notifications.map((r) => Number(r.recipient_user_id)), [1, 3]);
    assert.equal(dispatched(n1), 2);
    assert.equal(dispatched(n3), 2);
    assert.equal(realtime.length + pushes.length, 4);
  });

  it("sequential failures do not poison later notifications", async () => {
    const svc = load();
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    await safeNotify(() => svc.createNotification(note(FAIL_RECIPIENT), sim.client));
    await safeNotify(() => svc.createManyNotifications([note(FAIL_RECIPIENT)], sim.client));
    await safeNotify(() => svc.createManyIfNotExists([note(FAIL_RECIPIENT, { dedupeKey: "m1" })], sim.client));
    const ok = await svc.createNotification(note(4), sim.client);
    assert.equal((await sim.client.query("COMMIT")).command, "COMMIT");
    await tick();
    assert.equal(sim.committed.notifications.length, 1);
    assert.equal(dispatched(ok), 2);
  });

  it("application savepoint rolled back after a successful notification → no row, no ghost dispatch", async () => {
    const svc = load();
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["keep"]);
    await sim.client.query("SAVEPOINT app_a");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["undo"]);
    const ghost = await svc.createNotification(note(5), sim.client);
    await safeNotify(() => svc.createNotification(note(FAIL_RECIPIENT), sim.client));
    await sim.client.query("ROLLBACK TO SAVEPOINT app_a");
    const kept = await svc.createNotification(note(6), sim.client);
    await sim.client.query("RELEASE SAVEPOINT app_a");
    assert.equal((await sim.client.query("COMMIT")).command, "COMMIT");
    await tick();
    assert.deepEqual(sim.committed.business, ["keep"]);
    assert.deepEqual(sim.committed.notifications.map((r) => Number(r.recipient_user_id)), [6]);
    assert.equal(dispatched(ghost), 0);
    assert.equal(dispatched(kept), 2);
  });

  it("notification inside a caller's own best-effort savepoint (elite_notify style) still commits and dispatches once", async () => {
    const svc = load();
    const sim = pgSim();
    await sim.client.query("BEGIN");
    await sim.client.query("SAVEPOINT elite_notify");
    const n = await svc.createIfNotExists(note(8), "elite_k", sim.client);
    await sim.client.query("RELEASE SAVEPOINT elite_notify");
    assert.equal((await sim.client.query("COMMIT")).command, "COMMIT");
    await tick();
    assert.equal(dispatched(n), 2);
  });

  it("full ROLLBACK discards everything; dedupe conflict (no new row) never dispatches", async () => {
    const svc = load();
    const sim = pgSim();
    await sim.client.query("BEGIN");
    const rolled = await svc.createNotification(note(9), sim.client);
    await sim.client.query("ROLLBACK");
    await sim.client.query("BEGIN");
    const first = await svc.createIfNotExists(note(10), "dup", sim.client);
    const again = await svc.createIfNotExists(note(10), "dup", sim.client);
    await sim.client.query("COMMIT");
    await tick();
    assert.equal(dispatched(rolled), 0);
    assert.equal(again.id, first.id);
    assert.equal(dispatched(first), 2);
    assert.equal(sim.committed.notifications.length, 1);
  });

  it("REQUIRED semantics preserved: error still reaches a non-swallowing caller; transaction stays controllable", async () => {
    const svc = load();
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    const err = await svc.createIfNotExists(note(FAIL_RECIPIENT), "req", sim.client).catch((e) => e);
    assert.equal(err.code, "23503");
    assert.equal(sim.status(), "active");
    await sim.client.query("ROLLBACK");
  });

  it("outside a transaction: no SAVEPOINT, failure thrown as before, logged tx=none", async () => {
    const svc = load();
    const err = await svc.createNotification(note(FAIL_RECIPIENT)).catch((e) => e);
    assert.equal(err.code, "23503");
    assert.ok(!poolSim.statements.some((s) => s.startsWith("SAVEPOINT")));
    assert.ok(logs.some((l) => l === "[notifications] persist_failed type=order.created stage=persist code=23503 tx=none"));
  });

  it("batched preference lookup failing on the transaction client is isolated; insert still happens", async () => {
    const svc = load();
    prefsFail = true;
    const sim = pgSim();
    await sim.client.query("BEGIN");
    await sim.client.query("INSERT INTO business VALUES ($1)", ["r1a"]);
    const rows = await svc.createManyIfNotExists([note(21, { dedupeKey: "p21" }), note(22, { dedupeKey: "p22" })], sim.client);
    assert.equal((await sim.client.query("COMMIT")).command, "COMMIT");
    await tick();
    assert.equal(rows.length, 2);
    assert.deepEqual(sim.committed.business, ["r1a"]);
    assert.equal(realtime.length, 2);
  });

  it("notifyAdmins: failing recipient lookup on the transaction client cannot abort it", async () => {
    load();
    // eslint-disable-next-line global-require
    const events = require("../src/services/notificationEventsService");
    const sim = pgSim();
    const failingLookup = afterCommit.instrumentClient({
      query: (sql, params) => (/SELECT DISTINCT u\.id/.test(String(sql)) ? sim.client.query("SELECT 1/0") : sim.client.query(sql, params)),
    });
    await sim.client.query("BEGIN");
    // Same connection state machine: route the helper's statements through `sim` but fail the lookup.
    const runner = { query: (...a) => failingLookup.query(...a) };
    Object.getOwnPropertySymbols(sim.client).forEach((s) => { runner[s] = sim.client[s]; });
    await safeNotify(() => events.notifyAdmins({ type: "x.y", title: "t", message: "m", entityType: "order" }, runner));
    await sim.client.query("INSERT INTO business VALUES ($1)", ["after_admin_notify"]);
    assert.equal((await sim.client.query("COMMIT")).command, "COMMIT");
    assert.deepEqual(sim.committed.business, ["after_admin_notify"]);
  });

  it("logging is content-free and bounded (rate limited with a suppressed count)", async () => {
    const svc = load();
    const sim = pgSim({ failInsert: failRecipient });
    await sim.client.query("BEGIN");
    for (let i = 0; i < 30; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await safeNotify(() => svc.createNotification(note(FAIL_RECIPIENT, { title: "سري جداً", message: "secret body", metadata: { email: "a@b.c" } }), sim.client));
    }
    await sim.client.query("COMMIT");
    const lines = logs.filter((l) => l.startsWith("[notifications] persist_failed"));
    assert.equal(lines.length, 20, "at most 20 lines per window");
    assert.ok(lines.every((l) => l === "[notifications] persist_failed type=order.created stage=persist code=23503 tx=survived"));
    assert.ok(!logs.join("\n").match(/سري|secret body|a@b\.c|999999/));
  });
});

describe("notificationService — field limits and Unicode", () => {
  const svcPath = require.resolve("../src/services/notificationService");
  // eslint-disable-next-line global-require
  const loadSvc = () => require("../src/services/notificationService");
  afterEach(() => {
    delete require.cache[svcPath];
  });
  const cps = (s) => Array.from(s).length;
  const base = { recipientUserId: 1, type: "order.created", message: "m", entityType: "order" };

  it("limits mirror the notifications schema (migration 025)", () => {
    const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "migrations", "025_notifications.sql"), "utf8");
    const { NOTIFICATION_FIELD_LIMITS: L } = loadSvc();
    assert.match(sql, new RegExp(`recipient_role VARCHAR\\(${L.recipientRole}\\)`));
    assert.match(sql, new RegExp(`type VARCHAR\\(${L.type}\\)`));
    assert.match(sql, new RegExp(`title VARCHAR\\(${L.title}\\)`));
    assert.match(sql, new RegExp(`entity_type VARCHAR\\(${L.entityType}\\)`));
    assert.match(sql, new RegExp(`dedupe_key VARCHAR\\(${L.dedupeKey}\\)`));
    assert.match(sql, /message TEXT NOT NULL/);
    assert.match(sql, /link TEXT NULL/);
  });

  it("Arabic title over 255 characters is capped deterministically to ≤255 code points with an ellipsis", () => {
    const { normalizeCreateInput } = loadSvc();
    const title = "تم قبول عرضك على المشروع ".repeat(20);
    const a = normalizeCreateInput({ ...base, title }).title;
    const b = normalizeCreateInput({ ...base, title }).title;
    assert.equal(a, b);
    assert.ok(cps(a) <= 255);
    assert.ok(a.endsWith("…"));
    assert.ok(title.startsWith(a.slice(0, -1)));
  });

  it("English and short mixed titles are untouched; exactly 255 is kept", () => {
    const { normalizeCreateInput } = loadSvc();
    assert.equal(normalizeCreateInput({ ...base, title: "New order — طلب جديد 🎉" }).title, "New order — طلب جديد 🎉");
    const exact = "a".repeat(255);
    assert.equal(normalizeCreateInput({ ...base, title: exact }).title, exact);
    const long = normalizeCreateInput({ ...base, title: "word ".repeat(80) }).title;
    assert.ok(cps(long) <= 255 && long.endsWith("…") && !long.endsWith(" …"));
  });

  it("emoji: surrogate pairs and ZWJ / flag sequences are never split; counted as PostgreSQL characters", () => {
    const { capDisplayText } = loadSvc();
    const family = "👨‍👩‍👧‍👦"; // 7 code points, 11 UTF-16 units
    const out = capDisplayText(family.repeat(60), 255);
    assert.ok(cps(out) <= 255);
    assert.equal(out, `${family.repeat(36)}…`);
    assert.ok(out.isWellFormed());
    const flags = capDisplayText("🇯🇴".repeat(200), 255);
    assert.equal(flags, `${"🇯🇴".repeat(127)}…`);
    // 300 single emoji = 600 UTF-16 units but 300 characters for PostgreSQL
    const smile = capDisplayText("😀".repeat(300), 255);
    assert.equal(cps(smile), 255);
    assert.ok(smile.isWellFormed());
  });

  it("Arabic combining marks stay attached to their letter at the cut", () => {
    const { capDisplayText } = loadSvc();
    const vowelled = "بِسْمِ ".repeat(60); // letters + harakat (combining)
    const out = capDisplayText(vowelled, 255);
    assert.ok(cps(out) <= 255);
    const body = out.slice(0, -1);
    assert.ok(vowelled.startsWith(body));
    assert.ok(!/[ً-ْ]$/.test(body) || /[ب-م][ً-ْ]*$/.test(body));
  });

  it("NUL removed and lone surrogates replaced in title/message/link and metadata strings", () => {
    const { normalizeCreateInput, serializeMetadata } = loadSvc();
    const n = normalizeCreateInput({ ...base, title: "a\u0000b", message: "x\uD800y\u0000", link: "/p\u0000" });
    assert.equal(n.title, "ab");
    assert.equal(n.message, "x�y");
    assert.equal(n.link, "/p");
    const json = serializeMetadata({ a: "1\u00002", nested: { b: "\uDC00z" }, n: 5 });
    assert.ok(!json.includes("\\u0000"));
    assert.ok(!/\\ud[89a-f]/i.test(json));
    assert.deepEqual(JSON.parse(json), { a: "12", nested: { b: "�z" }, n: 5 });
  });

  it("structured identifiers are rejected, never truncated (no dedupe collisions)", () => {
    const { normalizeCreateInput } = loadSvc();
    for (const [field, value] of [
      ["type", "t".repeat(121)],
      ["entityType", "e".repeat(61)],
      ["recipientRole", "r".repeat(31)],
      ["dedupeKey", "k".repeat(256)],
    ]) {
      assert.throws(() => normalizeCreateInput({ ...base, title: "t", [field]: value }), (e) => e.code === "NOTIFICATION_FIELD_INVALID" && e.statusCode === 400 && !e.message.includes(value));
    }
    const ok = normalizeCreateInput({ ...base, title: "t", dedupeKey: "k".repeat(255) });
    assert.equal(ok.dedupeKey.length, 255);
  });

  it("ids beyond the exact integer range are rejected before reaching bigint columns", () => {
    const { normalizeCreateInput } = loadSvc();
    assert.throws(() => normalizeCreateInput({ ...base, title: "t", entityId: 2 ** 60 }));
    assert.throws(() => normalizeCreateInput({ ...base, title: "t", recipientUserId: 1e20 }));
  });
});

describe("source guards — isolation wiring and tracker coverage", () => {
  const svcSrc = read("services/notificationService.js");

  it("every notificationService create path persists through persistIsolated", () => {
    for (const [fn, next] of [
      ["async function createNotification", "async function createManyNotifications"],
      ["async function createManyNotifications", "async function createIfNotExists"],
      ["async function createIfNotExists", "async function createManyIfNotExists"],
      ["async function createManyIfNotExists", "async function markAsRead"],
    ]) {
      const body = svcSrc.slice(svcSrc.indexOf(fn), svcSrc.indexOf(next));
      assert.match(body, /return persistIsolated\(runner, /, fn);
      assert.ok(body.indexOf("persistIsolated(") < body.indexOf("INSERT INTO notifications"), `${fn}: INSERT inside the isolated section`);
      assert.match(body, /normalizeOrLog\(/, fn);
    }
    assert.match(svcSrc, /prefsByUser = await runInSavepoint\(runner, \(\) =>/);
  });

  it("helper-level reads on a caller's transaction client are isolated", () => {
    assert.match(read("services/notificationEventsService.js"), /await runInSavepoint\(runner, \(\) => runner\.query\(\s*`SELECT DISTINCT u\.id/);
    const rules = read("services/marketplaceNormalOrderRulesService.js");
    const block = rules.slice(rules.indexOf("async function notifyDeadlineReconcileOutcome"));
    assert.match(block, /const \{ rows: applicants \} = await runInSavepoint\(client, \(\) =>/);
  });

  it("no notification producer bypasses the shared, tracked pool (no new Client / callback BEGIN / pool BEGIN)", () => {
    const files = [];
    (function walk(d) {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) files.push(p);
      }
    })(SRC);
    const offenders = [];
    for (const file of files) {
      const code = fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join("\n");
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      if (/new\s+(pg\.)?Client\s*\(/.test(code)) offenders.push(`${rel}: new Client`);
      if (/\.query\(\s*["'`](BEGIN|START TRANSACTION)[^"'`]*["'`]\s*,/.test(code)) offenders.push(`${rel}: callback-style BEGIN`);
      if (/\bpool\.query\(\s*["'`](BEGIN|START TRANSACTION)/.test(code)) offenders.push(`${rel}: BEGIN on the pool`);
      if (/new\s+Pool\s*\(/.test(code) && !["config/db.js", "config/stagingQaEnv.js"].includes(rel)) offenders.push(`${rel}: extra Pool`);
    }
    assert.deepEqual(offenders, []);
    const qa = read("config/stagingQaEnv.js");
    assert.ok(!/notification(Service|EventsService)/.test(qa), "QA-only pools never create notifications");
  });
});
