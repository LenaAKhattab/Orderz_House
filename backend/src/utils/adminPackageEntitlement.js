/**
 * Super Admin marketplace membership entitlement.
 * Approval does not start the countdown. Duration is stored on its own,
 * and start/expiry are written only when the first real order is recorded.
 */

const PRESET_DURATION_MONTHS = Object.freeze([1, 3, 4, 6, 12]);
const MIN_DURATION_MONTHS = 1;
const MAX_DURATION_MONTHS = 120;
const DRAWER_ENTITLEMENT_NOTE = "ADMIN_PACKAGE_ENTITLEMENT";

function addMonthsUtc(date, months) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

function resolveAdminEntitlementDuration(durationMonths) {
  const months = Number(durationMonths);
  if (!Number.isInteger(months) || months < MIN_DURATION_MONTHS || months > MAX_DURATION_MONTHS) {
    return { ok: false, code: "INVALID_DURATION" };
  }
  return {
    ok: true,
    months,
    preset: PRESET_DURATION_MONTHS.includes(months),
  };
}

/** @deprecated Window dates are no longer written before the first real order. */
function resolveAdminEntitlementWindow({ durationMonths } = {}) {
  const duration = resolveAdminEntitlementDuration(durationMonths);
  if (!duration.ok) return duration;
  return { ...duration, start: null, expiry: null };
}

function buildAdminEntitlementFields({ durationMonths } = {}) {
  const duration = resolveAdminEntitlementDuration(durationMonths);
  return {
    status: "assigned_not_started",
    source: "admin",
    paymentStatus: "not_required",
    activationStatus: "company_approved",
    hasFirstOrder: false,
    firstOrderDate: null,
    actualStartDate: null,
    expiryDate: null,
    entitlementDurationMonths: duration.ok ? duration.months : null,
  };
}

function inferWholeDurationMonths(start, expiry) {
  if (!start || !expiry) return null;
  const s = new Date(start);
  const e = new Date(expiry);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return null;
  for (let months = MIN_DURATION_MONTHS; months <= MAX_DURATION_MONTHS; months += 1) {
    const candidate = addMonthsUtc(s, months);
    if (Math.abs(candidate.getTime() - e.getTime()) <= 1000) return months;
  }
  return null;
}

function isDrawerAdminEntitlement(sub) {
  return String(sub?.notes || "").includes(DRAWER_ENTITLEMENT_NOTE);
}

/**
 * Decide what the existing first-real-order event should write.
 * Legacy Case 3 dated entitlements keep their window and only get stamped.
 * Drawer entitlements that were started too early are started from this event instead.
 */
function planFirstRealOrderStart(sub, activatedAt) {
  const at = activatedAt instanceof Date ? activatedAt : new Date(activatedAt);
  if (!sub || !Number.isFinite(at.getTime())) return { mode: "unchanged", reason: "invalid" };
  if (sub.has_first_order === true) return { mode: "unchanged", reason: "already_started" };

  const drawer = isDrawerAdminEntitlement(sub);
  const legacyDatedEntitlement =
    !drawer &&
    String(sub.status || "") === "active" &&
    sub.actual_start_date &&
    sub.expiry_date &&
    String(sub.source || "") === "admin" &&
    String(sub.payment_status || "") === "not_required";
  if (legacyDatedEntitlement) return { mode: "stamp_only", reason: "legacy_dated_entitlement" };

  const awaiting =
    String(sub.status || "") === "assigned_not_started" && !sub.actual_start_date;
  if (!awaiting && !drawer) return { mode: "unchanged", reason: "not_awaiting" };

  let months = Number(sub.entitlement_duration_months);
  if (!Number.isInteger(months) || months < MIN_DURATION_MONTHS || months > MAX_DURATION_MONTHS) {
    months = inferWholeDurationMonths(sub.actual_start_date, sub.expiry_date);
  }

  let expiry = null;
  let durationMonths = null;
  if (Number.isInteger(months) && months >= MIN_DURATION_MONTHS && months <= MAX_DURATION_MONTHS) {
    expiry = addMonthsUtc(at, months);
    durationMonths = months;
  } else {
    const days = Number(sub.plan_duration_days);
    if (Number.isFinite(days) && days > 0) {
      expiry = new Date(at.getTime() + days * 24 * 60 * 60 * 1000);
    }
  }
  if (!expiry || !(expiry.getTime() > at.getTime())) {
    return { mode: "unchanged", reason: "duration_unknown" };
  }

  return {
    mode: "start",
    has_first_order: true,
    first_order_date: at,
    actual_start_date: at,
    expiry_date: expiry,
    status: "active",
    entitlement_duration_months: durationMonths,
  };
}

/**
 * Safe correction for drawer rows whose countdown was started before any real order.
 * Legacy dated assignments are not this class.
 */
function classifyPrematureAdminEntitlement(row) {
  if (!row || !isDrawerAdminEntitlement(row)) {
    return { action: "skip", reason: "not_drawer_entitlement" };
  }
  if (row.legacyAssignment) return { action: "skip", reason: "legacy_assignment" };
  if (row.has_first_order === true || row.hasFirstOrder === true) {
    return { action: "skip", reason: "has_first_order" };
  }
  if (row.first_order_id || row.firstOrderId) return { action: "skip", reason: "first_order_id" };
  if (row.hasAcceptedRealOrder) return { action: "skip", reason: "real_order" };

  const start = row.actual_start_date || row.actualStartDate || null;
  const expiry = row.expiry_date || row.expiryDate || null;
  if (!start && !expiry) return { action: "skip", reason: "already_unstarted" };

  const stored = Number(row.entitlement_duration_months ?? row.entitlementDurationMonths);
  const months =
    Number.isInteger(stored) && stored >= MIN_DURATION_MONTHS && stored <= MAX_DURATION_MONTHS
      ? stored
      : inferWholeDurationMonths(start, expiry);
  if (!months) return { action: "skip", reason: "duration_unknown" };

  return {
    action: "correct",
    status: "assigned_not_started",
    has_first_order: false,
    first_order_date: null,
    actual_start_date: null,
    expiry_date: null,
    entitlement_duration_months: months,
    activation_status: "company_approved",
    payment_status: "not_required",
    source: "admin",
  };
}

module.exports = {
  PRESET_DURATION_MONTHS,
  MIN_DURATION_MONTHS,
  MAX_DURATION_MONTHS,
  DRAWER_ENTITLEMENT_NOTE,
  addMonthsUtc,
  resolveAdminEntitlementDuration,
  resolveAdminEntitlementWindow,
  buildAdminEntitlementFields,
  inferWholeDurationMonths,
  planFirstRealOrderStart,
  classifyPrematureAdminEntitlement,
};
