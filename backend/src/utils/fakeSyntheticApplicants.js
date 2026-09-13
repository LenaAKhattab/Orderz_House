/**
 * Deterministic synthetic applicant growth for marketplace fake orders only.
 * DISPLAY-ONLY — never insert fake_order_applications; never use for admin lists,
 * assignment, payments, bid eligibility, round closure, or other business rules.
 *
 * displayedApplicantsCount = realApplicantsCount + syntheticApplicantsCount
 */

const CURVE_TYPES = Object.freeze(["easeInOut", "easeOut", "easeIn", "smoothstep"]);

/**
 * Weighted final-target buckets (sum = 1.0).
 * Some orders intentionally stay at 0–2 for realism.
 */
const TARGET_BUCKETS = Object.freeze([
  { weight: 0.1, min: 0, max: 2 },
  { weight: 0.25, min: 3, max: 5 },
  { weight: 0.35, min: 6, max: 9 },
  { weight: 0.2, min: 10, max: 14 },
  { weight: 0.08, min: 15, max: 18 },
  { weight: 0.02, min: 19, max: 22 },
]);

/** @param {string|number} fakeOrderId */
function hashSeed(fakeOrderId) {
  const s = String(fakeOrderId ?? "");
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** @returns {number} in [0, 1) */
function unitFloat(seed, salt) {
  let x = (seed ^ Math.imul(salt >>> 0, 0x9e3779b9)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

function clamp01(t) {
  if (!Number.isFinite(t)) return 0;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

function easeInOutCubic(t) {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeInCubic(t) {
  const x = clamp01(t);
  return x * x * x;
}

function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function applyCurve(curveType, t) {
  switch (curveType) {
    case "easeOut":
      return easeOutCubic(t);
    case "easeIn":
      return easeInCubic(t);
    case "smoothstep":
      return smoothstep(t);
    case "easeInOut":
    default:
      return easeInOutCubic(t);
  }
}

function toDate(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Pick base target from weighted buckets (deterministic).
 * @param {number} seed
 * @returns {number}
 */
function pickWeightedTarget(seed) {
  const roll = unitFloat(seed, 1);
  let acc = 0;
  for (const bucket of TARGET_BUCKETS) {
    acc += bucket.weight;
    if (roll < acc) {
      const span = bucket.max - bucket.min + 1;
      return bucket.min + Math.floor(unitFloat(seed, 21) * span);
    }
  }
  const last = TARGET_BUCKETS[TARGET_BUCKETS.length - 1];
  return last.max;
}

/**
 * Short-lived fake orders usually land lower targets.
 * @param {number} target
 * @param {number} lifetimeMinutes
 * @param {number} seed
 */
function scaleTargetForLifetime(target, lifetimeMinutes, seed) {
  const t = Math.max(0, Math.floor(Number(target) || 0));
  if (t === 0) return 0;

  let scale = 1;
  if (lifetimeMinutes <= 90) {
    scale = 0.2 + unitFloat(seed, 31) * 0.25; // ~0.20–0.45
  } else if (lifetimeMinutes <= 180) {
    scale = 0.35 + unitFloat(seed, 31) * 0.3; // ~0.35–0.65
  } else if (lifetimeMinutes <= 360) {
    scale = 0.55 + unitFloat(seed, 31) * 0.25; // ~0.55–0.80
  } else if (lifetimeMinutes <= 720) {
    scale = 0.75 + unitFloat(seed, 31) * 0.2; // ~0.75–0.95
  }

  return Math.max(0, Math.min(t, Math.round(t * scale)));
}

/**
 * Stable per-order growth profile (target, delay, ramp, curve).
 * @param {{ fakeOrderId: string|number, publishedAt?: Date|string|null, visibleUntil?: Date|string|null }} args
 */
function resolveSyntheticApplicantsProfile({ fakeOrderId, publishedAt = null, visibleUntil = null } = {}) {
  const seed = hashSeed(fakeOrderId);
  const published = toDate(publishedAt);
  const until = toDate(visibleUntil);

  let lifetimeMs = 12 * 60 * 60 * 1000; // default 12h when visibility window unknown
  if (published && until && until.getTime() > published.getTime()) {
    lifetimeMs = until.getTime() - published.getTime();
  }

  const lifetimeMinutes = Math.max(20, lifetimeMs / 60000);
  const baseTarget = pickWeightedTarget(seed);
  const target = scaleTargetForLifetime(baseTarget, lifetimeMinutes, seed);

  // Quiet period after publish — never show applicants at visible_from.
  let delayFrac = 0.02 + unitFloat(seed, 2) * 0.16; // ~2%–18%
  let rampFrac = 0.4 + unitFloat(seed, 3) * 0.4; // ~40%–80%

  // Occasional slow / late bloomers.
  const lateGrowth = unitFloat(seed, 5) < 0.18;
  if (lateGrowth) {
    delayFrac = Math.min(0.48, delayFrac + 0.12 + unitFloat(seed, 6) * 0.18);
    rampFrac = Math.min(0.95, rampFrac + 0.05 + unitFloat(seed, 7) * 0.1);
  }

  const maxDelay = Math.max(2, Math.floor(lifetimeMinutes * 0.5));
  const delayMinutes = Math.min(
    Math.max(2, Math.round(lifetimeMinutes * delayFrac)),
    maxDelay,
  );

  const remainingAfterDelay = Math.max(5, Math.floor(lifetimeMinutes - delayMinutes));
  const rampMinutes = Math.min(
    Math.max(8, Math.round(lifetimeMinutes * rampFrac)),
    remainingAfterDelay,
  );

  const curveType = CURVE_TYPES[Math.floor(unitFloat(seed, 4) * CURVE_TYPES.length)] || "easeInOut";

  return {
    fakeOrderId: String(fakeOrderId),
    syntheticApplicantsTarget: target,
    syntheticApplicantsBaseTarget: baseTarget,
    syntheticApplicantsDelayMinutes: delayMinutes,
    syntheticApplicantsRampMinutes: rampMinutes,
    syntheticApplicantsCurveType: curveType,
    syntheticApplicantsLateGrowth: lateGrowth,
    lifetimeMinutes: Math.round(lifetimeMinutes),
  };
}

/**
 * @param {{
 *   fakeOrderId: string|number,
 *   publishedAt?: Date|string|null,
 *   visibleUntil?: Date|string|null,
 *   now?: Date|string|null,
 * }} args
 * @returns {number}
 */
function computeSyntheticApplicantsCount({
  fakeOrderId,
  publishedAt = null,
  visibleUntil = null,
  now = null,
} = {}) {
  if (fakeOrderId == null || fakeOrderId === "") return 0;

  const published = toDate(publishedAt);
  if (!published) return 0;

  const at = toDate(now) || new Date();
  const until = toDate(visibleUntil);
  const profile = resolveSyntheticApplicantsProfile({ fakeOrderId, publishedAt: published, visibleUntil: until });

  const target = profile.syntheticApplicantsTarget;
  if (target <= 0) return 0;

  const delayMs = profile.syntheticApplicantsDelayMinutes * 60000;
  const rampMs = Math.max(1, profile.syntheticApplicantsRampMinutes * 60000);

  // Freeze at end of visibility window (or after full ramp).
  let effectiveNow = at.getTime();
  if (until && until.getTime() <= published.getTime() + delayMs) {
    return 0;
  }
  if (until && effectiveNow > until.getTime()) {
    effectiveNow = until.getTime();
  }

  const elapsedMs = effectiveNow - published.getTime();
  if (elapsedMs < delayMs) return 0;

  const growthElapsed = elapsedMs - delayMs;
  if (growthElapsed >= rampMs) return target;

  const t = growthElapsed / rampMs;
  const curved = applyCurve(profile.syntheticApplicantsCurveType, t);
  return Math.max(0, Math.min(target, Math.floor(target * curved)));
}

/**
 * Marketplace display helper only — do not feed into business decisions.
 * @param {{
 *   realApplicantsCount?: number,
 *   fakeOrderId: string|number,
 *   publishedAt?: Date|string|null,
 *   visibleUntil?: Date|string|null,
 *   now?: Date|string|null,
 * }} args
 */
function computeDisplayedFakeApplicantsCount(args = {}) {
  const real = Math.max(0, Math.floor(Number(args.realApplicantsCount) || 0));
  const synthetic = computeSyntheticApplicantsCount(args);
  return {
    realApplicantsCount: real,
    syntheticApplicantsCount: synthetic,
    displayedApplicantsCount: real + synthetic,
  };
}

module.exports = {
  CURVE_TYPES,
  TARGET_BUCKETS,
  hashSeed,
  pickWeightedTarget,
  scaleTargetForLifetime,
  resolveSyntheticApplicantsProfile,
  computeSyntheticApplicantsCount,
  computeDisplayedFakeApplicantsCount,
};
