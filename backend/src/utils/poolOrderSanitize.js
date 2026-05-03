/**
 * Strip PII and internal fields from pool order payloads returned to browsers.
 * Full order shapes from getOrderById / fake pool mapping must not be sent verbatim to guests or freelancers.
 */

function applicantsCountFrom(order) {
  const n = Number(order.bidsCount ?? order.applicantsCount ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function filesCountFrom(order) {
  if (Array.isArray(order.files)) return order.files.length;
  const n = Number(order.filesCount ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Guest / logged-out pool detail and pool **list** rows: marketplace-safe fields only (allowlist).
 * Never includes `assignedFreelancerId` — pool listings must not leak assignment even if upstream maps include it.
 */
function sanitizePublicPoolOrder(order) {
  if (!order || typeof order !== "object") return order;
  const applicantsCount = applicantsCountFrom(order);
  const fc = filesCountFrom(order);

  return {
    id: order.id,
    orderCode: order.orderCode,
    title: order.title,
    description: order.description,
    categoryId: order.categoryId,
    subcategoryId: order.subcategoryId,
    subSubcategoryId: order.subSubcategoryId,
    extraCategoryIds: order.extraCategoryIds,
    extraCategoryDetails: order.extraCategoryDetails,
    projectType: order.projectType,
    budget: order.budget,
    currencyCode: order.currencyCode,
    bidBudgetMin: order.bidBudgetMin,
    bidBudgetMax: order.bidBudgetMax,
    acceptsPriceBids: Boolean(order.acceptsPriceBids),
    durationValue: order.durationValue,
    durationUnit: order.durationUnit,
    sourceType: order.sourceType,
    orderStatus: order.orderStatus,
    isPublished: order.isPublished,
    isOpenForPool: order.isOpenForPool,
    isArchived: order.isArchived,
    receivedAt: order.receivedAt,
    dueAt: order.dueAt,
    createdAt: order.createdAt,
    poolListedAt: order.poolListedAt,
    preferredSkills: order.preferredSkills,
    category: order.category,
    subcategory: order.subcategory,
    subSubcategory: order.subSubcategory,
    extraCategories: order.extraCategories,
    applicantsCount,
    bidsCount: applicantsCount,
    filesCount: fc,
    files: [],
    orderSource: order.orderSource,
    trainingLabel: order.trainingLabel,
  };
}

/**
 * Logged-in pool viewer (any role): same as detail needs minus cross-user PII; keeps own myClaim/myBid and file attachments for freelancers evaluating the brief.
 */
function sanitizeFreelancerPoolOrder(order) {
  if (!order || typeof order !== "object") return order;
  const applicantsCount = applicantsCountFrom(order);
  const out = { ...order };

  delete out.bidUsers;
  delete out.createdByUserId;
  delete out.paymentRequired;
  delete out.paymentStatus;
  delete out.paymentAmount;
  delete out.paymentCurrency;
  delete out.clientRevisionNote;
  delete out.revisionRequestedBy;
  delete out.revisionRequestedAt;
  delete out.revisionDeadlineAt;
  delete out.isDirectAdminAssignment;

  out.applicantsCount = applicantsCount;
  out.bidsCount = applicantsCount;
  return out;
}

module.exports = {
  sanitizePublicPoolOrder,
  sanitizeFreelancerPoolOrder,
};
