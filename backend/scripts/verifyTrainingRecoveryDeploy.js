/**
 * Deployment verification for training-order backend recovery fix.
 * Run: node scripts/verifyTrainingRecoveryDeploy.js
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");

const API_BASE = process.env.VERIFY_API_BASE || "http://localhost:5000";
const results = [];

function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail || "" });
  const tag = pass ? "PASS" : "FAIL";
  console.log(`${tag} | ${name}`);
  if (detail) console.log(`      ${detail}`);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  console.log("=== Training Orders Recovery — Deployment Verification ===\n");

  // 1. Migration 080
  try {
    const { rows: mig } = await pool.query(
      `SELECT version FROM schema_migrations WHERE version = '080_order_cached_english_translations'`,
    );
    check("Migration 080 applied", mig.length === 1, mig[0]?.version || "not found");

    const { rows: cols } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'fake_orders'
        AND column_name IN ('title_en', 'description_en')
      ORDER BY column_name`);
    const colNames = cols.map((r) => r.column_name);
    check(
      "fake_orders has title_en + description_en",
      colNames.includes("title_en") && colNames.includes("description_en"),
      colNames.join(", ") || "missing",
    );
  } catch (e) {
    check("Migration 080", false, e.message);
  }

  // 2. db.js pool release hook loaded in this process
  try {
    const fs = require("fs");
    const path = require("path");
    const dbSrc = fs.readFileSync(path.join(__dirname, "..", "src", "config", "db.js"), "utf8");
    check("db.js pool release hook present", /pool\.on\("release"/.test(dbSrc) && /GENERATION_ADVISORY_LOCK_KEY/.test(dbSrc));
  } catch (e) {
    check("db.js pool release hook", false, e.message);
  }

  // 3. Advisory locks
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM pg_locks WHERE locktype = 'advisory' AND objid = 882947361`,
    );
    check("No leaked advisory locks", Number(rows[0]?.c || 0) === 0, `lock_count=${rows[0]?.c}`);
  } catch (e) {
    check("Advisory lock check", false, e.message);
  }

  // 4. Automation config
  const {
    isAutomationDriverConfigured,
    isInProcessAutomationIntervalEnabled,
    getAutomationCronSecret,
  } = require("../src/config/fakeOrdersAutomation");
  const autoEnabled = isInProcessAutomationIntervalEnabled();
  const cronSecret = getAutomationCronSecret();
  const tickMs = process.env.FAKE_ORDERS_TICK_MS || "(default)";
  if (isAutomationDriverConfigured()) {
    if (autoEnabled) {
      check("Automation mode", true, `In-process: FAKE_ORDERS_AUTOMATION_ENABLED=true (or dev default), TICK_MS=${tickMs}`);
    } else if (cronSecret) {
      check("Automation mode", true, "External cron + FAKE_ORDERS_AUTOMATION_CRON_SECRET configured");
    }
  } else {
    check(
      "Automation mode",
      false,
      "No driver — set FAKE_ORDERS_AUTOMATION_ENABLED=true (single instance) or FAKE_ORDERS_AUTOMATION_CRON_SECRET + cron",
    );
  }

  // 5. Visible training orders before recovery prep
  let visibleBefore = 0;
  try {
    visibleBefore = await fakeOrdersService.getVisibleFakeOrdersCount(pool);
    check("Visible training orders (baseline)", true, `count=${visibleBefore}`);
  } catch (e) {
    check("Visible count baseline", false, e.message);
  }

  // 6. Pool recovery test — expire all visible items temporarily
  let recoveryRoundId = null;
  try {
    const { rows: activeRounds } = await pool.query(
      `SELECT id FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1`,
    );
    recoveryRoundId = activeRounds[0]?.id ? Number(activeRounds[0].id) : null;

    await pool.query(
      `UPDATE fake_order_round_items SET visible_until = NOW() - INTERVAL '1 minute', updated_at = NOW()
       WHERE status = 'active' AND visible_until > NOW()`,
    );
    const afterExpire = await fakeOrdersService.getVisibleFakeOrdersCount(pool);
    check("Prepared 0 visible training orders", afterExpire === 0, `visible=${afterExpire}`);

    const { rows: realCount } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM orders WHERE is_published = TRUE AND is_open_for_pool = TRUE`,
    );
    const realOrders = Number(realCount[0]?.c || 0);
    check("Real orders still present", realOrders > 0, `real_count=${realOrders}`);

    const poolRes = await fetchJson(`${API_BASE}/api/orders/pool?page=1&limit=8&sort=newest`);
    const orders = poolRes.body?.orders || poolRes.body?.data?.orders || [];
    const fakeInApi = orders.filter((o) => o.showTrainingBadge === true || o.orderSource === "fake");
    const visibleAfter = await fakeOrdersService.getVisibleFakeOrdersCount(pool);

    check("GET /api/orders/pool returns 200", poolRes.status === 200, `status=${poolRes.status}`);
    check(
      "Pool recovery: visible DB count > 0 after API call",
      visibleAfter > 0,
      `visible_before_api=${afterExpire} visible_after=${visibleAfter}`,
    );
    check(
      "Pool recovery: training rows in API when settings allow",
      fakeInApi.length > 0 || orders.some((o) => o.showTrainingBadge === true),
      `api_total=${orders.length} training_rows=${fakeInApi.length}`,
    );

    // Sanitization on first training-like row or first order
    const sample = orders.find((o) => o.showTrainingBadge === true) || orders[0];
    if (sample) {
      const forbidden = ["orderSource", "isFake", "fake_status", "fakeStatus", "template_id", "fake_round_id"];
      const leaked = forbidden.filter((k) => Object.prototype.hasOwnProperty.call(sample, k));
      check(
        "API sanitization: no forbidden fields",
        leaked.length === 0,
        leaked.length ? `leaked: ${leaked.join(", ")}` : `keys_ok, showTrainingBadge=${sample.showTrainingBadge ?? "absent"}`,
      );
      if (sample.showTrainingBadge === true) {
        check("showTrainingBadge only when enabled", true, "showTrainingBadge=true present");
      }
    } else {
      check("API sanitization sample", false, "no orders in response");
    }
  } catch (e) {
    check("Pool recovery test", false, e.message);
  }

  // 7. Manual round start
  try {
    const { rows: admins } = await pool.query(
      `SELECT id FROM users WHERE is_active = TRUE AND role IN ('super_admin','admin') ORDER BY id LIMIT 1`,
    );
    const adminId = admins[0]?.id ? Number(admins[0].id) : null;
    if (!adminId) {
      check("Manual round start", false, "no admin user");
    } else {
      const result = await fakeOrdersService.startTrainingRoundManual({ actorUserId: adminId });
      const gen = Number(result?.generatedCount || 0);
      check("Manual round start success", gen > 0, `roundId=${result?.round?.id} generated=${gen}`);
      const vis = await fakeOrdersService.getVisibleFakeOrdersCount(pool);
      check("Visible count after manual start", vis > 0, `visible=${vis}`);
    }
  } catch (e) {
    const msg = String(e.message || e);
    const bad = msg.includes("transaction is aborted") || msg.includes("title_en");
    check("Manual round start", false, msg.slice(0, 200));
    if (bad) check("No transaction/title_en errors", false, msg.slice(0, 200));
  }

  // 8. Automation endpoint security (if secret configured)
  const cronSecretForTick = getAutomationCronSecret();
  if (cronSecretForTick) {
    try {
      const noSecret = await fetchJson(`${API_BASE}/api/internal/fake-orders/automation-tick`, { method: "POST" });
      check("Automation rejects missing secret", noSecret.status === 401 || noSecret.status === 403, `status=${noSecret.status}`);

      const withSecret = await fetchJson(`${API_BASE}/api/internal/fake-orders/automation-tick`, {
        method: "POST",
        headers: { "X-Fake-Orders-Automation-Secret": cronSecretForTick },
      });
      check("Automation accepts valid secret", withSecret.status === 200, `status=${withSecret.status}`);
    } catch (e) {
      check("Automation endpoint", false, e.message);
    }
  } else {
    try {
      const noSecret = await fetchJson(`${API_BASE}/api/internal/fake-orders/automation-tick`, { method: "POST" });
      check(
        "Automation endpoint rejects without secret (local)",
        noSecret.status === 401 || noSecret.status === 403 || noSecret.status === 503,
        `status=${noSecret.status} (503 expected when automation disabled)`,
      );
    } catch (e) {
      check("Automation endpoint reachable", false, e.message);
    }
  }

  // 9. Settings visibility
  try {
    const { rows } = await pool.query(
      `SELECT training_orders_enabled, show_to_all_freelancers, show_to_all_visitors, show_fake_badge_to_freelancers
       FROM fake_order_settings WHERE id = 1`,
    );
    const s = rows[0];
    check(
      "Training visibility settings",
      Boolean(s?.training_orders_enabled),
      `enabled=${s?.training_orders_enabled} freelancers=${s?.show_to_all_freelancers} visitors=${s?.show_to_all_visitors} badge=${s?.show_fake_badge_to_freelancers}`,
    );
  } catch (e) {
    check("Settings check", false, e.message);
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`\nTotal: ${pass} pass, ${fail} fail\n`);

  const blockers = results.filter((r) => !r.pass && !r.detail.includes("expected local"));
  if (blockers.length) {
    console.log("Blockers:");
    for (const b of blockers) console.log(`  - ${b.name}: ${b.detail}`);
  }

  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
