export function arabicDurationUnit(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return unit === "days" ? "يوم" : unit === "hours" ? "ساعة" : "دقيقة";

  if (unit === "days") {
    if (n === 1) return "يوم";
    if (n === 2) return "يومين";
    if (n >= 3 && n <= 10) return "أيام";
    return "يوم";
  }
  if (unit === "hours") {
    if (n === 1) return "ساعة";
    if (n === 2) return "ساعتين";
    if (n >= 3 && n <= 10) return "ساعات";
    return "ساعة";
  }
  if (unit === "minutes") {
    if (n === 1) return "دقيقة";
    if (n === 2) return "دقيقتين";
    if (n >= 3 && n <= 10) return "دقائق";
    return "دقيقة";
  }
  return String(unit || "");
}

