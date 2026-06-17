const { pool } = require("../config/db");
const fakeOrdersService = require("./fakeOrdersService");

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

/** Shared filter values; parallel WHERE fragments for o.* and fo.* */
function buildDualFilters(status, projectType, categoryId, subSubIds, q) {
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
  if (categoryId) {
    pushBoth(
      (i) => `o.category_id = $${i}`,
      (i) => `fo.category_id = $${i}`,
      Number(categoryId),
    );
  }
  if (subSubIds.length) {
    const arr = subSubIds;
    vals.push(arr);
    const i = vals.length;
    wr.push(`o.sub_subcategory_id = ANY($${i}::int[])`);
    wf.push(`fo.sub_subcategory_id = ANY($${i}::int[])`);
  }
  if (String(q || "").trim()) {
    const qq = `%${String(q).trim()}%`;
    vals.push(qq);
    const i = vals.length;
    wr.push(`(o.order_code ILIKE $${i} OR o.title ILIKE $${i})`);
    wf.push(`(fo.order_code ILIKE $${i} OR fo.title ILIKE $${i})`);
  }
  return { vals, wr, wf };
}

/** Pool list is read-only; fake maintenance runs via automation/cron (`runAutomationTick`). */
async function tryMergedPoolMeta({
  viewerUserId,
  viewerRole,
  page = 1,
  limit = 8,
  offset = null,
  status = null,
  projectType = null,
  categoryId = null,
  subSubCategoryIds = "",
  sort = "newest",
  q = "",
  includeRealOrders = true,
}) {
  const canSee = await fakeOrdersService.poolViewerMaySeeFakeOrders({ userId: viewerUserId, role: viewerRole });
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
  const { vals: fvals, wr, wf } = buildDualFilters(status, projectType, categoryId, subSubIds, q);

  const realExtra = [
    `o.is_published = TRUE`,
    `o.is_open_for_pool = TRUE`,
    `o.assigned_freelancer_id IS NULL`,
    `o.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`,
    `o.source_type IN ('admin_created','super_admin_created','client_created')`,
    ...wr,
  ];
  const uid = viewerUserId != null && Number(viewerUserId) > 0 ? Number(viewerUserId) : null;
  const uidIdx = fvals.length + 1;
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
    `
    (SELECT training_orders_enabled FROM fake_order_settings WHERE id = 1) = TRUE
    AND (
      (SELECT show_to_all_visitors FROM fake_order_settings WHERE id = 1) = TRUE
      OR (SELECT show_to_all_freelancers FROM fake_order_settings WHERE id = 1) = TRUE
      OR (
        $${uidIdx}::bigint IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM freelancer_subscriptions fs
          INNER JOIN fake_order_settings_plans sp ON sp.plan_id = fs.plan_id
          WHERE fs.freelancer_user_id = $${uidIdx}::bigint
            AND fs.is_current = TRUE
            AND fs.status IN ('active', 'assigned_not_started')
        )
      )
    )`,
  ];

  const whereRSql = `WHERE ${realExtra.join(" AND ")}`;
  const whereFSql = `WHERE ${fakeExtra.join(" AND ")}`;

  const orderBy =
    String(sort || "").toLowerCase() === "oldest"
      ? "sort_ts ASC, sort_id ASC"
      : "sort_ts DESC, sort_id DESC";

  const baseParams = [...fvals, uid];
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

  const countSql = `
    WITH unioned AS (
      ${unionBody}
    )
    SELECT COUNT(*)::int AS total FROM unioned
  `;

  const limPh = baseParams.length + 1;
  const offPh = baseParams.length + 2;
  const listSql = `
    WITH unioned AS (
      ${unionBody}
    )
    SELECT sort_id, src FROM unioned
    ORDER BY ${orderBy}
    LIMIT $${limPh} OFFSET $${offPh}
  `;

  const listParams = [...baseParams, lim, off];

  const [{ rows: cRows }, { rows: idRows }] = await Promise.all([
    pool.query(countSql, baseParams),
    pool.query(listSql, listParams),
  ]);

  let total = Number(cRows[0]?.total || 0);
  let idOrder = idRows.map((r) => ({ id: String(r.sort_id), source: r.src }));

  let fakeCount = idOrder.filter((r) => String(r.source) === "fake").length;

  const tryRecoverEmptyTrainingPool = async () => {
    try {
      const dbVisible = await fakeOrdersService.getVisibleFakeOrdersCount(pool);
      if (dbVisible > 0) {
        return;
      }
      const ensured = await fakeOrdersService.ensureMinimumVisibleFakeOrders({
        reason: "pool_list_empty",
        minVisible: 1,
      });
      if (ensured.generated) {
        const [{ rows: cRows2 }, { rows: idRows2 }] = await Promise.all([
          pool.query(countSql, baseParams),
          pool.query(listSql, listParams),
        ]);
        total = Number(cRows2[0]?.total || 0);
        idOrder = idRows2.map((r) => ({ id: String(r.sort_id), source: r.src }));
        fakeCount = idOrder.filter((r) => String(r.source) === "fake").length;
      } else if (ensured.code === "LOCK_BUSY") {
        debugTrainingPoolLog("ensure_min_visible_lock_busy", {
          retryable: Boolean(ensured.retryable),
          visible: ensured.visible,
        });
      } else if (ensured.code === "GENERATION_FAILED") {
        console.warn("[trainingPoolList] ensureMinimumVisibleFakeOrders failed:", ensured.error || ensured.code);
      }
    } catch (e) {
      console.warn("[trainingPoolList] ensureMinimumVisibleFakeOrders failed:", e?.message || e);
    }
  };

  if (fakeCount === 0) {
    await tryRecoverEmptyTrainingPool();
  }

  if (fakeCount === 0) {
    console.warn("[trainingPoolList] No active fake orders found in merged pool result.");
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

/** Training/fake orders only (no real `orders` branch) — for free-plan freelancers. */
async function tryFakeOnlyPoolMeta(options) {
  return tryMergedPoolMeta({ ...options, includeRealOrders: false });
}

module.exports = {
  tryMergedPoolMeta,
  tryFakeOnlyPoolMeta,
  parseIdCsv,
};
