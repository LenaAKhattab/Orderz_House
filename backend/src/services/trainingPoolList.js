const { pool } = require("../config/db");
const fakeOrdersService = require("./fakeOrdersService");

/** Guest-only merged-id cache. Never keyed by user. Clamp 10–60s. */
const PUBLIC_POOL_META_CACHE_MS = Math.min(
  Math.max(Number(process.env.PUBLIC_POOL_META_CACHE_MS) || 20_000, 10_000),
  60_000,
);

/** @type {Map<string, { value: object, expires: number }>} */
const guestMetaCache = new Map();
/** @type {Map<string, Promise<object | null>>} */
const guestMetaInflight = new Map();

function debugTrainingPoolLog(event, fields = {}) {
  if (String(process.env.TRAINING_POOL_DEBUG || "").trim() !== "1") return;
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ component: "training_pool_list", event, ...fields }));
}

function parseIdCsv(input) {
  const s = String(input || "").trim();
  if (!s) return [];
  return [...new Set(s.split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
}

function mergeCategoryIds(categoryId, categoryIds) {
  const ids = parseIdCsv(categoryIds);
  const single = Number(categoryId);
  if (Number.isInteger(single) && single > 0 && !ids.includes(single)) ids.push(single);
  return ids;
}

function pushCategoryOrSubSubFilter(vals, wr, wf, catIds, subSubIds) {
  if (!catIds.length && !subSubIds.length) return;
  const oParts = [];
  const fParts = [];
  if (catIds.length) {
    vals.push(catIds);
    const i = vals.length;
    oParts.push(`o.category_id = ANY($${i}::int[])`);
    fParts.push(`fo.category_id = ANY($${i}::int[])`);
  }
  if (subSubIds.length) {
    vals.push(subSubIds);
    const i = vals.length;
    oParts.push(`o.sub_subcategory_id = ANY($${i}::int[])`);
    fParts.push(`fo.sub_subcategory_id = ANY($${i}::int[])`);
  }
  wr.push(oParts.length === 1 ? oParts[0] : `(${oParts.join(" OR ")})`);
  wf.push(fParts.length === 1 ? fParts[0] : `(${fParts.join(" OR ")})`);
}

/** Shared filter values; parallel WHERE fragments for o.* and fo.* */
function buildDualFilters(status, projectType, categoryId, categoryIds, subSubIds, q) {
  const vals = [];
  const wr = [];
  const wf = [];
  const pushBoth = (sqlR, sqlF, v) => {
    vals.push(v);
    const i = vals.length;
    wr.push(sqlR(i));
    wf.push(sqlF(i));
  };
  if (status && ["published", "open_for_freelancers", "open_for_bids"].includes(String(status))) {
    pushBoth(
      (i) => `o.order_status = $${i}`,
      (i) => `fo.order_status = $${i}`,
      String(status),
    );
  }
  if (projectType) {
    const pt = String(projectType);
    if (pt === "bidding") {
      wr.push(
        `(o.project_type = 'bidding' AND o.bid_budget_min IS NOT NULL AND o.bid_budget_max IS NOT NULL AND o.bid_budget_min > 0 AND o.bid_budget_max >= o.bid_budget_min)`,
      );
      wf.push(
        `(fo.project_type = 'bidding' AND fo.bid_budget_min IS NOT NULL AND fo.bid_budget_max IS NOT NULL AND fo.bid_budget_min > 0 AND fo.bid_budget_max >= fo.bid_budget_min)`,
      );
    } else {
      pushBoth(
        (i) => `o.project_type = $${i}`,
        (i) => `fo.project_type = $${i}`,
        pt,
      );
    }
  }
  pushCategoryOrSubSubFilter(vals, wr, wf, mergeCategoryIds(categoryId, categoryIds), subSubIds);
  if (String(q || "").trim()) {
    const qq = `%${String(q).trim()}%`;
    vals.push(qq);
    const i = vals.length;
    wr.push(`(o.order_code ILIKE $${i} OR o.title ILIKE $${i})`);
    wf.push(`(fo.order_code ILIKE $${i} OR fo.title ILIKE $${i})`);
  }
  return { vals, wr, wf };
}

function isGuestViewer(viewerUserId) {
  return viewerUserId == null || !(Number(viewerUserId) > 0);
}

function guestMetaCacheKey(opts) {
  return JSON.stringify({
    page: Number(opts.page) || 1,
    limit: Number(opts.limit) || 8,
    offset: opts.offset == null ? null : Number(opts.offset),
    status: opts.status || null,
    projectType: opts.projectType || null,
    categoryId: opts.categoryId || null,
    categoryIds: String(opts.categoryIds || ""),
    subSubCategoryIds: String(opts.subSubCategoryIds || ""),
    sort: String(opts.sort || "newest"),
    q: String(opts.q || ""),
    includeRealOrders: opts.includeRealOrders !== false,
  });
}

function cloneMeta(meta) {
  if (!meta) return null;
  return {
    total: meta.total,
    idOrder: Array.isArray(meta.idOrder)
      ? meta.idOrder.map((r) => ({ id: String(r.id), source: r.source }))
      : [],
    page: meta.page,
    limit: meta.limit,
  };
}

function invalidatePublicGuestPoolMetaCache() {
  guestMetaCache.clear();
  guestMetaInflight.clear();
}

/**
 * Pool list triggers synchronous handoff recovery when the marketplace would otherwise be empty.
 * Audience/settings are applied in poolViewerMaySeeFakeOrders; SQL only lists currently visible rows.
 */
async function computeMergedPoolMeta({
  viewerUserId,
  viewerRole,
  page = 1,
  limit = 8,
  offset = null,
  status = null,
  projectType = null,
  categoryId = null,
  categoryIds = "",
  subSubCategoryIds = "",
  sort = "newest",
  q = "",
  includeRealOrders = true,
}) {
  const { perfStart } = require("../utils/perfLog");
  const canSeeTimer = perfStart("training_pool_list", "visibility_gate");
  const canSee = await fakeOrdersService.poolViewerMaySeeFakeOrders({ userId: viewerUserId, role: viewerRole });
  canSeeTimer.end({ canSee });
  debugTrainingPoolLog("visibility_gate", {
    viewerUserId: viewerUserId ?? null,
    viewerRole: viewerRole || null,
    canSee,
  });
  if (!canSee) {
    return null;
  }

  const lim = Math.min(Math.max(Number(limit) || 8, 1), 200);
  const off = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : Math.max(((Number(page) || 1) - 1) * lim, 0);
  const subSubIds = parseIdCsv(subSubCategoryIds);
  const { vals: fvals, wr, wf } = buildDualFilters(status, projectType, categoryId, categoryIds, subSubIds, q);

  const realExtra = [
    `o.is_published = TRUE`,
    `o.is_open_for_pool = TRUE`,
    `o.assigned_freelancer_id IS NULL`,
    `o.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`,
    `o.source_type IN ('admin_created','super_admin_created','client_created')`,
    `COALESCE(o.visibility_scope, 'public') = 'public'`,
    ...wr,
  ];
  // Visibility gate already applied. Do not re-query fake_order_settings per UNION row.
  const fakeExtra = [
    `fo.fake_status = 'active'`,
    `fo.is_published = TRUE`,
    `fo.is_open_for_pool = TRUE`,
    `fo.assigned_freelancer_id IS NULL`,
    `fo.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`,
    `ri.status = 'active'`,
    `ri.visible_from <= NOW()`,
    `ri.visible_until > NOW()`,
    `fr.status = 'active'`,
    ...wf,
  ];

  const whereRSql = `WHERE ${realExtra.join(" AND ")}`;
  const whereFSql = `WHERE ${fakeExtra.join(" AND ")}`;

  const orderBy =
    String(sort || "").toLowerCase() === "oldest"
      ? "sort_ts ASC, sort_id ASC"
      : "sort_ts DESC, sort_id DESC";

  const fakeSelect = `
      SELECT fo.id AS sort_id, ri.visible_from AS sort_ts, 'fake'::text AS src
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
      ${whereFSql}`;

  const realSelect = `
      SELECT o.id AS sort_id, o.created_at AS sort_ts, 'real'::text AS src
      FROM orders o
      ${whereRSql}`;

  const unionBody = includeRealOrders
    ? `${realSelect}\n      UNION ALL\n      ${fakeSelect}`
    : fakeSelect;

  const limPh = fvals.length + 1;
  const offPh = fvals.length + 2;
  const listSql = `
    WITH unioned AS (
      ${unionBody}
    )
    SELECT sort_id, src, COUNT(*) OVER()::int AS total
    FROM unioned
    ORDER BY ${orderBy}
    LIMIT $${limPh} OFFSET $${offPh}
  `;

  const listParams = [...fvals, lim, off];

  const sqlTimer = perfStart("training_pool_list", "union_page_query");
  const { rows: idRows } = await pool.query(listSql, listParams);
  sqlTimer.end({ rowCount: idRows.length, queryCount: 1 });

  let total = Number(idRows[0]?.total || 0);
  let idOrder = idRows.map((r) => ({ id: String(r.sort_id), source: r.src }));

  let fakeCount = idOrder.filter((r) => String(r.source) === "fake").length;

  if (fakeCount === 0) {
    debugTrainingPoolLog("no_fake_in_page", { note: "attempting_handoff_recovery" });
    try {
      const recoveryTimer = perfStart("training_pool_list", "handoff_recovery");
      const recovery = await fakeOrdersService.ensureMinimumVisibleFakeOrders({ reason: "pool_list_handoff" });
      recoveryTimer.end({
        generated: Boolean(recovery?.generated),
        visible: recovery?.visible ?? null,
      });
      if (recovery?.generated || (Number(recovery?.visible) || 0) > 0) {
        const retryTimer = perfStart("training_pool_list", "union_page_query_retry");
        const { rows: idRows2 } = await pool.query(listSql, listParams);
        retryTimer.end({ rowCount: idRows2.length, queryCount: 1 });
        total = Number(idRows2[0]?.total || 0);
        idOrder = idRows2.map((r) => ({ id: String(r.sort_id), source: r.src }));
        fakeCount = idOrder.filter((r) => String(r.source) === "fake").length;
        debugTrainingPoolLog("handoff_recovery_result", {
          generated: Boolean(recovery?.generated),
          visible: recovery?.visible ?? null,
          fakeInPage: fakeCount,
          total,
        });
      }
    } catch (e) {
      console.warn("[trainingPoolList] handoff recovery failed:", e?.message || e);
    }
  }

  if (fakeCount === 0) {
    debugTrainingPoolLog("no_fake_in_page", { note: "handoff_recovery_exhausted" });
  }

  const fakeIdsToMark = idOrder
    .filter((r) => String(r.source) === "fake")
    .map((r) => Number(r.id))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (fakeIdsToMark.length) {
    try {
      const markTimer = perfStart("training_pool_list", "record_marketplace_visible");
      await fakeOrdersService.recordMarketplaceVisibleFakeOrders(pool, { fakeOrderIds: fakeIdsToMark });
      markTimer.end({ count: fakeIdsToMark.length });
    } catch (e) {
      console.warn("[trainingPoolList] recordMarketplaceVisibleFakeOrders failed:", e?.message || e);
    }
  }

  debugTrainingPoolLog("merged_result", {
    total,
    fakeInPage: fakeCount,
    realInPage: idOrder.length - fakeCount,
    page: Math.floor(off / lim) + 1,
    limit: lim,
  });
  return {
    total,
    idOrder,
    page: Math.floor(off / lim) + 1,
    limit: lim,
  };
}

/** Pool list triggers synchronous handoff recovery when the marketplace would otherwise be empty. */
async function tryMergedPoolMeta(options) {
  const { perfStart } = require("../utils/perfLog");
  const totalTimer = perfStart("training_pool_list", "tryMergedPoolMeta");
  const guest = isGuestViewer(options?.viewerUserId);

  if (guest) {
    const key = guestMetaCacheKey(options || {});
    const hit = guestMetaCache.get(key);
    if (hit && hit.expires > Date.now()) {
      totalTimer.end({ cache: "hit", total: hit.value?.total ?? null });
      return cloneMeta(hit.value);
    }
    if (guestMetaInflight.has(key)) {
      const shared = await guestMetaInflight.get(key);
      totalTimer.end({ cache: "coalesce", total: shared?.total ?? null });
      return cloneMeta(shared);
    }
    const pending = computeMergedPoolMeta(options)
      .then((value) => {
        if (value) {
          guestMetaCache.set(key, { value: cloneMeta(value), expires: Date.now() + PUBLIC_POOL_META_CACHE_MS });
        }
        return value;
      })
      .finally(() => {
        guestMetaInflight.delete(key);
      });
    guestMetaInflight.set(key, pending);
    const value = await pending;
    totalTimer.end({
      cache: "miss",
      total: value?.total ?? null,
      fakeInPage: value?.idOrder?.filter((r) => r.source === "fake").length ?? 0,
    });
    return cloneMeta(value);
  }

  const value = await computeMergedPoolMeta(options);
  totalTimer.end({
    cache: "bypass_auth",
    total: value?.total ?? null,
    fakeInPage: value?.idOrder?.filter((r) => r.source === "fake").length ?? 0,
  });
  return value;
}

/** Training/fake orders only (no real `orders` branch) — for free-plan freelancers. */
async function tryFakeOnlyPoolMeta(options) {
  return tryMergedPoolMeta({ ...options, includeRealOrders: false });
}

module.exports = {
  tryMergedPoolMeta,
  tryFakeOnlyPoolMeta,
  parseIdCsv,
  invalidatePublicGuestPoolMetaCache,
  PUBLIC_POOL_META_CACHE_MS,
};
