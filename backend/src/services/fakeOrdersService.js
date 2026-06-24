const { pool } = require("../config/db");
const { isFakeOrdersAutomationVerbose, getFakeOrdersTickMs } = require("../config/fakeOrdersAutomation");
const {
  TRAINING_POOL_VISIBLE_FROM_SQL,
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("./trainingPoolEligibility");
const { invalidatePublicHomeOrderStatsCache } = require("./publicHomeOrderStatsService");
const {
  inferComplexityProfile,
  normalizeToCleanBudgetRange,
  normalizeTemplateBudget,
} = require("../utils/fakeBudgetRanges");
const { FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT } = require("../utils/fakeMarketplaceApplicantsSql");
const {
  mapCachedEnglishFields,
  scheduleFakeOrderTranslation,
  scheduleTemplateTranslation,
} = require("./orderTranslationHelper");

/** Session advisory lock: cross-process generation guard (PostgreSQL). */
const AUTOMATION_GENERATION_LOCK_KEY = 882947361;

const LOCK_BUSY_BACKOFF_MS = [250, 500, 1000];
const LOCK_BUSY_RETRY_REASONS = new Set([
  "server_startup",
  "pool_list_empty",
  "runtime",
  "automation_tick",
  "manual_start",
]);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPgTransactionAbortedError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("current transaction is aborted") || msg.includes("commands ignored until end of transaction block");
}

async function safeRollback(client) {
  try {
    await client.query("ROLLBACK");
  } catch (_) {
    /* ignore — connection may already be idle */
  }
}

/**
 * Run `fn` inside a named SAVEPOINT so failures do not abort the outer transaction.
 */
async function withSavepoint(client, savepointName, fn) {
  const sp = String(savepointName || "training_gen").replace(/[^a-z0-9_]/gi, "_");
  await client.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (e) {
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch (rbErr) {
      logAutomationEvent("savepoint_rollback_failed", {
        savepoint: sp,
        message: String(rbErr?.message || rbErr).slice(0, 200),
      });
      throw rbErr;
    }
    throw e;
  }
}

/** Best-effort: clear a leaked session lock on this pooled connection before acquiring. */
async function clearStaleSessionGenerationLock(client) {
  try {
    const { rows } = await client.query(`SELECT pg_advisory_unlock($1::bigint) AS released`, [
      AUTOMATION_GENERATION_LOCK_KEY,
    ]);
    if (rows[0]?.released) {
      logAutomationEvent("stale_session_lock_cleared", {});
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Transaction-scoped advisory lock (auto-released on COMMIT/ROLLBACK).
 * Clears any stale session lock on this connection first (legacy leak guard).
 */
async function tryAcquireGenerationLock(client, { reason = "" } = {}) {
  await clearStaleSessionGenerationLock(client);
  const { rows } = await client.query(`SELECT pg_try_advisory_xact_lock($1::bigint) AS got`, [
    AUTOMATION_GENERATION_LOCK_KEY,
  ]);
  const acquired = Boolean(rows[0]?.got);
  logAutomationEvent(acquired ? "lock_acquired" : "lock_busy", { reason, lockType: "xact" });
  return acquired;
}

/** xact locks auto-release at transaction end; also clear legacy session locks safely. */
async function releaseGenerationLock(client, { acquired = false, reason = "" } = {}) {
  if (!acquired) return;
  logAutomationEvent("lock_release_xact", { reason, note: "released_on_commit_or_rollback" });
  try {
    const { rows } = await client.query(`SELECT pg_advisory_unlock($1::bigint) AS released`, [
      AUTOMATION_GENERATION_LOCK_KEY,
    ]);
    if (rows[0]?.released) {
      logAutomationEvent("stale_session_lock_cleared_on_release", { reason });
    }
  } catch (e) {
    logAutomationEvent("lock_release_error", { reason, message: String(e?.message || e).slice(0, 200) });
    if (isPgTransactionAbortedError(e)) {
      await safeRollback(client);
      try {
        await client.query(`SELECT pg_advisory_unlock($1::bigint)`, [AUTOMATION_GENERATION_LOCK_KEY]);
        logAutomationEvent("lock_released_after_rollback", { reason });
      } catch (e2) {
        logAutomationEvent("lock_release_failed_after_rollback", {
          reason,
          message: String(e2?.message || e2).slice(0, 200),
        });
      }
    }
  }
}

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

/** Minimum overlap lead time before the sole visible round expires (ms). */
function getOverlapThresholdMs() {
  const tickMs = getFakeOrdersTickMs();
  const envMs = Number(process.env.FAKE_ORDERS_OVERLAP_MS);
  const configured = Number.isFinite(envMs) && envMs > 0 ? envMs : 10 * 60 * 1000;
  return Math.max(tickMs * 2, configured, 60_000);
}

/** Handoff window = overlap buffer + one automation tick (covers tick jitter between scheduled checks). */
function getHandoffLeadTimeMs() {
  return getOverlapThresholdMs() + getFakeOrdersTickMs();
}

/**
 * Minimum visible training orders from settings (defaults to min_orders).
 * @param {object} settings
 * @param {number|null|undefined} minVisibleOverride
 */
function resolveMinVisibleFromSettings(settings, minVisibleOverride) {
  if (Number.isFinite(Number(minVisibleOverride))) {
    return Math.max(1, Math.floor(Number(minVisibleOverride)));
  }
  return Math.max(1, Number(settings?.min_orders) || 1);
}

/**
 * True when the current visible wave is within the preemptive overlap window.
 * @param {{ earliestUntil?: string|Date|null }} coverage
 * @param {number} [nowMs]
 */
function needsPreemptiveOverlapWindow(coverage, nowMs = Date.now()) {
  if (!coverage?.earliestUntil) return false;
  const handoffMs = getHandoffLeadTimeMs();
  return new Date(coverage.earliestUntil).getTime() - nowMs <= handoffMs;
}

/**
 * Schedule the next automation check near (earliest visible_until − overlap), not at full round end.
 * @param {{ earliestUntil?: string|Date|null }} coverage
 * @param {object} settings DB row or mapped settings
 * @param {number} [nowMs]
 */
function computeNextAutomationRunAt(coverage, settings, nowMs = Date.now()) {
  const handoffMs = getHandoffLeadTimeMs();
  const tickMs = getFakeOrdersTickMs();
  const dv = Number(settings?.duration_value ?? settings?.durationValue);
  const du = String((settings?.duration_unit ?? settings?.durationUnit) || "hours");
  const intervalMs = msFromDurationSettings(dv, du) || 12 * 60 * 60 * 1000;

  if (coverage?.earliestUntil) {
    const handoffAt = new Date(coverage.earliestUntil).getTime() - handoffMs;
    return new Date(Math.max(nowMs + tickMs, handoffAt));
  }
  return new Date(nowMs + intervalMs);
}

/** Another currently-visible item expires after the given boundary (overlap already present). */
async function hasVisibleItemsExpiringAfter(client, boundaryUntil) {
  if (!boundaryUntil) return false;
  const { rows } = await client.query(
    `SELECT 1
     ${TRAINING_POOL_VISIBLE_FROM_SQL}
     WHERE ${trainingPoolVisibleWhereSql({ anyAudience: true })}
       AND ri.visible_until > $1::timestamptz
     LIMIT 1`,
    [boundaryUntil],
  );
  return Boolean(rows[0]);
}

async function getTrainingPoolCoverage(clientOrPool) {
  const runner = clientOrPool || pool;
  const { rows } = await runner.query(
    `SELECT
       COUNT(*)::int AS visible_count,
       COUNT(DISTINCT fr.id)::int AS active_rounds,
       MIN(ri.visible_until) AS earliest_until
     ${TRAINING_POOL_VISIBLE_FROM_SQL}
     WHERE ${trainingPoolVisibleWhereSql({ anyAudience: true })}`,
  );
  const row = rows[0] || {};
  return {
    visibleCount: Number(row.visible_count) || 0,
    activeRounds: Number(row.active_rounds) || 0,
    earliestUntil: row.earliest_until || null,
  };
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
async function supersedeActiveTrainingRounds(client, { exceptRoundId = null } = {}) {
  const params = [];
  let exceptSql = "";
  if (exceptRoundId != null) {
    params.push(Number(exceptRoundId));
    exceptSql = ` AND id <> $${params.length}`;
  }
  const { rows: active } = await client.query(
    `SELECT id FROM fake_order_rounds WHERE status = 'active'${exceptSql} ORDER BY id ASC FOR UPDATE`,
    params,
  );
  for (const row of active) {
    const rid = Number(row.id);
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE fake_order_round_items
       SET status = 'expired',
           visible_until = LEAST(visible_until, NOW()),
           updated_at = NOW()
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
  return active.length;
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
  const titleEn = template.title_en != null ? String(template.title_en).trim() || null : null;
  const descriptionEn = template.description_en != null ? String(template.description_en).trim() || null : null;
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
  const baselineApplicantsCount = randomInt(3, 12);

  const tplId = template.id != null ? Number(template.id) : null;

  const { rows } = await client.query(
    `INSERT INTO fake_orders (
      order_code, title, description, title_en, description_en,
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
      fake_status, is_fake, fake_round_id, show_fake_badge, fake_expires_at,
      baseline_applicants_count
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      '{}'::bigint[], '{}'::jsonb,
      'bidding', NULL, $9, $10, $11,
      $12, $13, $14,
      NULL,
      FALSE,
      NULL, NULL, NULL,
      TRUE, TRUE,
      FALSE,
      FALSE, 'not_required',
      'published',
      $15, $16,
      $17,
      'active', TRUE, $18, $19, $20,
      $21
    )
    RETURNING id`,
    [
      orderCode,
      title,
      description,
      titleEn,
      descriptionEn,
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
      baselineApplicantsCount,
    ],
  );
  const fakeOrderId = Number(rows[0].id);
  if (!titleEn && !descriptionEn) {
    scheduleFakeOrderTranslation(fakeOrderId, title, description);
  }
  return fakeOrderId;
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

/** Optional env override for per-round size (falls back to fake_order_settings min/max). */
function resolveRoundOrderBounds(settings = {}) {
  const envMin = Number(process.env.FAKE_ORDERS_ROUND_MIN);
  const envMax = Number(process.env.FAKE_ORDERS_ROUND_MAX);
  const settingsMin = Number(settings.min_orders);
  const settingsMax = Number(settings.max_orders);
  const minOrders =
    Number.isFinite(envMin) && envMin >= 1 ? Math.floor(envMin) : Math.max(1, settingsMin || 1);
  const maxOrders =
    Number.isFinite(envMax) && envMax >= minOrders
      ? Math.floor(envMax)
      : Math.max(minOrders, settingsMax || minOrders);
  return { minOrders, maxOrders };
}

/** One random target count per round (inclusive), stored on the round snapshot. */
function pickRoundTargetCount(settings = {}) {
  const { minOrders, maxOrders } = resolveRoundOrderBounds(settings);
  return randomInt(minOrders, maxOrders);
}

/**
 * Fake orders eligible for a new training round (existing pool only — no new inserts).
 */
async function loadEligibleFakeOrderPool(client) {
  const { rows } = await client.query(
    `SELECT
       fo.id,
       fo.template_id,
       fo.category_id,
       c.name AS category_name,
       c.slug AS category_slug
     FROM fake_orders fo
     INNER JOIN categories c ON c.id = fo.category_id AND c.is_active = TRUE
     WHERE COALESCE(fo.is_archived, FALSE) = FALSE
       AND fo.is_published = TRUE
       AND fo.is_open_for_pool = TRUE
       AND fo.assigned_freelancer_id IS NULL
       AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
       AND NOT EXISTS (
         SELECT 1
         FROM fake_order_round_items ri
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE ri.fake_order_id = fo.id
           AND ri.status = 'active'
           AND fr.status = 'active'
           AND ri.visible_from <= NOW()
           AND ri.visible_until > NOW()
       )
     ORDER BY fo.id ASC`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    templateId: r.template_id != null ? Number(r.template_id) : null,
    categoryId: Number(r.category_id),
    categoryName: r.category_name,
    categorySlug: r.category_slug,
  }));
}

const ELIGIBLE_FAKE_ORDER_POOL_WHERE_SQL = `
  COALESCE(fo.is_archived, FALSE) = FALSE
  AND fo.is_published = TRUE
  AND fo.is_open_for_pool = TRUE
  AND fo.assigned_freelancer_id IS NULL
  AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
  AND NOT EXISTS (
    SELECT 1
    FROM fake_order_round_items ri
    INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
    WHERE ri.fake_order_id = fo.id
      AND ri.status = 'active'
      AND fr.status = 'active'
      AND ri.visible_from <= NOW()
      AND ri.visible_until > NOW()
  )`;

/**
 * COUNT-only eligibility for admin readiness (same predicates as loadEligibleFakeOrderPool).
 */
async function countEligibleFakeOrderPool(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM fake_orders fo
     INNER JOIN categories c ON c.id = fo.category_id AND c.is_active = TRUE
     WHERE ${ELIGIBLE_FAKE_ORDER_POOL_WHERE_SQL}`,
  );
  return Number(rows[0]?.c || 0);
}

/**
 * Pick unique fake orders for one round (fixed count, category-weighted when possible).
 */
function selectFakeOrdersFromPool(eligibleRows, targetCount, categoryDistribution) {
  const eligible = Array.isArray(eligibleRows) ? eligibleRows : [];
  const n = Math.min(Math.max(0, Number(targetCount) || 0), eligible.length);
  if (n < 1) return [];

  const byBucket = { content: [], programming: [], design: [], other: [] };
  for (const row of eligible) {
    const bucket = classifyMainCategory({
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
    });
    if (bucket === "other") byBucket.other.push(row);
    else byBucket[bucket].push(row);
  }

  const slots = allocateBucketSlots(n, categoryDistribution);
  const selected = [];
  const usedIds = new Set();

  function takeFromList(list) {
    const shuffled = shuffleArray(list.filter((row) => !usedIds.has(row.id)));
    for (const row of shuffled) {
      if (usedIds.has(row.id)) continue;
      usedIds.add(row.id);
      selected.push(row);
      return true;
    }
    return false;
  }

  for (const bucket of slots) {
    if (selected.length >= n) break;
    if (!takeFromList(byBucket[bucket] || [])) {
      takeFromList([...byBucket.content, ...byBucket.programming, ...byBucket.design, ...byBucket.other]);
    }
  }

  if (selected.length < n) {
    for (const row of shuffleArray(eligible)) {
      if (usedIds.has(row.id)) continue;
      usedIds.add(row.id);
      selected.push(row);
      if (selected.length >= n) break;
    }
  }

  return selected.slice(0, n);
}

async function activateFakeOrdersInRound(client, { roundId, orders, visibleUntil, settings }) {
  const rid = Number(roundId);
  const showBadge = Boolean(settings.show_fake_badge_to_freelancers);
  let activated = 0;
  for (const order of orders) {
    const fakeOrderId = Number(order.id);
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE fake_orders
       SET fake_round_id = $1,
           fake_status = 'active',
           fake_expires_at = $2,
           show_fake_badge = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [rid, visibleUntil, showBadge, fakeOrderId],
    );
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO fake_order_round_items (round_id, fake_order_id, visible_from, visible_until, status, created_at, updated_at)
       VALUES ($1, $2, NOW(), $3, 'active', NOW(), NOW())`,
      [rid, fakeOrderId, visibleUntil],
    );
    activated += 1;
  }
  return activated;
}

/**
 * @returns {Promise<{ ok: boolean, code?: string, round?: object, generatedCount?: number, requestedCount?: number, eligiblePoolSize?: number, selectedFakeOrderIds?: number[] }>}
 */
async function generateTrainingRoundInternal(
  client,
  { actorUserId, roundSource, supersedeExisting = true, gaplessSupersede = false } = {},
) {
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

  const { minOrders, maxOrders } = resolveRoundOrderBounds(s);
  if (!(minOrders >= 1) || !(maxOrders >= minOrders)) {
    const err = new Error("نطاق عدد الطلبات غير صالح.");
    err.statusCode = 400;
    throw err;
  }

  const desiredN = pickRoundTargetCount(s);
  const eligiblePool = await loadEligibleFakeOrderPool(client);
  if (eligiblePool.length < minOrders) {
    return {
      ok: false,
      code: "INSUFFICIENT_ELIGIBLE_POOL",
      eligiblePoolSize: eligiblePool.length,
      requestedCount: desiredN,
      minOrders,
    };
  }

  const n = Math.min(desiredN, eligiblePool.length);
  if (!(n >= 1)) {
    return {
      ok: false,
      code: "INSUFFICIENT_ELIGIBLE_POOL",
      eligiblePoolSize: eligiblePool.length,
      requestedCount: desiredN,
      minOrders,
    };
  }

  if (supersedeExisting && !gaplessSupersede) {
    await supersedeActiveTrainingRounds(client);
  }

  const dist = normalizeCategoryDistribution(s.category_distribution || {});
  const selectedOrders = selectFakeOrdersFromPool(eligiblePool, n, dist);
  if (selectedOrders.length < 1) {
    return {
      ok: false,
      code: "INSUFFICIENT_ELIGIBLE_POOL",
      eligiblePoolSize: eligiblePool.length,
      requestedCount: desiredN,
      minOrders,
    };
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

  const titleBase =
    s.optional_round_name && String(s.optional_round_name).trim()
      ? String(s.optional_round_name).trim()
      : `جولة تجريبية - ${startsAt.toLocaleString("ar-JO", { hour12: false })}`;

  const durationHours = Math.min(720, Math.max(1, Math.ceil(visMs / (60 * 60 * 1000))));

  const settingsSnapshot = {
    min_orders: minOrders,
    max_orders: maxOrders,
    requested_order_count: desiredN,
    selected_order_count: selectedOrders.length,
    eligible_pool_size: eligiblePool.length,
    selection_mode: "existing_fake_orders_pool",
    duration_value: Number(s.duration_value),
    duration_unit: String(s.duration_unit || "hours"),
    automation_interval_value: Number(s.duration_value),
    automation_interval_unit: String(s.duration_unit || "hours"),
    category_distribution: dist,
    show_to_all_visitors: Boolean(s.show_to_all_visitors),
    show_to_all_freelancers: Boolean(s.show_to_all_freelancers),
    eligible_plan_ids: planIds,
    round_source: src,
    gapless_supersede: Boolean(gaplessSupersede),
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

  const generated = await activateFakeOrdersInRound(client, {
    roundId,
    orders: selectedOrders,
    visibleUntil,
    settings: s,
  });

  if (generated < 1) {
    const err = new Error("تعذر تفعيل طلبات تجريبية — لم يُضف أي طلب للجولة.");
    err.statusCode = 500;
    throw err;
  }

  if (supersedeExisting && gaplessSupersede) {
    await supersedeActiveTrainingRounds(client, { exceptRoundId: roundId });
  }

  await client.query(`UPDATE fake_order_rounds SET generated_count = $1, updated_at = NOW() WHERE id = $2`, [generated, roundId]);

  const { rows: outRound } = await client.query(`SELECT * FROM fake_order_rounds WHERE id = $1`, [roundId]);
  return {
    ok: true,
    round: mapRound(outRound[0]),
    generatedCount: generated,
    requestedCount: desiredN,
    eligiblePoolSize: eligiblePool.length,
    selectedFakeOrderIds: selectedOrders.map((o) => o.id),
  };
}

async function startTrainingRoundManualOnce({ actorUserId, attempt = 0 }) {
  const runStartedAt = new Date();
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    await client.query("BEGIN");
    lockAcquired = await tryAcquireGenerationLock(client, { reason: "manual_start" });
    if (!lockAcquired) {
      await safeRollback(client);
      const err = new Error("عملية توليد جولة قيد التنفيذ. حاول بعد لحظات.");
      err.statusCode = 409;
      err.code = "LOCK_BUSY";
      throw err;
    }

    await assertAdminOrSuperAdmin(actorUserId, client);
    const actor = Number(actorUserId);
    const result = await withSavepoint(client, "manual_round_gen", () =>
      generateTrainingRoundInternal(client, {
        actorUserId: actor,
        roundSource: "manual",
        supersedeExisting: true,
        gaplessSupersede: true,
      }),
    );
    if (!result.ok && (result.code === "NO_TEMPLATES" || result.code === "INSUFFICIENT_ELIGIBLE_POOL")) {
      await safeRollback(client);
      await insertAutomationLogSafe(pool, {
        runStartedAt,
        status: result.code === "INSUFFICIENT_ELIGIBLE_POOL" ? "skipped_insufficient_pool" : "skipped_no_templates",
        errorMessage: result.code,
        roundId: null,
        generatedCount: null,
        source: "manual",
      });
      const err = new Error(
        result.code === "INSUFFICIENT_ELIGIBLE_POOL"
          ? `لا توجد طلبات تجريبية كافية في المخزون (متاح: ${result.eligiblePoolSize ?? 0}، الحد الأدنى: ${result.minOrders ?? "—"}).`
          : "لا توجد قوالب طلبات نشطة. أضف قوالبًا أو فعّل القوالب والتصنيفات قبل بدء الجولة.",
      );
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
    try {
      await recordMarketplaceVisibleFakeOrders(pool);
      invalidatePublicHomeOrderStatsCache();
    } catch (markErr) {
      console.warn("[fakeOrders] recordMarketplaceVisibleFakeOrders after manual round:", markErr?.message || markErr);
    }
    await insertAutomationLogSafe(pool, {
      runStartedAt,
      status: "success",
      errorMessage: null,
      roundId,
      generatedCount: genCount,
      source: "manual",
    });
    return result;
  } catch (e) {
    await safeRollback(client);
    throw e;
  } finally {
    await releaseGenerationLock(client, { acquired: lockAcquired, reason: "manual_start" });
    client.release();
  }
}

async function startTrainingRoundManual({ actorUserId }) {
  const maxAttempts = LOCK_BUSY_RETRY_REASONS.has("manual_start") ? LOCK_BUSY_BACKOFF_MS.length + 1 : 1;
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const delayMs = LOCK_BUSY_BACKOFF_MS[attempt - 1] || 1000;
      logAutomationEvent("manual_start_retry", { attempt, delayMs });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      return await startTrainingRoundManualOnce({ actorUserId, attempt });
    } catch (e) {
      lastErr = e;
      if (e?.code === "LOCK_BUSY" && attempt < maxAttempts - 1) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("تعذر بدء الجولة.");
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

/** Freelancer applying to a training fake order must match global switch + pool visibility rules. */
async function assertFreelancerMayApplyToTrainingOrders(freelancerUserId) {
  const uid = Number(freelancerUserId);
  const { rows: srows } = await pool.query(
    `SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1 LIMIT 1`,
  );
  if (!srows[0]?.training_orders_enabled) {
    const err = new Error("الطلبات التدريبية مخفية حالياً ولا يمكن التقديم عليها.");
    err.statusCode = 403;
    throw err;
  }
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
    ...mapCachedEnglishFields(row),
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
    const patchKeys = Object.keys(patch).filter((k) => patch[k] !== undefined);
    const trainingVisibilityOnlyPatch =
      patchKeys.length === 1 && patchKeys[0] === "trainingOrdersEnabled";
    if (!trainingVisibilityOnlyPatch) {
      let effectivePlanIds = planIds;
      if (effectivePlanIds === null) {
        const pr = await client.query(`SELECT plan_id FROM fake_order_settings_plans`);
        effectivePlanIds = pr.rows.map((r) => Number(r.plan_id)).filter((n) => n > 0);
      }
      if (!showToAll && !showFreelancers && effectivePlanIds.length === 0) {
        const err = new Error("اختر إظهار الطلبات التجريبية لجميع الزوار/المستقلين أو حدد باقة واحدة على الأقل.");
        err.statusCode = 400;
        throw err;
      }
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
      const coverage = await getTrainingPoolCoverage(client);
      nextAutomationRunAt = computeNextAutomationRunAt(coverage, {
        duration_value: durationValue,
        duration_unit: durationUnit,
      });
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
        ${FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT},
        fa.id AS my_bid_id,
        fa.amount AS my_bid_amount,
        fa.status AS my_bid_status
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
        AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
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
        ${FAKE_MARKETPLACE_APPLICANTS_COUNT_SELECT}
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id AND ri.status = 'active'
        AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
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
  mapped.showTrainingBadge = Boolean(row.show_fake_badge);
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
         AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
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
    const planOrderValueEligibility = require("./planOrderValueEligibility");
    const { range: bidPlanRange } = await planOrderValueEligibility.assertFreelancerMayAccessFakeOrderByPlan(
      uid,
      fo,
      client,
    );
    if (!planOrderValueEligibility.isSingleValueInPlanRange(bidPlanRange, bid)) {
      const err = new Error("مبلغ العرض خارج نطاق باقة اشتراكك.");
      err.statusCode = 403;
      err.reason = "bid_amount_outside_plan_range";
      err.exposeToClient = true;
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
         AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
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
    const planOrderValueEligibility = require("./planOrderValueEligibility");
    await planOrderValueEligibility.assertFreelancerMayAccessFakeOrderByPlan(uid, fo, client);
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
 * When `externalClient` is passed, runs inside the caller's transaction (no nested BEGIN).
 */
async function expireStaleItems(externalClient = null) {
  const ownClient = externalClient ? null : await pool.connect();
  const client = externalClient || ownClient;
  try {
    if (!externalClient) {
      await client.query("BEGIN");
    }
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
    if (!externalClient) {
      await client.query("COMMIT");
    }
    const rowsItems = Number(r1.rowCount || 0);
    const rowsOrders = Number(r2.rowCount || 0);
    const rowsRounds = Number(r3.rowCount || 0);
    if (rowsItems + rowsOrders + rowsRounds > 0) {
      invalidatePublicHomeOrderStatsCache();
    }
    if (rowsItems + rowsOrders + rowsRounds > 0) {
      logAutomationEvent("expire_pass", {
        rowsItems,
        rowsOrders,
        rowsRounds,
        inTransaction: Boolean(externalClient),
      });
    }
    return { rowsItems, rowsOrders, rowsRounds };
  } catch (e) {
    if (!externalClient) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {
        /* ignore */
      }
    }
    throw e;
  } finally {
    if (ownClient) {
      ownClient.release();
    }
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
    await recordMarketplaceVisibleFakeOrders(pool);
  } catch (e) {
    logAutomationEvent("record_visible_failed", { message: String(e?.message || e).slice(0, 200) });
    console.error("[fakeOrders] recordMarketplaceVisibleFakeOrders failed (non-fatal):", e?.message || e);
  }

  const runStartedAt = new Date();
  const client = await pool.connect();
  let didGenerate = false;
  let genStatus = "success";
  let genError = null;
  let roundId = null;
  let genCount = null;

  try {
    await client.query("BEGIN");
    const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 FOR UPDATE`);
    const s = sRows[0];
    if (!s || !s.training_orders_enabled || !s.automation_enabled) {
      await client.query("COMMIT");
      logAutomationEvent("skipped_settings", {
        training_orders_enabled: Boolean(s?.training_orders_enabled),
        automation_enabled: Boolean(s?.automation_enabled),
        reason: !s
          ? "no_settings"
          : !s.training_orders_enabled
            ? "training_disabled"
            : "automation_disabled",
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

    const minVisible = resolveMinVisibleFromSettings(s);
    const overlapMs = getOverlapThresholdMs();
    let coverageBefore = await getTrainingPoolCoverage(client);
    logAutomationEvent("tick_coverage_before", {
      visibleCount: coverageBefore.visibleCount,
      minVisible,
      activeRounds: coverageBefore.activeRounds,
      earliestUntil: coverageBefore.earliestUntil,
      overlapMs,
    });

    let nextRun = s.next_automation_run_at ? new Date(s.next_automation_run_at).getTime() : null;
    if (nextRun == null) {
      const initAt = computeNextAutomationRunAt(coverageBefore, s);
      await client.query(
        `UPDATE fake_order_settings SET next_automation_run_at = $1, last_automation_next_at = $1, updated_at = NOW() WHERE id = 1`,
        [initAt],
      );
      await client.query("COMMIT");
      logAutomationEvent("next_run_initialized", {
        nextAt: initAt.toISOString(),
        earliestUntil: coverageBefore.earliestUntil,
        overlapMs,
      });
      return;
    }

    const now = Date.now();
    const actorUserId = await resolveAutomationActorUserId(client);
    if (!actorUserId) {
      logAutomationEvent("no_admin_actor", { reason: "no_admin_user" });
      console.error("[fakeOrders] automation: no admin user found for training round generation");
      const nextAtDate = computeNextAutomationRunAt(coverageBefore, s, now);
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
        runStartedAt,
        status: "failed",
        errorMessage: "no_admin_actor",
        roundId: null,
        generatedCount: null,
        source: "automation",
      });
      return;
    }

    const seamless = await ensureSeamlessTrainingRotation(client, s, {
      actorUserId,
      reason: "automation_tick",
      minVisible,
    });
    if (seamless.generated) {
      didGenerate = true;
      roundId = seamless.roundId ?? null;
      genCount = seamless.generatedCount ?? null;
      genStatus = "success";
      logAutomationEvent("seamless_rotation", {
        action: seamless.action,
        roundId,
        generatedCount: genCount,
        visibleBefore: coverageBefore.visibleCount,
        minVisible,
      });
    } else if (seamless.code === "NO_TEMPLATES") {
      genStatus = "skipped_no_templates";
      logAutomationEvent("skipped_no_templates", { code: "NO_TEMPLATES", phase: "seamless" });
    } else if (seamless.code === "LOCK_BUSY") {
      logAutomationEvent("rotation_skipped_lock", {
        phase: "seamless",
        visible: seamless.visible,
        minVisible,
      });
    }

    const scheduledDue = now >= nextRun;
    if (!didGenerate && scheduledDue) {
      let scheduledLockAcquired = false;
      try {
        scheduledLockAcquired = await tryAcquireGenerationLock(client, { reason: "automation_scheduled" });
        if (!scheduledLockAcquired) {
          logAutomationEvent("skipped_lock", { reason: "advisory_lock_active", phase: "scheduled" });
          await insertAutomationLogSafe(pool, {
            runStartedAt,
            status: "skipped_lock",
            errorMessage: null,
            roundId: null,
            generatedCount: null,
            source: "automation",
          });
        } else {
          const scheduleCoverage = await getTrainingPoolCoverage(client);
          const supersedeExisting = scheduleCoverage.visibleCount === 0;
          logAutomationEvent("scheduled_rotation_start", {
            visibleCount: scheduleCoverage.visibleCount,
            supersedeExisting,
            scheduledDue: true,
          });

          const result = await withSavepoint(client, "training_round_gen", () =>
            generateTrainingRoundInternal(client, {
              actorUserId,
              roundSource: "automation",
              supersedeExisting,
              gaplessSupersede: supersedeExisting,
            }),
          );
          if (result.ok) {
            didGenerate = true;
            roundId = result.round?.id ? Number(result.round.id) : null;
            genCount = result.generatedCount ?? null;
            genStatus = "success";
            invalidatePublicHomeOrderStatsCache();
            logAutomationEvent("generated_round", {
              roundId,
              generatedCount: genCount,
              phase: "scheduled",
              supersedeExisting,
            });
          } else if (result.code === "NO_TEMPLATES" || result.code === "INSUFFICIENT_ELIGIBLE_POOL") {
            genStatus = result.code === "INSUFFICIENT_ELIGIBLE_POOL" ? "skipped_insufficient_pool" : "skipped_no_templates";
            logAutomationEvent(genStatus, { code: result.code, phase: "scheduled", eligiblePoolSize: result.eligiblePoolSize });
            console.error(`[fakeOrders] automation: round generation skipped (${result.code})`);
          }
        }
      } catch (e) {
        genStatus = "failed";
        genError = String(e?.message || e).slice(0, 5000);
        logAutomationEvent("generation_failed", { message: genError.slice(0, 200), phase: "scheduled" });
        console.error("[fakeOrders] automation: round generation failed:", e?.message || e);
      } finally {
        await releaseGenerationLock(client, {
          acquired: scheduledLockAcquired,
          reason: "automation_scheduled",
        });
      }
    } else if (!didGenerate && !scheduledDue) {
      logAutomationEvent("scheduled_rotation_not_due", {
        nextRunAt: new Date(nextRun).toISOString(),
        visibleCount: coverageBefore.visibleCount,
        verbose: isFakeOrdersAutomationVerbose(),
      });
    }

    await expireStaleItems(client);

    let coverageAfter = await getTrainingPoolCoverage(client);
    if (coverageAfter.visibleCount < minVisible) {
      const postExpireRotation = await ensureSeamlessTrainingRotation(client, s, {
        actorUserId,
        reason: "automation_post_expire",
        minVisible,
      });
      if (postExpireRotation.generated) {
        didGenerate = true;
        roundId = postExpireRotation.roundId ?? roundId;
        genCount = postExpireRotation.generatedCount ?? genCount;
        genStatus = "success";
        logAutomationEvent("post_expire_replenish", {
          roundId,
          generatedCount: genCount,
          visibleBefore: coverageAfter.visibleCount,
          minVisible,
        });
      }
      coverageAfter = await getTrainingPoolCoverage(client);
    }

    const nextAtDate = computeNextAutomationRunAt(coverageAfter, s, Date.now());

    if (coverageAfter.visibleCount < minVisible) {
      logAutomationEvent("visible_below_minimum_after_tick", {
        visibleCount: coverageAfter.visibleCount,
        minVisible,
        didGenerate,
        earliestUntil: coverageAfter.earliestUntil,
      });
    }

    if (didGenerate || scheduledDue) {
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
    } else {
      await client.query(
        `UPDATE fake_order_settings SET
           next_automation_run_at = $1,
           last_automation_next_at = $1,
           updated_at = NOW()
         WHERE id = 1`,
        [nextAtDate],
      );
    }

    await client.query("COMMIT");

    logAutomationEvent("tick_coverage_after", {
      visibleCount: coverageAfter.visibleCount,
      minVisible,
      activeRounds: coverageAfter.activeRounds,
      earliestUntil: coverageAfter.earliestUntil,
      nextAutomationRunAt: nextAtDate.toISOString(),
      overlapMs,
    });

    if (didGenerate) {
      try {
        await recordMarketplaceVisibleFakeOrders(pool);
        invalidatePublicHomeOrderStatsCache();
      } catch (markErr) {
        console.warn("[fakeOrders] recordMarketplaceVisibleFakeOrders after tick:", markErr?.message || markErr);
      }
    }
    if (didGenerate || genStatus !== "success") {
      await insertAutomationLogSafe(pool, {
        runStartedAt,
        status: genStatus,
        errorMessage: genError,
        roundId,
        generatedCount: genCount,
        source: "automation",
      });
    }
  } catch (e) {
    await safeRollback(client);
    console.error("[fakeOrders] automation tick transaction failed:", e?.message || e);
  } finally {
    client.release();
  }
}

async function getVisibleFakeOrdersCount(clientOrPool) {
  const runner = clientOrPool || pool;
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS c
     ${TRAINING_POOL_VISIBLE_FROM_SQL}
     WHERE ${trainingPoolVisibleWhereSql({ anyAudience: true })}`,
  );
  return Number(rows[0]?.c || 0);
}

/**
 * Mark fake orders that are (or were just) marketplace-visible under the full audience-aware predicate.
 * @param {import('pg').Pool | import('pg').PoolClient} [clientOrPool]
 * @param {{ fakeOrderIds?: number[] }} [options]
 */
async function recordMarketplaceVisibleFakeOrders(clientOrPool, options = {}) {
  const runner = clientOrPool || pool;
  const ids = Array.isArray(options.fakeOrderIds)
    ? options.fakeOrderIds.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  if (ids.length) {
    await runner.query(
      `UPDATE fake_orders fo
       SET was_marketplace_visible = TRUE,
           first_visible_at = COALESCE(first_visible_at, NOW()),
           updated_at = NOW()
       WHERE fo.id = ANY($1::bigint[])
         AND fo.was_marketplace_visible IS NOT TRUE
         AND EXISTS (
           SELECT 1
           ${trainingPoolVisibleFromSql("fo_vis")}
           WHERE fo_vis.id = fo.id
             AND ${trainingPoolVisibleWhereSql({ anyAudience: true, alias: "fo_vis" })}
         )`,
      [ids],
    );
    return;
  }

  await runner.query(
    `UPDATE fake_orders fo
     SET was_marketplace_visible = TRUE,
         first_visible_at = COALESCE(first_visible_at, NOW()),
         updated_at = NOW()
     WHERE fo.was_marketplace_visible IS NOT TRUE
       AND EXISTS (
         SELECT 1
         ${TRAINING_POOL_VISIBLE_FROM_SQL}
         WHERE fo.id = ri.fake_order_id
           AND ${trainingPoolVisibleWhereSql({ anyAudience: true })}
       )`,
  );
}

/**
 * Keep public pool continuous: replenish after expiry and publish the next round before the last one ends.
 * Idempotent via advisory lock + coverage checks (no duplicate overlap rounds).
 */
async function ensureSeamlessTrainingRotation(client, settings, { actorUserId, reason = "rotation", minVisible = null } = {}) {
  const minVisibleCount = resolveMinVisibleFromSettings(settings, minVisible);
  const coverage = await getTrainingPoolCoverage(client);
  const overlapMs = getOverlapThresholdMs();
  const now = Date.now();

  let supersedeExisting = false;
  let rotationReason = null;

  if (coverage.visibleCount < minVisibleCount) {
    rotationReason = "replenish";
    supersedeExisting = coverage.visibleCount === 0;
    logAutomationEvent("rotation_replenish_triggered", {
      reason,
      visibleCount: coverage.visibleCount,
      minVisible: minVisibleCount,
      supersedeExisting,
    });
  } else if (
    coverage.earliestUntil &&
    needsPreemptiveOverlapWindow(coverage, now) &&
    !(await hasVisibleItemsExpiringAfter(client, coverage.earliestUntil))
  ) {
    rotationReason = "preemptive_overlap";
    supersedeExisting = false;
    logAutomationEvent("rotation_overlap_triggered", {
      reason,
      visibleCount: coverage.visibleCount,
      earliestUntil: coverage.earliestUntil,
      overlapMs,
      activeRounds: coverage.activeRounds,
    });
  } else {
    logAutomationEvent("rotation_not_needed", {
      reason,
      visibleCount: coverage.visibleCount,
      minVisible: minVisibleCount,
      activeRounds: coverage.activeRounds,
      earliestUntil: coverage.earliestUntil,
      overlapMs,
      withinOverlapWindow: needsPreemptiveOverlapWindow(coverage, now),
    });
    return { ok: true, action: "none", visible: coverage.visibleCount, coverage };
  }

  let lockAcquired = false;
  try {
    lockAcquired = await tryAcquireGenerationLock(client, { reason: `rotation:${reason}:${rotationReason}` });
    if (!lockAcquired) {
      logAutomationEvent("rotation_skipped_lock", { reason, rotationReason, visible: coverage.visibleCount });
      return { ok: false, code: "LOCK_BUSY", visible: coverage.visibleCount, coverage, retryable: true };
    }

    const afterLock = await getTrainingPoolCoverage(client);
    if (rotationReason === "replenish" && afterLock.visibleCount >= minVisibleCount) {
      logAutomationEvent("rotation_replenish_aborted", {
        reason,
        visibleAfterLock: afterLock.visibleCount,
        minVisible: minVisibleCount,
      });
      return { ok: true, action: "none", visible: afterLock.visibleCount, coverage: afterLock };
    }
    if (
      rotationReason === "preemptive_overlap" &&
      (!afterLock.earliestUntil ||
        !needsPreemptiveOverlapWindow(afterLock, Date.now()) ||
        (await hasVisibleItemsExpiringAfter(client, afterLock.earliestUntil)))
    ) {
      logAutomationEvent("rotation_overlap_aborted", {
        reason,
        visibleAfterLock: afterLock.visibleCount,
        earliestUntil: afterLock.earliestUntil,
      });
      return { ok: true, action: "none", visible: afterLock.visibleCount, coverage: afterLock };
    }

    const result = await withSavepoint(client, "training_round_generation", () =>
      generateTrainingRoundInternal(client, {
        actorUserId,
        roundSource: "automation",
        supersedeExisting,
        gaplessSupersede: supersedeExisting,
      }),
    );
    if (!result.ok) {
      logAutomationEvent("rotation_skipped_no_pool", { reason, rotationReason, code: result.code || "UNKNOWN" });
      return {
        ok: false,
        code: result.code || "INSUFFICIENT_ELIGIBLE_POOL",
        visible: afterLock.visibleCount,
        coverage: afterLock,
      };
    }

    const visibleAfterGen = await getVisibleFakeOrdersCount(client);
    invalidatePublicHomeOrderStatsCache();
    logAutomationEvent("rotation_generated", {
      reason,
      rotationReason,
      supersedeExisting,
      roundId: result.round?.id ? Number(result.round.id) : null,
      generatedCount: Number(result.generatedCount || 0),
      visibleAfterGen,
      minVisible: minVisibleCount,
    });
    return {
      ok: true,
      action: rotationReason,
      generated: true,
      roundId: result.round?.id ? Number(result.round.id) : null,
      generatedCount: Number(result.generatedCount || 0),
      visible: visibleAfterGen,
      coverage: afterLock,
    };
  } finally {
    await releaseGenerationLock(client, {
      acquired: lockAcquired,
      reason: `rotation:${reason}:${rotationReason || "none"}`,
    });
  }
}

/**
 * Ensure there are enough visible fake orders when training display is enabled.
 * Safe for repeated calls (advisory lock + transactional checks).
 */
async function ensureMinimumVisibleFakeOrders({ reason = "runtime", minVisible = null } = {}) {
  const maxAttempts = LOCK_BUSY_RETRY_REASONS.has(String(reason)) ? LOCK_BUSY_BACKOFF_MS.length + 1 : 1;
  let lastResult = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      const delayMs = LOCK_BUSY_BACKOFF_MS[attempt - 1] || 1000;
      logAutomationEvent("ensure_min_visible_retry", { reason, attempt, delayMs });
      // eslint-disable-next-line no-await-in-loop
      await sleep(delayMs);
    }
    // eslint-disable-next-line no-await-in-loop
    lastResult = await ensureMinimumVisibleFakeOrdersOnce({ reason, minVisible, attempt });
    if (lastResult.code !== "LOCK_BUSY") {
      return lastResult;
    }
  }

  return {
    ...lastResult,
    retryable: true,
    status: "lock_busy_retryable",
  };
}

async function ensureMinimumVisibleFakeOrdersOnce({ reason = "runtime", minVisible = null, attempt = 0 } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 FOR UPDATE`);
    const s = sRows[0];
    if (!s || !s.training_orders_enabled) {
      await client.query("COMMIT");
      return { ok: false, code: "TRAINING_DISABLED", status: "training_disabled" };
    }

    const thresholdFromSettings = Math.max(1, Number(s.min_orders) || 20);
    const threshold = Number.isFinite(Number(minVisible)) ? Math.max(1, Number(minVisible)) : thresholdFromSettings;
    const currentVisible = await getVisibleFakeOrdersCount(client);
    if (currentVisible >= threshold) {
      await client.query("COMMIT");
      return {
        ok: true,
        generated: false,
        visible: currentVisible,
        threshold,
        status: "already_visible",
      };
    }

    const actorUserId = await resolveAutomationActorUserId(client);
    if (!actorUserId) {
      await client.query("COMMIT");
      logAutomationEvent("ensure_min_visible_no_actor", { reason, currentVisible, threshold, attempt });
      return { ok: false, code: "NO_ADMIN_ACTOR", visible: currentVisible, threshold, status: "failed" };
    }

    const rotation = await ensureSeamlessTrainingRotation(client, s, {
      actorUserId,
      reason,
      minVisible: threshold,
    });
    if (rotation.code === "LOCK_BUSY") {
      await safeRollback(client);
      logAutomationEvent("ensure_min_visible_skipped_lock", { reason, currentVisible, threshold, attempt });
      return {
        ok: false,
        code: "LOCK_BUSY",
        visible: currentVisible,
        threshold,
        retryable: true,
        status: attempt < LOCK_BUSY_BACKOFF_MS.length ? "lock_busy_retryable" : "lock_busy_retryable",
      };
    }
    if (!rotation.generated) {
      await client.query("COMMIT");
      if (rotation.code === "NO_TEMPLATES") {
        logAutomationEvent("ensure_min_visible_no_templates", { reason, currentVisible, threshold, attempt });
        return { ok: false, code: "NO_TEMPLATES", visible: currentVisible, threshold, status: "failed" };
      }
      return {
        ok: true,
        generated: false,
        visible: currentVisible,
        threshold,
        status: rotation.action === "none" ? "already_visible" : "no_generation",
      };
    }

    await client.query("COMMIT");
    await recordMarketplaceVisibleFakeOrders(pool);
    const visibleAfter = await getVisibleFakeOrdersCount(pool);
    return {
      ok: true,
      generated: true,
      roundId: rotation.roundId ?? null,
      generatedCount: rotation.generatedCount ?? null,
      threshold,
      visible: visibleAfter,
      status: "generated",
    };
  } catch (e) {
    await safeRollback(client);
    logAutomationEvent("ensure_min_visible_failed", {
      reason,
      attempt,
      message: String(e?.message || e).slice(0, 500),
    });
    return {
      ok: false,
      code: "GENERATION_FAILED",
      visible: 0,
      threshold: Number(minVisible) || null,
      error: String(e?.message || e).slice(0, 500),
      status: "failed",
    };
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

async function countFakeOrdersPool({ actorUserId } = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders`);
  return { total: Number(rows[0]?.c || 0) };
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

function resolveTemplateBudgetSync(minB, maxB, { title = "", description = "" } = {}) {
  const result = normalizeTemplateBudget(minB, maxB, inferComplexityProfile({ title, description }));
  if (!result.ok) {
    const err = new Error("نطاق الميزانية غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  return { minB: result.min, maxB: result.max };
}

const LEGACY_TEMPLATE_SERVICE_ERROR =
  "Legacy templates are disabled. Create training orders directly in the pool (fake_orders).";

function assertLegacyTemplateServiceMutationAllowed() {
  if (process.env.ALLOW_LEGACY_TEMPLATE_SERVICE_MUTATION === "true") return;
  const err = new Error(LEGACY_TEMPLATE_SERVICE_ERROR);
  err.statusCode = 410;
  err.code = "template_service_mutation_disabled";
  throw err;
}

async function createTemplate({ actorUserId, payload }) {
  assertLegacyTemplateServiceMutationAllowed();
  // Legacy/internal only — admin manual orders must use createFakeOrder (fake_orders, template_id NULL).
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
    let minB = Number(payload.minBudget);
    let maxB = Number(payload.maxBudget);
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
    ({ minB, maxB } = resolveTemplateBudgetSync(minB, maxB, { title, description }));
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
    scheduleTemplateTranslation(newId, title, description);
    return getTemplateById(newId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function updateTemplate({ actorUserId, id, payload }) {
  assertLegacyTemplateServiceMutationAllowed();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const tid = Number(id);
    const { rows: curRows } = await client.query(
      `SELECT id, title, description, min_budget, max_budget FROM fake_order_templates WHERE id = $1 FOR UPDATE`,
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
    const nextTitle = payload.title != null ? String(payload.title).trim() : String(current.title || "").trim();
    const nextDescription = payload.description != null ? String(payload.description).trim() : String(current.description || "").trim();
    const draftMin = payload.minBudget != null ? Number(payload.minBudget) : Number(current.min_budget);
    const draftMax = payload.maxBudget != null ? Number(payload.maxBudget) : Number(current.max_budget);
    const { minB: resolvedMin, maxB: resolvedMax } = resolveTemplateBudgetSync(draftMin, draftMax, {
      title: nextTitle,
      description: nextDescription,
    });
    if (payload.minBudget != null) push(`min_budget =`, resolvedMin);
    if (payload.maxBudget != null) push(`max_budget =`, resolvedMax);
    if (payload.minDuration != null) push(`min_duration =`, Number(payload.minDuration));
    if (payload.maxDuration != null) push(`max_duration =`, Number(payload.maxDuration));
    if (payload.durationUnit != null) push(`duration_unit =`, String(payload.durationUnit));
    if (payload.isActive != null) push(`is_active =`, Boolean(payload.isActive));
    if (!fields.length) {
      await client.query("COMMIT");
      return getTemplateById(tid);
    }
    fields.push(`updated_at = NOW()`);
    vals.push(tid);
    await client.query(`UPDATE fake_order_templates SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    const titleChanged = payload.title != null;
    const descriptionChanged = payload.description != null;
    await client.query("COMMIT");
    if (titleChanged || descriptionChanged) {
      scheduleTemplateTranslation(tid, nextTitle, nextDescription);
    }
    return getTemplateById(tid);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function deleteTemplate({ actorUserId, id }) {
  assertLegacyTemplateServiceMutationAllowed();
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
    await client.query(
      `UPDATE fake_order_round_items SET status = 'expired', updated_at = NOW()
       WHERE round_id = $1 AND status = 'active'`,
      [rid],
    );
    await client.query(
      `UPDATE fake_orders SET fake_status = 'expired', updated_at = NOW()
       WHERE fake_round_id = $1 AND fake_status = 'active'`,
      [rid],
    );
    await client.query(`UPDATE fake_order_rounds SET status = 'stopped', updated_at = NOW() WHERE id = $1`, [rid]);
    const { rows: out } = await client.query(`SELECT * FROM fake_order_rounds WHERE id = $1`, [rid]);
    await client.query("COMMIT");
    invalidatePublicHomeOrderStatsCache();
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

async function listApplicationsForFakeOrder({ actorUserId, fakeOrderId, page = 1, limit = 100 } = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const oid = Number(fakeOrderId);
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM fake_order_applications fa
     WHERE fa.fake_order_id = $1`,
    [oid],
  );
  const total = Number(countRows[0]?.c || 0);

  const { rows: titleRows } = await pool.query(
    `SELECT title FROM fake_orders WHERE id = $1`,
    [oid],
  );
  const title = titleRows[0]?.title || null;

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
     ORDER BY fa.created_at DESC, fa.id DESC
     LIMIT $2 OFFSET $3`,
    [oid, lim, off],
  );
  const applicants = rows.map(mapApplication);
  return {
    title,
    applicantsTotal: total,
    applicants,
    applications: applicants,
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages: Math.max(1, Math.ceil(total / lim) || 1),
    },
  };
}

/** @type {ReturnType<typeof setInterval> | null} */
let automationIntervalId = null;

/**
 * Non-production helper: when training is on but DB automation flag is off, enable automation
 * so local dev rotation matches Super Admin intent without a manual settings toggle.
 */
async function syncLocalDevAutomationFlags() {
  const { isInProcessAutomationIntervalEnabled, isProductionNodeEnv } = require("../config/fakeOrdersAutomation");
  if (isProductionNodeEnv() || !isInProcessAutomationIntervalEnabled()) {
    return { synced: false };
  }
  const { rowCount } = await pool.query(
    `UPDATE fake_order_settings
     SET automation_enabled = TRUE, updated_at = NOW()
     WHERE id = 1
       AND training_orders_enabled = TRUE
       AND automation_enabled = FALSE`,
  );
  if (rowCount > 0) {
    logAutomationEvent("local_dev_automation_enabled", { reason: "training_on_automation_off" });
  }
  return { synced: rowCount > 0 };
}

/**
 * Pure readiness status for admin dashboard (unit-testable).
 * @param {{ eligibleForNextRound: number, minOrders: number, maxOrders: number, trainingOrdersEnabled: boolean, automationEnabled: boolean, currentlyVisibleFakeOrders: number, activeRound: object|null, oldVisibleOrdersCount: number }} input
 */
function buildTrainingOrdersReadinessPayload(input) {
  const {
    eligibleForNextRound,
    minOrders,
    maxOrders,
    trainingOrdersEnabled,
    automationEnabled,
    currentlyVisibleFakeOrders,
    activeRound,
    activeRoundVisibleCount = 0,
    activeRoundGeneratedCount = 0,
    activeRoundVisibleFrom = null,
    activeRoundVisibleUntil = null,
    activeRoundTimeRemainingSeconds = null,
    currentlyVisiblePublic = 0,
    currentlyVisibleEligibleAudience = 0,
    totalFakeOrdersPool = 0,
    activeFakeOrdersPool = 0,
    oldVisibleOrdersCount = 0,
    lastAutomationRunAt = null,
    lastAutomationStatus = null,
    nextAutomationRunAt = null,
    visibleOrdersPreview = [],
  } = input;

  const readinessWarnings = [];
  if (!trainingOrdersEnabled) readinessWarnings.push("training_orders_disabled");
  if (!automationEnabled) readinessWarnings.push("automation_disabled");
  if (eligibleForNextRound < minOrders) readinessWarnings.push("insufficient_eligible_pool");
  if (trainingOrdersEnabled && currentlyVisibleFakeOrders < 1) readinessWarnings.push("no_visible_orders");
  if (trainingOrdersEnabled && !activeRound) readinessWarnings.push("no_active_round");
  if (oldVisibleOrdersCount > 0) readinessWarnings.push("old_visible_orders_detected");
  if (
    nextAutomationRunAt &&
    activeRoundVisibleUntil &&
    new Date(nextAutomationRunAt).getTime() > new Date(activeRoundVisibleUntil).getTime()
  ) {
    readinessWarnings.push("rotation_scheduled_after_round_end");
  }

  let nextRoundReadinessStatus = "ready";
  if (!trainingOrdersEnabled || eligibleForNextRound < minOrders) {
    nextRoundReadinessStatus = "blocked";
  } else if (eligibleForNextRound < maxOrders) {
    nextRoundReadinessStatus = "warning";
  }

  const canCreateNextRound = Boolean(trainingOrdersEnabled) && eligibleForNextRound >= minOrders;
  const lastAutomationSuccessAt =
    lastAutomationRunAt && lastAutomationStatus === "success" ? lastAutomationRunAt : null;
  const lastAutomationFailedAt =
    lastAutomationRunAt && lastAutomationStatus === "failed" ? lastAutomationRunAt : null;

  return {
    trainingOrdersEnabled: Boolean(trainingOrdersEnabled),
    automationEnabled: Boolean(automationEnabled),
    activeRoundId: activeRound?.id != null ? String(activeRound.id) : null,
    activeRoundStatus: activeRound?.status || null,
    activeRoundVisibleCount,
    activeRoundGeneratedCount,
    activeRoundVisibleFrom,
    activeRoundVisibleUntil,
    activeRoundTimeRemainingSeconds,
    currentlyVisibleFakeOrders,
    currentlyVisiblePublic,
    currentlyVisibleEligibleAudience,
    totalFakeOrdersPool,
    activeFakeOrdersPool,
    eligibleForNextRound,
    minOrdersPerRound: minOrders,
    maxOrdersPerRound: maxOrders,
    canCreateNextRound,
    nextRoundReadinessStatus,
    readinessWarnings,
    oldVisibleOrdersCount,
    lastAutomationRunAt,
    lastAutomationSuccessAt,
    lastAutomationFailedAt,
    nextAutomationRunAt,
    handoffLeadTimeMs: getHandoffLeadTimeMs(),
    overlapMs: getOverlapThresholdMs(),
    visibleOrdersPreview,
    checkedAt: new Date().toISOString(),
  };
}

async function countOldVisibleOrderLeaks(runner) {
  const db = runner || pool;
  const { rows: leakRows } = await db.query(
    `SELECT COUNT(DISTINCT fo.id)::int AS c
     FROM fake_orders fo
     INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
     INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
     WHERE ri.status = 'active'
       AND ri.visible_from <= NOW()
       AND ri.visible_until > NOW()
       AND NOT (
         fr.status = 'active'
         AND COALESCE(fo.is_archived, FALSE) = FALSE
         AND fo.is_published = TRUE
         AND fo.is_open_for_pool = TRUE
         AND fo.assigned_freelancer_id IS NULL
         AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
       )`,
  );
  const { rows: staleRows } = await db.query(
    `SELECT COUNT(*)::int AS c
     FROM fake_orders fo
     WHERE fo.fake_status = 'active'
       AND (fo.fake_expires_at IS NULL OR fo.fake_expires_at > NOW())
       AND NOT (${FAKE_ORDER_VISIBLE_NOW_SQL})
       AND EXISTS (
         SELECT 1
         FROM fake_order_round_items ri_any
         WHERE ri_any.fake_order_id = fo.id
       )`,
  );
  return Number(leakRows[0]?.c || 0) + Number(staleRows[0]?.c || 0);
}

async function listCurrentlyVisibleFakeOrdersPreview(runner, limit = 10) {
  const { orders } = await queryCurrentlyVisibleFakeOrdersPaginated(runner, { page: 1, limit });
  return orders;
}

function mapCurrentlyVisibleFakeOrderRow(row) {
  return {
    id: String(row.id),
    title: row.title || row.order_code || `#${row.id}`,
    orderCode: row.order_code || null,
    categoryName: row.category_name || null,
    roundId: row.round_id != null ? String(row.round_id) : null,
    visibleUntil: row.visible_until || null,
    status: row.fake_status || null,
    roundStatus: row.round_status || null,
    visibleNow: true,
    applicantsCount: Number(row.applicants_count || 0),
  };
}

/**
 * Paginated list of training orders currently visible in the marketplace (any eligible audience).
 * Read-only — same predicates as getTrainingPoolCoverage / visibleNow admin filter.
 */
async function queryCurrentlyVisibleFakeOrdersPaginated(runner, { page = 1, limit = 10 } = {}) {
  const db = runner || pool;
  const lim = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const visibleWhere = trainingPoolVisibleWhereSql({ anyAudience: true });

  const { rows: countRows } = await db.query(
    `SELECT COUNT(DISTINCT fo.id)::int AS c
     ${TRAINING_POOL_VISIBLE_FROM_SQL}
     WHERE ${visibleWhere}`,
  );
  const total = Number(countRows[0]?.c || 0);
  const totalPages = Math.max(1, Math.ceil(total / lim) || 1);

  const { rows } = await db.query(
    `SELECT
       fo.id,
       fo.title,
       fo.order_code,
       fo.fake_status,
       c.name AS category_name,
       fr.id AS round_id,
       ri.visible_until,
       fr.status AS round_status,
       (
         SELECT COUNT(*)::int
         FROM fake_order_applications fa
         WHERE fa.fake_order_id = fo.id
       ) AS applicants_count
     ${TRAINING_POOL_VISIBLE_FROM_SQL}
     LEFT JOIN categories c ON c.id = fo.category_id
     WHERE ${visibleWhere}
     ORDER BY applicants_count DESC, ri.visible_until ASC, fo.id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  );

  return {
    orders: rows.map(mapCurrentlyVisibleFakeOrderRow),
    pagination: { page: pg, limit: lim, total, totalPages },
  };
}

async function listCurrentlyVisibleFakeOrders({ actorUserId, page = 1, limit = 10 } = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  return queryCurrentlyVisibleFakeOrdersPaginated(pool, { page, limit });
}

/**
 * Read-only operational readiness for admin — no mutations.
 */
async function getTrainingOrdersReadiness() {
  const { perfStart } = require("../utils/perfLog");
  const timing = perfStart("fakeOrdersService", "getTrainingOrdersReadiness");
  const settings = await getSettings();
  const { minOrders, maxOrders } = resolveRoundOrderBounds(
    settings
      ? { min_orders: settings.minOrders, max_orders: settings.maxOrders }
      : {},
  );

  const [
    coverage,
    eligibleForNextRound,
    activeRoundRes,
    activeRoundItemsRes,
    publicVisibleRes,
    totalPoolRes,
    activePoolRes,
    oldVisibleOrdersCount,
    visibleOrdersPreview,
  ] = await Promise.all([
    getTrainingPoolCoverage(pool),
    countEligibleFakeOrderPool(pool),
    pool.query(
      `SELECT * FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1`,
    ),
    pool.query(
      `SELECT
         ri.round_id,
         COUNT(*) FILTER (
           WHERE ri.status = 'active' AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
         )::int AS visible_count,
         MIN(ri.visible_from) FILTER (
           WHERE ri.status = 'active' AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
         ) AS visible_from,
         MAX(ri.visible_until) FILTER (
           WHERE ri.status = 'active' AND ri.visible_from <= NOW() AND ri.visible_until > NOW()
         ) AS visible_until
       FROM fake_order_round_items ri
       INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
       WHERE fr.status = 'active'
       GROUP BY ri.round_id
       ORDER BY ri.round_id DESC
       LIMIT 1`,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT fo.id)::int AS c
       ${TRAINING_POOL_VISIBLE_FROM_SQL}
       WHERE ${trainingPoolVisibleWhereSql({ publicAudienceOnly: true })}`,
    ),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders`),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM fake_orders fo
       WHERE COALESCE(fo.is_archived, FALSE) = FALSE
         AND fo.is_published = TRUE
         AND fo.is_open_for_pool = TRUE
         AND fo.assigned_freelancer_id IS NULL
         AND fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`,
    ),
    countOldVisibleOrderLeaks(pool),
    listCurrentlyVisibleFakeOrdersPreview(pool, 10),
  ]);

  const activeRoundRow = activeRoundRes.rows[0] || null;
  const activeRound = activeRoundRow ? mapRound(activeRoundRow) : null;
  const itemsRow = activeRoundItemsRes.rows[0] || null;
  const activeRoundVisibleCount = Number(itemsRow?.visible_count || 0);
  const activeRoundGeneratedCount = activeRound ? Number(activeRound.generatedCount || 0) : 0;
  const activeRoundVisibleFrom = itemsRow?.visible_from || null;
  const activeRoundVisibleUntil = itemsRow?.visible_until || activeRound?.expiresAt || null;
  let activeRoundTimeRemainingSeconds = null;
  if (activeRound?.expiresAt) {
    const ms = new Date(activeRound.expiresAt).getTime() - Date.now();
    activeRoundTimeRemainingSeconds = ms > 0 ? Math.floor(ms / 1000) : 0;
  }

  timing.end();
  return buildTrainingOrdersReadinessPayload({
    trainingOrdersEnabled: settings?.trainingOrdersEnabled,
    automationEnabled: settings?.automationEnabled,
    eligibleForNextRound,
    minOrders,
    maxOrders,
    activeRound,
    activeRoundVisibleCount,
    activeRoundGeneratedCount,
    activeRoundVisibleFrom,
    activeRoundVisibleUntil,
    activeRoundTimeRemainingSeconds,
    currentlyVisibleFakeOrders: coverage.visibleCount,
    currentlyVisiblePublic: Number(publicVisibleRes.rows[0]?.c || 0),
    currentlyVisibleEligibleAudience: coverage.visibleCount,
    totalFakeOrdersPool: Number(totalPoolRes.rows[0]?.c || 0),
    activeFakeOrdersPool: Number(activePoolRes.rows[0]?.c || 0),
    oldVisibleOrdersCount,
    lastAutomationRunAt: settings?.lastAutomationRunAt || null,
    lastAutomationStatus: settings?.lastAutomationStatus || null,
    nextAutomationRunAt: settings?.nextAutomationRunAt || null,
    visibleOrdersPreview,
  });
}

/**
 * Diagnostics for Super Admin / ops — safe aggregates only.
 */
async function getFakeOrdersAutomationHealth() {
  const {
    isInProcessAutomationIntervalEnabled,
    isAutomationDriverConfigured,
    getAutomationCronSecret,
    getFakeOrdersTickMs,
  } = require("../config/fakeOrdersAutomation");

  const settings = await getSettings();
  const coverage = await getTrainingPoolCoverage(pool);

  const [
    templatesRes,
    roundsRes,
    itemsRes,
    publicVisibleRes,
    plansRes,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates WHERE is_active = TRUE`),
    pool.query(`SELECT status, COUNT(*)::int AS c FROM fake_order_rounds GROUP BY status`),
    pool.query(`SELECT status, COUNT(*)::int AS c FROM fake_order_round_items GROUP BY status`),
    pool.query(
      `SELECT COUNT(DISTINCT fo.id)::int AS c
       ${TRAINING_POOL_VISIBLE_FROM_SQL}
       WHERE ${trainingPoolVisibleWhereSql({ publicAudienceOnly: true })}`,
    ),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_settings_plans`),
  ]);

  const inProcess = isInProcessAutomationIntervalEnabled();
  const cronConfigured = Boolean(getAutomationCronSecret());
  const driverActive = isAutomationDriverConfigured();

  const warnings = [];
  if (!driverActive) {
    warnings.push("no_automation_driver");
  }
  if (!settings?.trainingOrdersEnabled) {
    warnings.push("training_orders_disabled");
  }
  if (!settings?.automationEnabled) {
    warnings.push("db_automation_disabled");
  }
  if (driverActive && settings?.trainingOrdersEnabled && !settings?.automationEnabled) {
    warnings.push("driver_on_but_db_automation_off");
  }
  if (Number(templatesRes.rows[0]?.c || 0) < 1) {
    const { rows: poolRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM fake_orders
       WHERE COALESCE(is_archived, FALSE) = FALSE
         AND is_published = TRUE
         AND is_open_for_pool = TRUE`,
    );
    if (Number(poolRows[0]?.c || 0) < 1) {
      warnings.push("no_active_templates");
    }
  }
  if (coverage.visibleCount < 1 && settings?.trainingOrdersEnabled) {
    warnings.push("no_visible_fake_orders");
  }
  if (
    settings?.trainingOrdersEnabled &&
    !settings?.showToAllVisitors &&
    !settings?.showToAllFreelancers &&
    Number(plansRes.rows[0]?.c || 0) < 1
  ) {
    warnings.push("audience_gating_no_public_or_plans");
  }
  if (settings?.lastAutomationStatus === "failed" && settings?.lastAutomationError) {
    warnings.push("last_automation_failed");
  }
  if (
    settings?.nextAutomationRunAt &&
    coverage.earliestUntil &&
    new Date(settings.nextAutomationRunAt).getTime() > new Date(coverage.earliestUntil).getTime()
  ) {
    warnings.push("rotation_scheduled_after_round_end");
  }

  return {
    checkedAt: new Date().toISOString(),
    driver: {
      inProcessTicksEnabled: inProcess,
      tickIntervalMs: getFakeOrdersTickMs(),
      cronSecretConfigured: cronConfigured,
      cronEndpoint: "/api/internal/fake-orders/automation-tick",
      anyDriverActive: driverActive,
      schedulerRunning: automationIntervalId != null,
    },
    rotation: {
      durationValue: settings?.durationValue ?? null,
      durationUnit: settings?.durationUnit ?? null,
      overlapMs: getOverlapThresholdMs(),
      handoffLeadTimeMs: getHandoffLeadTimeMs(),
      minVisibleOrders: settings?.minOrders ?? null,
      label:
        settings?.durationValue != null && settings?.durationUnit
          ? `${settings.durationValue} ${settings.durationUnit}`
          : null,
      note: "next_automation_run_at is scheduled near earliest visible_until − handoffLeadTimeMs (overlap + one tick). FAKE_ORDERS_TICK_MS controls tick frequency only.",
    },
    db: {
      trainingOrdersEnabled: Boolean(settings?.trainingOrdersEnabled),
      automationEnabled: Boolean(settings?.automationEnabled),
      showToAllVisitors: Boolean(settings?.showToAllVisitors),
      showToAllFreelancers: Boolean(settings?.showToAllFreelancers),
      eligiblePlanLinks: Number(plansRes.rows[0]?.c || 0),
      nextAutomationRunAt: settings?.nextAutomationRunAt ?? null,
      lastAutomationRunAt: settings?.lastAutomationRunAt ?? null,
      lastAutomationStatus: settings?.lastAutomationStatus ?? null,
      lastAutomationError: settings?.lastAutomationError ?? null,
      lastAutomationRoundId: settings?.lastAutomationRoundId ?? null,
      lastAutomationGeneratedCount: settings?.lastAutomationGeneratedCount ?? null,
    },
    pool: {
      visibleAnyAudience: coverage.visibleCount,
      visiblePublicAudience: Number(publicVisibleRes.rows[0]?.c || 0),
      activeRounds: coverage.activeRounds,
      earliestVisibleUntil: coverage.earliestUntil ?? null,
    },
    templates: { activeCount: Number(templatesRes.rows[0]?.c || 0) },
    roundsByStatus: Object.fromEntries(roundsRes.rows.map((r) => [r.status, Number(r.c)])),
    roundItemsByStatus: Object.fromEntries(itemsRes.rows.map((r) => [r.status, Number(r.c)])),
    warnings,
  };
}

async function buildRotateTrainingRoundPlan(client) {
  const { rows: activeRounds } = await client.query(
    `SELECT
       fr.id,
       fr.generated_count,
       fr.starts_at,
       (
         SELECT COUNT(*)::int
         FROM fake_order_round_items ri
         WHERE ri.round_id = fr.id
           AND ri.status = 'active'
           AND ri.visible_until > NOW()
       ) AS visible_items
     FROM fake_order_rounds fr
     WHERE fr.status = 'active'
     ORDER BY fr.id DESC`,
  );
  const coverage = await getTrainingPoolCoverage(client);
  const { rows: sRows } = await client.query(`SELECT * FROM fake_order_settings WHERE id = 1 LIMIT 1`);
  const settings = sRows[0] || {};
  const { minOrders, maxOrders } = resolveRoundOrderBounds(settings);
  const requestedCount = pickRoundTargetCount(settings);
  const eligiblePool = await loadEligibleFakeOrderPool(client);
  const targetCount = Math.min(requestedCount, eligiblePool.length);
  const previewOrders = selectFakeOrdersFromPool(
    eligiblePool,
    targetCount,
    normalizeCategoryDistribution(settings.category_distribution || {}),
  );
  const visibleToExpire = activeRounds.reduce((sum, r) => sum + Number(r.visible_items || 0), 0);
  return {
    activeRounds,
    coverage,
    settings,
    minOrders,
    maxOrders,
    requestedCount,
    targetCount,
    eligiblePoolSize: eligiblePool.length,
    previewFakeOrderIds: previewOrders.map((o) => o.id),
    visibleItemsToExpire: visibleToExpire,
    sufficientPool: eligiblePool.length >= minOrders && previewOrders.length >= 1,
  };
}

/**
 * Force-rotate training pool: gapless new round from existing fake_orders, then stop prior actives.
 * @param {{ actorUserId?: number, dryRun?: boolean }} [opts]
 */
async function rotateTrainingRoundNow({ actorUserId = null, dryRun = true } = {}) {
  const client = await pool.connect();
  try {
    const plan = await buildRotateTrainingRoundPlan(client);
    const publicHomeOrderStatsService = require("./publicHomeOrderStatsService");
    publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
    const heroBefore = await publicHomeOrderStatsService.queryHeroOrderCounts();

    const report = {
      dryRun: Boolean(dryRun),
      activeRounds: plan.activeRounds,
      visibleItemsToExpire: plan.visibleItemsToExpire,
      currentVisibleCount: plan.coverage.visibleCount,
      minOrders: plan.minOrders,
      maxOrders: plan.maxOrders,
      requestedRandomCount: plan.requestedCount,
      selectedTargetCount: plan.targetCount,
      eligiblePoolSize: plan.eligiblePoolSize,
      previewFakeOrderIds: plan.previewFakeOrderIds,
      homepageBefore: {
        availableOrdersNow: heroBefore.availableOrdersNow,
        completedOrders: heroBefore.completedOrders,
      },
      sufficientPool: plan.sufficientPool,
    };

    if (dryRun) {
      report.estimatedAvailableOrdersNow = plan.targetCount + (heroBefore.availableOrdersNowReal || 0);
      return report;
    }

    const uid = actorUserId != null ? Number(actorUserId) : await resolveAutomationActorUserId(client);
    if (!uid) {
      const err = new Error("لا يوجد مستخدم أدمن لتنفيذ التدوير.");
      err.statusCode = 500;
      throw err;
    }

    await client.query("BEGIN");
    let lockAcquired = false;
    try {
      lockAcquired = await tryAcquireGenerationLock(client, { reason: "rotate_now" });
      if (!lockAcquired) {
        const err = new Error("عملية تدوير قيد التنفيذ. حاول بعد لحظات.");
        err.statusCode = 409;
        err.code = "LOCK_BUSY";
        throw err;
      }

      if (!plan.sufficientPool) {
        const err = new Error(
          `مخزون الطلبات التجريبية غير كافٍ (متاح: ${plan.eligiblePoolSize}، الحد الأدنى: ${plan.minOrders}).`,
        );
        err.statusCode = 400;
        throw err;
      }

      const result = await withSavepoint(client, "rotate_training_round_now", () =>
        generateTrainingRoundInternal(client, {
          actorUserId: uid,
          roundSource: "manual",
          supersedeExisting: true,
          gaplessSupersede: true,
        }),
      );

      if (!result.ok) {
        const err = new Error(result.code || "ROTATION_FAILED");
        err.statusCode = 400;
        err.code = result.code;
        throw err;
      }

      await client.query(
        `UPDATE fake_order_settings SET
           last_automation_run_at = NOW(),
           last_automation_status = 'success',
           last_automation_error = NULL,
           last_automation_round_id = $1,
           last_automation_generated_count = $2,
           updated_at = NOW()
         WHERE id = 1`,
        [result.round?.id ? Number(result.round.id) : null, result.generatedCount ?? null],
      );

      await client.query("COMMIT");
      lockAcquired = false;

      try {
        await recordMarketplaceVisibleFakeOrders(pool);
        invalidatePublicHomeOrderStatsCache();
      } catch (markErr) {
        console.warn("[fakeOrders] recordMarketplaceVisibleFakeOrders after rotate:", markErr?.message || markErr);
      }

      const heroAfter = await publicHomeOrderStatsService.queryHeroOrderCounts();
      const coverageAfter = await getTrainingPoolCoverage(pool);

      return {
        ...report,
        executed: true,
        roundId: result.round?.id ? Number(result.round.id) : null,
        generatedCount: result.generatedCount,
        requestedCount: result.requestedCount,
        selectedFakeOrderIds: result.selectedFakeOrderIds || [],
        homepageAfter: {
          availableOrdersNow: heroAfter.availableOrdersNow,
          completedOrders: heroAfter.completedOrders,
        },
        visibleAfter: coverageAfter.visibleCount,
      };
    } catch (e) {
      await safeRollback(client);
      throw e;
    } finally {
      await releaseGenerationLock(client, { acquired: lockAcquired, reason: "rotate_now" });
    }
  } finally {
    client.release();
  }
}

/**
 * Start in-process automation scheduler (idempotent). First tick after short delay.
 * @returns {{ enabled: boolean, tickMs: number }}
 */
const FAKE_ORDER_VISIBLE_NOW_SQL = `
  EXISTS (
    SELECT 1
    FROM fake_order_round_items ri
    INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
    WHERE ri.fake_order_id = fo.id
      AND ri.status = 'active'
      AND fr.status = 'active'
      AND ri.visible_from <= NOW()
      AND ri.visible_until > NOW()
  )`;

function mapFakeOrderAdmin(row) {
  if (!row) return null;
  const minB = row.bid_budget_min != null ? Number(row.bid_budget_min) : row.budget != null ? Number(row.budget) : null;
  const maxB = row.bid_budget_max != null ? Number(row.bid_budget_max) : row.budget != null ? Number(row.budget) : null;
  return {
    id: String(row.id),
    orderCode: row.order_code,
    title: row.title,
    description: row.description,
    ...mapCachedEnglishFields(row),
    categoryId: String(row.category_id),
    subcategoryId: row.subcategory_id ? String(row.subcategory_id) : null,
    subSubcategoryId: row.sub_subcategory_id ? String(row.sub_subcategory_id) : null,
    categoryName: row.category_name || null,
    projectType: row.project_type || "bidding",
    budget: row.budget != null ? Number(row.budget) : null,
    bidBudgetMin: minB,
    bidBudgetMax: maxB,
    currency: row.currency_code || "JOD",
    durationValue: Number(row.duration_value),
    durationUnit: row.duration_unit,
    orderStatus: row.order_status,
    fakeStatus: row.fake_status,
    isPublished: Boolean(row.is_published),
    isOpenForPool: Boolean(row.is_open_for_pool),
    isArchived: Boolean(row.is_archived),
    isActive: Boolean(row.is_published) && Boolean(row.is_open_for_pool) && !Boolean(row.is_archived),
    templateId: row.template_id != null ? String(row.template_id) : null,
    fakeRoundId: row.fake_round_id != null ? String(row.fake_round_id) : null,
    visibleNow: Boolean(row.visible_now),
    currentRoundId: row.current_round_id != null ? String(row.current_round_id) : null,
    currentRoundTitle: row.current_round_title || null,
    applicantsCount: Number(row.applicants_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function isFakeOrderCurrentlyVisible(client, fakeOrderId) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT EXISTS (
      SELECT 1
      FROM fake_order_round_items ri
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
      WHERE ri.fake_order_id = $1
        AND ri.status = 'active'
        AND fr.status = 'active'
        AND ri.visible_from <= NOW()
        AND ri.visible_until > NOW()
    ) AS visible`,
    [Number(fakeOrderId)],
  );
  return Boolean(rows[0]?.visible);
}

function resolveFakeOrderBudgetFields(payload) {
  const projectType = payload.projectType === "fixed" ? "fixed" : "bidding";
  let bidMin;
  let bidMax;
  let budget = null;
  if (projectType === "fixed") {
    const b = Math.round(Number(payload.budget ?? payload.minBudget ?? payload.maxBudget));
    if (!Number.isFinite(b) || b <= 0) {
      const err = new Error("الميزانية غير صالحة.");
      err.statusCode = 400;
      throw err;
    }
    const norm = normalizeTemplateBudget(b, b, inferComplexityProfile({ title: payload.title, description: payload.description }));
    if (!norm.ok) {
      const err = new Error("نطاق الميزانية غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    bidMin = norm.min;
    bidMax = norm.max;
    budget = norm.min;
  } else {
    let minB = Math.round(Number(payload.bidBudgetMin ?? payload.minBudget));
    let maxB = Math.round(Number(payload.bidBudgetMax ?? payload.maxBudget));
    const norm = normalizeTemplateBudget(minB, maxB, inferComplexityProfile({ title: payload.title, description: payload.description }));
    if (!norm.ok) {
      const err = new Error("نطاق الميزانية غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    bidMin = norm.min;
    bidMax = norm.max;
  }
  return { projectType, bidMin, bidMax, budget };
}

/** Maps normalized budget fields to fake_orders columns per orders_currency_by_project_type_chk. */
function resolveFakeOrderDbBudgetColumns({ projectType, bidMin, bidMax, budget }) {
  if (projectType === "fixed") {
    return {
      projectType: "fixed",
      budget,
      currencyCode: "JOD",
      bidBudgetMin: null,
      bidBudgetMax: null,
    };
  }
  return {
    projectType: "bidding",
    budget: null,
    currencyCode: "JOD",
    bidBudgetMin: bidMin,
    bidBudgetMax: bidMax,
  };
}

function rethrowFakeOrderBudgetConstraintError(err) {
  const constraint = String(err?.constraint || "");
  if (
    err?.code === "23514" &&
    (constraint.includes("orders_currency_by_project_type") || constraint.includes("orders_budget_by_project_type"))
  ) {
    const wrapped = new Error("Budget fields are not compatible with the selected project type.");
    wrapped.statusCode = 400;
    throw wrapped;
  }
  throw err;
}

function resolveFakeOrderDurationFields(payload) {
  const durationUnit = String(payload.durationUnit || "days");
  if (!["days", "hours", "minutes"].includes(durationUnit)) {
    const err = new Error("وحدة المدة غير صالحة.");
    err.statusCode = 400;
    throw err;
  }
  const minD = Number(payload.durationValue ?? payload.minDuration ?? payload.durationMin);
  const maxD = Number(payload.durationMax ?? payload.maxDuration ?? minD);
  if (!Number.isFinite(minD) || minD < 1) {
    const err = new Error("المدة غير صالحة.");
    err.statusCode = 400;
    throw err;
  }
  const durationValue = Number.isFinite(maxD) && maxD >= minD ? Math.round((minD + maxD) / 2) : Math.round(minD);
  return { durationValue, durationUnit };
}

async function listFakeOrders({
  actorUserId,
  page = 1,
  limit = 20,
  categoryId = null,
  isActive = null,
  visibleNow = null,
  q = "",
} = {}) {
  await assertAdminOrSuperAdmin(actorUserId, pool);
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = ["1=1"];
  if (categoryId) {
    params.push(Number(categoryId));
    where.push(`fo.category_id = $${params.length}`);
  }
  if (isActive === true) {
    where.push(`COALESCE(fo.is_archived, FALSE) = FALSE AND fo.is_published = TRUE AND fo.is_open_for_pool = TRUE`);
  } else if (isActive === false) {
    where.push(`(COALESCE(fo.is_archived, FALSE) = TRUE OR fo.is_published = FALSE OR fo.is_open_for_pool = FALSE)`);
  }
  if (visibleNow === true) {
    where.push(FAKE_ORDER_VISIBLE_NOW_SQL);
  } else if (visibleNow === false) {
    where.push(`NOT (${FAKE_ORDER_VISIBLE_NOW_SQL})`);
  }
  if (String(q || "").trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(fo.title ILIKE $${params.length} OR fo.description ILIKE $${params.length} OR fo.order_code ILIKE $${params.length})`);
  }
  const whereSql = where.join(" AND ");
  const { rows: cRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders fo WHERE ${whereSql}`, params);
  const total = Number(cRows[0]?.c || 0);
  const limPh = params.length + 1;
  const offPh = params.length + 2;
  const { rows } = await pool.query(
    `SELECT
       fo.*,
       c.name AS category_name,
       (${FAKE_ORDER_VISIBLE_NOW_SQL}) AS visible_now,
       (
         SELECT ri.round_id
         FROM fake_order_round_items ri
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE ri.fake_order_id = fo.id
           AND ri.status = 'active'
           AND fr.status = 'active'
           AND ri.visible_from <= NOW()
           AND ri.visible_until > NOW()
         ORDER BY ri.id DESC
         LIMIT 1
       ) AS current_round_id,
       (
         SELECT fr.title
         FROM fake_order_round_items ri
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE ri.fake_order_id = fo.id
           AND ri.status = 'active'
           AND fr.status = 'active'
           AND ri.visible_from <= NOW()
           AND ri.visible_until > NOW()
         ORDER BY ri.id DESC
         LIMIT 1
       ) AS current_round_title,
       (
         SELECT COUNT(*)::int
         FROM fake_order_applications fa
         WHERE fa.fake_order_id = fo.id
       ) AS applicants_count
     FROM fake_orders fo
     LEFT JOIN categories c ON c.id = fo.category_id
     WHERE ${whereSql}
     ORDER BY fo.id DESC
     LIMIT $${limPh} OFFSET $${offPh}`,
    [...params, lim, off],
  );
  return {
    fakeOrders: rows.map(mapFakeOrderAdmin),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function getFakeOrderById(id, { actorUserId } = {}) {
  if (actorUserId) await assertAdminOrSuperAdmin(actorUserId, pool);
  const { rows } = await pool.query(
    `SELECT
       fo.*,
       c.name AS category_name,
       (${FAKE_ORDER_VISIBLE_NOW_SQL}) AS visible_now,
       (
         SELECT ri.round_id
         FROM fake_order_round_items ri
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE ri.fake_order_id = fo.id
           AND ri.status = 'active'
           AND fr.status = 'active'
           AND ri.visible_from <= NOW()
           AND ri.visible_until > NOW()
         ORDER BY ri.id DESC
         LIMIT 1
       ) AS current_round_id,
       (
         SELECT fr.title
         FROM fake_order_round_items ri
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE ri.fake_order_id = fo.id
           AND ri.status = 'active'
           AND fr.status = 'active'
           AND ri.visible_from <= NOW()
           AND ri.visible_until > NOW()
         ORDER BY ri.id DESC
         LIMIT 1
       ) AS current_round_title,
       (
         SELECT COUNT(*)::int
         FROM fake_order_applications fa
         WHERE fa.fake_order_id = fo.id
       ) AS applicants_count
     FROM fake_orders fo
     LEFT JOIN categories c ON c.id = fo.category_id
     WHERE fo.id = $1
     LIMIT 1`,
    [Number(id)],
  );
  return mapFakeOrderAdmin(rows[0]);
}

async function createFakeOrder({ actorUserId, payload }) {
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
    const { projectType, bidMin, bidMax, budget } = resolveFakeOrderBudgetFields({ ...payload, title, description });
    const dbBudget = resolveFakeOrderDbBudgetColumns({ projectType, bidMin, bidMax, budget });
    const { durationValue, durationUnit } = resolveFakeOrderDurationFields(payload);
    const { rowCount: catOk } = await client.query(`SELECT 1 FROM categories WHERE id = $1 AND is_active = TRUE`, [categoryId]);
    if (catOk === 0) {
      const err = new Error("تصنيف غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    const settingsRes = await client.query(`SELECT show_fake_badge_to_freelancers FROM fake_order_settings WHERE id = 1 LIMIT 1`);
    const showBadge = Boolean(settingsRes.rows[0]?.show_fake_badge_to_freelancers);
    const isActive = payload.isActive !== false;
    const orderCode = await generateUniqueOrderCode(client);
    const baselineApplicantsCount = randomInt(3, 12);
    const uid = Number(actorUserId);
    const cbr = "super_admin";
    const st = "admin_created";

    const { rows } = await client.query(
      `INSERT INTO fake_orders (
        order_code, title, description, title_en, description_en,
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
        fake_status, is_fake, fake_round_id, show_fake_badge, fake_expires_at,
        baseline_applicants_count
      ) VALUES (
        $1, $2, $3, NULL, NULL,
        $4, $5, $6,
        '{}'::bigint[], '{}'::jsonb,
        $7, $8, $9, $10, $11,
        $12, $13, $14,
        NULL,
        FALSE,
        NULL, NULL, NULL,
        $15, $16,
        FALSE,
        FALSE, 'not_required',
        'published',
        $17, $18,
        NULL,
        'active', TRUE, NULL, $19, NULL,
        $20
      )
      RETURNING id`,
      [
        orderCode,
        title,
        description,
        categoryId,
        Number.isInteger(subcategoryId) && subcategoryId > 0 ? subcategoryId : null,
        Number.isInteger(subSubcategoryId) && subSubcategoryId > 0 ? subSubcategoryId : null,
        dbBudget.projectType,
        dbBudget.budget,
        dbBudget.currencyCode,
        durationValue,
        durationUnit,
        uid,
        cbr,
        st,
        isActive,
        isActive,
        dbBudget.bidBudgetMin,
        dbBudget.bidBudgetMax,
        showBadge,
        baselineApplicantsCount,
      ],
    );
    const newId = Number(rows[0].id);
    await client.query("COMMIT");
    scheduleFakeOrderTranslation(newId, title, description);
    return getFakeOrderById(newId);
  } catch (e) {
    await client.query("ROLLBACK");
    rethrowFakeOrderBudgetConstraintError(e);
  } finally {
    client.release();
  }
}

async function updateFakeOrder({ actorUserId, id, payload }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const fid = Number(id);
    const { rows: curRows } = await client.query(
      `SELECT id, title, description, project_type, budget, bid_budget_min, bid_budget_max, duration_value, duration_unit
       FROM fake_orders WHERE id = $1 FOR UPDATE`,
      [fid],
    );
    if (!curRows[0]) {
      const err = new Error("الطلب التجريبي غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    const visible = await isFakeOrderCurrentlyVisible(client, fid);
    const fields = [];
    const vals = [];
    const push = (sql, v) => {
      vals.push(v);
      fields.push(`${sql} $${vals.length}`);
    };

    if (visible) {
      const blocked = ["categoryId", "subcategoryId", "subSubcategoryId", "projectType", "budget", "bidBudgetMin", "bidBudgetMax", "minBudget", "maxBudget", "durationValue", "durationUnit", "minDuration", "maxDuration", "isActive", "isPublished", "isOpenForPool", "isArchived"];
      for (const key of blocked) {
        if (payload[key] !== undefined) {
          const err = new Error("لا يمكن تعديل بيانات الطلب التجريبي أثناء ظهوره في جولة نشطة. انتظر انتهاء الجولة أو أوقفها أولاً.");
          err.statusCode = 409;
          throw err;
        }
      }
    }

    if (payload.title != null) push(`title =`, String(payload.title).trim());
    if (payload.description != null) push(`description =`, String(payload.description).trim());
    if (!visible) {
      if (payload.categoryId != null) push(`category_id =`, Number(payload.categoryId));
      if (payload.subcategoryId !== undefined) push(`subcategory_id =`, payload.subcategoryId ? Number(payload.subcategoryId) : null);
      if (payload.subSubcategoryId !== undefined) push(`sub_subcategory_id =`, payload.subSubcategoryId ? Number(payload.subSubcategoryId) : null);
      if (
        payload.projectType != null ||
        payload.budget != null ||
        payload.bidBudgetMin != null ||
        payload.bidBudgetMax != null ||
        payload.minBudget != null ||
        payload.maxBudget != null
      ) {
        const cur = curRows[0];
        const merged = {
          projectType: payload.projectType ?? cur.project_type,
          budget: payload.budget ?? cur.budget,
          bidBudgetMin: payload.bidBudgetMin ?? payload.minBudget ?? cur.bid_budget_min,
          bidBudgetMax: payload.bidBudgetMax ?? payload.maxBudget ?? cur.bid_budget_max,
          minBudget: payload.minBudget ?? payload.bidBudgetMin ?? cur.bid_budget_min,
          maxBudget: payload.maxBudget ?? payload.bidBudgetMax ?? cur.bid_budget_max,
          title: payload.title ?? cur.title,
          description: payload.description ?? cur.description,
        };
        const { projectType, bidMin, bidMax, budget } = resolveFakeOrderBudgetFields(merged);
        const dbBudget = resolveFakeOrderDbBudgetColumns({ projectType, bidMin, bidMax, budget });
        push(`project_type =`, dbBudget.projectType);
        push(`budget =`, dbBudget.budget);
        push(`currency_code =`, dbBudget.currencyCode);
        push(`bid_budget_min =`, dbBudget.bidBudgetMin);
        push(`bid_budget_max =`, dbBudget.bidBudgetMax);
      }
      if (payload.durationValue != null || payload.durationUnit != null || payload.minDuration != null) {
        const { durationValue, durationUnit } = resolveFakeOrderDurationFields({ ...payload, durationValue: payload.durationValue ?? payload.minDuration });
        push(`duration_value =`, durationValue);
        push(`duration_unit =`, durationUnit);
      }
      if (payload.isActive !== undefined) {
        const active = payload.isActive !== false;
        push(`is_published =`, active);
        push(`is_open_for_pool =`, active);
        push(`is_archived =`, false);
      }
    }

    if (!fields.length) {
      await client.query("COMMIT");
      return getFakeOrderById(fid);
    }
    vals.push(fid);
    await client.query(`UPDATE fake_orders SET ${fields.join(", ")} WHERE id = $${vals.length}`, vals);
    await client.query("COMMIT");
    return getFakeOrderById(fid);
  } catch (e) {
    await client.query("ROLLBACK");
    rethrowFakeOrderBudgetConstraintError(e);
  } finally {
    client.release();
  }
}

/**
 * Admin soft-hide: expire one visible round item in the active round without deleting fake_orders.
 * Does not change visible_until (natural expiry / homepage completed counts use ended windows only).
 */
async function hideFakeOrderFromCurrentRound({ actorUserId, id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const fid = Number(id);

    const { rows: orderRows } = await client.query(`SELECT id FROM fake_orders WHERE id = $1 FOR UPDATE`, [fid]);
    if (orderRows.length === 0) {
      const err = new Error("الطلب التجريبي غير موجود.");
      err.statusCode = 404;
      throw err;
    }

    const { rows: itemRows } = await client.query(
      `SELECT ri.id
       FROM fake_order_round_items ri
       INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
       WHERE ri.fake_order_id = $1
         AND fr.status = 'active'
         AND ri.status = 'active'
         AND ri.visible_from <= NOW()
         AND ri.visible_until > NOW()
       FOR UPDATE OF ri`,
      [fid],
    );

    if (itemRows.length === 0) {
      const { rows: alreadyHidden } = await client.query(
        `SELECT 1
         FROM fake_order_round_items ri
         INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
         WHERE ri.fake_order_id = $1
           AND fr.status = 'active'
           AND ri.status = 'expired'
         LIMIT 1`,
        [fid],
      );
      const err = new Error(
        alreadyHidden.length > 0
          ? "تم إخفاء هذا الطلب من الجولة الحالية مسبقاً."
          : "هذا الطلب التجريبي غير ظاهر حالياً في الجولة النشطة.",
      );
      err.statusCode = 409;
      throw err;
    }

    const itemId = Number(itemRows[0].id);
    const r1 = await client.query(
      `UPDATE fake_order_round_items
       SET status = 'expired', updated_at = NOW()
       WHERE id = $1 AND status = 'active'`,
      [itemId],
    );
    if (Number(r1.rowCount || 0) === 0) {
      const err = new Error("تم إخفاء هذا الطلب من الجولة الحالية مسبقاً.");
      err.statusCode = 409;
      throw err;
    }

    await client.query(
      `UPDATE fake_orders fo
       SET fake_status = 'expired', updated_at = NOW()
       WHERE fo.id = $1
         AND fo.fake_status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM fake_order_round_items ri2
           WHERE ri2.fake_order_id = fo.id AND ri2.status = 'active'
         )`,
      [fid],
    );

    await client.query("COMMIT");
    invalidatePublicHomeOrderStatsCache();
    return { ok: true, fakeOrderId: String(fid) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function deleteFakeOrder({ actorUserId, id }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertAdminOrSuperAdmin(actorUserId, client);
    const fid = Number(id);
    const visible = await isFakeOrderCurrentlyVisible(client, fid);
    if (visible) {
      const err = new Error("لا يمكن حذف طلب ظاهر حالياً. أخفه من الجولة الحالية أولاً.");
      err.statusCode = 409;
      throw err;
    }
    const { rowCount } = await client.query(`DELETE FROM fake_orders WHERE id = $1`, [fid]);
    if (rowCount === 0) {
      const err = new Error("الطلب التجريبي غير موجود.");
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

/**
 * Map a fake_order_templates row to insertable fake_orders fields (pool conversion; no round linkage).
 * @param {object} template DB row (snake_case)
 * @returns {{ ok: true, row: object } | { ok: false, templateId: number, reason: string }}
 */
function buildFakeOrderRowFromTemplateForPoolConversion(template) {
  const templateId = Number(template?.id);
  const title = String(template?.title || "").trim();
  const description = String(template?.description || "").trim();
  if (title.length < 2 || description.length < 2) {
    return { ok: false, templateId, reason: "invalid_title_description" };
  }
  const categoryId = Number(template?.category_id);
  if (!Number.isFinite(categoryId) || categoryId < 1) {
    return { ok: false, templateId, reason: "invalid_category" };
  }
  let minB = Number(template?.min_budget);
  let maxB = Number(template?.max_budget);
  try {
    ({ minB, maxB } = resolveTemplateBudgetSync(minB, maxB, { title, description }));
  } catch {
    return { ok: false, templateId, reason: "invalid_budget" };
  }
  const minD = Number(template?.min_duration);
  const maxD = Number(template?.max_duration);
  const durationUnit = String(template?.duration_unit || "days");
  if (!["days", "hours", "minutes"].includes(durationUnit)) {
    return { ok: false, templateId, reason: "invalid_duration_unit" };
  }
  if (!Number.isFinite(minD) || !Number.isFinite(maxD) || minD < 1 || maxD < minD) {
    return { ok: false, templateId, reason: "invalid_duration" };
  }
  const projectType = minB === maxB ? "fixed" : "bidding";
  const budgetPayload =
    projectType === "fixed"
      ? { projectType: "fixed", title, description, budget: minB, durationUnit }
      : {
          projectType: "bidding",
          title,
          description,
          bidBudgetMin: minB,
          bidBudgetMax: maxB,
          minDuration: minD,
          maxDuration: maxD,
          durationUnit,
        };
  let resolvedBudget;
  try {
    resolvedBudget = resolveFakeOrderBudgetFields(budgetPayload);
  } catch {
    return { ok: false, templateId, reason: "invalid_budget_fields" };
  }
  const dbBudget = resolveFakeOrderDbBudgetColumns({
    projectType: resolvedBudget.projectType,
    bidMin: resolvedBudget.bidMin,
    bidMax: resolvedBudget.bidMax,
    budget: resolvedBudget.budget,
  });
  let durationFields;
  try {
    durationFields = resolveFakeOrderDurationFields({
      minDuration: minD,
      maxDuration: maxD,
      durationUnit,
    });
  } catch {
    return { ok: false, templateId, reason: "invalid_duration_fields" };
  }
  return {
    ok: true,
    templateId,
    row: {
      title,
      description,
      titleEn: template.title_en != null ? String(template.title_en).trim() || null : null,
      descriptionEn: template.description_en != null ? String(template.description_en).trim() || null : null,
      categoryId,
      subcategoryId: template.subcategory_id != null ? Number(template.subcategory_id) : null,
      subSubcategoryId: template.sub_subcategory_id != null ? Number(template.sub_subcategory_id) : null,
      projectType: dbBudget.projectType,
      budget: dbBudget.budget,
      currencyCode: dbBudget.currencyCode,
      bidBudgetMin: dbBudget.bidBudgetMin,
      bidBudgetMax: dbBudget.bidBudgetMax,
      durationValue: durationFields.durationValue,
      durationUnit: durationFields.durationUnit,
      createdByUserId: template.created_by != null ? Number(template.created_by) : null,
      sourceType: "template_converted",
    },
  };
}

/**
 * Insert one converted template as a pool fake_order and record conversion tracking.
 * Caller must run inside a transaction. Does not create round items.
 */
async function insertConvertedTemplateAsFakeOrder(client, { template, actorUserId, conversionBatchId }) {
  const built = buildFakeOrderRowFromTemplateForPoolConversion(template);
  if (!built.ok) return built;

  const { row } = built;
  const { rowCount: catOk } = await client.query(
    `SELECT 1 FROM categories WHERE id = $1 AND is_active = TRUE`,
    [row.categoryId],
  );
  if (catOk === 0) {
    return { ok: false, templateId: built.templateId, reason: "inactive_category" };
  }

  const settingsRes = await client.query(
    `SELECT show_fake_badge_to_freelancers FROM fake_order_settings WHERE id = 1 LIMIT 1`,
  );
  const showBadge = Boolean(settingsRes.rows[0]?.show_fake_badge_to_freelancers);
  const orderCode = await generateUniqueOrderCode(client);
  const baselineApplicantsCount = randomInt(3, 12);
  const uid = Number(actorUserId || row.createdByUserId || 1);
  const subcategoryId =
    Number.isInteger(row.subcategoryId) && row.subcategoryId > 0 ? row.subcategoryId : null;
  const subSubcategoryId =
    Number.isInteger(row.subSubcategoryId) && row.subSubcategoryId > 0 ? row.subSubcategoryId : null;

  const { rows } = await client.query(
    `INSERT INTO fake_orders (
      order_code, title, description, title_en, description_en,
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
      fake_status, is_fake, fake_round_id, show_fake_badge, fake_expires_at,
      baseline_applicants_count,
      created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      '{}'::bigint[], '{}'::jsonb,
      $9, $10, $11, $12, $13,
      $14, $15, $16,
      NULL,
      FALSE,
      NULL, NULL, NULL,
      TRUE, TRUE,
      FALSE,
      FALSE, 'not_required',
      'published',
      $17, $18,
      NULL,
      'active', TRUE, NULL, $19, NULL,
      $20,
      NOW(), NOW()
    )
    RETURNING id`,
    [
      orderCode,
      row.title,
      row.description,
      row.titleEn,
      row.descriptionEn,
      row.categoryId,
      subcategoryId,
      subSubcategoryId,
      row.projectType,
      row.budget,
      row.currencyCode,
      row.durationValue,
      row.durationUnit,
      uid,
      "admin",
      row.sourceType,
      row.bidBudgetMin,
      row.bidBudgetMax,
      showBadge,
      baselineApplicantsCount,
    ],
  );
  const fakeOrderId = Number(rows[0].id);
  await client.query(
    `INSERT INTO fake_order_template_conversions (template_id, fake_order_id, conversion_batch_id)
     VALUES ($1, $2, $3)`,
    [built.templateId, fakeOrderId, String(conversionBatchId)],
  );
  scheduleFakeOrderTranslation(fakeOrderId, row.title, row.description);
  return { ok: true, templateId: built.templateId, fakeOrderId };
}

function startFakeOrdersAutomationScheduler() {
  const { isInProcessAutomationIntervalEnabled, getFakeOrdersTickMs } = require("../config/fakeOrdersAutomation");
  const tickMs = getFakeOrdersTickMs();
  if (!isInProcessAutomationIntervalEnabled()) {
    return { enabled: false, tickMs };
  }
  if (automationIntervalId != null) {
    return { enabled: true, tickMs, alreadyRunning: true };
  }

  const runTick = () => {
    runAutomationTick().catch((err) => {
      console.error("[fakeOrders] automation tick failed:", err?.message || err);
    });
  };

  setTimeout(runTick, 3_000);
  automationIntervalId = setInterval(runTick, tickMs);
  logAutomationEvent("interval_started", { tickMs, firstTickDelayMs: 3_000 });
  return { enabled: true, tickMs };
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
  ensureSeamlessTrainingRotation,
  ensureMinimumVisibleFakeOrders,
  getVisibleFakeOrdersCount,
  getTrainingPoolCoverage,
  recordMarketplaceVisibleFakeOrders,
  generateTrainingRoundInternal,
  resolveRoundOrderBounds,
  pickRoundTargetCount,
  loadEligibleFakeOrderPool,
  countEligibleFakeOrderPool,
  selectFakeOrdersFromPool,
  buildRotateTrainingRoundPlan,
  rotateTrainingRoundNow,
  hasVisibleItemsExpiringAfter,
  getOverlapThresholdMs,
  getHandoffLeadTimeMs,
  computeNextAutomationRunAt,
  needsPreemptiveOverlapWindow,
  resolveMinVisibleFromSettings,
  runAutomationTick,
  startFakeOrdersAutomationScheduler,
  getFakeOrdersAutomationHealth,
  getTrainingOrdersReadiness,
  listCurrentlyVisibleFakeOrders,
  queryCurrentlyVisibleFakeOrdersPaginated,
  buildTrainingOrdersReadinessPayload,
  syncLocalDevAutomationFlags,
  startTrainingRoundManual,
  getFakePoolOrderMapped,
  submitFakeTrainingBid,
  submitFakeTrainingClaim,
  mapRound,
  mapApplication,
  listTemplates,
  countFakeOrdersPool,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listRounds,
  cancelRound,
  listTrainingApplications,
  listApplicationsForFakeOrder,
  listFakeOrdersApplicantSummary,
  mapFakeOrderAdmin,
  listFakeOrders,
  getFakeOrderById,
  createFakeOrder,
  updateFakeOrder,
  hideFakeOrderFromCurrentRound,
  deleteFakeOrder,
  buildFakeOrderRowFromTemplateForPoolConversion,
  insertConvertedTemplateAsFakeOrder,
  resolveFakeOrderDbBudgetColumns,
  resolveFakeOrderBudgetFields,
  countOldVisibleOrderLeaks,
};
