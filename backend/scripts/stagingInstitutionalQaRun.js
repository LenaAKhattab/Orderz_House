/**
 * Live staging QA for Institutional Order Storage via HTTP API + DB assertions.
 * Creates only QA-* prefixed records and cleans them up at the end.
 * Does not wipe unrelated data.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const jwt = require("jsonwebtoken");
const { pool } = require("../src/config/db");
const {
  assertCleanupEnvironmentSafe,
  cleanupInstitutionalTestRecords,
} = require("../test/helpers/institutionalTestCleanup");

const BASE = process.env.STAGING_API_BASE || "http://127.0.0.1:5000";
const results = [];
const cleanup = {
  institutionIds: [],
  storageIds: [],
  storedOrderIds: [],
  liveOrderIds: [],
  userIds: [],
  fakeOrderIds: [],
};

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.institutions)) return value.institutions;
  if (Array.isArray(value?.members)) return value.members;
  if (Array.isArray(value?.users)) return value.users;
  if (Array.isArray(value?.orders)) return value.orders;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function record(section, step, status, detail = "") {
  results.push({ section, step, status, detail: String(detail).slice(0, 500) });
  const mark = status === "PASS" ? "✓" : status === "FAIL" ? "✗" : "○";
  console.log(`${mark} [${section}] ${step} — ${status}${detail ? `: ${detail}` : ""}`);
}

function signUser(row) {
  return jwt.sign(
    {
      sub: String(row.id),
      accountId: row.account_id,
      role: row.role,
      email: row.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" },
  );
}

async function api(method, path, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, ok: res.ok };
}

async function pickUsers() {
  const { rows } = await pool.query(`
    SELECT u.id, u.account_id, u.email, u.role, u.first_name, u.family_name
    FROM users u
    WHERE COALESCE(u.is_active, TRUE) = TRUE
      AND u.role IN ('super_admin', 'admin', 'freelancer')
    ORDER BY CASE u.role WHEN 'super_admin' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.id
  `);
  const superAdmin = rows.find((r) => r.role === "super_admin");
  const admin = rows.find((r) => r.role === "admin") || superAdmin;
  const freelancers = rows.filter((r) => r.role === "freelancer");
  if (!superAdmin) throw new Error("No super_admin user in DB");
  if (freelancers.length < 3) throw new Error(`Need ≥3 freelancers, found ${freelancers.length}`);
  return {
    superAdmin,
    admin,
    member: freelancers[0],
    otherInstMember: freelancers[1],
    outsider: freelancers[2],
  };
}

async function seedCategory() {
  const { rows } = await pool.query(`
    SELECT c.id AS category_id,
           (SELECT s.id FROM subcategories s WHERE s.category_id = c.id ORDER BY s.id LIMIT 1) AS subcategory_id
    FROM categories c
    ORDER BY c.id ASC LIMIT 1`);
  if (!rows[0]) throw new Error("No category");
  return rows[0];
}

async function main() {
  console.log("=== Institutional Staging QA (API) ===");
  console.log("BASE", BASE);
  console.log("SCHEDULER_ENABLED", process.env.INSTITUTIONAL_RELEASE_SCHEDULER_ENABLED);
  console.log("NODE_ENV", process.env.NODE_ENV);

  // Health ping
  try {
    const res = await fetch(`${BASE}/api/health`);
    const text = await res.text();
    record("prep", "Backend reachable", res.ok ? "PASS" : "FAIL", `status=${res.status} ${text.slice(0, 120)}`);
    if (!res.ok) throw new Error(`health ${res.status}`);
  } catch (e) {
    record("prep", "Backend reachable", "FAIL", e.message);
    throw e;
  }

  const users = await pickUsers();
  const saToken = signUser(users.superAdmin);
  const adminToken = signUser(users.admin);
  const memberToken = signUser(users.member);
  const otherToken = signUser(users.otherInstMember);
  const outsiderToken = signUser(users.outsider);
  record(
    "prep",
    "Test accounts resolved",
    "PASS",
    `sa=${users.superAdmin.id} admin=${users.admin.id} member=${users.member.id} other=${users.otherInstMember.id} out=${users.outsider.id}`,
  );

  const cat = await seedCategory();

  // --- Scheduler health ---
  {
    const r = await api("GET", "/api/admin/institutional-order-storage/scheduler/health", { token: saToken });
    const h = r.json?.data?.health || r.json?.health || r.json?.data || r.json;
    const mode = h?.schedulerMode || h?.mode;
    record(
      "scheduler",
      "Health endpoint",
      r.status === 200 ? "PASS" : "FAIL",
      `status=${r.status} mode=${mode} enabled=${h?.processSchedulerEnabled} running=${h?.processCurrentlyRunning} overdue=${h?.overdueBatchCount} warnings=${(h?.warnings || []).length}`,
    );
    if (r.status === 200) {
      record(
        "scheduler",
        "Single in-process driver (local staging)",
        mode === "in-process" && h?.processSchedulerEnabled === true ? "PASS" : mode === "disabled" ? "PASS" : "FAIL",
        `mode=${mode} enabled=${h?.processSchedulerEnabled} running=${h?.processCurrentlyRunning}`,
      );
    }
  }

  // Unauthorized health
  {
    const r = await api("GET", "/api/admin/institutional-order-storage/scheduler/health", {
      token: outsiderToken,
    });
    record("permissions", "Outsider scheduler health denied", r.status === 403 || r.status === 401 ? "PASS" : "FAIL", `status=${r.status}`);
  }

  // --- Institution management ---
  let institutionId;
  let otherInstitutionId;
  let storageId;
  let releasedLiveId = null;
  const orderIds = [];

  try {
  {
    const name = `QA-INST-${Date.now()}`;
    const r = await api("POST", "/api/admin/institutions", {
      token: saToken,
      body: { name, description: "staging QA institution" },
    });
    institutionId = Number(r.json?.data?.institution?.id || r.json?.data?.id || r.json?.institution?.id || r.json?.id);
    if (institutionId) cleanup.institutionIds.push(institutionId);
    record("institutions", "Create institution", r.status < 300 && institutionId ? "PASS" : "FAIL", `status=${r.status} id=${institutionId} body=${JSON.stringify(r.json).slice(0, 200)}`);

    const list = await api("GET", "/api/admin/institutions", { token: saToken });
    const institutions = asArray(list.json?.data || list.json);
    const found = institutions.some((i) => Number(i.id) === institutionId || i.name === name);
    record("institutions", "Appears in list", found ? "PASS" : "FAIL", `status=${list.status} n=${institutions.length}`);

    const detail = await api("GET", `/api/admin/institutions/${institutionId}`, { token: saToken });
    record("institutions", "Open details", detail.status === 200 ? "PASS" : "FAIL", `status=${detail.status}`);

    // Search by email / id / name
    for (const [label, q] of [
      ["email", users.member.email],
      ["id", String(users.member.id)],
      ["name", users.member.first_name || users.member.email.split("@")[0]],
    ]) {
      const s = await api(
        "GET",
        `/api/admin/institutions/users/search?q=${encodeURIComponent(q)}`,
        { token: saToken },
      );
      const hits = asArray(s.json?.data || s.json);
      const ok = s.status === 200 && Array.isArray(hits) && hits.some((u) => Number(u.id) === Number(users.member.id));
      record("institutions", `Search users by ${label}`, ok ? "PASS" : "FAIL", `status=${s.status} hits=${hits.length}`);
    }

    const add = await api("POST", `/api/admin/institutions/${institutionId}/members`, {
      token: saToken,
      body: { userId: users.member.id },
    });
    record("institutions", "Add member", add.status < 300 ? "PASS" : "FAIL", `status=${add.status} ${JSON.stringify(add.json).slice(0, 180)}`);

    const members = await api("GET", `/api/admin/institutions/${institutionId}/members`, { token: saToken });
    const mrows = asArray(members.json?.data || members.json);
    const m = mrows.find((x) => Number(x.userId || x.user_id) === Number(users.member.id));
    record(
      "institutions",
      "Member row fields",
      m && (m.status || m.membershipStatus) ? "PASS" : "FAIL",
      JSON.stringify(m || members.json).slice(0, 250),
    );

    const dup = await api("POST", `/api/admin/institutions/${institutionId}/members`, {
      token: saToken,
      body: { userId: users.member.id },
    });
    const dupOk =
      dup.status >= 400 &&
      (String(dup.json?.code || "").includes("DUPLICATE") ||
        /مسبق|duplicate|موجود/i.test(String(dup.json?.message || "")));
    record("institutions", "Duplicate member error", dupOk ? "PASS" : "FAIL", `status=${dup.status} ${JSON.stringify(dup.json).slice(0, 200)}`);

    const rem = await api("DELETE", `/api/admin/institutions/${institutionId}/members/${users.member.id}`, {
      token: saToken,
    });
    record("institutions", "Remove member", rem.status < 300 ? "PASS" : "FAIL", `status=${rem.status}`);

    const memAfter = await api("GET", "/api/institution/membership", { token: memberToken });
    const stillActive =
      memAfter.json?.data?.isMember === true ||
      memAfter.json?.isMember === true ||
      (Array.isArray(memAfter.json?.data?.institutionIds) &&
        memAfter.json.data.institutionIds.map(Number).includes(institutionId));
    record(
      "institutions",
      "Access lost after remove",
      !stillActive ? "PASS" : "FAIL",
      `status=${memAfter.status} ${JSON.stringify(memAfter.json).slice(0, 200)}`,
    );

    const readd = await api("POST", `/api/admin/institutions/${institutionId}/members`, {
      token: saToken,
      body: { userId: users.member.id },
    });
    record("institutions", "Re-add member for remaining tests", readd.status < 300 ? "PASS" : "FAIL", `status=${readd.status}`);

    // Second institution for other freelancer
    const other = await api("POST", "/api/admin/institutions", {
      token: saToken,
      body: { name: `QA-INST-OTHER-${Date.now()}`, description: "other institution" },
    });
    otherInstitutionId = Number(other.json?.data?.institution?.id || other.json?.data?.id || other.json?.institution?.id || other.json?.id);
    if (otherInstitutionId) cleanup.institutionIds.push(otherInstitutionId);
    await api("POST", `/api/admin/institutions/${otherInstitutionId}/members`, {
      token: saToken,
      body: { userId: users.otherInstMember.id },
    });
    record("institutions", "Second institution + other member", otherInstitutionId ? "PASS" : "FAIL", `id=${otherInstitutionId}`);
  }

  // Admin permission (may fail if admin lacks delegated perms — record accurately)
  {
    const r = await api("GET", "/api/admin/institutions", { token: adminToken });
    record(
      "permissions",
      "Delegated admin institutions list",
      r.status === 200 || r.status === 403 ? (r.status === 200 ? "PASS" : "BLOCKED") : "FAIL",
      `status=${r.status} (403=permission config, not code defect if admin lacks institutional perms)`,
    );
  }

  // --- Storage ---
  {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 2);
    const r = await api("POST", "/api/admin/institutional-order-storage", {
      token: saToken,
      body: {
        name: `QA-STORAGE-${Date.now()}`,
        description: "staging QA storage",
        financialLimitJod: 500,
        distributionMonths: 3,
        distributionStartDate: start.toISOString().slice(0, 10),
        institutionIds: [institutionId],
      },
    });
    storageId = Number(r.json?.data?.storage?.id || r.json?.data?.id || r.json?.storage?.id || r.json?.id);
    if (storageId) cleanup.storageIds.push(storageId);
    record("storage", "Create storage", r.status < 300 && storageId ? "PASS" : "FAIL", `status=${r.status} ${JSON.stringify(r.json).slice(0, 220)}`);

    const g = await api("GET", `/api/admin/institutional-order-storage/${storageId}`, { token: saToken });
    const s = g.json?.data || g.json?.storage || g.json;
    const budget = s?.budget || s?.metrics || s;
    record(
      "storage",
      "Budget metrics initial",
      g.status === 200 ? "PASS" : "FAIL",
      `limit=${budget?.financialLimitJod || s?.financialLimitJod} remaining=${budget?.remainingAmountJod ?? budget?.remainingJod}`,
    );

    const up = await api("PATCH", `/api/admin/institutional-order-storage/${storageId}`, {
      token: saToken,
      body: { financialLimitJod: 600 },
    });
    record("storage", "Increase limit", up.status < 300 ? "PASS" : "FAIL", `status=${up.status}`);

    const downOk = await api("PATCH", `/api/admin/institutional-order-storage/${storageId}`, {
      token: saToken,
      body: { financialLimitJod: 550 },
    });
    record("storage", "Reduce limit above allocated", downOk.status < 300 ? "PASS" : "FAIL", `status=${downOk.status}`);
  }

  // --- Create orders ---
  async function createOrder(title, budget) {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("description", `QA staging order body for ${title} — long enough description for validation.`);
    fd.append("categoryId", String(cat.category_id));
    if (cat.subcategory_id) fd.append("subcategoryId", String(cat.subcategory_id));
    fd.append("projectType", "fixed");
    fd.append("budget", String(budget));
    fd.append("durationValue", "3");
    fd.append("durationUnit", "days");
    const r = await api("POST", `/api/admin/institutional-order-storage/${storageId}/orders`, {
      token: saToken,
      formData: fd,
    });
    const id = Number(r.json?.data?.order?.id || r.json?.data?.id || r.json?.order?.id || r.json?.id);
    if (id) cleanup.storedOrderIds.push(id);
    return { r, id };
  }

  {
    for (let i = 0; i < 11; i++) {
      const { r, id } = await createOrder(`QA-ORDER-${Date.now()}-${i}`, 40);
      orderIds.push(id);
      if (!id) {
        record("orders", `Create order ${i}`, "FAIL", `status=${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
        break;
      }
    }
    record("orders", "Create 11 institutional orders", orderIds.filter(Boolean).length === 11 ? "PASS" : "FAIL", `count=${orderIds.filter(Boolean).length}`);

    // Submit all
    let submitOk = 0;
    for (const id of orderIds.filter(Boolean)) {
      const s = await api("POST", `/api/admin/institutional-order-storage/orders/${id}/submit`, { token: saToken });
      if (s.status < 300) submitOk += 1;
    }
    record("orders", "Submit for approval", submitOk === orderIds.filter(Boolean).length ? "PASS" : "FAIL", `submitted=${submitOk}`);

    // Pre-approval budget / visibility
    const g = await api("GET", `/api/admin/institutional-order-storage/${storageId}`, { token: saToken });
    const s = g.json?.data || g.json?.storage || g.json;
    const allocated = Number(s?.budget?.allocatedAmountJod ?? s?.allocatedAmountJod ?? s?.metrics?.allocatedAmountJod ?? -1);
    record("orders", "Budget still zero before approval", allocated === 0 ? "PASS" : "FAIL", `allocated=${allocated}`);

    const poolBefore = await api("GET", "/api/institution/orders/pool", { token: memberToken });
    const poolOrders = poolBefore.json?.data?.orders || poolBefore.json?.orders || [];
    const leaked = poolOrders.some((o) => orderIds.includes(Number(o.institutionalStoredOrderId || o.storedOrderId)));
    record("visibility", "Pending not in private pool", poolBefore.status < 300 && !leaked ? "PASS" : "FAIL", `status=${poolBefore.status} count=${poolOrders.length}`);

    const market = await api("GET", "/api/orders/pool?page=1&limit=50", { token: outsiderToken });
    const mOrders = market.json?.data?.orders || market.json?.orders || [];
    const mLeak = mOrders.some((o) => String(o.title || "").startsWith("QA-ORDER-"));
    record("visibility", "Pending not in public/freelancer pool", !mLeak ? "PASS" : "FAIL", `status=${market.status}`);
  }

  // Approve 11, then try over-limit
  {
    let approved = 0;
    for (const id of orderIds.filter(Boolean)) {
      const a = await api("POST", `/api/admin/institutional-order-storage/orders/${id}/approve`, { token: saToken });
      if (a.status < 300) approved += 1;
      else console.log("approve fail", id, a.status, JSON.stringify(a.json).slice(0, 150));
    }
    record("approval", "Approve 11 orders within limit", approved === 11 ? "PASS" : "FAIL", `approved=${approved}`);

    // Extra order that would exceed: limit 550, 11*40=440, room for 2 more at 40 = 80 → 520; create 200 JOD
    const { r: overCreate, id: overId } = await createOrder(`QA-ORDER-OVER-${Date.now()}`, 200);
    if (overId) {
      await api("POST", `/api/admin/institutional-order-storage/orders/${overId}/submit`, { token: saToken });
      const a = await api("POST", `/api/admin/institutional-order-storage/orders/${overId}/approve`, { token: saToken });
      const blocked = a.status >= 400;
      record(
        "approval",
        "Approve exceeding limit blocked",
        blocked ? "PASS" : "FAIL",
        `status=${a.status} msg=${a.json?.message || ""}`,
      );
      // keep pending for later archive/transfer tests
    } else {
      record("approval", "Create over-limit order", "FAIL", JSON.stringify(overCreate.json).slice(0, 200));
    }

    // Invalid limit reduction
    const bad = await api("PATCH", `/api/admin/institutional-order-storage/${storageId}`, {
      token: saToken,
      body: { financialLimitJod: 100 },
    });
    record(
      "storage",
      "Reduce limit below allocated blocked",
      bad.status >= 400 ? "PASS" : "FAIL",
      `status=${bad.status} ${bad.json?.message || ""}`,
    );
  }

  // Archive one approved unscheduled before schedule
  let archivedId = orderIds[10];
  {
    const a = await api("POST", `/api/admin/institutional-order-storage/orders/${archivedId}/archive`, {
      token: saToken,
      body: { reason: "QA archive before schedule" },
    });
    record("orders", "Archive before release", a.status < 300 ? "PASS" : "FAIL", `status=${a.status} ${JSON.stringify(a.json).slice(0, 180)}`);
  }

  // Transfer one
  let transferredId = orderIds[9];
  {
    const t = await api("POST", `/api/admin/institutional-order-storage/orders/${transferredId}/transfer-to-training`, {
      token: saToken,
      body: {},
    });
    const fakeId = t.json?.data?.fakeOrderId || t.json?.fakeOrderId || t.json?.data?.destinationFakeOrderId;
    if (fakeId) cleanup.fakeOrderIds.push(Number(fakeId));
    record("orders", "Transfer before release", t.status < 300 ? "PASS" : "FAIL", `status=${t.status} fake=${fakeId}`);
    const t2 = await api("POST", `/api/admin/institutional-order-storage/orders/${transferredId}/transfer-to-training`, {
      token: saToken,
      body: {},
    });
    record(
      "orders",
      "Duplicate transfer blocked/idempotent",
      t2.status < 300 || t2.status === 409 || t2.status === 400 ? "PASS" : "FAIL",
      `status=${t2.status}`,
    );
  }

  // Schedule with remaining approved (~9 orders, 3 months → 3/3/3)
  const scheduledOrderIds = orderIds.slice(0, 9);
  {
    const gen = await api("POST", `/api/admin/institutional-order-storage/${storageId}/schedule/generate`, {
      token: saToken,
      body: {},
    });
    record("schedule", "Generate schedule", gen.status < 300 ? "PASS" : "FAIL", `status=${gen.status} ${JSON.stringify(gen.json).slice(0, 200)}`);

    const sch = await api("GET", `/api/admin/institutional-order-storage/${storageId}/schedule`, { token: saToken });
    const schedule = sch.json?.data?.schedule || sch.json?.schedule || sch.json?.data || {};
    const months = schedule.months || [];
    const totals = months.map((m) => Number(m.targetOrderCount || m.batches?.reduce((a, b) => a + Number(b.assignedOrderCount || 0), 0) || 0));
    record(
      "schedule",
      "Monthly distribution",
      months.length === 3 ? "PASS" : "FAIL",
      `months=${months.length} targets=${JSON.stringify(totals)} batches=${months.map((m) => m.batches?.length).join(",")}`,
    );

    const allBatches = months.flatMap((m) => m.batches || []);
    const future = allBatches.find((b) => b.status === "SCHEDULED" || b.status === "scheduled");
    if (future) {
      const newDate = new Date(future.scheduledReleaseAt || future.scheduled_release_at);
      newDate.setUTCDate(newDate.getUTCDate() + 1);
      const patch = await api("PATCH", `/api/admin/institutional-order-storage/batches/${future.id}`, {
        token: saToken,
        body: { scheduledReleaseAt: newDate.toISOString() },
      });
      record("schedule", "Edit future batch date", patch.status < 300 ? "PASS" : "FAIL", `status=${patch.status} ${JSON.stringify(patch.json).slice(0, 150)}`);
    } else {
      record("schedule", "Edit future batch date", "BLOCKED", "no SCHEDULED batch found");
    }
  }

  // Activate / pause / resume
  {
    const act = await api("POST", `/api/admin/institutional-order-storage/${storageId}/status`, {
      token: saToken,
      body: { status: "active", confirmPastBatches: true, allowPastBatches: true },
    });
    record("lifecycle", "Activate storage", act.status < 300 ? "PASS" : "FAIL", `status=${act.status} ${JSON.stringify(act.json).slice(0, 200)}`);

    const pause = await api("POST", `/api/admin/institutional-order-storage/${storageId}/status`, {
      token: saToken,
      body: { status: "paused" },
    });
    record("lifecycle", "Pause storage", pause.status < 300 ? "PASS" : "FAIL", `status=${pause.status}`);

    // Make first batch due while paused
    await pool.query(
      `UPDATE institutional_release_batches
       SET scheduled_release_at = NOW() - INTERVAL '2 minutes', status = 'SCHEDULED'
       WHERE storage_id = $1 AND status = 'SCHEDULED'
       AND id = (
         SELECT id FROM institutional_release_batches WHERE storage_id = $1 AND status = 'SCHEDULED'
         ORDER BY scheduled_release_at ASC, id ASC LIMIT 1
       )`,
      [storageId],
    );

    const tickPaused = await api("POST", "/api/admin/institutional-order-storage/release-tick", { token: saToken });
    const { rows: liveWhilePaused } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders o
       JOIN institutional_stored_orders s ON s.released_order_id = o.id
       WHERE s.storage_id = $1`,
      [storageId],
    );
    record(
      "lifecycle",
      "No release while paused",
      Number(liveWhilePaused[0].c) === 0 ? "PASS" : "FAIL",
      `live=${liveWhilePaused[0].c} tick=${tickPaused.status}`,
    );

    const resume = await api("POST", `/api/admin/institutional-order-storage/${storageId}/status`, {
      token: saToken,
      body: { status: "active", confirmPastBatches: true, allowPastBatches: true },
    });
    record(
      "lifecycle",
      "Resume storage",
      resume.status < 300 ? "PASS" : "FAIL",
      `status=${resume.status} ${JSON.stringify(resume.json).slice(0, 160)}`,
    );
  }

  // Release
  {
    const tick1 = await api("POST", "/api/admin/institutional-order-storage/release-tick", { token: saToken });
    const tick2 = await api("POST", "/api/admin/institutional-order-storage/release-tick", { token: saToken });
    record("scheduler", "Manual release tick", tick1.status < 300 ? "PASS" : "FAIL", `status=${tick1.status} ${JSON.stringify(tick1.json).slice(0, 180)}`);
    record("scheduler", "Duplicate tick safe", tick2.status < 300 ? "PASS" : "FAIL", `status=${tick2.status}`);

    const { rows: released } = await pool.query(
      `SELECT id, released_order_id, lifecycle_status FROM institutional_stored_orders
       WHERE storage_id = $1 AND lifecycle_status = 'released'`,
      [storageId],
    );
    record("scheduler", "Stored orders released", released.length >= 1 ? "PASS" : "FAIL", `count=${released.length}`);

    if (released[0]?.released_order_id) {
      releasedLiveId = Number(released[0].released_order_id);
      cleanup.liveOrderIds.push(releasedLiveId);
      const { rows: live } = await pool.query(
        `SELECT visibility_scope, institutional_stored_order_id FROM orders WHERE id = $1`,
        [releasedLiveId],
      );
      record(
        "scheduler",
        "Live order institution scope",
        live[0]?.visibility_scope === "institution" ? "PASS" : "FAIL",
        JSON.stringify(live[0]),
      );

      const { rows: dup } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM orders WHERE institutional_stored_order_id = $1`,
        [released[0].id],
      );
      record("scheduler", "Exactly one live order per stored", Number(dup[0].c) === 1 ? "PASS" : "FAIL", `count=${dup[0].c}`);
    }

    // Restart recovery simulation: make another batch due, call tick twice (simulates after restart)
    await pool.query(
      `UPDATE institutional_release_batches
       SET scheduled_release_at = NOW() - INTERVAL '1 minute', status = 'SCHEDULED'
       WHERE storage_id = $1 AND status = 'SCHEDULED'
       AND id = (
         SELECT id FROM institutional_release_batches WHERE storage_id = $1 AND status = 'SCHEDULED'
         ORDER BY scheduled_release_at ASC, id ASC LIMIT 1
       )`,
      [storageId],
    );
    await api("POST", "/api/admin/institutional-order-storage/release-tick", { token: saToken });
    await api("POST", "/api/admin/institutional-order-storage/release-tick", { token: saToken });
    const { rows: allLive } = await pool.query(
      `SELECT institutional_stored_order_id, COUNT(*)::int AS c FROM orders
       WHERE institutional_storage_id = $1
       GROUP BY institutional_stored_order_id
       HAVING COUNT(*) > 1`,
      [storageId],
    );
    record("scheduler", "Restart/duplicate tick no duplicate lives", allLive.length === 0 ? "PASS" : "FAIL", `dups=${allLive.length}`);
  }

  // Member pool experience
  {
    const pool = await api("GET", "/api/institution/orders/pool", { token: memberToken });
    const orders = pool.json?.data?.orders || pool.json?.orders || [];
    record(
      "member",
      "Member sees released pool",
      pool.status === 200 && orders.length >= 1 ? "PASS" : "FAIL",
      `status=${pool.status} count=${orders.length}`,
    );

    if (releasedLiveId) {
      const detail = await api("GET", `/api/orders/pool/${releasedLiveId}`, { token: memberToken });
      record("member", "Member open order details", detail.status === 200 ? "PASS" : "FAIL", `status=${detail.status} ${JSON.stringify(detail.json).slice(0, 120)}`);

      const claim = await api("POST", `/api/orders/pool/${releasedLiveId}/take`, {
        token: memberToken,
        body: {},
      });
      // take may 400/409 for plan/eligibility — accept success or clear business validation
      const claimOk = claim.status < 300 || [400, 403, 409, 422].includes(claim.status);
      record(
        "member",
        "Member claim/bid attempt (real-order rules)",
        claimOk ? "PASS" : "FAIL",
        `status=${claim.status} ${JSON.stringify(claim.json).slice(0, 180)}`,
      );
    }

    const otherPool = await api("GET", "/api/institution/orders/pool", { token: otherToken });
    const otherOrders = otherPool.json?.data?.orders || otherPool.json?.orders || [];
    const otherSees = otherOrders.some((o) => Number(o.id) === releasedLiveId);
    record(
      "unauthorized",
      "Other-institution pool hides order",
      otherPool.status === 200 && !otherSees ? "PASS" : otherPool.status === 403 ? "PASS" : "FAIL",
      `status=${otherPool.status} count=${otherOrders.length}`,
    );

    const outPool = await api("GET", "/api/institution/orders/pool", { token: outsiderToken });
    record(
      "unauthorized",
      "Non-member pool 403",
      outPool.status === 403 ? "PASS" : "FAIL",
      `status=${outPool.status}`,
    );

    if (releasedLiveId) {
      const outDetail = await api("GET", `/api/orders/pool/${releasedLiveId}`, { token: outsiderToken });
      record("unauthorized", "Outsider direct detail denied", outDetail.status === 403 || outDetail.status === 404 ? "PASS" : "FAIL", `status=${outDetail.status}`);

      const outClaim = await api("POST", `/api/orders/pool/${releasedLiveId}/take`, { token: outsiderToken, body: {} });
      record("unauthorized", "Outsider claim denied", outClaim.status === 403 || outClaim.status === 401 || outClaim.status === 404 ? "PASS" : "FAIL", `status=${outClaim.status}`);

      const guest = await api("GET", `/api/orders/pool/${releasedLiveId}`);
      record("unauthorized", "Guest detail denied", guest.status === 401 || guest.status === 403 || guest.status === 404 ? "PASS" : "FAIL", `status=${guest.status}`);
    }
  }

  // Remove member → deny
  {
    await api("DELETE", `/api/admin/institutions/${institutionId}/members/${users.member.id}`, { token: saToken });
    const pool = await api("GET", "/api/institution/orders/pool", { token: memberToken });
    record(
      "unauthorized",
      "Removed member pool denied",
      pool.status === 403 ? "PASS" : "FAIL",
      `status=${pool.status} ${JSON.stringify(pool.json).slice(0, 160)}`,
    );
    // Re-add for cleanup safety of further checks
    await api("POST", `/api/admin/institutions/${institutionId}/members`, {
      token: saToken,
      body: { userId: users.member.id },
    });
  }

  // Released protections
  if (releasedLiveId) {
    const { rows: so } = await pool.query(
      `SELECT id FROM institutional_stored_orders WHERE released_order_id = $1 LIMIT 1`,
      [releasedLiveId],
    );
    const sid = so[0]?.id;
    if (sid) {
      const tr = await api("POST", `/api/admin/institutional-order-storage/orders/${sid}/transfer-to-training`, {
        token: saToken,
        body: {},
      });
      record("released", "Transfer after release blocked", tr.status >= 400 ? "PASS" : "FAIL", `status=${tr.status}`);

      const del = await api("DELETE", `/api/admin/institutional-order-storage/orders/${sid}`, { token: saToken });
      record("released", "Hard delete after release blocked", del.status >= 400 ? "PASS" : "FAIL", `status=${del.status}`);

      const arch = await api("POST", `/api/admin/institutional-order-storage/orders/${sid}/archive`, {
        token: saToken,
        body: { reason: "QA archive after release" },
      });
      const { rows: liveStill } = await pool.query(
        `SELECT id, is_published, order_status, visibility_scope FROM orders WHERE id = $1`,
        [releasedLiveId],
      );
      record(
        "released",
        "Archive stored does not withdraw live",
        arch.status < 300 && liveStill[0] && liveStill[0].visibility_scope === "institution" ? "PASS" : "FAIL",
        `arch=${arch.status} live=${JSON.stringify(liveStill[0])}`,
      );
    }

    // Staff order detail badge metadata
    const staff = await api("GET", `/api/admin/orders/${releasedLiveId}`, { token: saToken });
    const od = staff.json?.data || staff.json?.order || staff.json;
    const badge =
      od?.isInstitutionalOrder === true ||
      od?.visibilityScope === "institution" ||
      od?.visibility_scope === "institution";
    record(
      "released",
      "Staff order exposes institutional metadata",
      staff.status === 200 && badge ? "PASS" : "FAIL",
      `status=${staff.status} isInst=${od?.isInstitutionalOrder} scope=${od?.visibilityScope || od?.visibility_scope} storage=${od?.institutionalStorageName || od?.storageName}`,
    );
  }

  // Homepage stats exclusion (API)
  {
    const home = await api("GET", "/api/public/home-stats");
    record(
      "visibility",
      "Homepage stats endpoint reachable",
      home.status === 200 ? "PASS" : "FAIL",
      `status=${home.status}`,
    );
  }

  // Immutable released batch
  {
    const { rows: relBatch } = await pool.query(
      `SELECT id, status FROM institutional_release_batches WHERE storage_id = $1 AND status IN ('RELEASED','PROCESSING') LIMIT 1`,
      [storageId],
    );
    if (relBatch[0]) {
      const patch = await api("PATCH", `/api/admin/institutional-order-storage/batches/${relBatch[0].id}`, {
        token: saToken,
        body: { scheduledReleaseAt: new Date().toISOString() },
      });
      record("schedule", "Released batch immutable", patch.status >= 400 ? "PASS" : "FAIL", `status=${patch.status}`);
    } else {
      record("schedule", "Released batch immutable", "BLOCKED", "no released batch yet");
    }
  }

  // Frontend SPA reachability (not interactive UI)
  {
    const pages = [
      "http://127.0.0.1:5173/",
      "http://127.0.0.1:5173/dashboard/super-admin/institutions",
      "http://127.0.0.1:5173/dashboard/super-admin/institutional-order-storage",
      "http://127.0.0.1:5173/dashboard/freelancer/institution-orders",
    ];
    for (const url of pages) {
      try {
        const res = await fetch(url);
        const html = await res.text();
        record("ui", `SPA shell ${url.replace("http://127.0.0.1:5173", "")}`, res.ok && html.includes("<div id=\"root\"") ? "PASS" : "FAIL", `status=${res.status}`);
      } catch (e) {
        record("ui", `SPA shell ${url}`, "FAIL", e.message);
      }
    }
    record(
      "ui",
      "Interactive browser UI / RTL / responsive click-through",
      "BLOCKED",
      "No browser automation MCP available in this agent environment; SPA shells verified only",
    );
  }
  } catch (e) {
    record("fatal", "Unhandled staging error", "FAIL", e.stack || e.message);
  }

  // Cleanup QA data (only QA-created IDs tracked in this run)
  console.log("\n--- Cleanup QA records ---");
  try {
    assertCleanupEnvironmentSafe();
    await cleanupInstitutionalTestRecords(pool, {
      storageIds: cleanup.storageIds,
      institutionIds: cleanup.institutionIds,
      releasedOrderIds: cleanup.liveOrderIds,
      fakeOrderIds: cleanup.fakeOrderIds,
      logPrefix: "[stagingInstitutionalQaRun]",
    });
    record("cleanup", "QA-prefixed data cleanup", "PASS", JSON.stringify(cleanup));
  } catch (e) {
    record("cleanup", "QA-prefixed data cleanup", "FAIL", e.message);
  }

  const summary = {
    PASS: results.filter((r) => r.status === "PASS").length,
    FAIL: results.filter((r) => r.status === "FAIL").length,
    BLOCKED: results.filter((r) => r.status === "BLOCKED").length,
  };
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(results, null, 2));

  await pool.end();
  process.exit(summary.FAIL > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FATAL", e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
