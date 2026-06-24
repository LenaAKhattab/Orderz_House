/**
 * Applicant count for a visible-order table row — never falls back to order id.
 * @param {{ applicantsCount?: number|string|null }} [row]
 */
export function resolveRowApplicantsCount(row) {
  const n = Number(row?.applicantsCount);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Applicant total from modal/API payload — uses nullish coalescing, not truthy fallback.
 * @param {{ applicantsTotal?: number|string|null, applicants?: unknown[], applications?: unknown[] }} [payload]
 */
export function resolveApplicantsTotal(payload) {
  if (payload?.applicantsTotal != null) {
    const n = Number(payload.applicantsTotal);
    return Number.isFinite(n) ? n : 0;
  }
  const apps = payload?.applicants ?? payload?.applications;
  return Array.isArray(apps) ? apps.length : 0;
}
