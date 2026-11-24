/**
 * Smart Orders S5/S6 — pure UI helpers for the finance screens (no React, no imports: unit-tested with node --test).
 *
 * Money rule: the server sends decimal STRINGS. The UI renders them as-is next to their currency code and never
 * performs floating-point arithmetic on money. The only arithmetic here is on reward weights, done in integer
 * hundredths of a percent (basis points), mirroring the backend (10000 bp = 100.00 %).
 */

export const FINANCE_POLICY_KEYS = [
  "base_currency",
  "freelancer_compensation",
  "revenue_split",
  "vat",
  "payment_fees",
  "quality_checks",
  "employee_reward_pool",
];

/** Money-changing policies: activating one needs a management approval reference (backend: ≥ 5 chars). */
export const GATED_POLICY_KEYS = ["revenue_split", "vat", "quality_checks", "employee_reward_pool"];

/** Core policies that can never be disabled (backend: FINANCE_POLICY_LOCKED). */
export const LOCKED_ACTIVE_POLICY_KEYS = ["base_currency", "freelancer_compensation", "payment_fees"];

/** Editable config fields per policy. `fixed` fields are shown read-only (the server forces the value). */
export const POLICY_CONFIG_FIELDS = {
  base_currency: [{ name: "currency", fixed: "JOD" }],
  freelancer_compensation: [{ name: "mode", fixed: "agreed_terms" }],
  revenue_split: [{ name: "freelancerPercentOfNet", type: "percent" }],
  vat: [
    { name: "ratePercent", type: "percent" },
    { name: "pricesIncludeTax", fixed: true },
  ],
  payment_fees: [
    { name: "source", fixed: "actual_recorded" },
    { name: "deductFrom", fixed: "company_share" },
  ],
  quality_checks: [
    { name: "unitCost", type: "decimal" },
    { name: "currency", type: "currency" },
    { name: "maxPerOrder", type: "integer" },
  ],
  employee_reward_pool: [
    { name: "percentOfCompanyShare", type: "percent" },
    { name: "period", fixed: "monthly" },
  ],
};

export const APPROVAL_REFERENCE_MIN = 5;
export const REASON_MIN = 5;
export const FULL_WEIGHT_HUNDREDTHS = 10000;

export const COST_KINDS = ["payment_fee", "quality_check", "direct_expense"];
export const ADJUSTMENT_KINDS = ["refund", "dispute_loss", "customer_credit", "correction"];
export const EXCEPTION_RESOLUTIONS = ["refunded_in_stripe", "kept_with_authorization", "no_action_required", "other"];
export const EXCEPTION_KINDS = ["refund", "dispute", "duplicate_payment", "amount_mismatch", "superseded", "paid_inactive"];
export const SETTLEMENT_BLOCKERS = ["fx_snapshot_required", "order_not_completed", "open_payment_exceptions"];
export const FX_QUOTE_CURRENCIES = ["AED", "USD", "EUR", "SAR", "GBP"];
export const ITEM_PRICE_CURRENCIES = ["JOD", "AED"];
export const AMOUNT_ROWS = ["gross", "refunds", "tax", "fees", "qualityChecks", "qualityChecksExcluded", "directCosts", "net", "freelancer", "company"];
export const SETTLED_ROWS = ["gross", "refunds", "tax", "fees", "qualityChecks", "directCosts", "net", "freelancerCompensation", "companyShare"];
export const CUSTOMER_MODE_ROWS = ["existing_customer", "new_account", "guest", "client_marketplace", "internal", "whatsapp_channel"];

export function policyNeedsApproval(key, status) {
  return GATED_POLICY_KEYS.includes(key) && status === "active";
}

/**
 * Client-side mirror of the server rule for a new policy version.
 * @returns {string|null} error key under `smartOrders.finance.policies.errors`, or null when submittable.
 */
export function validatePolicyDraft(key, draft) {
  const status = draft?.status;
  if (status !== "active" && status !== "disabled") return "status";
  if (LOCKED_ACTIVE_POLICY_KEYS.includes(key) && status !== "active") return "locked";
  if (policyNeedsApproval(key, status) && String(draft?.approvalReference || "").trim().length < APPROVAL_REFERENCE_MIN) {
    return "approvalRequired";
  }
  for (const f of POLICY_CONFIG_FIELDS[key] || []) {
    if (f.fixed !== undefined) continue;
    const v = String(draft?.config?.[f.name] ?? "").trim();
    if (f.type === "percent" && (!/^\d{1,3}(\.\d{1,2})?$/.test(v) || hundredthsOf(v) > FULL_WEIGHT_HUNDREDTHS)) return "config";
    if (f.type === "decimal" && !/^\d{1,9}(\.\d{1,3})?$/.test(v)) return "config";
    if (f.type === "integer" && (!/^\d{1,2}$/.test(v) || Number(v) > 20)) return "config";
    if (f.type === "currency" && !/^[A-Za-z]{3}$/.test(v)) return "config";
  }
  return null;
}

/** Config payload: fixed fields take their forced value, typed fields are sent as trimmed strings. */
export function buildPolicyConfig(key, config = {}) {
  const out = {};
  for (const f of POLICY_CONFIG_FIELDS[key] || []) {
    if (f.fixed !== undefined) out[f.name] = f.fixed;
    else if (f.type === "integer") out[f.name] = Number(String(config[f.name] ?? "").trim());
    else if (f.type === "currency") out[f.name] = String(config[f.name] ?? "").trim().toUpperCase();
    else out[f.name] = String(config[f.name] ?? "").trim();
  }
  return out;
}

/**
 * Percent string → integer hundredths ("33.33" → 3333, "50" → 5000). Null when not a valid 0–999.99 value.
 * String-based: never goes through a float.
 */
export function hundredthsOf(value) {
  const s = String(value ?? "").trim().replace(/,/g, ".");
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
}

export function formatHundredths(n) {
  if (n == null || !Number.isInteger(n)) return "—";
  const neg = n < 0;
  const a = Math.abs(n);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/**
 * Reward weights check, in integer hundredths: total must be exactly 10000 (100.00 %), each weight > 0,
 * no duplicate person. 33.33 + 33.33 + 33.34 → valid; 50 + 49.99 → invalid.
 */
export function evaluateWeights(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let total = 0;
  let invalid = false;
  const seen = new Set();
  for (const r of list) {
    const h = hundredthsOf(r?.percent);
    if (h == null || h <= 0 || h > FULL_WEIGHT_HUNDREDTHS || !r?.userId || seen.has(String(r.userId))) invalid = true;
    if (r?.userId) seen.add(String(r.userId));
    if (h != null) total += h;
  }
  return {
    totalHundredths: total,
    totalLabel: formatHundredths(total),
    valid: list.length > 0 && !invalid && total === FULL_WEIGHT_HUNDREDTHS,
    invalidRow: invalid,
  };
}

/** Weights PUT payload (percent as a normalized 2-decimal string). */
export function buildWeightsPayload(rows) {
  return (rows || []).map((r) => ({ userId: String(r.userId), percent: formatHundredths(hundredthsOf(r.percent)) }));
}

/** Signed decimal amount check (string-only). `allowNegative` for corrections / reward adjustments. */
export function isValidAmount(value, { allowNegative = false } = {}) {
  const s = String(value ?? "").trim();
  const re = allowNegative ? /^-?\d{1,9}(\.\d{1,3})?$/ : /^\d{1,9}(\.\d{1,3})?$/;
  if (!re.test(s)) return false;
  return !/^-?0+(\.0+)?$/.test(s);
}

export function isValidFxRate(value) {
  const s = String(value ?? "").trim();
  return /^\d{1,13}(\.\d{1,10})?$/.test(s) && !/^0+(\.0+)?$/.test(s);
}

/**
 * Report money: three strictly separate blocks. Each block keeps one row per currency — nothing is ever summed
 * across currencies (or across blocks). Client-marketplace receipts stay their own JOD row inside "received".
 */
export function buildMoneyBlocks(money) {
  const rows = (arr) =>
    (Array.isArray(arr) ? arr : []).map((r) => ({ currency: r.currency, count: r.count ?? 0, amount: r.amount ?? "0.000" }));
  const cm = money?.receivedClientMarketplace;
  return {
    quoted: rows(money?.quotedUnpaid),
    received: {
      quotePayments: rows(money?.receivedQuotePayments),
      clientMarketplace: cm ? { currency: cm.currency || "JOD", count: cm.count ?? 0, amount: cm.amount ?? "0.000" } : null,
      unallocated: rows(money?.unallocatedReceipts),
    },
    settled: money?.settled ? { ...money.settled, baseCurrency: money.settled.baseCurrency || "JOD" } : null,
  };
}

/** Per-order panel state: unsupported (client marketplace rules) vs. a full breakdown. */
export function settlementViewState(settlement) {
  if (!settlement) return "loading";
  if (settlement.supported === false) return "unsupported";
  return "breakdown";
}

/** expectedVersion for closing: latest version, or 0 when nothing was closed yet. */
export function expectedSettlementVersion(settlement) {
  const v = settlement?.latestSettlement?.version;
  return Number.isInteger(v) ? v : 0;
}

/**
 * Finance capabilities from a permission check function. `has(permissionKey)` must already treat
 * Super Admin as allowed (userHasPermission does). Keys are passed in to keep this module import-free.
 */
export function financeCapabilities(has, keys) {
  const can = (k) => Boolean(k && typeof has === "function" && has(k));
  return {
    view: can(keys?.financeView),
    manage: can(keys?.financeManage),
    policy: can(keys?.financePolicy),
    rewards: can(keys?.rewardManage),
    payout: can(keys?.payoutApprove),
    orders: can(keys?.orders),
    createOrder: can(keys?.createOrder),
  };
}

/** Which page tabs a user sees (My rewards is for every admin). */
export function financeTabsFor(caps) {
  const tabs = [];
  if (caps?.view) tabs.push("report", "policies", "fx", "exceptions");
  if (caps?.rewards) tabs.push("rewards");
  tabs.push("mine");
  return tabs;
}

/** URL ?tab= value → internal tab id ("myRewards" is the notification deep link for "mine"). */
export const FINANCE_TAB_ALIASES = { myRewards: "mine", mine: "mine", report: "report", policies: "policies", fx: "fx", exceptions: "exceptions", rewards: "rewards" };

export function financeTabFromQuery(value) {
  const v = String(value || "").trim();
  return Object.prototype.hasOwnProperty.call(FINANCE_TAB_ALIASES, v) ? FINANCE_TAB_ALIASES[v] : "";
}

/** Default report range: the last 30 days, as yyyy-mm-dd strings (local calendar). */
export function defaultReportRange(now = new Date()) {
  const d = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const from = new Date(now.getTime());
  from.setDate(from.getDate() - 30);
  return { from: d(from), to: d(now) };
}

/** Inclusive date range → ISO instants for the API (to = end of the chosen day). */
export function reportRangeParams(from, to) {
  const f = from ? new Date(`${from}T00:00:00`) : null;
  const t = to ? new Date(`${to}T23:59:59.999`) : null;
  return {
    from: f && !Number.isNaN(f.getTime()) ? f.toISOString() : undefined,
    to: t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined,
  };
}

/** Current month as YYYY-MM (reward periods cannot be created for a future month). */
export function currentMonth(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
