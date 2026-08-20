export const SILVER_CONVERSION_DEFAULT_ERROR_AR =
  "تعذر بدء ترقية Silver حالياً. حاول مرة أخرى أو افتح صفحة الباقات.";

export const SILVER_CONVERSION_SUCCESS_AR =
  "تم إرسال طلب تفعيل Silver. يبدأ الاشتراك بعد موافقة الشركة.";

export function formatSilverUpgradeButtonLabel(priceJod) {
  const raw = String(priceJod ?? "19").trim();
  const label = raw.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") || "19";
  return `الترقية إلى Silver – ${label} JOD`;
}

export function silverConversionErrorMessage(err) {
  const code = err?.response?.data?.code || err?.publicCode || err?.code || "";
  if (code === "FREELANCER_ACTIVATION_ENGINE_DISABLED") {
    return "تجربة التفعيل غير مفعّلة حالياً.";
  }
  if (code === "FREELANCER_SILVER_CONVERSION_BLOCKED") {
    return "لا يمكن بدء ترقية Silver في حالتك الحالية.";
  }
  if (code === "FREELANCER_SILVER_PLAN_NOT_FOUND") {
    return "باقة Silver غير متاحة حالياً. راجع صفحة الباقات.";
  }
  if (code === "ACTIVATION_REQUEST_ALREADY_PENDING") {
    return "لديك طلب تفعيل قيد المراجعة لهذه الباقة.";
  }
  if (code === "MARKETPLACE_PLAN_NOT_FOUND") {
    return "باقة Marketplace غير متاحة حالياً.";
  }
  const apiMessage = err?.response?.data?.message;
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage.trim();
  return SILVER_CONVERSION_DEFAULT_ERROR_AR;
}
