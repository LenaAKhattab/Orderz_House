/** Dashboard period presets — persisted for Super Admin home. */

export const PERIOD_PRESETS = [
  { id: "today", label: "اليوم" },
  { id: "7d", label: "آخر 7 أيام" },
  { id: "30d", label: "آخر 30 يوماً" },
  { id: "90d", label: "آخر 90 يوماً" },
  { id: "this_month", label: "هذا الشهر" },
  { id: "last_month", label: "الشهر الماضي" },
  { id: "custom", label: "مخصص" },
];

const STORAGE_KEY = "sa-dashboard-period-v1";

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toIsoDate(d) {
  return d.toISOString().slice(0, 10);
}

function parseIso(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function loadStoredPeriod() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveStoredPeriod(period) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
  } catch {
    /* ignore */
  }
}

/**
 * Resolve UI preset to bounds + PostHog range (server supports today|7d|30d).
 */
export function resolveDashboardPeriod({ preset = "7d", customFrom = null, customTo = null } = {}) {
  const now = new Date();
  const todayEnd = endOfDay(now);
  let start;
  let end = todayEnd;
  let posthogRange = "7d";

  switch (preset) {
    case "today":
      start = startOfDay(now);
      posthogRange = "today";
      break;
    case "30d":
      start = startOfDay(new Date(now.getTime() - 29 * 86400000));
      posthogRange = "30d";
      break;
    case "90d":
      start = startOfDay(new Date(now.getTime() - 89 * 86400000));
      posthogRange = "30d";
      break;
    case "this_month":
      start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
      posthogRange = "30d";
      break;
    case "last_month": {
      const y = now.getFullYear();
      const m = now.getMonth();
      start = startOfDay(new Date(y, m - 1, 1));
      end = endOfDay(new Date(y, m, 0));
      posthogRange = "30d";
      break;
    }
    case "custom": {
      const from = parseIso(customFrom);
      const to = parseIso(customTo);
      if (from && to) {
        start = startOfDay(from);
        end = endOfDay(to);
        const spanDays = Math.ceil((end - start) / 86400000) + 1;
        posthogRange = spanDays <= 1 ? "today" : spanDays <= 7 ? "7d" : "30d";
      } else {
        start = startOfDay(new Date(now.getTime() - 6 * 86400000));
        posthogRange = "7d";
      }
      break;
    }
    case "7d":
    default:
      start = startOfDay(new Date(now.getTime() - 6 * 86400000));
      posthogRange = "7d";
      break;
  }

  const label = PERIOD_PRESETS.find((p) => p.id === preset)?.label || "آخر 7 أيام";
  const spanDays = Math.max(1, Math.ceil((end - start) / 86400000) + 1);

  return {
    preset,
    label,
    customFrom: customFrom || toIsoDate(start),
    customTo: customTo || toIsoDate(end),
    start,
    end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
    spanDays,
    posthogRange,
    posthogLimited: preset === "90d" || (preset === "custom" && spanDays > 30),
    cacheKey: `${preset}:${toIsoDate(start)}:${toIsoDate(end)}`,
  };
}

export function isDateInPeriod(isoDate, period) {
  if (!isoDate || !period?.start || !period?.end) return false;
  const d = parseIso(String(isoDate).slice(0, 10));
  if (!d) return false;
  return d >= period.start && d <= period.end;
}

export function filterRowsByPeriod(rows, dateKey, period) {
  if (!Array.isArray(rows) || !period) return [];
  return rows.filter((row) => {
    const raw = row[dateKey] ?? row.day ?? row.monthStart ?? row.month_start;
    return isDateInPeriod(raw, period);
  });
}
