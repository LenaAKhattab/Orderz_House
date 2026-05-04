export function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

/** Currency before amount (e.g. `JOD 44`) for clearer LTR price chips in RTL layouts */
export function formatMoneyJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `JOD ${formatMoney(value)}`;
}

/** Bidding range with currency first, e.g. `JOD 10 – 20` */
export function formatMoneyJodRange(min, max) {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  return `JOD ${formatMoney(min)} – ${formatMoney(max)}`;
}

export function formatJoDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

export function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}
