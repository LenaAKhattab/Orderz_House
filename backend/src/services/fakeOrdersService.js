const { pool } = require("../config/db");
const { isFakeOrdersAutomationVerbose } = require("../config/fakeOrdersAutomation");
const {
  isAllowedCleanBudgetRange,
  inferComplexityProfile,
  normalizeToCleanBudgetRange,
} = require("../utils/fakeBudgetRanges");

/** Session advisory lock: cross-process generation guard (PostgreSQL). */
const AUTOMATION_GENERATION_LOCK_KEY = 882947361;

function logAutomationEvent(event, fields = {}) {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      component: "fake_orders_automation",
      event,
      pid: process.pid,
      ...fields,
    }),
  );
}

function randomInt(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function classifyMainCategory({ categoryName, categorySlug }) {
  const name = String(categoryName || "").toLowerCase();
  const slug = String(categorySlug || "").toLowerCase();
  const text = `${name} ${slug}`;
  if (text.includes("content") || text.includes("محتوى") || text.includes("كتابة")) return "content";
  if (text.includes("program") || text.includes("برمج") || text.includes("development")) return "programming";
  if (text.includes("design") || text.includes("تصميم")) return "design";
  return "other";
}

function normalizeCategoryDistribution(raw) {
  const base = {
    content: Number(raw?.content || 0),
    programming: Number(raw?.programming || 0),
    design: Number(raw?.design || 0),
  };
  return {
    content: Number.isFinite(base.content) ? Math.max(0, base.content) : 0,
    programming: Number.isFinite(base.programming) ? Math.max(0, base.programming) : 0,
    design: Number.isFinite(base.design) ? Math.max(0, base.design) : 0,
  };
}

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Wall-clock offset for visibility / automation scheduling */
function msFromDurationSettings(value, unit) {
  const v = Number(value);
  const u = String(unit || "").toLowerCase();
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (u === "minutes") return v * 60 * 1000;
  if (u === "hours") return v * 60 * 60 * 1000;
  if (u === "days") return v * 24 * 60 * 60 * 1000;
  return 0;
}

/** Random sub-range within template min/max budget (JOD / 2 decimal). */
function randomBidRangeFromTemplate(t) {
  const lo = Number(t.min_budget);
  const hi = Number(t.max_budget);
  const profile = inferComplexityProfile({
    categoryBucket: classifyMainCategory({ categoryName: t.category_name, categorySlug: t.category_slug }),
    title: t.title,
    description: t.description,
    categoryName: t.category_name,
    subcategoryName: t.subcategory_name,
  });
  const normalized = normalizeToCleanBudgetRange(lo, hi, profile);
  return { bidMin: normalized.min, bidMax: normalized.max };
}

/**
 * End all active training rounds (items + fake_orders + round row) so a new sole-active round can start.
 * Replaced rounds use status `stopped` (superseded); time-expired rounds remain `expired` via expireStaleItems.
 */
async function supersedeActiveTrainingRounds(client) {
  const { rows: active } = await client.query(
    `SELECT id FROM fake_order_rounds WHERE status = 'active' ORDER BY id ASC FOR UPDATE`,
  );
  for (const row of active) {
    const rid = Number(row.id);
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE fake_order_round_items SET status = 'expired', updated_at = NOW()
       WHERE round_id = $1 AND status = 'active'`,
      [rid],
    );
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE fake_orders SET fake_status = 'expired', updated_at = NOW()
       WHERE fake_round_id = $1 AND fake_status = 'active'`,
      [rid],
    );
    // eslint-disable-next-line no-await-in-loop
    await client.query(`UPDATE fake_order_rounds SET status = 'stopped', updated_at = NOW() WHERE id = $1`, [rid]);
  }
}

function allocateBucketSlots(total, dist) {
  const d = normalizeCategoryDistribution(dist);
  const keys = ["content", "programming", "design"];
  const parts = keys.map((k) => ({ k, raw: (total * d[k]) / 100 }));
  const floors = parts.map(({ k, raw }) => ({ k, f: Math.floor(raw), frac: raw - Math.floor(raw) }));
  let used = floors.reduce((s, x) => s + x.f, 0);
  const slots = [];
  for (const { k, f } of floors) {
    for (let i = 0; i < f; i += 1) slots.push(k);
  }
  let rem = total - used;
  const order = floors.slice().sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < rem; i += 1) slots.push(order[i % order.length].k);
  return shuffleArray(slots);
}

async function resolveAutomationActorUserId(client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT id FROM users
     WHERE is_active = TRUE AND role IN ('super_admin', 'admin')
     ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * Creates bidding fake_orders rows from templates. Does not touch real `orders`.
 * Caller must run inside a transaction.
 */
async function insertFakeOrderFromTemplate(client, { template, roundId, actorUserId, settings, visibleUntil, createdByRole, sourceType }) {
  const orderCode = await generateUniqueOrderCode(client);
  const durVal = randomInt(Number(template.min_duration), Number(template.max_duration));
  const durUnit = String(template.duration_unit || "days");
  const title = String(template.title || "").trim();
  const description = String(template.description || "").trim();
  const categoryId = Number(template.category_id);
  const subcategoryId = template.subcategory_id ? Number(template.subcategory_id) : null;
  const subSubcategoryId = template.sub_subcategory_id ? Number(template.sub_subcategory_id) : null;
  const { bidMin: minB, bidMax: maxB } = randomBidRangeFromTemplate(template);
  const currency = "JOD";
  const uid = Number(actorUserId);
  const rid = Number(roundId);
  const showBadge = Boolean(settings.show_fake_badge_to_freelancers);
  const cbr = createdByRole === "super_admin" ? "super_admin" : "admin";
  const st = sourceType || (cbr === "super_admin" ? "super_admin_created" : "admin_created");

  const tplId = template.id != null ? Number(template.id) : null;

  const { rows } = await client.query(
    `INSERT INTO fake_orders (
      order_code, title, description,
      category_id, subcategory_id, sub_subcategory_id,
      extra_category_ids, extra_category_details,
      project_type, budget, currency_code, duration_value, duration_unit,
      created_by_user_id, created_by_role, source_type,
      assigned_freelancer_id,
      is_direct_admin_assignment,
      received_at, started_at, due_at,
      is_published, is_open_for_pool,
      is_archived,
      payment_required, payment_status,
      order_status,
      bid_budget_min, bid_budget_max,
      template_id,
      fake_status, is_fake, fake_round_id, show_fake_badge, fake_expires_at
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6,
      '{}'::bigint[], '{}'::jsonb,
      'bidding', NULL, $7, $8, $9,
      $10, $11, $12,
      NULL,
      FALSE,
      NULL, NULL, NULL,
      TRUE, TRUE,
      FALSE,
      FALSE, 'not_required',
      'published',
      $13, $14,
      $15,
      'active', TRUE, $16, $17, $18
    )
    RETURNING id`,
    [
      orderCode,
      title,
      description,
      categoryId,
      Number.isInteger(subcategoryId) && subcategoryId > 0 ? subcategoryId : null,
      Number.isInteger(subSubcategoryId) && subSubcategoryId > 0 ? subSubcategoryId : null,
      currency,
      durVal,
      durUnit,
      uid,
      cbr,
      st,
      minB,
      maxB,
      Number.isInteger(tplId) && tplId > 0 ? tplId : null,
      rid,
      showBadge,
      visibleUntil,
    ],
  );
  return Number(rows[0].id);
}

async function loadActiveTemplatesForGeneration(client) {
  const { rows } = await client.query(
    `SELECT t.*, c.name AS category_name, c.slug AS category_slug
     FROM fake_order_templates t
     INNER JOIN categories c ON c.id = t.category_id AND c.is_active = TRUE
     WHERE t.is_active = TRUE`,
  );
  return rows;
}

function buildTemplateBuckets(templateRows) {
  const byBucket = { content: [], programming: [], design: [], other: [] };
  for (const t of templateRows) {
    const bucket = classifyMainCategory({ categoryName: t.category_name, categorySlug: t.category_slug });
    if (bucket === "other") byBucket.other.push(t);
    else byBucket[bucket].push(t);
  }
  return byBucket;
}

/** DISTINCT template_id from fake_orders tied to the currently active round (queried before supersede). */
async function loadTemplateIdsUsedInActiveRound(client) {
  const { rows } = await client.query(
    `SELECT DISTINCT fo.template_id
     FROM fake_orders fo
     INNER JOIN fake_order_rounds fr ON fr.id = fo.fake_round_id AND fr.status = 'active'
     WHERE fo.template_id IS NOT NULL`,
  );
  return new Set(rows.map((r) => Number(r.template_id)).filter((id) => Number.isInteger(id) && id > 0));
}

function filterTemplatesNotInSet(templates, excluded) {
  if (!excluded || excluded.size === 0) return templates;
  return templates.filter((t) => t && !excluded.has(Number(t.id)));
}

/**
 * One slot: same bucket / fallback rules as before, but prefer templates not used in the last active round.
 */
function pickTemplateForBucketWithExclusion(bucket, byBucket, allRows, excludedLastRound) {
  const ex = excludedLastRound instanceof Set ? excludedLastRound : new Set(excludedLastRound || []);
  const pick = (arr) => (Array.isArray(arr) && arr.length ? pickRandom(arr) : null);

  const bucketRows = byBucket[bucket] && byBucket[bucket].length ? byBucket[bucket] : [];
  const freshBucket = filterTemplatesNotInSet(bucketRows, ex);
  if (freshBucket.length) return pick(freshBucket);
  if (bucketRows.length) return pick(bucketRows);

  const allFresh = filterTemplatesNotInSet(allRows, ex);
  if (allFresh.length) return pick(allFresh);
  if (allRows.length) return pick(allRows);

  const otherFresh = filterTemplatesNotInSet(byBucket.other, ex);
  if (otherFresh.length) return pick(otherFresh);
  if (byBucket.other.length) return pick(byBucket.other);
  return allRows.length ? pick(allRows) : null;
}

/**
 * @returns {Promise<{ ok: boolean, code?: string, round?: object, generatedCount?: number }>}
 */
async function generateTrainingRoundInternal(client, { actorUserId, roundSource }) {
  const uid = Number(actorUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("معرّف المستخدم غير صالح لتوليد الجولة.");
    err.statusCode = 500;
    throw err;
  }
  const src = roundSource === "manual" || roundSource === "automation" ? roundSource : "automation";

  const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
  const s = sRows[0];
  if (!s) {
    const err = new Error("إعدادات الطلبات التجريبية غير متاحة.");
    err.statusCode = 500;
    throw err;
  }
  if (!s.training_orders_enabled) {
    const err = new Error("الطلبات التجريبية غير مفعّلة في الإعدادات.");
    err.statusCode = 400;
    throw err;
  }

  const minOrders = Number(s.min_orders);
  const maxOrders = Number(s.max_orders);
  if (!(minOrders >= 1) || !(maxOrders >= minOrders)) {
    const err = new Error("نطاق عدد الطلبات غير صالح.");
    err.statusCode = 400;
    throw err;
  }

  const templateRows = await loadActiveTemplatesForGeneration(client);
  if (!templateRows.length) {
    return { ok: false, code: "NO_TEMPLATES" };
  }

  const desiredN = randomInt(minOrders, maxOrders);
  const n = Math.min(desiredN, templateRows.length);
  if (!(n >= 1)) {
    return { ok: false, code: "NO_TEMPLATES" };
  }

  const excludedLastRoundIds = await loadTemplateIdsUsedInActiveRound(client);

  await supersedeActiveTrainingRounds(client);

  const dist = normalizeCategoryDistribution(s.category_distribution || {});
  const slots = allocateBucketSlots(n, dist);
  const byBucket = buildTemplateBuckets(templateRows);
  const picks = [];
  for (const bucket of slots) {
    picks.push(pickTemplateForBucketWithExclusion(bucket, byBucket, templateRows, excludedLastRoundIds));
  }

  const visMs = msFromDurationSettings(s.duration_value, s.duration_unit);
  if (!(visMs > 0)) {
    const err = new Error("مدة ظهور الجولة غير صالحة.");
    err.statusCode = 400;
    throw err;
  }

  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + visMs);
  const visibleUntil = expiresAt;

  const { rows: planRows } = await client.query(`SELECT plan_id FROM fake_order_settings_plans ORDER BY id ASC`);
  const planIds = planRows.map((r) => Number(r.plan_id)).filter((x) => Number.isInteger(x) && x > 0);

  const { rows: actorRows } = await client.query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [uid]);
  const actorRole = String(actorRows[0]?.role || "admin");
  const createdByRole = actorRole === "super_admin" ? "super_admin" : "admin";
  const orderSourceType = createdByRole === "super_admin" ? "super_admin_created" : "admin_created";

  const titleBase =
    s.optional_round_name && String(s.optional_round_name).trim()
      ? String(s.optional_round_name).trim()
      : `جولة تجريبية - ${startsAt.toLocaleString("ar-JO", { hour12: false })}`;

  const durationHours = Math.min(720, Math.max(1, Math.ceil(visMs / (60 * 60 * 1000))));

  const settingsSnapshot = {
    min_orders: minOrders,
    max_orders: maxOrders,
    requested_order_count: desiredN,
    generated_order_count_cap: n,
    template_pool_size: templateRows.length,
    duration_value: Number(s.duration_value),
    duration_unit: String(s.duration_unit || "hours"),
    automation_interval_value: Number(s.duration_value),
    automation_interval_unit: String(s.duration_unit || "hours"),
    category_distribution: dist,
    show_to_all_visitors: Boolean(s.show_to_all_visitors),
    show_to_all_freelancers: Boolean(s.show_to_all_freelancers),
    eligible_plan_ids: planIds,
    round_source: src,
  };

  const { rows: rIns } = await client.query(
    `INSERT INTO fake_order_rounds (
      title, min_orders, max_orders, generated_count,
      duration_hours, starts_at, expires_at, status,
      show_fake_badge_to_freelancers, show_to_all_freelancers,
      created_by, round_source, settings_snapshot,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, 0,
      $4, $5, $6, 'active',
      $7, $8,
      $9, $10, $11::jsonb,
      NOW(), NOW()
    ) RETURNING *`,
    [
      titleBase.slice(0, 200),
      minOrders,
      maxOrders,
      durationHours,
      startsAt,
      expiresAt,
      Boolean(s.show_fake_badge_to_freelancers),
      Boolean(s.show_to_all_freelancers),
      uid,
      src,
      JSON.stringify(settingsSnapshot),
    ],
  );
  const roundRow = rIns[0];
  const roundId = Number(roundRow.id);

  for (const pid of planIds) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO fake_order_round_plans (fake_round_id, plan_id, created_at) VALUES ($1, $2, NOW())
       ON CONFLICT (fake_round_id, plan_id) DO NOTHING`,
      [roundId, pid],
    );
  }

  let generated = 0;
  for (const tpl of picks) {
    if (!tpl) continue;
    // eslint-disable-next-line no-await-in-loop
    const fakeOrderId = await insertFakeOrderFromTemplate(client, {
      template: tpl,
      roundId,
      actorUserId: uid,
      settings: s,
      visibleUntil,
      createdByRole,
      sourceType: orderSourceType,
    });
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO fake_order_round_items (round_id, fake_order_id, visible_from, visible_until, status, created_at, updated_at)
       VALUES ($1, $2, NOW(), $3, 'active', NOW(), NOW())`,
      [roundId, fakeOrderId, visibleUntil],
    );
    generated += 1;
  }

  if (generated < 1) {
    const err = new Error("تعذر توليد طلبات وهمية — لم يُنشأ أي طلب.");
    err.statusCode = 500;
    throw err;
  }

  await client.query(`UPDATE fake_order_rounds SET generated_count = $1, updated_at = NOW() WHERE id = $2`, [generated, roundId]);

  const { rows: outRound } = await client.query(`SELECT * FROM fake_order_rounds WHERE id = $1`, [roundId]);
  return { ok: true, round: mapRound(outRound[0]), generatedCount: generated };
}

async function startTrainingRoundManual({ actorUserId }) {
  const runStartedAt = new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock($1::bigint) AS got`, [
      AUTOMATION_GENERATION_LOCK_KEY,
    ]);
    if (!lockRows[0]?.got) {
      await client.query("ROLLBACK");
      const err = new Error("عملية توليد جولة قيد التنفيذ. حاول بعد لحظات.");
      err.statusCode = 409;
      throw err;
    }
    try {
      await assertAdminOrSuperAdmin(actorUserId, client);
      const actor = Number(actorUserId);
      const result = await generateTrainingRoundInternal(client, { actorUserId: actor, roundSource: "manual" });
      if (!result.ok && result.code === "NO_TEMPLATES") {
        await client.query("ROLLBACK");
        await insertAutomationLogSafe(pool, {
          runStartedAt,
          status: "skipped_no_templates",
          errorMessage: null,
          roundId: null,
          generatedCount: null,
          source: "manual",
        });
        const err = new Error("لا توجد قوالب طلبات نشطة. أضف قوالبًا أو فعّل القوالب والتصنيفات قبل بدء الجولة.");
        err.statusCode = 400;
        throw err;
      }
      const roundId = result.round?.id ? Number(result.round.id) : null;
      const genCount = result.generatedCount != null ? Number(result.generatedCount) : null;
      await client.query(
        `UPDATE fake_order_settings SET
           last_automation_run_at = NOW(),
           last_automation_status = $1,
           last_automation_error = NULL,
           last_automation_round_id = $2,
           last_automation_generated_count = $3,
           updated_at = NOW()
         WHERE id = 1`,
        ["success", roundId, genCount],
      );
      await client.query("COMMIT");
      await insertAutomationLogSafe(pool, {
        runStartedAt,
        status: "success",
        errorMessage: null,
        roundId,
        generatedCount: genCount,
        source: "manual",
      });
      return result;
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [AUTOMATION_GENERATION_LOCK_KEY]);
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* transaction may already be closed */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function assertAdminOrSuperAdmin(userId, client) {
  const { rows } = await client.query(`SELECT role, is_active FROM users WHERE id = $1 LIMIT 1`, [Number(userId)]);
  const u = rows[0];
  if (!u || !u.is_active || !["admin", "super_admin"].includes(String(u.role || ""))) {
    const err = new Error("غير مصرح.");
    err.statusCode = 403;
    throw err;
  }
}

async function generateUniqueOrderCode(client) {
  const runner = client || pool;
  for (let i = 0; i < 20; i += 1) {
    const code = `ORD-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    // eslint-disable-next-line no-await-in-loop
    const { rowCount: o1 } = await runner.query(`SELECT 1 FROM orders WHERE order_code = $1`, [code]);
    // eslint-disable-next-line no-await-in-loop
    const { rowCount: o2 } = await runner.query(`SELECT 1 FROM fake_orders WHERE order_code = $1`, [code]);
    if (!o1 && !o2) return code;
  }
  const err = new Error("تعذر توليد رقم طلب فريد.");
  err.statusCode = 500;
  throw err;
}

/** Visibility: training master switch + active round item + plan / visitor rules */
async function poolViewerMaySeeFakeOrders({ userId, role }) {
  const { rows: srows } = await pool.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
  const s = srows[0];
  if (!s) return false;
  if (typeof s.training_orders_enabled === "boolean" && !s.training_orders_enabled) return false;
  const uid = userId ? Number(userId) : null;
  const isFreelancer = role === "freelancer" && Number.isInteger(uid) && uid > 0;
  const showAll = Boolean(s.show_to_all_visitors) || Boolean(s.show_to_all_freelancers);
  if (showAll) return true;
  if (!isFreelancer) return false;
  const { rows: prow } = await pool.query(
    `SELECT 1
     FROM freelancer_subscriptions fs
     INNER JOIN fake_order_settings_plans sp ON sp.plan_id = fs.plan_id
     WHERE fs.freelancer_user_id = $1 AND fs.is_current = TRUE
       AND fs.status IN ('active', 'assigned_not_started')
     LIMIT 1`,
    [uid],
  );
  return Boolean(prow[0]);
}

/** Freelancer applying to a training fake order must match pool visibility rules. */
async function assertFreelancerMayApplyToTrainingOrders(freelancerUserId) {
  const uid = Number(freelancerUserId);
  const ok = await poolViewerMaySeeFakeOrders({ userId: uid, role: "freelancer" });
  if (!ok) {
    const err = new Error("لا يمكنك التقديم على هذا الطلب التجريبي وفق إعدادات الظهور.");
    err.statusCode = 403;
    throw err;
  }
}

function mapTemplate(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    categoryId: String(row.category_id),
    subcategoryId: row.subcategory_id ? String(row.subcategory_id) : null,
    subSubcategoryId: row.sub_subcategory_id ? String(row.sub_subcategory_id) : null,
    categoryName: row.category_name || null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    minBudget: Number(row.min_budget),
    maxBudget: Number(row.max_budget),
    currency: row.currency || "JOD",
    minDuration: Number(row.min_duration),
    maxDuration: Number(row.max_duration),
    durationUnit: row.duration_unit,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettings(row, planRows = []) {
  if (!row) return null;
  const dv = Number(row.duration_value);
  const du = String(row.duration_unit || "hours").trim();
  const duOk = ["minutes", "hours", "days"].includes(du);
  return {
    trainingOrdersEnabled: row.training_orders_enabled === true,
    automationEnabled: Boolean(row.automation_enabled),
    /** @deprecated Same as durationValue/Unit; kept for API compatibility. */
    automationIntervalValue: Number.isFinite(dv) && dv > 0 ? dv : null,
    /** @deprecated Same as durationValue/Unit; kept for API compatibility. */
    automationIntervalUnit: duOk ? du : null,
    minOrders: Number(row.min_orders),
    maxOrders: Number(row.max_orders),
    durationValue: Number.isFinite(dv) && dv > 0 ? dv : 12,
    durationUnit: duOk ? du : "hours",
    showToAllFreelancers: Boolean(row.show_to_all_freelancers),
    showToAllVisitors: Boolean(row.show_to_all_visitors),
    categoryDistribution: normalizeCategoryDistribution(row.category_distribution || {}),
    nextAutomationRunAt: row.next_automation_run_at || null,
    optionalRoundName: row.optional_round_name || null,
    updatedBy: row.updated_by ? String(row.updated_by) : null,
    updatedAt: row.updated_at,
    planIds: planRows.map((p) => String(p.plan_id)),
    plans: planRows.map((p) => ({
      id: String(p.plan_id),
      title: p.title || p.name || `#${p.plan_id}`,
      name: p.name || null,
    })),
    lastAutomationRunAt: row.last_automation_run_at || null,
    lastAutomationStatus: row.last_automation_status || null,
    lastAutomationError: row.last_automation_error || null,
    lastAutomationRoundId: row.last_automation_round_id != null ? String(row.last_automation_round_id) : null,
    lastAutomationGeneratedCount:
      row.last_automation_generated_count != null ? Number(row.last_automation_generated_count) : null,
    lastAutomationNextAt: row.last_automation_next_at || null,
  };
}

async function getSettings() {
  const [settingsRes, planRes] = await Promise.all([
    pool.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`),
    pool.query(
      `SELECT sp.plan_id, p.title, p.name
       FROM fake_order_settings_plans sp
       LEFT JOIN plans p ON p.id = sp.plan_id
       ORDER BY sp.id ASC`,
    ),
  ]);
  return mapSettings(settingsRes.rows[0], planRes.rows);
}

async function updateSettings({ actorUserId, patch }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const currentRes = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
    const current = currentRes.rows[0];
    if (!current) {
      const err = new Error("إعدادات الطلبات التجريبية غير متاحة.");
      err.statusCode = 500;
      throw err;
    }
    const minOrders = patch.minOrders !== undefined ? Number(patch.minOrders) : Number(current.min_orders);
    const maxOrders = patch.maxOrders !== undefined ? Number(patch.maxOrders) : Number(current.max_orders);
    const durationValue =
      patch.durationValue !== undefined ? Number(patch.durationValue) : Number(current.duration_value || current.duration_hours);
    const durationUnit = patch.durationUnit !== undefined ? String(patch.durationUnit) : String(current.duration_unit || "hours");
    if (!Number.isFinite(durationValue) || durationValue <= 0 || !["minutes", "hours", "days"].includes(durationUnit)) {
      const err = new Error("مدة الجولة غير صالحة (قيمة موجبة ووحدة: دقائق / ساعات / أيام).");
      err.statusCode = 400;
      throw err;
    }
    const dist = patch.categoryDistribution
      ? normalizeCategoryDistribution(patch.categoryDistribution)
      : normalizeCategoryDistribution(current.category_distribution || {});
    const sum = dist.content + dist.programming + dist.design;
    if (sum !== 100) {
      const err = new Error("مجموع نسب التصنيفات يجب أن يساوي 100٪.");
      err.statusCode = 400;
      throw err;
    }
    if (!(minOrders >= 1) || !(maxOrders >= minOrders)) {
      const err = new Error("الحد الأدنى والأعلى للطلبات غير صالحين.");
      err.statusCode = 400;
      throw err;
    }
    const showToAll = patch.showToAllVisitors !== undefined ? Boolean(patch.showToAllVisitors) : Boolean(current.show_to_all_visitors);
    const showFreelancers =
      patch.showToAllFreelancers !== undefined ? Boolean(patch.showToAllFreelancers) : Boolean(current.show_to_all_freelancers);
    const planIds = Array.isArray(patch.planIds) ? patch.planIds.map((x) => Number(x)).filter((n) => n > 0) : null;
    if (!showToAll && !showFreelancers && (!planIds || planIds.length === 0)) {
      const err = new Error("اختر إظهار الطلبات التجريبية لجميع الزوار/المستقلين أو حدد باقة واحدة على الأقل.");
      err.statusCode = 400;
      throw err;
    }
    const trainingOn = patch.trainingOrdersEnabled !== undefined ? Boolean(patch.trainingOrdersEnabled) : Boolean(current.training_orders_enabled);
    const autoOn = patch.automationEnabled !== undefined ? Boolean(patch.automationEnabled) : Boolean(current.automation_enabled);
    /** Mirror legacy columns from مدة الجولة (single source of truth). */
    const mirroredIntervalValue = durationValue;
    const mirroredIntervalUnit = durationUnit;
    const prevAuto = Boolean(current.automation_enabled);
    const prevDur = Number(current.duration_value);
    const prevDu = String(current.duration_unit || "hours");
    const durationChanged = Number(durationValue) !== prevDur || String(durationUnit) !== prevDu;
    const turnedAutomationOn = autoOn && !prevAuto;

    let nextAutomationRunAt = current.next_automation_run_at;
    if (!autoOn) {
      nextAutomationRunAt = null;
    } else if (turnedAutomationOn || !current.next_automation_run_at || durationChanged) {
      nextAutomationRunAt = new Date(Date.now() + msFromDurationSettings(durationValue, durationUnit));
    }

    await client.query(
      `UPDATE fake_order_settings
       SET min_orders = $1, max_orders = $2,
           duration_value = $3, duration_unit = $4,
           category_distribution = $5::jsonb,
           show_to_all_freelancers = $6,
           show_to_all_visitors = $7,
           training_orders_enabled = $8,
           automation_enabled = $9,
           automation_interval_value = $10,
           automation_interval_unit = $11,
           optional_round_name = COALESCE($12, optional_round_name),
           next_automation_run_at = $13,
           updated_by = $14, updated_at = NOW()
       WHERE id = 1`,
      [
        minOrders,
        maxOrders,
        durationValue,
        durationUnit,
        JSON.stringify(dist),
        showFreelancers,
        showToAll,
        trainingOn,
        autoOn,
        mirroredIntervalValue,
        mirroredIntervalUnit,
        patch.optionalRoundName != null ? String(patch.optionalRoundName).slice(0, 200) : null,
        nextAutomationRunAt,
        Number(actorUserId),
      ],
    );
    if (planIds) {
      await client.query(`DELETE FROM fake_order_settings_plans`);
      for (const pid of planIds) {
        // eslint-disable-next-line no-await-in-loop
        await client.query(`INSERT INTO fake_order_settings_plans (plan_id, created_at) VALUES ($1, NOW())`, [pid]);
      }
    }
    await client.query("COMMIT");
    return getSettings();
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function hasPricedBiddingFakeRow(row) {
  return row.bid_budget_min != null && row.bid_budget_max != null;
}

/**
 * Single fake training order for pool detail (same card shape as list).
 * Caller must already verify poolViewerMaySeeFakeOrders.
 */
async function getFakePoolOrderMapped({ orderId, freelancerUserId }) {
  const oid = Number(orderId);
  const uid = freelancerUserId && Number(freelancerUserId) > 0 ? Number(freelancerUserId) : null;
  const { mapListOrderRow } = require("./ordersService");
  const sqlWithUser = `
      SELECT
        fo.*,
        ri.visible_from AS pool_listed_at,
        c.slug AS category_slug,
        c.name AS category_name,
        ss.slug AS sub_subcategory_slug,
        ss.name AS sub_subcategory_name,
        ss.subcategory_id AS sub_subcategory_parent_id,
        0::int AS files_count,
        COALESCE(appc.applicants_count, 0)::int AS applicants_count,
        fa.id AS my_bid_id,
        fa.amount AS my_bid_amount,
        fa.status AS my_bid_status
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
        AND ri.visible_from <= NOW() AND ri.visible_until >= NOW()
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
      LEFT JOIN categories c ON c.id = fo.category_id
      LEFT JOIN sub_subcategories ss ON ss.id = fo.sub_subcategory_id
      LEFT JOIN (
        SELECT fake_order_id, COUNT(DISTINCT freelancer_user_id)::int AS applicants_count
        FROM fake_order_applications
        GROUP BY fake_order_id
      ) appc ON appc.fake_order_id = fo.id
      LEFT JOIN fake_order_applications fa ON fa.fake_order_id = fo.id
        AND fa.freelancer_user_id = $2 AND fa.round_id = ri.round_id
      WHERE fo.id = $1 AND fo.fake_status = 'active'`;
  const sqlPublic = `
      SELECT
        fo.*,
        ri.visible_from AS pool_listed_at,
        c.slug AS category_slug,
        c.name AS category_name,
        ss.slug AS sub_subcategory_slug,
        ss.name AS sub_subcategory_name,
        ss.subcategory_id AS sub_subcategory_parent_id,
        0::int AS files_count,
        COALESCE(appc.applicants_count, 0)::int AS applicants_count
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
        AND ri.visible_from <= NOW() AND ri.visible_until >= NOW()
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
      LEFT JOIN categories c ON c.id = fo.category_id
      LEFT JOIN sub_subcategories ss ON ss.id = fo.sub_subcategory_id
      LEFT JOIN (
        SELECT fake_order_id, COUNT(DISTINCT freelancer_user_id)::int AS applicants_count
        FROM fake_order_applications
        GROUP BY fake_order_id
      ) appc ON appc.fake_order_id = fo.id
      WHERE fo.id = $1 AND fo.fake_status = 'active'`;
  const { rows } = await pool.query(uid ? sqlWithUser : sqlPublic, uid ? [oid, uid] : [oid]);
  const row = rows[0];
  if (!row) return null;
  const mapped = mapListOrderRow(row);
  if (!mapped) return null;
  mapped.orderSource = "fake";
  if (row.show_fake_badge) mapped.trainingLabel = "طلب تجريبي";
  if (row.pool_listed_at != null) {
    mapped.createdAt = row.pool_listed_at;
    mapped.poolListedAt = row.pool_listed_at;
  }
  return mapped;
}

async function submitFakeTrainingBid({ freelancerUserId, orderId, amount, message }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const uid = Number(freelancerUserId);
    const oid = Number(orderId);
    await assertFreelancerMayApplyToTrainingOrders(uid);
    const subscriptionsService = require("./subscriptionsService");
    const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(uid));
    if (!eligibility.eligible) {
      const err = new Error("Your subscription is not active. You cannot submit bids.");
      err.statusCode = 403;
      throw err;
    }
    const { rows: foRows } = await client.query(
      `SELECT fo.*, ri.round_id, ri.visible_until
       FROM fake_orders fo
       INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
         AND ri.visible_from <= NOW() AND ri.visible_until >= NOW()
       INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
       WHERE fo.id = $1 AND fo.fake_status = 'active'
       FOR UPDATE OF fo`,
      [oid],
    );
    const fo = foRows[0];
    if (!fo) {
      const err = new Error("الطلب غير متاح.");
      err.statusCode = 404;
      throw err;
    }
    if (fo.project_type !== "bidding") {
      const err = new Error("هذا الطلب لا يقبل عروض الأسعار.");
      err.statusCode = 409;
      throw err;
    }
    const bid = Number(amount);
    const min = Number(fo.bid_budget_min);
    const max = Number(fo.bid_budget_max);
    if (!Number.isFinite(bid) || bid < min || bid > max) {
      const err = new Error("مبلغ العرض غير ضمن النطاق.");
      err.statusCode = 400;
      throw err;
    }
    const msg = message != null ? String(message).trim() : null;
    await client.query(
      `INSERT INTO fake_order_applications (fake_order_id, round_id, freelancer_user_id, amount, proposal_message, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (fake_order_id, round_id, freelancer_user_id)
       DO UPDATE SET amount = EXCLUDED.amount, proposal_message = EXCLUDED.proposal_message, updated_at = NOW()`,
      [oid, Number(fo.round_id), uid, bid, msg],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function submitFakeTrainingClaim({ freelancerUserId, orderId, message = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const uid = Number(freelancerUserId);
    const oid = Number(orderId);
    await assertFreelancerMayApplyToTrainingOrders(uid);
    const subscriptionsService = require("./subscriptionsService");
    const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(uid));
    if (!eligibility.eligible) {
      const err = new Error("Your subscription is not active. You cannot take orders.");
      err.statusCode = 403;
      throw err;
    }
    const { rows: foRows } = await client.query(
      `SELECT fo.*, ri.round_id
       FROM fake_orders fo
       INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
         AND ri.visible_from <= NOW() AND ri.visible_until >= NOW()
       INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id AND fr.status = 'active'
       WHERE fo.id = $1 AND fo.fake_status = 'active'
       FOR UPDATE OF fo`,
      [oid],
    );
    const fo = foRows[0];
    if (!fo) {
      const err = new Error("الطلب غير متاح.");
      err.statusCode = 404;
      throw err;
    }
    if (hasPricedBiddingFakeRow(fo)) {
      const err = new Error("هذا الطلب يتطلب تقديم عرض سعر.");
      err.statusCode = 409;
      throw err;
    }
    const budget = fo.budget != null ? Number(fo.budget) : null;
    const amount = budget != null && Number.isFinite(budget) && budget > 0 ? budget : 1;
    const msg = message != null ? String(message).trim() : null;
    await client.query(
      `INSERT INTO fake_order_applications (fake_order_id, round_id, freelancer_user_id, amount, proposal_message, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (fake_order_id, round_id, freelancer_user_id)
       DO UPDATE SET proposal_message = COALESCE(EXCLUDED.proposal_message, fake_order_applications.proposal_message), updated_at = NOW()`,
      [oid, Number(fo.round_id), uid, amount, msg],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Time-based expiry. Idempotent: only rows that still match predicates are updated.
 * Runs in one transaction so related updates are consistent for a single pass.
 * Safe under multi-instance: concurrent runs may repeat the same updates (no-op).
 */
async function expireStaleItems() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r1 = await client.query(
      `UPDATE fake_order_round_items ri
       SET status = 'expired', updated_at = NOW()
       WHERE ri.status = 'active' AND ri.visible_until <= NOW()`,
    );
    const r2 = await client.query(
      `UPDATE fake_orders fo
       SET fake_status = 'expired', updated_at = NOW()
       WHERE fo.fake_status = 'active'
         AND EXISTS (
           SELECT 1 FROM fake_order_round_items ri
           WHERE ri.fake_order_id = fo.id AND ri.status = 'expired'
         )
         AND NOT EXISTS (
           SELECT 1 FROM fake_order_round_items ri2
           WHERE ri2.fake_order_id = fo.id AND ri2.status = 'active'
         )`,
    );
    const r3 = await client.query(
      `UPDATE fake_order_rounds fr
       SET status = 'expired', updated_at = NOW()
       WHERE fr.status = 'active' AND fr.expires_at <= NOW()`,
    );
    await client.query("COMMIT");
    const rowsItems = Number(r1.rowCount || 0);
    const rowsOrders = Number(r2.rowCount || 0);
    const rowsRounds = Number(r3.rowCount || 0);
    if (rowsItems + rowsOrders + rowsRounds > 0 && isFakeOrdersAutomationVerbose()) {
      logAutomationEvent("expire_pass", {
        rowsItems,
        rowsOrders,
        rowsRounds,
      });
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function insertAutomationLogSafe(clientOrPool, row) {
  const runner = clientOrPool || pool;
  try {
    await runner.query(
      `INSERT INTO fake_order_automation_logs (run_started_at, run_finished_at, status, error_message, round_id, generated_count, source)
       VALUES ($1::timestamptz, NOW(), $2, $3, $4, $5, $6)`,
      [
        row.runStartedAt,
        row.status,
        row.errorMessage != null ? String(row.errorMessage).slice(0, 5000) : null,
        row.roundId != null ? Number(row.roundId) : null,
        row.generatedCount != null ? Number(row.generatedCount) : null,
        row.source || "automation",
      ],
    );
  } catch (e) {
    if (String(e.message || "").includes("fake_order_automation_logs")) {
      /* migration 040 not applied */
      return;
    }
    console.error("[fakeOrders] insertAutomationLogSafe failed:", e?.message || e);
  }
}

async function runAutomationTick() {
  logAutomationEvent("tick_started");

  try {
    await expireStaleItems();
  } catch (e) {
    logAutomationEvent("expire_failed", { message: String(e?.message || e).slice(0, 200) });
    console.error("[fakeOrders] expireStaleItems failed (non-fatal):", e?.message || e);
  }

  const runStartedAt = new Date();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 FOR UPDATE`);
    const s = sRows[0];
    if (!s || !s.training_orders_enabled || !s.automation_enabled) {
      await client.query("COMMIT");
      logAutomationEvent("skipped_settings", {
        training_orders_enabled: Boolean(s?.training_orders_enabled),
        automation_enabled: Boolean(s?.automation_enabled),
      });
      return;
    }
    const dv = Number(s.duration_value);
    const du = String(s.duration_unit || "");
    if (!Number.isFinite(dv) || dv <= 0 || !["minutes", "hours", "days"].includes(du)) {
      await client.query("COMMIT");
      logAutomationEvent("skipped_settings", { reason: "invalid_duration" });
      return;
    }

    const intervalMs = msFromDurationSettings(dv, du);
    let nextRun = s.next_automation_run_at ? new Date(s.next_automation_run_at).getTime() : null;
    if (nextRun == null) {
      const initAt = new Date(Date.now() + intervalMs);
      await client.query(
        `UPDATE fake_order_settings SET next_automation_run_at = $1, last_automation_next_at = $1, updated_at = NOW() WHERE id = 1`,
        [initAt],
      );
      await client.query("COMMIT");
      logAutomationEvent("next_run_initialized", { nextAtMs: initAt.getTime() });
      return;
    }

    const now = Date.now();
    if (now < nextRun) {
      await client.query("COMMIT");
      if (isFakeOrdersAutomationVerbose()) {
        logAutomationEvent("skipped_not_due", { nextRunAtMs: nextRun });
      }
      return;
    }

    /** Next run = wall clock after this tick (same as مدة الجولة). */
    const nextAtDate = new Date(Date.now() + intervalMs);

    const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock($1::bigint) AS got`, [
      AUTOMATION_GENERATION_LOCK_KEY,
    ]);
    if (!lockRows[0]?.got) {
      await client.query("ROLLBACK");
      logAutomationEvent("skipped_lock", { reason: "advisory_lock_active" });
      await insertAutomationLogSafe(pool, {
        runStartedAt: runStartedAt,
        status: "skipped_lock",
        errorMessage: null,
        roundId: null,
        generatedCount: null,
        source: "automation",
      });
      return;
    }

    try {
      const actorUserId = await resolveAutomationActorUserId(client);
      if (!actorUserId) {
        logAutomationEvent("no_admin_actor", { reason: "no_admin_user" });
        console.error("[fakeOrders] automation: no admin user found for training round generation");
        await client.query(
          `UPDATE fake_order_settings SET
             next_automation_run_at = $1,
             last_automation_next_at = $1,
             last_automation_run_at = NOW(),
             last_automation_status = 'failed',
             last_automation_error = 'no_admin_actor',
             last_automation_round_id = NULL,
             last_automation_generated_count = NULL,
             updated_at = NOW()
           WHERE id = 1`,
          [nextAtDate],
        );
        await client.query("COMMIT");
        await insertAutomationLogSafe(pool, {
          runStartedAt: runStartedAt,
          status: "failed",
          errorMessage: "no_admin_actor",
          roundId: null,
          generatedCount: null,
          source: "automation",
        });
        return;
      }

      let genStatus = "success";
      let genError = null;
      let roundId = null;
      let genCount = null;

      await client.query("SAVEPOINT training_round_gen");
      try {
        const result = await generateTrainingRoundInternal(client, { actorUserId, roundSource: "automation" });
        if (result.ok) {
          roundId = result.round?.id ? Number(result.round.id) : null;
          genCount = result.generatedCount ?? null;
          genStatus = "success";
        } else if (result.code === "NO_TEMPLATES") {
          genStatus = "skipped_no_templates";
          logAutomationEvent("skipped_no_templates", { code: "NO_TEMPLATES" });
          console.error("[fakeOrders] automation: no active templates — skipping round generation");
        }
        await client.query("RELEASE SAVEPOINT training_round_gen");
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT training_round_gen");
        genStatus = "failed";
        genError = String(e?.message || e).slice(0, 5000);
        logAutomationEvent("generation_failed", { message: genError.slice(0, 200) });
        console.error("[fakeOrders] automation: round generation failed:", e?.message || e);
      }

      if (genStatus === "success" && roundId) {
        logAutomationEvent("generated_round", { roundId, generatedCount: genCount });
      }

      await client.query(
        `UPDATE fake_order_settings SET
           next_automation_run_at = $1,
           last_automation_next_at = $1,
           last_automation_run_at = NOW(),
           last_automation_status = $2,
           last_automation_error = $3,
           last_automation_round_id = $4,
           last_automation_generated_count = $5,
           updated_at = NOW()
         WHERE id = 1`,
        [nextAtDate, genStatus, genError, roundId, genCount],
      );
      await client.query("COMMIT");
      await insertAutomationLogSafe(pool, {
        runStartedAt: runStartedAt,
        status: genStatus,
        errorMessage: genError,
        roundId,
        generatedCount: genCount,
        source: "automation",
      });
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [AUTOMATION_GENERATION_LOCK_KEY]);
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (r) {
      /* ignore */
    }
    console.error("[fakeOrders] automation tick transaction failed:", e?.message || e);
  } finally {
    client.release();
  }
}

async function getVisibleFakeOrdersCount(clientOrPool) {
  const runner = clientOrPool || pool;
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS c
     FROM fake_orders fo
     INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
     INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
     WHERE fo.fake_status = 'active'
       AND fo.is_published = TRUE
       AND fo.is_open_for_pool = TRUE
       AND ri.status = 'active'
       AND ri.visible_from <= NOW()
       AND ri.visible_until >= NOW()
       AND fr.status = 'active'`,
  );
  return Number(rows[0]?.c || 0);
}

/**
 * Ensure there are enough visible fake orders when training display is enabled.
 * Safe for repeated calls (advisory lock + transactional checks).
 */
async function ensureMinimumVisibleFakeOrders({ reason = "runtime", minVisible = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 FOR UPDATE`);
    const s = sRows[0];
    if (!s || !s.training_orders_enabled) {
      await client.query("COMMIT");
      return { ok: false, code: "TRAINING_DISABLED" };
    }

    const thresholdFromSettings = Math.max(1, Number(s.min_orders) || 20);
    const threshold = Number.isFinite(Number(minVisible)) ? Math.max(1, Number(minVisible)) : thresholdFromSettings;
    const currentVisible = await getVisibleFakeOrdersCount(client);
    if (currentVisible >= threshold) {
      await client.query("COMMIT");
      return { ok: true, generated: false, visible: currentVisible, threshold };
    }

    const { rows: lockRows } = await client.query(`SELECT pg_try_advisory_lock($1::bigint) AS got`, [
      AUTOMATION_GENERATION_LOCK_KEY,
    ]);
    if (!lockRows[0]?.got) {
      await client.query("ROLLBACK");
      logAutomationEvent("ensure_min_visible_skipped_lock", { reason, currentVisible, threshold });
      return { ok: false, code: "LOCK_BUSY", visible: currentVisible, threshold };
    }

    try {
      const actorUserId = await resolveAutomationActorUserId(client);
      if (!actorUserId) {
        await client.query("COMMIT");
        logAutomationEvent("ensure_min_visible_no_actor", { reason, currentVisible, threshold });
        return { ok: false, code: "NO_ADMIN_ACTOR", visible: currentVisible, threshold };
      }

      const result = await generateTrainingRoundInternal(client, { actorUserId, roundSource: "automation" });
      if (!result.ok) {
        await client.query("COMMIT");
        logAutomationEvent("ensure_min_visible_no_templates", { reason, currentVisible, threshold });
        return { ok: false, code: result.code || "NO_TEMPLATES", visible: currentVisible, threshold };
      }
      await client.query("COMMIT");
      logAutomationEvent("ensure_min_visible_generated", {
        reason,
        roundId: result.round?.id ? Number(result.round.id) : null,
        generatedCount: Number(result.generatedCount || 0),
        threshold,
      });
      return {
        ok: true,
        generated: true,
        roundId: result.round?.id ? Number(result.round.id) : null,
        generatedCount: Number(result.generatedCount || 0),
        threshold,
      };
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [AUTOMATION_GENERATION_LOCK_KEY]);
    }
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

function mapRound(row) {
  if (!row) return null;
  const snap = row.settings_snapshot;
  return {
    id: String(row.id),
    title: row.title,
    minOrders: Number(row.min_orders),
    maxOrders: Number(row.max_orders),
    generatedCount: Number(row.generated_count),
    durationHours: Number(row.duration_hours),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roundSource: row.round_source || null,
    createdBy: row.created_by ? String(row.created_by) : null,
    settingsSnapshot: snap && typeof snap === "object" ? snap : null,
  };
}

function mapApplication(row) {
  if (!row) return null;
  const name = [row.first_name, row.father_name, row.family_name].filter(Boolean).join(" ").trim();
  return {
    id: String(row.id),
    fakeOrderId: row.fake_order_id != null ? String(row.fake_order_id) : null,
    roundId: String(row.round_id),
    freelancerUserId: String(row.freelancer_user_id),
    amount: Number(row.amount),
    proposalMessage: row.proposal_message || null,
    status: row.status,
    createdAt: row.created_at,
    fakeOrderTitle: row.fake_order_title || null,
    categoryName: row.category_name || null,
    roundTitle: row.round_title || null,
    freelancerName: name || null,
    accountId: row.account_id || null,
    planTitle: row.plan_title || null,
  };
}

async function listTemplates({ actorUserId, page = 1, limit = 20, categoryId = null, isActive = null, q = "" } = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (categoryId) {
    params.push(Number(categoryId));
    where.push(`t.category_id = $${params.length}`);
  }
  if (isActive === true || isActive === false) {
    params.push(isActive);
    where.push(`t.is_active = $${params.length}`);
  }
  if (String(q || "").trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
  }
  const whereSql = where.join(" AND ");
  const { rows: cRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates t WHERE ${whereSql}`, params);
  const total = Number(cRows[0]?.c || 0);
  const limPh = params.length + 1;
  const offPh = params.length + 2;
  const { rows } = await pool.query(
    `SELECT t.*, c.name AS category_name
     FROM fake_order_templates t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${whereSql}
     ORDER BY t.id DESC
     LIMIT $${limPh} OFFSET $${offPh}`,
    [...params, lim, off],
  );
  return {
    templates: rows.map(mapTemplate),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function getTemplateById(id, { actorUserId } = {}) {
  if (actorUserId) await assertAdminOrSuperAdmin(actorUserId, pool);
  const { rows } = await pool.query(
    `SELECT t.*, c.name AS category_name
     FROM fake_order_templates t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = $1 LIMIT 1`,
    [Number(id)],
  );
  return mapTemplate(rows[0]);
}

async function createTemplate({ actorUserId, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const title = String(payload.title || "").trim();
    const description = String(payload.description || "").trim();
    if (title.length < 2 || description.length < 2) {
      const err = new Error("العنوان والوصف مطلوبان.");
      err.statusCode = 400;
      throw err;
    }
    const categoryId = Number(payload.categoryId);
    const subcategoryId = payload.subcategoryId != null ? Number(payload.subcategoryId) : null;
    const subSubcategoryId = payload.subSubcategoryId != null ? Number(payload.subSubcategoryId) : null;
    const minB = Number(payload.minBudget);
    const maxB = Number(payload.maxBudget);
    const minD = Number(payload.minDuration);
    const maxD = Number(payload.maxDuration);
    const currency = "JOD";
    const durationUnit = String(payload.durationUnit || "days");
    if (!["days", "hours", "minutes"].includes(durationUnit)) {
      const err = new Error("وحدة المدة غير صالحة.");
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(minB) || !Number.isFinite(maxB) || minB <= 0 || maxB < minB) {
      const err = new Error("نطاق الميزانية غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isInteger(minB) || !Number.isInteger(maxB) || !isAllowedCleanBudgetRange(minB, maxB)) {
      const err = new Error("نطاق الميزانية يجب أن يكون من الأزواج المعتمدة فقط (بدون كسور).");
      err.statusCode = 400;
      throw err;
    }
    if (!Number.isFinite(minD) || !Number.isFinite(maxD) || minD < 1 || maxD < minD) {
      const err = new Error("نطاق المدة غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    const skillsArr = Array.isArray(payload.skills) ? payload.skills.map((s) => String(s).trim()).filter(Boolean) : [];
    const skillsJson = JSON.stringify(skillsArr.slice(0, 50));
    const { rowCount: catOk } = await client.query(`SELECT 1 FROM categories WHERE id = $1 AND is_active = TRUE`, [categoryId]);
    if (catOk === 0) {
      const err = new Error("تصنيف غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    const { rows } = await client.query(
      `INSERT INTO fake_order_templates (
        title, description, category_id, subcategory_id, sub_subcategory_id,
        skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
        is_active, created_by, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
      RETURNING id`,
      [
        title,
        description,
        categoryId,
        Number.isInteger(subcategoryId) && subcategoryId > 0 ? subcategoryId : null,
        Number.isInteger(subSubcategoryId) && subSubcategoryId > 0 ? subSubcategoryId : null,
        skillsJson,
        minB,
        maxB,
        currency,
        minD,
        maxD,
        durationUnit,
        payload.isActive !== false,
        Number(actorUserId),
      ],
    );
    const newId = rows[0].id;
    await client.query("COMMIT");
    return getTemplateById(newId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function updateTemplate({ actorUserId, id, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const tid = Number(id);
    const { rows: curRows } = await client.query(
      `SELECT id, min_budget, max_budget FROM fake_order_templates WHERE id = $1 FOR UPDATE`,
      [tid],
    );
    const current = curRows[0];
    if (!current) {
      const err = new Error("القالب غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    const fields = [];
    const vals = [];
    const push = (sql, v) => {
      vals.push(v);
      fields.push(`${sql} $${vals.length}`);
    };
    if (payload.title != null) push(`title =`, String(payload.title).trim());
    if (payload.description != null) push(`description =`, String(payload.description).trim());
    if (payload.categoryId != null) push(`category_id =`, Number(payload.categoryId));
    if (payload.subcategoryId !== undefined) push(`subcategory_id =`, payload.subcategoryId ? Number(payload.subcategoryId) : null);
    if (payload.subSubcategoryId !== undefined) push(`sub_subcategory_id =`, payload.subSubcategoryId ? Number(payload.subSubcategoryId) : null);
    if (payload.skills != null) {
      const skillsArr = Array.isArray(payload.skills) ? payload.skills.map((s) => String(s).trim()).filter(Boolean) : [];
      vals.push(JSON.stringify(skillsArr.slice(0, 50)));
      fields.push(`skills = $${vals.length}::jsonb`);
    }
    if (payload.minBudget != null) push(`min_budget =`, Number(payload.minBudget));
    if (payload.maxBudget != null) push(`max_budget =`, Number(payload.maxBudget));
    if (payload.minDuration != null) push(`min_duration =`, Number(payload.minDuration));
    if (payload.maxDuration != null) push(`max_duration =`, Number(payload.maxDuration));
    if (payload.durationUnit != null) push(`duration_unit =`, String(payload.durationUnit));
    if (payload.isActive != null) push(`is_active =`, Boolean(payload.isActive));
    if (!fields.length) {
      await client.query("COMMIT");
      return getTemplateById(tid);
    }
    const finalMin = payload.minBudget != null ? Number(payload.minBudget) : Number(current.min_budget);
    const finalMax = payload.maxBudget != null ? Number(payload.maxBudget) : Number(current.max_budget);
    if (!Number.isInteger(finalMin) || !Number.isInteger(finalMax) || !isAllowedCleanBudgetRange(finalMin, finalMax)) {
      const err = new Error("نطاق الميزانية يجب أن يكون من الأزواج المعتمدة فقط (بدون كسور).");
      err.statusCode = 400;
      throw err;
    }
    fields.push(`updated_at = NOW()`);
    vals.push(tid);
    await client.query(`UPDATE fake_order_templates SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    await client.query("COMMIT");
    return getTemplateById(tid);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function deleteTemplate({ actorUserId, id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const tid = Number(id);
    const { rowCount } = await client.query(`DELETE FROM fake_order_templates WHERE id = $1`, [tid]);
    if (rowCount === 0) {
      const err = new Error("القالب غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function listRounds({ actorUserId, page = 1, limit = 20, status = null } = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (status && ["scheduled", "active", "expired", "stopped"].includes(String(status))) {
    params.push(String(status));
    where.push(`fr.status = $${params.length}`);
  }
  const whereSql = where.join(" AND ");
  const { rows: cRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_rounds fr WHERE ${whereSql}`, params);
  const total = Number(cRows[0]?.c || 0);
  const limPh = params.length + 1;
  const offPh = params.length + 2;
  const { rows } = await pool.query(
    `SELECT fr.* FROM fake_order_rounds fr WHERE ${whereSql} ORDER BY fr.id DESC LIMIT $${limPh} OFFSET $${offPh}`,
    [...params, lim, off],
  );
  return {
    rounds: rows.map(mapRound),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function cancelRound({ actorUserId, roundId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const rid = Number(roundId);
    const { rows } = await client.query(`SELECT id, status FROM fake_order_rounds WHERE id = $1 FOR UPDATE`, [rid]);
    const r = rows[0];
    if (!r) {
      const err = new Error("الجولة غير موجودة.");
      err.statusCode = 404;
      throw err;
    }
    if (r.status === "expired" || r.status === "stopped") {
      const err = new Error("الجولة منتهية أو ملغاة مسبقاً.");
      err.statusCode = 409;
      throw err;
    }
    await client.query(`UPDATE fake_order_rounds SET status = 'stopped', updated_at = NOW() WHERE id = $1`, [rid]);
    const { rows: out } = await client.query(`SELECT * FROM fake_order_rounds WHERE id = $1`, [rid]);
    await client.query("COMMIT");
    return mapRound(out[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function mapFakeOrderApplicantSummary(row) {
  if (!row) return null;
  return {
    fakeOrderId: String(row.fake_order_id),
    title: row.title || null,
    categoryName: row.category_name || null,
    roundId: String(row.round_id),
    roundTitle: row.round_title || null,
    roundStatus: row.round_status || null,
    fakeOrderStatus: row.fake_order_status || null,
    applicantsCount: Number(row.applicants_count) || 0,
    orderCreatedAt: row.order_created_at || null,
    roundStartsAt: row.round_starts_at || null,
    lastApplicationAt: row.last_application_at || null,
  };
}

/**
 * One row per fake_order that has ≥1 application (fake_order_applications only).
 * Applicant count = COUNT(application rows) for that fake order (one per freelancer per round).
 */
async function listFakeOrdersApplicantSummary({
  actorUserId,
  page = 1,
  limit = 20,
  roundId = null,
  fakeOrderId = null,
  categoryId = null,
} = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (roundId) {
    params.push(Number(roundId));
    where.push(`fa.round_id = $${params.length}`);
  }
  if (fakeOrderId) {
    params.push(Number(fakeOrderId));
    where.push(`fa.fake_order_id = $${params.length}`);
  }
  if (categoryId) {
    params.push(Number(categoryId));
    where.push(`fo.category_id = $${params.length}`);
  }
  const whereSql = where.join(" AND ");

  const countSql = `
    SELECT COUNT(*)::int AS c
    FROM (
      SELECT fo.id
      FROM fake_order_applications fa
      INNER JOIN fake_orders fo ON fo.id = fa.fake_order_id
      INNER JOIN fake_order_rounds fr ON fr.id = fa.round_id
      WHERE ${whereSql}
      GROUP BY fo.id
    ) grouped`;
  const { rows: cRows } = await pool.query(countSql, params);
  const total = Number(cRows[0]?.c || 0);

  const limPh = params.length + 1;
  const offPh = params.length + 2;
  const listSql = `
    SELECT
      fo.id AS fake_order_id,
      fo.title,
      fo.fake_status AS fake_order_status,
      fo.created_at AS order_created_at,
      c.name AS category_name,
      fr.id AS round_id,
      fr.title AS round_title,
      fr.status AS round_status,
      fr.starts_at AS round_starts_at,
      COUNT(fa.id)::int AS applicants_count,
      MAX(fa.created_at) AS last_application_at
    FROM fake_order_applications fa
    INNER JOIN fake_orders fo ON fo.id = fa.fake_order_id
    LEFT JOIN categories c ON c.id = fo.category_id
    INNER JOIN fake_order_rounds fr ON fr.id = fa.round_id
    WHERE ${whereSql}
    GROUP BY fo.id, fo.title, fo.fake_status, fo.created_at, c.name, fr.id, fr.title, fr.status, fr.starts_at
    ORDER BY MAX(fa.created_at) DESC NULLS LAST, fo.id DESC
    LIMIT $${limPh} OFFSET $${offPh}`;
  const { rows } = await pool.query(listSql, [...params, lim, off]);
  return {
    fakeOrders: rows.map(mapFakeOrderApplicantSummary),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function listTrainingApplications({
  actorUserId,
  page = 1,
  limit = 20,
  roundId = null,
  fakeOrderId = null,
  categoryId = null,
  freelancerUserId = null,
  dateFrom = null,
  dateTo = null,
} = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (roundId) {
    params.push(Number(roundId));
    where.push(`fa.round_id = $${params.length}`);
  }
  if (fakeOrderId) {
    params.push(Number(fakeOrderId));
    where.push(`fa.fake_order_id = $${params.length}`);
  }
  if (categoryId) {
    params.push(Number(categoryId));
    where.push(`fo.category_id = $${params.length}`);
  }
  if (freelancerUserId) {
    params.push(Number(freelancerUserId));
    where.push(`fa.freelancer_user_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`fa.created_at >= $${params.length}::timestamptz`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`fa.created_at <= $${params.length}::timestamptz`);
  }
  const whereSql = where.join(" AND ");
  const countSql = `SELECT COUNT(*)::int AS c
    FROM fake_order_applications fa
    INNER JOIN fake_orders fo ON fo.id = fa.fake_order_id
    WHERE ${whereSql}`;
  const { rows: cRows } = await pool.query(countSql, params);
  const total = Number(cRows[0]?.c || 0);
  const limPh = params.length + 1;
  const offPh = params.length + 2;
  const listSql = `
    SELECT fa.*,
           fo.title AS fake_order_title,
           c.name AS category_name,
           fr.title AS round_title,
           u.first_name, u.father_name, u.family_name, u.account_id,
           (SELECT p.title FROM freelancer_subscriptions fs
            INNER JOIN plans p ON p.id = fs.plan_id
            WHERE fs.freelancer_user_id = u.id AND fs.is_current = TRUE
            LIMIT 1) AS plan_title
    FROM fake_order_applications fa
    INNER JOIN fake_orders fo ON fo.id = fa.fake_order_id
    LEFT JOIN categories c ON c.id = fo.category_id
    LEFT JOIN fake_order_rounds fr ON fr.id = fa.round_id
    INNER JOIN users u ON u.id = fa.freelancer_user_id
    WHERE ${whereSql}
    ORDER BY fa.created_at DESC, fa.id DESC
    LIMIT $${limPh} OFFSET $${offPh}`;
  const { rows } = await pool.query(listSql, [...params, lim, off]);
  return {
    applications: rows.map(mapApplication),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function listApplicationsForFakeOrder({ actorUserId, fakeOrderId }) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const oid = Number(fakeOrderId);
  const { rows } = await pool.query(
    `SELECT fa.*,
            fo.title AS fake_order_title,
            c.name AS category_name,
            fr.title AS round_title,
            u.first_name, u.father_name, u.family_name, u.account_id,
            (SELECT p.title FROM freelancer_subscriptions fs
             INNER JOIN plans p ON p.id = fs.plan_id
             WHERE fs.freelancer_user_id = u.id AND fs.is_current = TRUE
             LIMIT 1) AS plan_title
     FROM fake_order_applications fa
     INNER JOIN fake_orders fo ON fo.id = fa.fake_order_id
     LEFT JOIN categories c ON c.id = fo.category_id
     LEFT JOIN fake_order_rounds fr ON fr.id = fa.round_id
     INNER JOIN users u ON u.id = fa.freelancer_user_id
     WHERE fa.fake_order_id = $1
     ORDER BY fa.created_at DESC`,
    [oid],
  );
  return rows.map(mapApplication);
}

module.exports = {
  randomInt,
  classifyMainCategory,
  normalizeCategoryDistribution,
  pickRandom,
  assertAdminOrSuperAdmin,
  generateUniqueOrderCode,
  poolViewerMaySeeFakeOrders,
  mapTemplate,
  mapSettings,
  getSettings,
  updateSettings,
  expireStaleItems,
  ensureMinimumVisibleFakeOrders,
  getVisibleFakeOrdersCount,
  runAutomationTick,
  startTrainingRoundManual,
  getFakePoolOrderMapped,
  submitFakeTrainingBid,
  submitFakeTrainingClaim,
  mapRound,
  mapApplication,
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listRounds,
  cancelRound,
  listTrainingApplications,
  listApplicationsForFakeOrder,
  listFakeOrdersApplicantSummary,
};
