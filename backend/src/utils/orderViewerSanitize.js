/**
 * Role-aware order / bid / claim shaping for API responses.
 * Never trust the frontend — strip internal IDs and PII before JSON.
 *
 * Order number (`orderCode`) visibility (product + privacy):
 * - admin / super_admin: always include when present on the order object.
 * - client: never include in API payloads.
 * - freelancer: include only when `orderStatus` is the canonical completed status (`completed`).
 * - guest / unauthenticated pool: never include.
 */

const STAFF_ROLES = new Set(["admin", "super_admin"]);

/** Canonical DB/API status for a finished project (freelancer may see order number). */
const FREELANCER_ORDER_NUMBER_VISIBLE_STATUSES = new Set(["completed"]);

function isStaffRole(role) {
  return STAFF_ROLES.has(String(role || "").trim());
}

/**
 * @param {string|null|undefined} viewerRole
 * @param {{ orderStatus?: string|null }} order
 * @returns {boolean}
 */
function canViewOrderNumber(viewerRole, order) {
  const role = String(viewerRole || "").trim();
  if (!role) return false;
  if (isStaffRole(role)) return true;
  if (role === "client") return false;
  if (role === "freelancer") {
    const st = String(order?.orderStatus || "").trim();
    return FREELANCER_ORDER_NUMBER_VISIBLE_STATUSES.has(st);
  }
  return false;
}

/**
 * Serialize an order for JSON responses based on viewer role and view context.
 * @param {object} order
 * @param {{ role?: string|null, view?: "pool"|"assigned"|"client" }} opts
 */
function serializeOrderForViewer(order, opts = {}) {
  if (!order || typeof order !== "object") return order;
  const role = String(opts.role || "").trim();
  const view = String(opts.view || "").trim();
  if (isStaffRole(role)) return sanitizeOrderForStaff(order);
  if (role === "freelancer") {
    if (view === "pool") return sanitizeFreelancerPoolOrder(order);
    return sanitizeOrderForFreelancerAssigned(order);
  }
  if (role === "client") return sanitizeOrderForClient(order);
  return sanitizePublicPoolOrder(order);
}

function joinDisplayName(parts) {
  return (Array.isArray(parts) ? parts : []).filter(Boolean).join(" ").trim() || null;
}

function stripInternalFileFields(f) {
  if (!f || typeof f !== "object") return f;
  const out = { ...f };
  delete out.submissionId;
  delete out.revisionRequestId;
  delete out.publicId;
  delete out.adminMetadata;
  return out;
}

/** Remove nested admin-only metadata from submission timeline for client/freelancer. */
function sanitizeSubmissionHistoryForNonStaff(h) {
  if (!h || !Array.isArray(h.submissions)) return h;
  return {
    submissions: h.submissions.map((s) => {
      const sub = { ...s };
      delete sub.adminMetadata;
      sub.files = Array.isArray(sub.files) ? sub.files.map(stripInternalFileFields) : [];
      sub.revisionRequests = Array.isArray(sub.revisionRequests)
        ? sub.revisionRequests.map((r) => {
            const rr = { ...r };
            delete rr.adminMetadata;
            rr.files = Array.isArray(rr.files) ? rr.files.map(stripInternalFileFields) : [];
            return rr;
          })
        : [];
      return sub;
    }),
  };
}

function applicantsCountFrom(order) {
  const n = Number(order?.bidsCount ?? order?.applicantsCount ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function filesCountFrom(order) {
  if (Array.isArray(order?.files)) return order.files.length;
  const n = Number(order?.filesCount ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** Guest / logged-out pool list + detail: marketplace-safe allowlist only. */
function sanitizePublicPoolOrder(order) {
  if (!order || typeof order !== "object") return order;
  const applicantsCount = applicantsCountFrom(order);
  const fc = filesCountFrom(order);

  return {
    id: order.id,
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
    hasAssignedFreelancer: Boolean(order.assignedFreelancerId),
  };
}

/**
 * Logged-in freelancer viewing pool detail/list: no client IDs, no bid roster PII,
 * no raw `assignedFreelancerId` (boolean only). Includes own myClaim/myBid + files.
 */
function sanitizeFreelancerPoolOrder(order) {
  if (!order || typeof order !== "object") return order;
  const pub = sanitizePublicPoolOrder(order);
  return {
    ...pub,
    files: Array.isArray(order.files) ? order.files : [],
    myClaim: order.myClaim ?? null,
    myBid: order.myBid ?? null,
    updatedAt: order.updatedAt ?? null,
    takenAt: order.takenAt ?? null,
    acceptedAt: order.acceptedAt ?? null,
    startedAt: order.startedAt ?? null,
    submittedAt: order.submittedAt ?? null,
  };
}

/** Freelancer assigned / in-progress: hide client identity and competitor bid roster; keep payment summary for their job. */
const FREELANCER_ASSIGNED_STRIP_KEYS = new Set(["createdByUserId", "assignedFreelancerId", "bidUsers", "bids"]);

/** Freelancer assigned order detail: never expose client account / user id or other bidders' PII. */
function sanitizeOrderForFreelancerAssigned(order) {
  if (!order || typeof order !== "object") return order;
  const o = { ...order };
  for (const k of FREELANCER_ASSIGNED_STRIP_KEYS) delete o[k];
  delete o.isDirectAdminAssignment;
  o.hasAssignedFreelancer = Boolean(order.assignedFreelancerId);
  o.bidsCount = typeof order.bidsCount === "number" ? order.bidsCount : applicantsCountFrom(order);
  if (!canViewOrderNumber("freelancer", order)) {
    delete o.orderCode;
  }
  if (o.submissionHistory) {
    o.submissionHistory = sanitizeSubmissionHistoryForNonStaff(o.submissionHistory);
  }
  if (Array.isArray(o.files)) {
    o.files = o.files.map(stripInternalFileFields);
  }
  return o;
}

function sanitizeBidUsersForClient(bidUsers) {
  if (!Array.isArray(bidUsers)) return [];
  return bidUsers.map((b) => {
    const u = b.user || {};
    const displayName = joinDisplayName([u.firstName, u.fatherName, u.familyName]);
    return {
      bidId: b.bidId,
      amount: b.amount,
      status: b.status,
      createdAt: b.createdAt,
      displayName: displayName || null,
    };
  });
}

/** Client-owned order payloads: hide freelancer user/account IDs; keep safe display for bids. */
function sanitizeOrderForClient(order) {
  if (!order || typeof order !== "object") return order;
  const o = { ...order };
  delete o.assignedFreelancerId;
  o.hasAssignedFreelancer = Boolean(order.assignedFreelancerId);
  delete o.createdByUserId;
  delete o.bidUsers;
  delete o.orderCode;
  if (Array.isArray(order.bidUsers)) {
    o.bidUsers = sanitizeBidUsersForClient(order.bidUsers);
  }
  if (o.submissionHistory) {
    o.submissionHistory = sanitizeSubmissionHistoryForNonStaff(o.submissionHistory);
  }
  if (Array.isArray(o.files)) {
    o.files = o.files.map(stripInternalFileFields);
  }
  return o;
}

function sanitizeBidsForClient(bids) {
  if (!Array.isArray(bids)) return [];
  return bids.map((b) => ({
    id: b.id,
    orderId: b.orderId,
    amount: b.amount,
    status: b.status,
    message: b.message ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    displayName: b.freelancer
      ? joinDisplayName([b.freelancer.firstName, b.freelancer.fatherName, b.freelancer.familyName])
      : null,
  }));
}

function sanitizeClaimsForClient(claims) {
  if (!Array.isArray(claims)) return [];
  return claims.map((c) => ({
    id: c.id,
    orderId: c.orderId,
    status: c.status,
    reviewedAt: c.reviewedAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    displayName: c.freelancer
      ? joinDisplayName([c.freelancer.firstName, c.freelancer.fatherName, c.freelancer.familyName])
      : null,
  }));
}

/** Admin / super_admin: full order object (caller still must not expose passwords etc.). */
function sanitizeOrderForStaff(order) {
  return order;
}

function sanitizeOrderForRole(order, role) {
  if (!order) return order;
  const r = String(role || "").trim();
  if (isStaffRole(r)) return sanitizeOrderForStaff(order);
  if (r === "freelancer") return sanitizeOrderForFreelancerAssigned(order);
  return sanitizeOrderForClient(order);
}

module.exports = {
  STAFF_ROLES,
  isStaffRole,
  FREELANCER_ORDER_NUMBER_VISIBLE_STATUSES,
  canViewOrderNumber,
  serializeOrderForViewer,
  sanitizePublicPoolOrder,
  sanitizeFreelancerPoolOrder,
  sanitizeOrderForFreelancerAssigned,
  sanitizeOrderForClient,
  sanitizeOrderForStaff,
  sanitizeOrderForRole,
  sanitizeBidsForClient,
  sanitizeClaimsForClient,
  sanitizeBidUsersForClient,
  joinDisplayName,
};
