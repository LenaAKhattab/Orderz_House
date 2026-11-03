/**
 * Best-effort first-party checkout funnel telemetry (web).
 * Never blocks payment; failures are swallowed.
 */
import { TOKEN_KEY } from "../services/httpClient.js";
import { getApiBaseUrl } from "../config/apiBase.js";
import { readStoredLocale } from "../i18n/localePreference.js";

const CLIENT_EVENTS = new Set([
  "checkout_redirect_started",
  "checkout_cancel_returned",
  "checkout_success_returned",
]);

/**
 * @param {{
 *   eventType: string,
 *   stripeCheckoutSessionId: string,
 *   paymentFlow?: string,
 *   channel?: 'web'|'mobile',
 *   locale?: string|null,
 * }} payload
 */
export function recordCheckoutFunnelEvent(payload) {
  try {
    const eventType = String(payload?.eventType || "").trim();
    const sessionId = String(payload?.stripeCheckoutSessionId || "").trim();
    if (!CLIENT_EVENTS.has(eventType) || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return;

    const token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!token) return;

    const body = JSON.stringify({
      eventType,
      stripeCheckoutSessionId: sessionId,
      paymentFlow: payload.paymentFlow || undefined,
      channel: payload.channel === "mobile" ? "mobile" : "web",
      locale: payload.locale || readStoredLocale() || undefined,
    });

    const base = String(getApiBaseUrl() || "/api").replace(/\/$/, "");
    const url = `${base}/payments/checkout-funnel-events`;
    void fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Accept-Language": readStoredLocale() || "ar",
      },
      body,
      keepalive: true,
      credentials: "include",
    }).catch(() => {});
  } catch {
    /* never throw */
  }
}

/** Extract cs_* from a Stripe Checkout URL when sessionId was not returned separately. */
export function sessionIdFromCheckoutUrl(url) {
  try {
    const u = new URL(String(url || ""));
    const parts = u.pathname.split("/").filter(Boolean);
    const cs = parts.find((p) => /^cs_[A-Za-z0-9_]+$/.test(p));
    return cs || null;
  } catch {
    return null;
  }
}

/**
 * Record redirect_started then navigate. Telemetry is best-effort and must not delay handoff.
 */
export function redirectToStripeCheckout({ checkoutUrl, sessionId, paymentFlow, locale }) {
  const sid = sessionId || sessionIdFromCheckoutUrl(checkoutUrl);
  if (sid) {
    recordCheckoutFunnelEvent({
      eventType: "checkout_redirect_started",
      stripeCheckoutSessionId: sid,
      paymentFlow,
      channel: "web",
      locale,
    });
  }
  window.location.href = checkoutUrl;
}
