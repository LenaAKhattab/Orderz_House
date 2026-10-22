/**
 * Referral commission hold processor (pending → available, bonus evaluation).
 * DB hold_until is the source of truth; the tick is idempotent, bounded (batch limit),
 * single-runner (pg advisory lock) and uses one pooled client that is always released.
 * The lazy promotion on dashboard/withdrawal reads stays as a second path.
 */
const { isNonProductionRemoteDatabase } = require("./fakeOrdersAutomation");

function parseBoolEnv(name, defaultValue = false) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === "") return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return defaultValue;
}

/**
 * Default on (production runs a single backend; the advisory lock makes extra instances no-ops).
 * Off by default for a local process pointed at a remote non-production database.
 */
function isReferralHoldProcessorEnabled() {
  const raw = process.env.REFERRAL_HOLD_PROCESSOR_ENABLED;
  if (raw !== undefined && String(raw).trim() !== "") {
    return parseBoolEnv("REFERRAL_HOLD_PROCESSOR_ENABLED", false);
  }
  return !isNonProductionRemoteDatabase();
}

function getReferralHoldProcessorTickMs() {
  return Math.max(60_000, Number(process.env.REFERRAL_HOLD_PROCESSOR_TICK_MS) || 15 * 60_000);
}

/** Secret for POST /api/internal/referrals/hold-tick (optional external cron). */
function getReferralHoldProcessorSecret() {
  const s = process.env.REFERRAL_HOLD_PROCESSOR_SECRET;
  if (!s) return null;
  const trimmed = String(s).trim();
  return trimmed.length >= 16 ? trimmed : null;
}

let intervalId = null;

function startReferralHoldProcessor() {
  const tickMs = getReferralHoldProcessorTickMs();
  if (!isReferralHoldProcessorEnabled()) return { enabled: false, tickMs };
  if (intervalId) return { enabled: true, alreadyRunning: true, tickMs };
  const { runReferralHoldProcessor } = require("../services/referralCommissionService");
  let running = false;
  const runTick = () => {
    if (running) return;
    running = true;
    runReferralHoldProcessor({ limit: 200 })
      .then((result) => {
        if (result.promoted > 0) {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify({ component: "referral_hold", event: "tick", promoted: result.promoted }));
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({ component: "referral_hold", event: "tick_failed", message: err?.message }));
      })
      .finally(() => {
        running = false;
      });
  };
  // First run well after startup so boot/readiness never competes with it.
  const first = setTimeout(runTick, 2 * 60_000);
  first.unref?.();
  intervalId = setInterval(runTick, tickMs);
  intervalId.unref?.();
  return { enabled: true, tickMs };
}

module.exports = {
  isReferralHoldProcessorEnabled,
  getReferralHoldProcessorTickMs,
  getReferralHoldProcessorSecret,
  startReferralHoldProcessor,
};
