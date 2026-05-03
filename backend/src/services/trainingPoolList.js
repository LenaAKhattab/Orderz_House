const { pool } = require("../config/db");
const fakeOrdersService = require("./fakeOrdersService");

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
    pushBoth(
      (i) => `o.project_type = $${i}`,
      (i) => `fo.project_type = $${i}`,
      String(projectType),
    );
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

async function tryMergedPoolMeta({
  viewerUserId,
  viewerRole,
  page = 1,
  limit = 12,
  offset = null,
  status = null,
  projectType = null,
  categoryId = null,
  subSubCategoryIds = "",
  sort = "newest",
  q = "",
}) {
  try {
    await fakeOrdersService.expireStaleItems();
  } catch (e) {
    console.error("[trainingPoolList] expireStaleItems failed (non-fatal):", e?.message || e);
  }
  const canSee = await fakeOrdersService.poolViewerMaySeeFakeOrders({ userId: viewerUserId, role: viewerRole });
  const st = await fakeOrdersService.getSettings();
  if (!st || st.trainingOrdersEnabled !== true || !canSee) {
    return null;
  }

  const lim = Math.min(Math.max(Number(limit) || 12, 1), 200);
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
    `ri.visible_until >= NOW()`,
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
  const countSql = `
    WITH unioned AS (
      SELECT o.id AS sort_id, o.created_at AS sort_ts, 'real'::text AS src
      FROM orders o
      ${whereRSql}
      UNION ALL
      SELECT fo.id, ri.visible_from AS sort_ts, 'fake'::text AS src
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
      ${whereFSql}
    )
    SELECT COUNT(*)::int AS total FROM unioned
  `;

  const limPh = baseParams.length + 1;
  const offPh = baseParams.length + 2;
  const listSql = `
    WITH unioned AS (
      SELECT o.id AS sort_id, o.created_at AS sort_ts, 'real'::text AS src
      FROM orders o
      ${whereRSql}
      UNION ALL
      SELECT fo.id, ri.visible_from AS sort_ts, 'fake'::text AS src
      FROM fake_orders fo
      INNER JOIN fake_order_round_items ri ON ri.fake_order_id = fo.id
      INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id
      ${whereFSql}
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

  const total = Number(cRows[0]?.total || 0);
  return {
    total,
    idOrder: idRows.map((r) => ({ id: String(r.sort_id), source: r.src })),
    page: Math.floor(off / lim) + 1,
    limit: lim,
  };
}

module.exports = {
  tryMergedPoolMeta,
  parseIdCsv,
};
