/**
 * Reconcile Stripe Checkout sessions with orders when multiple sessions exist per order
 * (new session overwrites orders.stripe_checkout_session_id; older paid tabs must still apply).
 */

const PURPOSE_FIXED = "client_fixed_order";
const PURPOSE_BID = "client_selected_bid";
const ROW_PURPOSE_FIXED = "fixed_order_creation";
const ROW_PURPOSE_BID = "selected_bid_payment";

/**
 * Webhook path: after locking `order`, verify this Checkout Session belongs to this order + flow.
 * Accepts session.id === orders.stripe_checkout_session_id, or a pending client_order_payments row,
 * or consistent Stripe metadata + client_reference_id (signed webhook payload).
 *
 * @param {*} client pg client (transaction)
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function assertCheckoutSessionAuthorizedForOrder(client, { order, session, orderId, purpose }) {
  const sid = String(session?.id || "");
  const meta = session?.metadata || {};
  const oid = Number(orderId);

  if (!sid) return { ok: false, reason: "missing_session_id" };
  if (!Number.isFinite(Number(meta.orderId)) || Number(meta.orderId) !== oid) {
    return { ok: false, reason: "metadata_order_mismatch" };
  }
  if (String(meta.purpose || "") !== purpose) return { ok: false, reason: "metadata_purpose_mismatch" };
  if (!Number.isFinite(Number(meta.clientUserId)) || Number(meta.clientUserId) !== Number(order.created_by_user_id)) {
    return { ok: false, reason: "metadata_client_mismatch" };
  }

  let bidId = null;
  if (purpose === PURPOSE_BID) {
    bidId = Number(meta.bidId != null ? meta.bidId : order.selected_bid_id);
    if (!Number.isInteger(bidId) || bidId < 1) return { ok: false, reason: "bid_id_invalid" };
    if (order.selected_bid_id != null && Number(order.selected_bid_id) !== bidId) {
      return { ok: false, reason: "selected_bid_mismatch" };
    }
    if (String(session.client_reference_id || "") !== `${oid}:${bidId}`) {
      return { ok: false, reason: "client_reference_mismatch" };
    }
  } else if (purpose === PURPOSE_FIXED) {
    if (String(session.client_reference_id || "") !== String(oid)) {
      return { ok: false, reason: "client_reference_mismatch" };
    }
  } else {
    return { ok: false, reason: "unknown_purpose" };
  }

  const stored = order.stripe_checkout_session_id ? String(order.stripe_checkout_session_id) : "";
  if (stored && stored === sid) return { ok: true };

  const rowPurpose = purpose === PURPOSE_FIXED ? ROW_PURPOSE_FIXED : ROW_PURPOSE_BID;
  const { rows } = await client.query(
    `SELECT id FROM client_order_payments
     WHERE order_id = $1
       AND provider_checkout_session_id = $2
       AND status = 'pending'
       AND purpose = $3
       AND ($4::bigint IS NULL OR bid_id IS NOT DISTINCT FROM $4::bigint)`,
    [oid, sid, rowPurpose, purpose === PURPOSE_BID ? bidId : null],
  );
  if (rows.length > 0) return { ok: true };

  // Metadata + client_reference match our Checkout creation — valid even if order row points at a newer session id.
  return { ok: true };
}

/**
 * Confirm endpoint: find a Checkout Session for this order that is paid and matches metadata.
 * Tries pending client_order_payments sessions (oldest first), then orders.stripe_checkout_session_id (latest pointer).
 *
 * @param {import('stripe').Stripe} stripe
 * @param {*} db pg client in transaction
 */
async function resolvePaidCheckoutSessionForClientOrder(stripe, db, { order, orderId, purpose, bidId }) {
  const oid = Number(orderId);
  const purposeRow = purpose === PURPOSE_FIXED ? ROW_PURPOSE_FIXED : ROW_PURPOSE_BID;
  const { rows: pendingRows } = await db.query(
    `SELECT provider_checkout_session_id
     FROM client_order_payments
     WHERE order_id = $1
       AND purpose = $2
       AND status = 'pending'
       AND ($3::bigint IS NULL OR bid_id IS NOT DISTINCT FROM $3::bigint)
       AND provider_checkout_session_id IS NOT NULL
     ORDER BY id ASC`,
    [oid, purposeRow, purpose === PURPOSE_BID ? bidId : null],
  );

  const fromPending = pendingRows.map((r) => r.provider_checkout_session_id).filter(Boolean);
  const ptr = order.stripe_checkout_session_id ? String(order.stripe_checkout_session_id) : null;
  const candidates = [...new Set([...fromPending, ptr].filter(Boolean))];

  const uid = Number(order.created_by_user_id);

  for (const csid of candidates) {
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(String(csid), { expand: ["payment_intent"] });
    } catch {
      continue;
    }
    const meta = session.metadata || {};
    if (String(meta.purpose || "") !== purpose) continue;
    if (Number(meta.orderId) !== oid) continue;
    if (Number(meta.clientUserId) !== uid) continue;
    if (purpose === PURPOSE_BID) {
      const mb = Number(meta.bidId);
      if (!Number.isInteger(Number(bidId)) || mb !== Number(bidId)) continue;
    }
    if (String(session.payment_status || "").toLowerCase() !== "paid") continue;

    const auth = await assertCheckoutSessionAuthorizedForOrder(db, {
      order,
      session,
      orderId: oid,
      purpose,
    });
    if (auth.ok) return session;
  }

  return null;
}

module.exports = {
  assertCheckoutSessionAuthorizedForOrder,
  resolvePaidCheckoutSessionForClientOrder,
  PURPOSE_FIXED,
  PURPOSE_BID,
  ROW_PURPOSE_FIXED,
  ROW_PURPOSE_BID,
};
