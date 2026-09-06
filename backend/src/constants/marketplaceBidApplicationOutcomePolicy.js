/**
 * Phase A10 — Bid outcome policy for application reservations.
 * Does not implement FEFO. Callers use existing reserve/release/consume services.
 *
 * Real opportunities: consume Bid on loss / withdraw / admin reject (no refund).
 * Simulation/training: refund on expiry/close (and on loss — do not permanently take training Bids).
 * No-selection close/cancel of real articles remains refundable (existing product).
 */

const OPPORTUNITY_KINDS = Object.freeze({
  REAL: "real",
  SIMULATION: "simulation",
  UNKNOWN: "unknown",
});

const BID_OUTCOME_REASONS = Object.freeze({
  LOST_SELECTION_CONSUMED: "lost_selection_consumed",
  WITHDRAWAL_CONSUMED: "withdrawal_consumed",
  REJECTION_CONSUMED: "rejection_consumed",
  SIMULATION_CLOSED_REFUND: "simulation_closed_refund",
  ARTICLE_CANCELLED_REFUND: "article_cancelled",
  ARTICLE_MINIMUM_NOT_MET_REFUND: "article_minimum_not_met",
  NO_SELECTION_REFUND: "article_no_selection_refund",
});

const FREELANCER_SIMULATION_REFUND_MESSAGE_AR =
  "تم إغلاق الطلب وإعادة رصيد التقديم.";
const FREELANCER_SIMULATION_REFUND_MESSAGE_EN =
  "The order was closed and your application credit was restored.";

function truthyFlag(value) {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

/**
 * Resolve opportunity kind from article/order-like objects.
 * Unknown → treated as real (conservative).
 */
function resolveOpportunityKind(opportunity = {}) {
  if (!opportunity || typeof opportunity !== "object") return OPPORTUNITY_KINDS.UNKNOWN;

  if (
    truthyFlag(opportunity.is_fake_or_training)
    || truthyFlag(opportunity.isFakeOrTraining)
    || truthyFlag(opportunity.is_simulation)
    || truthyFlag(opportunity.isSimulation)
    || truthyFlag(opportunity.is_training)
    || truthyFlag(opportunity.isTraining)
  ) {
    return OPPORTUNITY_KINDS.SIMULATION;
  }

  const source = String(
    opportunity.orderSource
      || opportunity.order_source
      || opportunity.opportunityKind
      || opportunity.kind
      || "",
  )
    .trim()
    .toLowerCase();

  if (
    source === "fake"
    || source === "training"
    || source === "simulation"
    || source === "simulated"
  ) {
    return OPPORTUNITY_KINDS.SIMULATION;
  }

  if (source === "real" || source === "article" || source === "marketplace_article") {
    return OPPORTUNITY_KINDS.REAL;
  }

  return OPPORTUNITY_KINDS.UNKNOWN;
}

function isSimulationOpportunity(opportunity) {
  return resolveOpportunityKind(opportunity) === OPPORTUNITY_KINDS.SIMULATION;
}

function isRealOpportunity(opportunity) {
  const kind = resolveOpportunityKind(opportunity);
  return kind === OPPORTUNITY_KINDS.REAL || kind === OPPORTUNITY_KINDS.UNKNOWN;
}

/** When another freelancer is selected: real → consume; simulation → refund. */
function shouldConsumeBidOnLoss(opportunity) {
  return isRealOpportunity(opportunity);
}

function shouldRefundBidOnLoss(opportunity) {
  return isSimulationOpportunity(opportunity);
}

/** Duration ended / training round closed without a lasting selection. */
function shouldRefundBidOnExpiredSimulation(opportunity) {
  return isSimulationOpportunity(opportunity);
}

/**
 * Article closed/cancelled with no winner selected (real no-selection path).
 * Always refundable for pending apps (existing B5 product).
 */
function shouldRefundBidOnNoSelectionClose(_opportunity) {
  return true;
}

/**
 * Decide release vs consume for a lifecycle event.
 * @param {'lost_selection'|'withdrawn'|'rejected'|'article_cancelled'|'minimum_not_met'|'simulation_expired'} event
 */
function decideBidReservationOutcome(opportunity, event) {
  const sim = isSimulationOpportunity(opportunity);
  const ev = String(event || "");

  if (ev === "simulation_expired" || (sim && (ev === "article_cancelled" || ev === "minimum_not_met"))) {
    return {
      action: "release",
      reason: BID_OUTCOME_REASONS.SIMULATION_CLOSED_REFUND,
      publicMessageAr: FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
      publicMessageEn: FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
    };
  }

  if (ev === "lost_selection") {
    if (sim) {
      return {
        action: "release",
        reason: BID_OUTCOME_REASONS.SIMULATION_CLOSED_REFUND,
        publicMessageAr: FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
        publicMessageEn: FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
      };
    }
    return {
      action: "consume",
      reason: BID_OUTCOME_REASONS.LOST_SELECTION_CONSUMED,
      publicMessageAr: null,
      publicMessageEn: null,
    };
  }

  if (ev === "withdrawn") {
    if (sim) {
      return {
        action: "release",
        reason: BID_OUTCOME_REASONS.SIMULATION_CLOSED_REFUND,
        publicMessageAr: FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
        publicMessageEn: FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
      };
    }
    return {
      action: "consume",
      reason: BID_OUTCOME_REASONS.WITHDRAWAL_CONSUMED,
      publicMessageAr: null,
      publicMessageEn: null,
    };
  }

  if (ev === "rejected") {
    if (sim) {
      return {
        action: "release",
        reason: BID_OUTCOME_REASONS.SIMULATION_CLOSED_REFUND,
        publicMessageAr: FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
        publicMessageEn: FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
      };
    }
    return {
      action: "consume",
      reason: BID_OUTCOME_REASONS.REJECTION_CONSUMED,
      publicMessageAr: null,
      publicMessageEn: null,
    };
  }

  if (ev === "article_cancelled" || ev === "minimum_not_met") {
    return {
      action: "release",
      reason:
        ev === "minimum_not_met"
          ? BID_OUTCOME_REASONS.ARTICLE_MINIMUM_NOT_MET_REFUND
          : BID_OUTCOME_REASONS.ARTICLE_CANCELLED_REFUND,
      publicMessageAr: null,
      publicMessageEn: null,
    };
  }

  // Conservative default: real consume-on-loss style
  return {
    action: "consume",
    reason: BID_OUTCOME_REASONS.LOST_SELECTION_CONSUMED,
    publicMessageAr: null,
    publicMessageEn: null,
  };
}

module.exports = {
  OPPORTUNITY_KINDS,
  BID_OUTCOME_REASONS,
  FREELANCER_SIMULATION_REFUND_MESSAGE_AR,
  FREELANCER_SIMULATION_REFUND_MESSAGE_EN,
  resolveOpportunityKind,
  isSimulationOpportunity,
  isRealOpportunity,
  shouldConsumeBidOnLoss,
  shouldRefundBidOnLoss,
  shouldRefundBidOnExpiredSimulation,
  shouldRefundBidOnNoSelectionClose,
  decideBidReservationOutcome,
};
