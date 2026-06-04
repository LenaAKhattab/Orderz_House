import { arabicDurationUnit } from "./arTime";

const DATE_FMT = new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatLearningTimestamp(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return DATE_FMT.format(d);
}

/**
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatCompletionDuration(seconds) {
  const s = Math.floor(Number(seconds));
  if (!Number.isFinite(s) || s < 0) return "—";
  if (s === 0) return "أقل من دقيقة";

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const parts = [];

  if (days > 0) {
    parts.push(`${days} ${arabicDurationUnit(days, "days")}`);
    if (hours > 0) parts.push(`${hours} ${arabicDurationUnit(hours, "hours")}`);
  } else if (hours > 0) {
    parts.push(`${hours} ${arabicDurationUnit(hours, "hours")}`);
    if (minutes > 0) parts.push(`${minutes} ${arabicDurationUnit(minutes, "minutes")}`);
  } else if (minutes > 0) {
    parts.push(`${minutes} ${arabicDurationUnit(minutes, "minutes")}`);
  } else {
    return "أقل من دقيقة";
  }

  return parts.join(" و");
}

/** Human label for platform average (e.g. 7.4 days). */
export function formatAverageCompletionDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "—";
  const days = s / 86400;
  if (days >= 1) {
    const rounded = Math.round(days * 10) / 10;
    const whole = Math.floor(rounded);
    const frac = rounded - whole;
    if (frac < 0.05) return `${whole} ${arabicDurationUnit(whole, "days")}`;
    return `${rounded.toLocaleString("ar-JO-u-nu-latn", { maximumFractionDigits: 1 })} ${arabicDurationUnit(Math.round(rounded), "days")}`;
  }
  return formatCompletionDuration(s);
}
