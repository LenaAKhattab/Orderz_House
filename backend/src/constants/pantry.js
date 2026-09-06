/** بيت المونة — status helpers + create validation (pure, no DB). */

const PANTRY_REQUEST_STATUSES = Object.freeze([
  "draft",
  "open_for_bids",
  "assigned",
  "in_progress",
  "submitted",
  "revision_requested",
  "approved",
  "archived",
]);

const PANTRY_BID_STATUSES = Object.freeze(["pending", "accepted", "rejected", "withdrawn"]);

const PANTRY_DELIVERY_STATUSES = Object.freeze([
  "submitted",
  "revision_requested",
  "approved",
  "archived",
]);

const PANTRY_PRICING_TYPES = Object.freeze(["fixed", "bidding"]);

const PANTRY_DURATION_UNITS = Object.freeze(["days", "hours", "weeks"]);

const FREELANCER_VISIBLE_REQUEST_STATUSES = Object.freeze(["open_for_bids"]);

/** Safe fields for PATCH /admin/pantry/requests/:id (status excluded). */
const PANTRY_REQUEST_PATCHABLE_FIELDS = Object.freeze([
  "title",
  "description",
  "categoryId",
  "subcategoryId",
  "subSubcategoryId",
  "pricingType",
  "budgetMin",
  "budgetMax",
  "fixedBudget",
  "deliveryDays",
  "durationUnit",
  "deadline",
  "skills",
  "requirements",
  "attachments",
  "internalNotes",
  "applicationBidCost",
  "targetApplicantCount",
  "eligibleTierCodes",
  "applicationDeadlineAt",
]);

const PANTRY_ELIGIBLE_TIER_CODES = Object.freeze(["starter", "silver", "pro", "elite"]);

function canFreelancerListRequest(status) {
  return FREELANCER_VISIBLE_REQUEST_STATUSES.includes(String(status || ""));
}

function canFreelancerBid(status) {
  return String(status || "") === "open_for_bids";
}

function canFreelancerDeliver(request, freelancerId) {
  if (!request || !freelancerId) return false;
  const assigned = Number(request.assignedFreelancerId || request.assigned_freelancer_id);
  if (assigned !== Number(freelancerId)) return false;
  const status = String(request.status || "");
  return ["assigned", "in_progress", "revision_requested"].includes(status);
}

function canAdminAcceptBid(requestStatus, bidStatus) {
  return String(requestStatus) === "open_for_bids" && String(bidStatus) === "pending";
}

/** Approve only a freshly submitted delivery (not revision_requested / approved / archived). */
function canAdminApproveDelivery(deliveryStatus) {
  return String(deliveryStatus || "") === "submitted";
}

/** Request revision only on submitted deliveries. */
function canAdminRequestRevision(deliveryStatus) {
  return String(deliveryStatus || "") === "submitted";
}

/** Archive only stock that was already approved. */
function canAdminArchiveDelivery(deliveryStatus) {
  return String(deliveryStatus || "") === "approved";
}

function deliveryMatchesAssignedFreelancer(delivery, request) {
  if (!delivery || !request) return false;
  const deliveryFreelancer = Number(delivery.freelancerId || delivery.freelancer_id);
  const assigned = Number(request.assignedFreelancerId || request.assigned_freelancer_id);
  if (!Number.isFinite(deliveryFreelancer) || !Number.isFinite(assigned)) return false;
  return deliveryFreelancer === assigned;
}

const PANTRY_SCHEMA_HINT =
  "Apply backend/sql/migrations/153_pantry_house.sql on a local/dev database only. Do not apply blindly on production without approval.";

function mapPantryDbError(err) {
  if (!err) return err;
  const code = String(err.code || "");
  const msg = String(err.message || "");

  // NOT NULL — never mislabel as missing schema (Postgres messages mention relation "pantry_...").
  if (code === "23502") {
    const mapped = new Error("حقل مطلوب ناقص عند إنشاء/تحديث طلب بيت المونة.");
    mapped.statusCode = 400;
    mapped.code = "PANTRY_REQUIRED_FIELD_MISSING";
    mapped.publicCode = "PANTRY_REQUIRED_FIELD_MISSING";
    mapped.exposeToClient = true;
    mapped.logDetails = { pgCode: code, detail: err.detail || null, column: err.column || null };
    return mapped;
  }

  // Missing table only: PostgreSQL undefined_table.
  const missingRelation =
    code === "42P01" ||
    (/undefined_table/i.test(msg) && /pantry_/i.test(msg)) ||
    (/^relation ["']pantry_[^"']+["'] does not exist$/i.test(msg.trim()));
  if (!missingRelation) return err;

  // eslint-disable-next-line no-console
  console.error(`[pantry] schema missing — pantry_* tables not found. ${PANTRY_SCHEMA_HINT}`);
  const mapped = new Error(
    "جداول بيت المونة غير مهيأة بعد. يلزم تطبيق migration 153_pantry_house على قاعدة تطوير محلية آمنة.",
  );
  mapped.statusCode = 503;
  mapped.code = "PANTRY_SCHEMA_MISSING";
  mapped.publicCode = "PANTRY_SCHEMA_MISSING";
  mapped.exposeToClient = true;
  mapped.logDetails = { hint: PANTRY_SCHEMA_HINT, pgCode: code || null };
  return mapped;
}

/** Same actor id pattern as other admin controllers (`req.auth.userId`). */
function actorId(req) {
  const raw =
    req?.auth?.userId ??
    req?.user?.id ??
    req?.user?.userId ??
    req?.user?.sub ??
    null;
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  return null;
}

function requireActorId(req) {
  const id = actorId(req);
  if (!id) {
    const err = new Error("يجب تسجيل الدخول لإنشاء أو إدارة طلبات بيت المونة.");
    err.statusCode = 401;
    err.code = "UNAUTHORIZED";
    err.publicCode = "UNAUTHORIZED";
    err.exposeToClient = true;
    throw err;
  }
  return id;
}

function normalizeSkills(raw) {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => {
      const fileUrl = String(f?.fileUrl || f?.url || "").trim();
      const fileName = String(f?.fileName || f?.name || "file").trim() || "file";
      if (!fileUrl) return null;
      if (!/^https?:\/\//i.test(fileUrl)) return null;
      return { fileUrl, fileName };
    })
    .filter(Boolean)
    .slice(0, 10);
}

/**
 * Validate create/update-like payload for pantry requests (client-order parity, no payment).
 * @returns {{ ok: true, value: object } | { ok: false, message: string, fieldErrors: object }}
 */
function validatePantryRequestPayload(payload = {}, { partial = false } = {}) {
  const fieldErrors = {};
  const src = payload && typeof payload === "object" ? payload : {};

  const title = src.title !== undefined ? String(src.title || "").trim() : undefined;
  const description =
    src.description !== undefined ? String(src.description || "").trim() : undefined;

  if (!partial || src.title !== undefined) {
    if (!title || title.length < 2) {
      fieldErrors.title = "عنوان المشروع مطلوب (حرفان على الأقل).";
    }
  }
  if (!partial || src.description !== undefined) {
    if (description == null || description.length < 10) {
      fieldErrors.description = "وصف المشروع مطلوب (10 أحرف على الأقل).";
    }
  }

  let categoryId = null;
  if (!partial || src.categoryId !== undefined) {
    const rawCat = src.categoryId;
    if (rawCat == null || String(rawCat).trim() === "") {
      fieldErrors.categoryId = "يرجى اختيار التصنيف.";
    } else {
      categoryId = Number(rawCat);
      if (!Number.isFinite(categoryId) || categoryId <= 0) {
        fieldErrors.categoryId = "تصنيف غير صالح.";
      }
    }
  }

  const pricingTypeRaw =
    src.pricingType !== undefined
      ? String(src.pricingType || "").trim()
      : src.projectType !== undefined
        ? String(src.projectType || "").trim()
        : partial
          ? undefined
          : "fixed";
  let pricingType = pricingTypeRaw;
  if (pricingType !== undefined) {
    if (!PANTRY_PRICING_TYPES.includes(pricingType)) {
      fieldErrors.pricingType = "نوع الطلب يجب أن يكون ميزانية ثابتة أو استقبال عروض.";
      pricingType = "fixed";
    }
  }

  let fixedBudget = null;
  let budgetMin = null;
  let budgetMax = null;
  const effectivePricing = pricingType || "fixed";

  if (!partial || src.fixedBudget !== undefined || src.budget !== undefined || src.pricingType !== undefined || src.projectType !== undefined) {
    if (effectivePricing === "fixed") {
      const budgetRaw = src.fixedBudget ?? src.budget;
      const n = Number(budgetRaw);
      if (!(Number.isFinite(n) && n > 0)) {
        fieldErrors.fixedBudget = "يرجى إدخال ميزانية ثابتة صحيحة أكبر من 0.";
      } else {
        fixedBudget = n;
      }
    } else {
      const minRaw = src.budgetMin ?? src.bidBudgetMin;
      const maxRaw = src.budgetMax ?? src.bidBudgetMax;
      if (minRaw != null && String(minRaw).trim() !== "") {
        const n = Number(minRaw);
        if (!(Number.isFinite(n) && n >= 0)) fieldErrors.budgetMin = "الحد الأدنى للميزانية غير صالح.";
        else budgetMin = n;
      }
      if (maxRaw != null && String(maxRaw).trim() !== "") {
        const n = Number(maxRaw);
        if (!(Number.isFinite(n) && n >= 0)) fieldErrors.budgetMax = "الحد الأعلى للميزانية غير صالح.";
        else budgetMax = n;
      }
      if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
        fieldErrors.budgetMax = "الحد الأعلى يجب أن يكون أكبر من أو يساوي الحد الأدنى.";
      }
    }
  }

  let deliveryDays = null;
  if (!partial || src.deliveryDays !== undefined || src.durationValue !== undefined) {
    const daysRaw = src.deliveryDays ?? src.durationValue;
    if (daysRaw != null && String(daysRaw).trim() !== "") {
      const n = Number(daysRaw);
      if (!(Number.isInteger(n) && n > 0)) {
        fieldErrors.deliveryDays = "مدة التنفيذ يجب أن تكون عدداً صحيحاً أكبر من 0.";
      } else {
        deliveryDays = n;
      }
    } else if (!partial && effectivePricing === "fixed") {
      fieldErrors.deliveryDays = "مدة التنفيذ مطلوبة لطلبات الميزانية الثابتة.";
    }
  }

  let durationUnit = "days";
  if (src.durationUnit !== undefined) {
    const u = String(src.durationUnit || "days").trim();
    if (!PANTRY_DURATION_UNITS.includes(u)) {
      fieldErrors.durationUnit = "وحدة المدة غير صالحة.";
    } else {
      durationUnit = u;
    }
  }

  const skills = normalizeSkills(src.skills ?? src.preferredSkills);
  const attachments = normalizeAttachments(src.attachments);
  const requirements =
    src.requirements !== undefined ? String(src.requirements || "").trim() || null : undefined;
  const internalNotes =
    src.internalNotes !== undefined ? String(src.internalNotes || "").trim() || null : undefined;

  let subcategoryId = null;
  if (src.subcategoryId != null && String(src.subcategoryId).trim() !== "") {
    const n = Number(src.subcategoryId);
    if (Number.isFinite(n) && n > 0) subcategoryId = n;
  }
  let subSubcategoryId = null;
  if (src.subSubcategoryId != null && String(src.subSubcategoryId).trim() !== "") {
    const n = Number(src.subSubcategoryId);
    if (Number.isFinite(n) && n > 0) subSubcategoryId = n;
  }

  let deadline = null;
  if (src.deadline !== undefined) {
    if (src.deadline) {
      const d = new Date(src.deadline);
      if (Number.isNaN(d.getTime())) fieldErrors.deadline = "تاريخ التسليم غير صالح.";
      else deadline = d.toISOString();
    }
  }

  let applicationBidCost = null;
  if (src.applicationBidCost != null && String(src.applicationBidCost).trim() !== "") {
    const n = Number(src.applicationBidCost);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      fieldErrors.applicationBidCost = "تكلفة التقديم بالعرض يجب أن تكون عدداً صحيحاً من 1 إلى 1000.";
    } else {
      applicationBidCost = n;
    }
  }

  let targetApplicantCount = null;
  if (src.targetApplicantCount != null && String(src.targetApplicantCount).trim() !== "") {
    const n = Number(src.targetApplicantCount);
    if (!Number.isInteger(n) || n < 1 || n > 10000) {
      fieldErrors.targetApplicantCount = "العدد المستهدف للمتقدمين غير صالح.";
    } else {
      targetApplicantCount = n;
    }
  }

  let requiredBidCount = null;
  if (src.requiredBidCount != null && String(src.requiredBidCount).trim() !== "") {
    const n = Number(src.requiredBidCount);
    if (!Number.isInteger(n) || n < 1) {
      fieldErrors.requiredBidCount = "حد المناقصات الأدنى غير صالح.";
    } else {
      requiredBidCount = n;
    }
  }

  let eligibleTierCodes = null;
  if (src.eligibleTierCodes != null && src.eligibleTierCodes !== "") {
    const raw = Array.isArray(src.eligibleTierCodes)
      ? src.eligibleTierCodes
      : String(src.eligibleTierCodes)
          .split(",")
          .map((s) => s.trim());
    const cleaned = raw
      .map((t) => String(t || "").toLowerCase())
      .filter((t) => PANTRY_ELIGIBLE_TIER_CODES.includes(t));
    if (raw.filter(Boolean).length && !cleaned.length) {
      fieldErrors.eligibleTierCodes = "الباقات المؤهلة غير صالحة.";
    } else if (cleaned.length) {
      eligibleTierCodes = cleaned;
    }
  }

  let applicationDeadlineAt = null;
  if (src.applicationDeadlineAt) {
    const d = new Date(src.applicationDeadlineAt);
    if (Number.isNaN(d.getTime())) {
      fieldErrors.applicationDeadlineAt = "موعد إغلاق التقديم غير صالح.";
    } else {
      applicationDeadlineAt = d.toISOString();
    }
  }

  if (Object.keys(fieldErrors).length) {
    return {
      ok: false,
      message: Object.values(fieldErrors)[0] || "تحقق من الحقول المطلوبة.",
      fieldErrors,
    };
  }

  const value = {
    title,
    description,
    categoryId,
    subcategoryId,
    subSubcategoryId,
    pricingType: pricingType || "fixed",
    fixedBudget: effectivePricing === "fixed" ? fixedBudget : null,
    budgetMin: effectivePricing === "bidding" ? budgetMin : null,
    budgetMax: effectivePricing === "bidding" ? budgetMax : null,
    deliveryDays,
    durationUnit,
    deadline,
    skills,
    requirements: requirements === undefined ? null : requirements,
    attachments,
    internalNotes: internalNotes === undefined ? null : internalNotes,
    applicationBidCost,
    targetApplicantCount,
    eligibleTierCodes,
    applicationDeadlineAt,
    requiredBidCount,
    minRequiredBidsAcknowledged: Boolean(
      src.minRequiredBidsAcknowledged === true ||
        src.minRequiredBidsAcknowledged === "true" ||
        src.minRequiredBidsAcknowledged === 1,
    ),
    publish: Boolean(src.publish),
  };

  return { ok: true, value };
}

module.exports = {
  PANTRY_REQUEST_STATUSES,
  PANTRY_BID_STATUSES,
  PANTRY_DELIVERY_STATUSES,
  PANTRY_PRICING_TYPES,
  PANTRY_DURATION_UNITS,
  FREELANCER_VISIBLE_REQUEST_STATUSES,
  PANTRY_REQUEST_PATCHABLE_FIELDS,
  PANTRY_ELIGIBLE_TIER_CODES,
  canFreelancerListRequest,
  canFreelancerBid,
  canFreelancerDeliver,
  canAdminAcceptBid,
  canAdminApproveDelivery,
  canAdminRequestRevision,
  canAdminArchiveDelivery,
  deliveryMatchesAssignedFreelancer,
  normalizeSkills,
  normalizeAttachments,
  validatePantryRequestPayload,
  mapPantryDbError,
  actorId,
  requireActorId,
  PANTRY_SCHEMA_HINT,
  /** @deprecated use canAdminApproveDelivery / canAdminRequestRevision */
  canAdminReviewDelivery: canAdminApproveDelivery,
};
