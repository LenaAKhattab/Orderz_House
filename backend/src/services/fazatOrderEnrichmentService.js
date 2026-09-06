const { pool } = require("../config/db");
const { PARTNER_CODE } = require("../config/fazatIntegration");

/**
 * Attach partner white-label flags onto mapped orders for sanitizer consumption.
 * Fail-open (returns orders unchanged) if partner tables are missing.
 */
async function attachPartnerMetaToOrders(orders) {
  if (!Array.isArray(orders) || !orders.length) return orders;
  const ids = orders
    .map((o) => Number(o.id))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return orders;

  let rows = [];
  try {
    const result = await pool.query(
      `SELECT orderz_order_id, partner_code, external_assignment_id, external_order_id, metadata_json
       FROM partner_orders
       WHERE partner_code = $1 AND orderz_order_id = ANY($2::bigint[])`,
      [PARTNER_CODE, ids],
    );
    rows = result.rows;
  } catch {
    return orders;
  }

  if (!rows.length) return orders;
  const byId = new Map(rows.map((r) => [String(r.orderz_order_id), r]));
  return orders.map((o) => {
    const row = byId.get(String(o.id));
    if (!row) return o;
    return {
      ...o,
      isPartnerManaged: true,
      partnerMeta: {
        partnerCode: row.partner_code,
        // Kept only for sanitizer detection; stripped before freelancer response.
        externalAssignmentId: row.external_assignment_id,
        externalOrderId: row.external_order_id,
      },
    };
  });
}

async function attachPartnerMetaToOrder(order) {
  if (!order) return order;
  const [enriched] = await attachPartnerMetaToOrders([order]);
  return enriched;
}

module.exports = {
  attachPartnerMetaToOrders,
  attachPartnerMetaToOrder,
};
