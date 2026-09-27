/**
 * Super Admin administrative package entitlement.
 * Distinct from unpaid "assigned, not started" and from Stripe purchases.
 */

const PRESET_DURATION_MONTHS = Object.freeze([1, 3, 4, 6, 12]);
const MIN_DURATION_MONTHS = 1;
const MAX_DURATION_MONTHS = 120;

function addMonthsUtc(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

function resolveAdminEntitlementWindow({ startsAt = null, durationMonths, now = new Date() } = {}) {
  const months = Number(durationMonths);
  if (!Number.isInteger(months) || months < MIN_DURATION_MONTHS || months > MAX_DURATION_MONTHS) {
    return { ok: false, code: "INVALID_DURATION" };
  }
  const start = startsAt != null && startsAt !== "" ? new Date(startsAt) : new Date(now);
  if (!Number.isFinite(start.getTime())) {
    return { ok: false, code: "INVALID_START" };
  }
  const expiry = addMonthsUtc(start, months);
  if (!(expiry.getTime() > start.getTime())) {
    return { ok: false, code: "INVALID_WINDOW" };
  }
  return {
    ok: true,
    months,
    preset: PRESET_DURATION_MONTHS.includes(months),
    start,
    expiry,
  };
}

function buildAdminEntitlementFields(window) {
  return {
    status: "active",
    source: "admin",
    paymentStatus: "not_required",
    activationStatus: "company_approved",
    hasFirstOrder: false,
    firstOrderDate: null,
    actualStartDate: window.start,
    expiryDate: window.expiry,
  };
}

module.exports = {
  PRESET_DURATION_MONTHS,
  MIN_DURATION_MONTHS,
  MAX_DURATION_MONTHS,
  addMonthsUtc,
  resolveAdminEntitlementWindow,
  buildAdminEntitlementFields,
};
