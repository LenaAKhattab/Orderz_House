const CONDITION_KEYS = Object.freeze([
  "freelancer_new",
  "profile_incomplete",
  "verification_incomplete",
  "training_incomplete",
  "activation_not_requested",
  "activation_pending_review",
  "activation_rejected",
  "activated",
  "mini_bid_intro",
  "article_mini_bid_intro",
]);

const ITEM_TYPES = Object.freeze(["informational", "required"]);
const PLACEMENTS = Object.freeze(["dashboard_banner", "getting_started", "modal", "inline_help"]);
const EVENT_TYPES = Object.freeze(["viewed", "dismissed", "clicked_cta", "completed", "skipped"]);

const BANNER_PRIORITY = Object.freeze([
  "freelancer_new",
  "profile_incomplete",
  "verification_incomplete",
  "training_incomplete",
  "activation_not_requested",
  "activation_pending_review",
  "activation_rejected",
]);

const STATUS_COPY = Object.freeze({
  freelancer_new: {
    label: "غير مفعّل لاستقبال الأعمال",
    compact: "ابدأ من مركز البداية لمعرفة الخطوات التالية.",
  },
  profile_incomplete: {
    label: "غير مفعّل لاستقبال الأعمال",
    compact: "بقيت لك خطوة لتفعيل حسابك: استكمال البيانات.",
  },
  verification_incomplete: {
    label: "غير مفعّل لاستقبال الأعمال",
    compact: "بقيت لك خطوة لتفعيل حسابك: تأكيد البريد الإلكتروني.",
  },
  training_incomplete: {
    label: "بانتظار إكمال التدريب",
    compact: "بقيت لك خطوة واحدة لتفعيل حسابك: إكمال التدريب.",
  },
  activation_not_requested: {
    label: "جاهز لطلب التفعيل",
    compact: "بقيت لك خطوة واحدة: طلب تفعيل الحساب.",
  },
  activation_pending_review: {
    label: "قيد المراجعة",
    compact: "طلب التفعيل قيد المراجعة.",
  },
  activation_rejected: {
    label: "غير مفعّل لاستقبال الأعمال",
    compact: "يلزم مراجعة الحساب وإعادة طلب التفعيل.",
  },
  activated: {
    label: "حسابك مفعّل",
    compact: null,
  },
});

module.exports = {
  CONDITION_KEYS,
  ITEM_TYPES,
  PLACEMENTS,
  EVENT_TYPES,
  BANNER_PRIORITY,
  STATUS_COPY,
};
