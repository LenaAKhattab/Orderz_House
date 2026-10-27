/**
 * Card statement descriptor for OrderzHouse one-time Stripe Checkout payments.
 *
 * The Stripe account is shared with other company products, so its static descriptor/prefix is not OrderzHouse
 * ("FAZ3AT"). A per-payment suffix makes the charge recognizable without touching the shared account:
 * card statements show "<prefix>* ORDERZHOUSE" (FAZ3AT* ORDERZHOUSE = 19 of the 22 allowed characters).
 * Stripe rules: ≤ 22 characters, at least one letter, none of < > \ ' " *.
 *
 * Only for `mode: "payment"` sessions (payment_intent_data). Subscription-mode Checkout has no
 * payment_intent_data and is intentionally left unchanged.
 */
const ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX = "ORDERZHOUSE";

/** @param {object} paymentIntentData */
function withOrderzHouseStatementDescriptor(paymentIntentData = {}) {
  return { ...paymentIntentData, statement_descriptor_suffix: ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX };
}

module.exports = { ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX, withOrderzHouseStatementDescriptor };
