/**
 * Safe Arabic messages for responses when internal / third-party details must not leak.
 */
const { GENERIC_5XX_AR } = require("./apiErrors");

module.exports = {
  /** @deprecated use GENERIC_5XX_AR from apiErrors — kept for backward imports */
  GENERIC_SERVER_AR: GENERIC_5XX_AR,
  GENERIC_5XX_AR,
  SERVICE_UNAVAILABLE_AR: "الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً.",
  BAD_GATEWAY_AR: "تعذر إكمال الطلب مع مزود الخدمة. يرجى المحاولة لاحقاً.",
  CODE_INTERNAL_ERROR: "INTERNAL_ERROR",
  CODE_SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
};
