const { getStripeOrNull } = require("./stripeCheckoutService");
const { pickCountryFromCheckoutSession, pickCountryFromPaymentIntent } = require("../utils/stripeBillingCountry");

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CONCURRENT = 8;

/** @type {Map<string, { code: string | null, expiresAt: number }>} */
const countryCache = new Map();

function cacheKey(sessionId, paymentIntentId) {
  if (sessionId) return `cs:${sessionId}`;
  if (paymentIntentId) return `pi:${paymentIntentId}`;
  return null;
}

function readCache(key) {
  const hit = countryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    countryCache.delete(key);
    return undefined;
  }
  return hit.code;
}

function writeCache(key, code) {
  countryCache.set(key, { code: code || null, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function mapPool(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index;
      index += 1;
      results[i] = await mapper(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Resolve billing country for one Stripe-backed subscription (Checkout Session / PaymentIntent).
 * @returns {Promise<string | null>} ISO country code
 */
async function resolveStripeSubscriptionCountryCode({ stripeSessionId, stripePaymentIntentId }) {
  const stripe = getStripeOrNull();
  if (!stripe) return null;

  const key = cacheKey(stripeSessionId, stripePaymentIntentId);
  if (!key) return null;

  const cached = readCache(key);
  if (cached !== undefined) return cached;

  let code = null;
  try {
    if (stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(String(stripeSessionId), {
        expand: ["payment_intent.latest_charge"],
      });
      const picked = pickCountryFromCheckoutSession(session);
      code = picked?.code || null;
      if (!code) {
        const piRef = session.payment_intent;
        const piId = typeof piRef === "string" ? piRef : piRef?.id;
        if (piId && typeof piRef !== "object") {
          const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
          code = pickCountryFromPaymentIntent(pi)?.code || null;
        }
      }
    } else if (stripePaymentIntentId) {
      const pi = await stripe.paymentIntents.retrieve(String(stripePaymentIntentId), {
        expand: ["latest_charge"],
      });
      code = pickCountryFromPaymentIntent(pi)?.code || null;
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[stripeSubscriptionCountry]", key, err?.message || err);
    }
    code = null;
  }

  writeCache(key, code);
  return code;
}

/**
 * Attach `paymentCountryCode` (ISO-2 or null) to subscription list items from Stripe billing data.
 * @param {Array<object>} subscriptions — mapped subscriptions
 */
async function enrichSubscriptionsWithPaymentCountry(subscriptions) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) return subscriptions;

  const stripe = getStripeOrNull();
  if (!stripe) {
    return subscriptions.map((s) => ({ ...s, paymentCountryCode: null }));
  }

  const stripeSubs = subscriptions.filter(
    (s) =>
      String(s?.source || "").toLowerCase() === "stripe" &&
      (s?.stripeSessionId || s?.stripePaymentIntentId),
  );

  const codeById = new Map();

  await mapPool(stripeSubs, MAX_CONCURRENT, async (sub) => {
    const code = await resolveStripeSubscriptionCountryCode({
      stripeSessionId: sub.stripeSessionId,
      stripePaymentIntentId: sub.stripePaymentIntentId,
    });
    codeById.set(sub.id, code);
  });

  return subscriptions.map((s) => ({
    ...s,
    paymentCountryCode:
      String(s?.source || "").toLowerCase() === "stripe" ? codeById.get(s.id) ?? null : null,
  }));
}

module.exports = {
  enrichSubscriptionsWithPaymentCountry,
  resolveStripeSubscriptionCountryCode,
};
