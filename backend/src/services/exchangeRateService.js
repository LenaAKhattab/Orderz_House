/**
 * Display-only FX rates from JOD to supported currencies.
 * Never use these rates for Stripe, payouts, wallets, or order totals.
 */

const { BASE_CURRENCY, SUPPORTED_DISPLAY_CURRENCIES } = require("../constants/displayCurrencies");

const DEFAULT_CACHE_MS = 8 * 60 * 60 * 1000;
const MIN_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_MS = 12 * 60 * 60 * 1000;

/** @type {{ ratesUsd: Record<string, number> | null, fetchedAt: number, expiresAt: number }} */
let cache = { ratesUsd: null, fetchedAt: 0, expiresAt: 0 };
/** Last successful USD-based rates, kept after TTL for provider failure. */
let lastGoodRatesUsd = null;

function cacheTtlMs() {
  const hours = Number(process.env.EXCHANGE_RATE_CACHE_HOURS);
  if (Number.isFinite(hours) && hours > 0) {
    return Math.min(Math.max(hours * 60 * 60 * 1000, MIN_CACHE_MS), MAX_CACHE_MS);
  }
  const raw = Number(process.env.EXCHANGE_RATE_CACHE_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.max(raw, MIN_CACHE_MS), MAX_CACHE_MS);
  }
  return DEFAULT_CACHE_MS;
}

function providerConfig() {
  const provider = String(process.env.EXCHANGE_RATE_PROVIDER || "open-er-api").trim().toLowerCase();
  const key = String(process.env.EXCHANGE_RATE_API_KEY || "").trim();
  if (provider === "exchangerate-api" && key) {
    return {
      url: `https://v6.exchangerate-api.com/v6/${key}/latest/USD`,
      hasSecret: true,
    };
  }
  return {
    url: "https://open.er-api.com/v6/latest/USD",
    hasSecret: false,
  };
}

function parseUsdRates(payload) {
  const rates = payload?.rates;
  if (!rates || typeof rates !== "object") return null;
  const jod = Number(rates.JOD);
  if (!Number.isFinite(jod) || jod <= 0) return null;
  const out = {};
  for (const code of SUPPORTED_DISPLAY_CURRENCIES) {
    const n = Number(rates[code]);
    if (Number.isFinite(n) && n > 0) out[code] = n;
  }
  if (!out.USD) out.USD = 1;
  if (!out.JOD) return null;
  return out;
}

async function fetchUsdRates() {
  const { url, hasSecret } = providerConfig();
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error("exchange_rate_http");
  }
  const json = await res.json();
  const rates = parseUsdRates(json);
  if (!rates) throw new Error("exchange_rate_parse");
  void hasSecret;
  return rates;
}

function rateFromJod(targetCurrency, ratesUsd) {
  const code = String(targetCurrency || "").toUpperCase();
  if (code === BASE_CURRENCY) return 1;
  if (!ratesUsd) return null;
  const jodPerUsd = Number(ratesUsd.JOD);
  const targetPerUsd = Number(ratesUsd[code]);
  if (!Number.isFinite(jodPerUsd) || jodPerUsd <= 0) return null;
  if (!Number.isFinite(targetPerUsd) || targetPerUsd <= 0) return null;
  return targetPerUsd / jodPerUsd;
}

async function refreshRatesIfNeeded() {
  const now = Date.now();
  if (cache.ratesUsd && now < cache.expiresAt) {
    return cache.ratesUsd;
  }
  try {
    const ratesUsd = await fetchUsdRates();
    const ttl = cacheTtlMs();
    cache = { ratesUsd, fetchedAt: now, expiresAt: now + ttl };
    lastGoodRatesUsd = ratesUsd;
    return ratesUsd;
  } catch {
    if (lastGoodRatesUsd) {
      cache = { ratesUsd: lastGoodRatesUsd, fetchedAt: cache.fetchedAt || now, expiresAt: now + 5 * 60 * 1000 };
      return lastGoodRatesUsd;
    }
    return null;
  }
}

/**
 * @param {string} targetCurrency
 * @returns {Promise<number | null>}
 */
async function getRateFromJod(targetCurrency) {
  const code = String(targetCurrency || "").toUpperCase();
  if (code === BASE_CURRENCY) return 1;
  if (!SUPPORTED_DISPLAY_CURRENCIES.includes(code)) return null;
  const rates = await refreshRatesIfNeeded();
  return rateFromJod(code, rates);
}

function resetExchangeRateCacheForTests() {
  cache = { ratesUsd: null, fetchedAt: 0, expiresAt: 0 };
  lastGoodRatesUsd = null;
}

function seedExchangeRateCacheForTests(ratesUsd) {
  const now = Date.now();
  cache = { ratesUsd, fetchedAt: now, expiresAt: now + cacheTtlMs() };
  lastGoodRatesUsd = ratesUsd;
}

module.exports = {
  getRateFromJod,
  rateFromJod,
  parseUsdRates,
  resetExchangeRateCacheForTests,
  seedExchangeRateCacheForTests,
  cacheTtlMs,
};
