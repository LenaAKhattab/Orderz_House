const { pool } = require("../config/db");
const { isAllowedCleanBudgetRange, normalizeToCleanBudgetRange } = require("../utils/fakeBudgetRanges");

async function hydrateMergedPoolOrders(idOrder, mapListOrderRow, { freelancerUserId }) {
  if (!idOrder.length) return [];
  const realIds = idOrder.filter((x) => x.source === "real").map((x) => Number(x.id));
  const fakeIds = idOrder.filter((x) => x.source === "fake").map((x) => Number(x.id));
  const uid = freelancerUserId && Number(freelancerUserId) > 0 ? Number(freelancerUserId) : null;

  const realSql = uid
    ? `
      SELECT
        o.*,
        c.slug AS category_slug,
        c.name AS category_name,
        ss.slug AS sub_subcategory_slug,
        ss.name AS sub_subcategory_name,
        ss.subcategory_id AS sub_subcategory_parent_id,
        COALESCE(ofc.files_count, 0)::int AS files_count,
        COALESCE(ac.applicants_count, 0)::int AS applicants_count,
        oc.id AS my_claim_id,
        oc.status AS my_claim_status,
        mb.id AS my_bid_id,
        mb.amount AS my_bid_amount,
        mb.status AS my_bid_status
      FROM orders o
      LEFT JOIN categories c ON c.id = o.category_id
      LEFT JOIN sub_subcategories ss ON ss.id = o.sub_subcategory_id
      LEFT JOIN (
        SELECT order_id, COUNT(*)::int AS files_count
        FROM order_files
        GROUP BY order_id
      ) ofc ON ofc.order_id = o.id
      LEFT JOIN (
        SELECT z.order_id, COUNT(DISTINCT z.freelancer_user_id)::int AS applicants_count
        FROM (
          SELECT order_id, freelancer_user_id
          FROM order_claims
          WHERE freelancer_user_id IS NOT NULL
          UNION ALL
          SELECT order_id, freelancer_user_id
          FROM order_freelancer_bids
          WHERE freelancer_user_id IS NOT NULL
        ) z
        GROUP BY z.order_id
      ) ac ON ac.order_id = o.id
      LEFT JOIN order_claims oc ON oc.order_id = o.id AND oc.freelancer_user_id = $2
      LEFT JOIN order_freelancer_bids mb ON mb.order_id = o.id AND mb.freelancer_user_id = $2
      WHERE o.id = ANY($1::bigint[])
    `
    : `
      SELECT
        o.*,
        c.slug AS category_slug,
        c.name AS category_name,
        ss.slug AS sub_subcategory_slug,
        ss.name AS sub_subcategory_name,
        ss.subcategory_id AS sub_subcategory_parent_id,
        COALESCE(ofc.files_count, 0)::int AS files_count,
        COALESCE(ac.applicants_count, 0)::int AS applicants_count
      FROM orders o
      LEFT JOIN categories c ON c.id = o.category_id
      LEFT JOIN sub_subcategories ss ON ss.id = o.sub_subcategory_id
      LEFT JOIN (
        SELECT order_id, COUNT(*)::int AS files_count
        FROM order_files
        GROUP BY order_id
      ) ofc ON ofc.order_id = o.id
      LEFT JOIN (
        SELECT z.order_id, COUNT(DISTINCT z.freelancer_user_id)::int AS applicants_count
        FROM (
          SELECT order_id, freelancer_user_id
          FROM order_claims
          WHERE freelancer_user_id IS NOT NULL
          UNION ALL
          SELECT order_id, freelancer_user_id
          FROM order_freelancer_bids
          WHERE freelancer_user_id IS NOT NULL
        ) z
        GROUP BY z.order_id
      ) ac ON ac.order_id = o.id
      WHERE o.id = ANY($1::bigint[])
    `;

  const fakeSql = uid
    ? `
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
      LEFT JOIN fake_order_applications fa ON fa.fake_order_id = fo.id AND fa.freelancer_user_id = $2
        AND fa.round_id = ri.round_id
      WHERE fo.id = ANY($1::bigint[])
    `
    : `
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
      WHERE fo.id = ANY($1::bigint[])
    `;

  const [realRes, fakeRes] = await Promise.all([
    realIds.length ? pool.query(realSql, uid ? [realIds, uid] : [realIds]) : { rows: [] },
    fakeIds.length ? pool.query(fakeSql, uid ? [fakeIds, uid] : [fakeIds]) : { rows: [] },
  ]);

  const realBy = new Map(realRes.rows.map((r) => [String(r.id), r]));
  const fakeBy = new Map(fakeRes.rows.map((r) => [String(r.id), r]));

  const out = [];
  for (const { id, source } of idOrder) {
    const row = source === "real" ? realBy.get(id) : fakeBy.get(id);
    if (!row) continue;
    const mapped = mapListOrderRow(row);
    if (!mapped) continue;
    if (source === "fake") {
      mapped.orderSource = "fake";
      if (mapped.projectType === "bidding") {
        const min = Number(mapped.bidBudgetMin);
        const max = Number(mapped.bidBudgetMax);
        if (!isAllowedCleanBudgetRange(min, max)) {
          const fixed = normalizeToCleanBudgetRange(min, max, "technical");
          mapped.bidBudgetMin = fixed.min;
          mapped.bidBudgetMax = fixed.max;
          // eslint-disable-next-line no-console
          console.warn("[hydrateMergedPool] corrected invalid fake bid range in response", {
            fakeOrderId: String(row.id),
            from: [min, max],
            to: [fixed.min, fixed.max],
          });
        }
      } else if (mapped.budget != null) {
        mapped.budget = Math.round(Number(mapped.budget));
      }
      if (row.show_fake_badge) mapped.trainingLabel = "طلب تجريبي";
      if (row.pool_listed_at != null) {
        mapped.createdAt = row.pool_listed_at;
        mapped.poolListedAt = row.pool_listed_at;
      }
    } else {
      mapped.orderSource = "real";
    }
    out.push(mapped);
  }
  return out;
}

module.exports = { hydrateMergedPoolOrders };
