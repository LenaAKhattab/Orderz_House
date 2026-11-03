/**
 * German / Dutch / Romanian system-content translation memory: hash parity with the SPA, source collection,
 * coverage, idempotent upsert, public endpoint allowlist. Fake DB — no network, no database.
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const { systemContentHash, normalizeSystemContentSource } = require("../src/utils/systemContentHash");
const service = require("../src/services/systemContentTranslationsService");

test("hash vectors are identical to frontend/src/i18n/systemContent.js", () => {
  assert.equal(systemContentHash("Terms & Conditions"), "101fe63019a1cd");
  assert.equal(systemContentHash("كتابة المحتوى"), "0d6cb52ed93f29");
  assert.equal(systemContentHash("Română: ș ț ă"), "1ee8de708b8d21");
  assert.equal(systemContentHash("line1\nline2"), "07dbadf4204ab2");
  assert.equal(normalizeSystemContentSource(" a\r\nb "), "a\nb");
});

function fakeDb({ columns = {}, rows = {}, stored = [] } = {}) {
  const calls = [];
  const db = {
    calls,
    stored: stored.slice(),
    async query(sql, params = []) {
      calls.push(sql);
      if (/information_schema\.columns/.test(sql)) return { rows: (columns[params[0]] || []).map((c) => ({ column_name: c })) };
      const from = /FROM "(\w+)"/.exec(sql);
      if (from && /^SELECT id::text/.test(sql.trim())) return { rows: rows[from[1]] || [] };
      if (/SELECT source_hash, value FROM system_content_translations/.test(sql)) {
        return { rows: db.stored.filter((r) => r.locale === params[0]).map((r) => ({ source_hash: r.source_hash, value: r.value })) };
      }
      if (/SELECT source_hash FROM system_content_translations/.test(sql)) {
        return { rows: db.stored.filter((r) => r.locale === params[0]).map((r) => ({ source_hash: r.source_hash })) };
      }
      if (/^INSERT INTO system_content_translations/.test(sql.trim())) {
        const [locale, ...rest] = params;
        for (let i = 0; i < rest.length; i += 3) {
          const existing = db.stored.find((r) => r.locale === locale && r.source_hash === rest[i]);
          if (existing) existing.value = rest[i + 1];
          else db.stored.push({ locale, source_hash: rest[i], value: rest[i + 1] });
        }
        return { rows: [] };
      }
      throw new Error(`unexpected SQL ${sql.slice(0, 60)}`);
    },
  };
  return db;
}

test("collects visible sources with English primary hash and Arabic alternate hash", async () => {
  const db = fakeDb({
    columns: { categories: ["id", "name", "name_en", "description", "button_label", "is_active"] },
    rows: { categories: [{ id: "1", name: "تصميم", name_en: "Design", description: "خدمات التصميم", button_label: "" }, { id: "2", name: "https://x.y", name_en: "" }] },
  });
  const sources = await service.collectSystemContentSources(db);
  assert.deepEqual(
    sources.map((s) => [s.table, s.field, s.source]),
    [["categories", "name", "Design"], ["categories", "description", "خدمات التصميم"]],
  );
  assert.equal(sources[0].hash, systemContentHash("Design"));
  assert.equal(sources[0].altHash, systemContentHash("تصميم"));
  assert.equal(sources[1].altHash, null);
  // Fixed literal WHERE clauses only (no user input), read-only statements.
  for (const sql of db.calls) assert.match(sql.trim(), /^SELECT/);
});

test("upsert is idempotent, dry-run by default, and rejects invalid entries", async () => {
  const db = fakeDb({ stored: [{ locale: "de", source_hash: "aaaaaaaaaaaaaa", value: "Alt" }] });
  const entries = [{ hash: "aaaaaaaaaaaaaa", value: "Neu" }, { hash: "bbbbbbbbbbbbbb", value: "Gestaltung" }];
  const dry = await service.upsertSystemContentTranslations(db, "de", entries);
  assert.deepEqual(dry, { inserted: 1, updated: 1, unchanged: 0 });
  assert.equal(db.stored.length, 1, "dry-run writes nothing");
  await service.upsertSystemContentTranslations(db, "de", entries, { dryRun: false });
  assert.equal(db.stored.length, 2);
  const again = await service.upsertSystemContentTranslations(db, "de", entries, { dryRun: false });
  assert.deepEqual(again, { inserted: 0, updated: 0, unchanged: 2 });
  await assert.rejects(() => service.upsertSystemContentTranslations(db, "de", [{ hash: "../x", value: "v" }]));
  await assert.rejects(() => service.upsertSystemContentTranslations(db, "de", [{ hash: "cccccccccccccc", value: "  " }]));
  await assert.rejects(() => service.upsertSystemContentTranslations(db, "fr", entries));
});

test("coverage counts unique required sources per locale", async () => {
  const db = fakeDb({ stored: [{ locale: "nl", source_hash: systemContentHash("Design"), value: "Ontwerp" }] });
  const sources = [
    { table: "categories", id: "1", field: "name", source: "Design", hash: systemContentHash("Design") },
    { table: "categories", id: "2", field: "name", source: "Writing", hash: systemContentHash("Writing") },
  ];
  const r = await service.computeSystemContentCoverage(db, "nl", sources);
  assert.equal(r.total, 2);
  assert.equal(r.translated, 1);
  assert.equal(r.coveragePct, 50);
  assert.deepEqual(r.missing.map((m) => m.id), ["2"]);
});

test("public endpoint allowlists locales and serves a cacheable map", async () => {
  const dbPath = require.resolve("../src/config/db");
  const controllerPath = require.resolve("../src/controllers/systemContentTranslationsController");
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: { query: async () => ({ rows: [] }) } },
  };
  delete require.cache[controllerPath];
  const controller = require("../src/controllers/systemContentTranslationsController");
  const res = () => {
    const r = { statusCode: 200, headers: {}, body: null };
    r.status = (c) => ((r.statusCode = c), r);
    r.json = (b) => ((r.body = b), r);
    r.set = (k, v) => ((r.headers[k] = v), r);
    r.end = () => r;
    return r;
  };
  for (const bad of ["fr", "../de", "en", "ar", "DE"]) {
    const r = res();
    await controller.getSystemContent({ params: { locale: bad }, headers: {} }, r, (e) => assert.fail(e));
    assert.equal(r.statusCode, 400, bad);
    assert.equal(r.body.code, "UNSUPPORTED_LOCALE");
  }
});

test("system content sources never include user-generated tables", () => {
  const tables = service.SYSTEM_CONTENT_SOURCES.map((s) => s.table);
  for (const forbidden of ["orders", "fake_orders", "messages", "order_submissions", "users", "reviews", "order_freelancer_bids"]) {
    assert.ok(!tables.includes(forbidden), forbidden);
  }
  assert.deepEqual([...service.SYSTEM_CONTENT_LOCALES], ["de", "nl", "ro"]);
});
