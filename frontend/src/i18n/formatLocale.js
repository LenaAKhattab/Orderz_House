const AMMAN = "Asia/Amman";

export function formatLocaleDate(value, locale = "ar") {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: AMMAN,
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: AMMAN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatLocaleDateTime(value, locale = "ar") {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  if (locale === "en") {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: AMMAN,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
  const datePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: AMMAN,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-GB", {
    timeZone: AMMAN,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return `${datePart} ${timePart}`;
}

export function durationMonthsText(t, months) {
  const count = Number(months);
  if (!Number.isInteger(count) || count < 1) return null;
  if (count === 1) return t("users.duration.one");
  if (count === 2) return t("users.duration.two");
  if (count >= 3 && count <= 10) return t("users.duration.few", { count });
  return t("users.duration.many", { count });
}
