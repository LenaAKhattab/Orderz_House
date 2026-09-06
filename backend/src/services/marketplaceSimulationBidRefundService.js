/**
 * Phase A10 — Simulation/training opportunity Bid refund hooks.
 *
 * Training pool `fake_orders` applications do NOT currently reserve Bid Credits.
 * This module documents the close/expiry hook and refunds any Bid reservations
 * that may exist for simulation-marked marketplace articles.
 *
 * Freelancer-facing messages never say "fake" / "simulation".
 */

const { pool } = require("../config/db");
const {
  decideBidReservationOutcome,
  FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
  FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
  isSimulationOpportunity,
} = require("../constants/marketplaceBidApplicationOutcomePolicy");
const reservationService = require("./marketplaceBidCreditReservationService");

/**
 * Refund active Bid reservations linked to pending applications on a
 * simulation/training marketplace article after close/expiry.
 * Safe no-op when schema/apps/reservations are missing.
 */
async function refundPendingSimulationArticleReservations(
  articleId,
  { client = null, actorUserId = null, now = new Date() } = {},
) {
  const aid = Number(articleId);
  if (!Number.isInteger(aid) || aid < 1) {
    return { refunded: 0, skipped: true, reason: "invalid_article" };
  }
  const runner = client || pool;
  let article;
  try {
    const { rows } = await runner.query(`SELECT * FROM marketplace_articles WHERE id = $1`, [aid]);
    article = rows[0] || null;
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") {
      return { refunded: 0, skipped: true, reason: "schema_missing" };
    }
    throw err;
  }
  if (!article || !isSimulationOpportunity(article)) {
    return { refunded: 0, skipped: true, reason: "not_simulation" };
  }

  const decision = decideBidReservationOutcome(article, "simulation_expired");
  let apps = [];
  try {
    const { rows } = await runner.query(
      `SELECT * FROM marketplace_article_applications
        WHERE article_id = $1 AND status = 'pending'
        FOR UPDATE`,
      [aid],
    );
    apps = rows;
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") {
      return { refunded: 0, skipped: true, reason: "apps_schema_missing" };
    }
    throw err;
  }

  let refunded = 0;
  for (const app of apps) {
    const reservationId = app.bid_reservation_id != null ? Number(app.bid_reservation_id) : null;
    if (!reservationId) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await reservationService.releaseBidCreditReservation({
        client: runner,
        reservationId,
        reason: decision.reason,
        now,
        restoreDailyLimit: true,
      });
      refunded += 1;
    } catch (err) {
      if (
        err?.publicCode === "BID_RESERVATION_NOT_FOUND"
        || err?.publicCode === "ARTICLE_RESERVATION_NOT_ACTIVE"
        || err?.publicCode === "BID_RESERVATION_ALREADY_RELEASED"
        || err?.publicCode === "BID_RESERVATION_ALREADY_CONSUMED"
      ) {
        continue;
      }
      throw err;
    }
  }

  return {
    refunded,
    skipped: false,
    reason: decision.reason,
    publicMessageAr: FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
    publicMessageEn: FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
    actorUserId: actorUserId != null ? Number(actorUserId) : null,
  };
}

/**
 * Training pool expiry hook.
 * Fake order applications currently do not use Bid Credit reservations —
 * recorded for audit/policy completeness.
 */
async function onTrainingPoolOpportunityExpired({
  fakeOrderId = null,
  client = null,
} = {}) {
  const fid = fakeOrderId != null ? Number(fakeOrderId) : null;
  // Intentionally no Bid release: fake_order_applications have no bid_reservation_id.
  return {
    refunded: 0,
    skipped: true,
    reason: "training_pool_no_bid_reservations",
    fakeOrderId: Number.isInteger(fid) && fid > 0 ? fid : null,
    note:
      "Training/simulation pool orders do not reserve Bid Credits today. "
      + "Policy hook retained for future Bid wiring.",
    clientPresent: Boolean(client),
  };
}

module.exports = {
  refundPendingSimulationArticleReservations,
  onTrainingPoolOpportunityExpired,
};
