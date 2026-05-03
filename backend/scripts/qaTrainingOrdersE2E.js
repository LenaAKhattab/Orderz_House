/**
 * One-off E2E QA for fake/training orders (DB + service calls).
 * Run: node scripts/qaTrainingOrdersE2E.js
 * Requires: DATABASE_URL, backend migrations applied.
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");

const results = { steps: [], summary: { pass: 0, fail: 0 } };

function step(name, pass, detail) {
  results.steps.push({ name, pass: !!pass, detail: detail || "" });
  if (pass) results.summary.pass += 1;
  else results.summary.fail += 1;
}

function short(obj) {
  try {
    return JSON.stringify(obj, null, 0).slice(0, 1200);
  } catch {
    return String(obj);
  }
}

async function main() {
  console.log("=== QA: Training / Fake Orders E2E ===\n");

  // --- 1) Setup / migrations ---
  let tables = [];
  try {
    const { rows } = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE 'fake_%'
      ORDER BY table_name`);
    tables = rows.map((r) => r.table_name);
    const need = [
      "fake_orders",
      "fake_order_rounds",
      "fake_order_round_items",
      "fake_order_settings",
      "fake_order_applications",
      "fake_order_templates",
    ];
    const missing = need.filter((t) => !tables.includes(t));
    step(
      "1. Tables exist (fake_*)",
      missing.length === 0,
      missing.length ? `Missing: ${missing.join(", ")}` : `Found ${tables.length} fake_* tables`,
    );
  } catch (e) {
    step("1. Tables exist", false, e.message);
  }

  let migFake = [];
  try {
    const { rows } = await pool.query(
      `SELECT version FROM schema_migrations WHERE version LIKE '%fake%' OR version LIKE '%040%' OR version LIKE '%037%' OR version LIKE '%030%' ORDER BY version`,
    );
    migFake = rows.map((r) => r.version);
    step("1b. schema_migrations (fake-related rows)", migFake.length > 0, short(migFake.slice(0, 15)));
  } catch (e) {
    step("1b. schema_migrations", false, e.message);
  }

  // Settings row
  let settingsRow = null;
  try {
    const { rows } = await pool.query(`SELECT * FROM fake_order_settings WHERE id = 1`);
    settingsRow = rows[0] || null;
    step("1c. fake_order_settings id=1", !!settingsRow, settingsRow ? `min=${settingsRow.min_orders} max=${settingsRow.max_orders}` : "no row");
  } catch (e) {
    step("1c. fake_order_settings", false, e.message);
  }

  // --- 2) Ensure 3 active templates in different category buckets ---
  let adminId = null;
  try {
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE is_active = TRUE AND role IN ('super_admin','admin') ORDER BY CASE WHEN role='super_admin' THEN 0 ELSE 1 END, id LIMIT 1`,
    );
    adminId = rows[0]?.id ? Number(rows[0].id) : null;
    step("2a. Admin actor for templates", !!adminId, adminId ? `user id=${adminId}` : "no admin user");
  } catch (e) {
    step("2a. Admin actor", false, e.message);
  }

  const catSamples = { content: null, programming: null, design: null };
  try {
    const { rows } = await pool.query(`
      SELECT id, name, slug FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 50`);
    for (const c of rows) {
      const b = fakeOrdersService.classifyMainCategory({ categoryName: c.name, categorySlug: c.slug });
      if (b === "content" && !catSamples.content) catSamples.content = c.id;
      if (b === "programming" && !catSamples.programming) catSamples.programming = c.id;
      if (b === "design" && !catSamples.design) catSamples.design = c.id;
    }
    const ok = catSamples.content && catSamples.programming && catSamples.design;
    step(
      "2b. Categories for 3 buckets (content/programming/design)",
      !!ok,
      ok ? short(catSamples) : "Could not resolve 3 buckets from category names — will use any 3 distinct categories",
    );
  } catch (e) {
    step("2b. Categories", false, e.message);
  }

  let createdTemplateIds = [];
  if (adminId) {
    try {
      const { rows: anyCats } = await pool.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 3`);
      const ids = [catSamples.content, catSamples.programming, catSamples.design].filter(Boolean);
      const fallback = anyCats.map((r) => r.id);
      const useCats = ids.length >= 3 ? [ids[0], ids[1], ids[2]] : fallback.slice(0, 3);
      if (useCats.length < 3) {
        step("2c. Create 3 templates", false, "Need at least 3 active categories in DB");
      } else {
        for (let i = 0; i < 3; i += 1) {
          const cid = useCats[i];
          const t = await fakeOrdersService.createTemplate({
            actorUserId: adminId,
            payload: {
              title: `QA Template ${i + 1} ${Date.now()}`,
              description: "QA E2E template body — min length for validation.",
              categoryId: cid,
              minBudget: 10,
              maxBudget: 50,
              currency: "JOD",
              minDuration: 1,
              maxDuration: 7,
              durationUnit: "days",
              skills: [],
              isActive: true,
            },
          });
          createdTemplateIds.push(Number(t.id));
        }
        step("2c. Created 3 active templates", createdTemplateIds.length === 3, `ids=${createdTemplateIds.join(",")}`);
      }
    } catch (e) {
      step("2c. Create templates", false, e.message);
    }
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, title, category_id, is_active FROM fake_order_templates WHERE id = ANY($1::bigint[])`,
      [createdTemplateIds.length ? createdTemplateIds : [-1]],
    );
    step("2d. DB rows for new templates", rows.length === createdTemplateIds.length, short(rows));
  } catch (e) {
    step("2d. DB verify templates", false, e.message);
  }

  // --- 3) Settings patch ---
  let planIdForSettings = null;
  try {
    const { rows } = await pool.query(`SELECT id FROM plans ORDER BY id LIMIT 1`);
    planIdForSettings = rows[0]?.id ? Number(rows[0].id) : null;
  } catch (_) {
    /* ignore */
  }

  if (adminId && settingsRow) {
    try {
      const patched = await fakeOrdersService.updateSettings({
        actorUserId: adminId,
        patch: {
          trainingOrdersEnabled: true,
          automationEnabled: true,
          minOrders: 3,
          maxOrders: 5,
          durationValue: 2,
          durationUnit: "minutes",
          categoryDistribution: { content: 34, programming: 33, design: 33 },
          showToAllFreelancers: true,
          showToAllVisitors: false,
          planIds: planIdForSettings ? [planIdForSettings] : [],
        },
      });
      const sum =
        patched.categoryDistribution.content +
        patched.categoryDistribution.programming +
        patched.categoryDistribution.design;
      step(
        "3. Settings saved (min 3, max 5, dist=100, short duration)",
        patched.minOrders === 3 && patched.maxOrders === 5 && sum === 100 && patched.trainingOrdersEnabled && patched.automationEnabled,
        `min=${patched.minOrders} max=${patched.maxOrders} dur=${patched.durationValue}${patched.durationUnit} nextAuto=${patched.nextAutomationRunAt}`,
      );
    } catch (e) {
      step("3. Settings patch", false, e.message);
    }
  } else {
    step("3. Settings patch", false, "skip: no admin or settings");
  }

  // --- 4) Manual round ---
  let roundResult = null;
  if (adminId) {
    try {
      roundResult = await fakeOrdersService.startTrainingRoundManual({ actorUserId: adminId });
      step(
        "4. Manual round start",
        !!(roundResult && roundResult.round && roundResult.generatedCount >= 1),
        roundResult ? `roundId=${roundResult.round?.id} generated=${roundResult.generatedCount}` : "null",
      );
    } catch (e) {
      step("4. Manual round start", false, e.message);
    }
  } else {
    step("4. Manual round", false, "skip: no admin");
  }

  const roundId = roundResult?.round?.id ? Number(roundResult.round.id) : null;
  let sampleOrders = [];
  if (roundId) {
    try {
      const { rows: rCheck } = await pool.query(
        `SELECT id, status, generated_count FROM fake_order_rounds WHERE id = $1`,
        [roundId],
      );
      const { rows: fo } = await pool.query(
        `SELECT id, title, fake_status, order_code FROM fake_orders WHERE fake_round_id = $1 ORDER BY id LIMIT 5`,
        [roundId],
      );
      const { rows: ri } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_round_items WHERE round_id = $1`, [roundId]);
      step(
        "4b. DB: active round + items + fake_orders",
        rCheck[0]?.status === "active" && fo.length > 0 && ri[0]?.c >= 1,
        `round status=${rCheck[0]?.status} fake_orders=${fo.length} items=${ri[0]?.c} sample=${short(fo.slice(0, 2))}`,
      );
      sampleOrders = fo;
    } catch (e) {
      step("4b. DB round details", false, e.message);
    }
  }

  // --- 5) Pool (service-level, same as API data path) ---
  let poolSample = null;
  try {
    const ordersService = require("../src/services/ordersService");
    const list = await ordersService.listPoolOrders({
      viewerUserId: null,
      viewerRole: null,
      page: 1,
      limit: 20,
    });
    const fakes = (list.orders || []).filter((o) => o.orderSource === "fake");
    poolSample = fakes[0] || null;
    step(
      "5. Pool list (guest): fake orders + orderSource",
      fakes.length >= 1,
      `total orders=${list.orders?.length ?? 0} fake count=${fakes.length} sample orderSource=${poolSample?.orderSource || "n/a"} id=${poolSample?.id}`,
    );
  } catch (e) {
    step("5. Pool list", false, e.message);
  }

  // --- 6) Freelancer apply + duplicate (needs active subscription per submitFakeTrainingBid) ---
  let freelancerId = null;
  try {
    const { rows } = await pool.query(`
      SELECT u.id
      FROM users u
      INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
        AND fs.status IN ('active', 'assigned_not_started')
      WHERE u.is_active = TRUE AND u.role = 'freelancer'
      ORDER BY u.id
      LIMIT 1`);
    freelancerId = rows[0]?.id ? Number(rows[0].id) : null;
    step("6a. Pick freelancer (with current subscription)", !!freelancerId, freelancerId ? `id=${freelancerId}` : "none");
  } catch (e) {
    step("6a. Freelancer", false, e.message);
  }

  const fakeOrderIdForBid = sampleOrders[0]?.id ? Number(sampleOrders[0].id) : null;
  if (freelancerId && fakeOrderIdForBid) {
    try {
      await fakeOrdersService.submitFakeTrainingBid({
        freelancerUserId: freelancerId,
        orderId: fakeOrderIdForBid,
        amount: 25,
        message: "QA first bid",
      });
      const { rows: apps } = await pool.query(
        `SELECT id, fake_order_id, freelancer_user_id FROM fake_order_applications WHERE fake_order_id = $1 AND freelancer_user_id = $2`,
        [fakeOrderIdForBid, freelancerId],
      );
      step("6b. First apply → fake_order_applications row", apps.length >= 1, short(apps[0]));

      await fakeOrdersService.submitFakeTrainingBid({
        freelancerUserId: freelancerId,
        orderId: fakeOrderIdForBid,
        amount: 30,
        message: "QA duplicate bid",
      });
      const { rows: apps2 } = await pool.query(
        `SELECT id, amount::text, proposal_message FROM fake_order_applications WHERE fake_order_id = $1 AND freelancer_user_id = $2`,
        [fakeOrderIdForBid, freelancerId],
      );
      const oneRow = apps2.length === 1;
      step("6c. Duplicate apply (upsert)", oneRow && Number(apps2[0].amount) === 30, short(apps2[0]));
    } catch (e) {
      step("6b/c Freelancer apply", false, e.message);
    }
  } else {
    step("6b/c Freelancer apply", false, "skip: no freelancer or fake order id");
  }

  // --- 7) Expiry: force round_items visible_until in the past + expireStaleItems ---
  if (roundId) {
    try {
      await pool.query(
        `UPDATE fake_order_round_items SET visible_until = NOW() - INTERVAL '1 minute', updated_at = NOW() WHERE round_id = $1`,
        [roundId],
      );
      await pool.query(
        `UPDATE fake_order_rounds SET expires_at = NOW() - INTERVAL '1 minute', updated_at = NOW() WHERE id = $1`,
        [roundId],
      );
      await fakeOrdersService.expireStaleItems();
      const { rows: items } = await pool.query(`SELECT status FROM fake_order_round_items WHERE round_id = $1`, [roundId]);
      const { rows: poolAfter } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM fake_orders fo
         INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
         WHERE fo.id = ANY($1::bigint[])`,
        [sampleOrders.map((o) => o.id)],
      );
      step(
        "7. Expiry: items expired, pool hides fakes",
        items.every((x) => x.status === "expired") && poolAfter[0].c === 0,
        `items statuses=${items.map((i) => i.status).join(",")} poolActiveCount=${poolAfter[0].c}`,
      );
    } catch (e) {
      step("7. Expiry", false, e.message);
    }
  } else {
    step("7. Expiry", false, "skip: no round");
  }

  // --- 8) Automation: new round (re-enable settings, set next run past) ---
  if (adminId) {
    try {
      await pool.query(
        `UPDATE fake_order_settings SET next_automation_run_at = NOW() - INTERVAL '1 second', automation_enabled = TRUE, training_orders_enabled = TRUE WHERE id = 1`,
      );
      await fakeOrdersService.runAutomationTick();
      const gs = await fakeOrdersService.getSettings();
      const { rows: rounds } = await pool.query(
        `SELECT id, status, round_source FROM fake_order_rounds ORDER BY id DESC LIMIT 3`,
      );
      step(
        "8. Automation tick after forcing past next_run",
        gs.lastAutomationStatus === "success" || gs.lastAutomationStatus === "skipped_no_templates" || gs.lastAutomationStatus === "skipped_lock",
        `lastStatus=${gs.lastAutomationStatus} nextAt=${gs.nextAutomationRunAt} recent rounds=${short(rounds)}`,
      );
    } catch (e) {
      step("8. Automation tick", false, e.message);
    }
  } else {
    step("8. Automation", false, "skip: no admin");
  }

  // --- 9) Edge cases ---
  if (adminId) {
    try {
      await fakeOrdersService.updateSettings({
        actorUserId: adminId,
        patch: {
          categoryDistribution: { content: 10, programming: 10, design: 10 },
        },
      });
      step("9a. Invalid % rejected", false, "should not run");
    } catch (e) {
      step("9a. Invalid % rejected", e.statusCode === 400 || String(e.message).includes("100"), e.message.slice(0, 80));
    }
  }

  // Logged-out apply: service rejects invalid freelancer id path
  try {
    await fakeOrdersService.submitFakeTrainingBid({ freelancerUserId: null, orderId: 999999999, amount: 1, message: "x" });
    step("9b. Null freelancer apply rejected", false, "unexpected success");
  } catch (e) {
    step("9b. Invalid/null freelancer apply errors", true, `${e.statusCode || ""} ${String(e.message).slice(0, 120)}`);
  }

  // --- Print report ---
  console.log("\n--- Step results ---\n");
  for (const s of results.steps) {
    console.log(`${s.pass ? "PASS" : "FAIL"} | ${s.name}`);
    if (s.detail) console.log(`      ${s.detail}\n`);
  }
  console.log(`\nTotal: ${results.summary.pass} pass, ${results.summary.fail} fail\n`);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
