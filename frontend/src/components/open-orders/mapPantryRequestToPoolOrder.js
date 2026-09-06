import { isBidCollectionClosedForApply } from "../../admin/marketplaceArticles/marketplaceArticleFormUtils.js";

function pantryBidCollectionFromRow(row) {
  if (row?.bidCollection && typeof row.bidCollection === "object") return row.bidCollection;
  const required = row?.requiredBidCount != null ? Number(row.requiredBidCount) : null;
  if (required == null || !Number.isFinite(required) || required < 1) return null;
  const current =
    row.validApplicantCount != null
      ? Number(row.validApplicantCount)
      : row.bidsCount != null
        ? Number(row.bidsCount)
        : 0;
  return {
    requiredBidCount: required,
    currentBidCount: Number.isFinite(current) ? current : 0,
    bidCollectionOutcome: row.bidCollectionOutcome || null,
    bidCollectionStatus: row.bidCollectionStatus || null,
  };
}

/**
 * Map a Freelancer pantry open-request row into the pool list shape
 * so it renders identically in MarketplaceOrderListRow.
 * Keeps internal pantry ids for API actions; no pantry branding in display fields.
 */
export function mapPantryRequestToPoolOrder(row) {
  if (!row || row.id == null) return null;
  const pantryRequestId = String(row.id);
  const isBidding = String(row.pricingType || "").toLowerCase() === "bidding";
  const bidCollection = pantryBidCollectionFromRow(row);
  const collectionClosed =
    isBidCollectionClosedForApply(bidCollection) ||
    Boolean(row.applicationsClosedAt) ||
    Boolean(row.applicationsCloseReason);
  const locked = row.applyEligible === false;

  return {
    id: `pantry-${pantryRequestId}`,
    pantryRequestId,
    isPantryPoolItem: true,
    title: row.title || "",
    description: row.description || "",
    projectType: isBidding ? "bidding" : "fixed",
    budget: row.fixedBudget != null ? Number(row.fixedBudget) : null,
    bidBudgetMin: row.budgetMin != null ? Number(row.budgetMin) : null,
    bidBudgetMax: row.budgetMax != null ? Number(row.budgetMax) : null,
    durationValue: row.deliveryDays != null ? Number(row.deliveryDays) : null,
    durationUnit: row.durationUnit || "days",
    applicantsCount:
      row.validApplicantCount != null
        ? Number(row.validApplicantCount)
        : row.bidsCount != null
          ? Number(row.bidsCount)
          : 0,
    bidsCount: row.bidsCount != null ? Number(row.bidsCount) : 0,
    category: row.categoryId
      ? { id: String(row.categoryId), name: row.categoryName || row.category?.name || "" }
      : row.category || null,
    subSubcategory: row.subSubcategoryId
      ? {
          id: String(row.subSubcategoryId),
          name: row.subSubcategoryName || row.subSubcategory?.name || "",
        }
      : row.subSubcategory || null,
    myBid: row.myBid || null,
    applicationBidCost: row.applicationBidCost != null ? Number(row.applicationBidCost) : null,
    bidCollection,
    collectionClosed,
    relistCount: row.relistCount != null ? Number(row.relistCount) : 0,
    poolEligibility: {
      isLockedByPlan: Boolean(locked),
      lockReason: row.applyBlockMessage || null,
    },
    isFake: false,
    sourceType: "admin_created",
  };
}

export function isPantryPoolOrder(order) {
  return Boolean(order?.isPantryPoolItem && order?.pantryRequestId);
}

export function pantryRequestIdFromPoolOrder(order) {
  if (!order) return null;
  if (order.pantryRequestId != null) return String(order.pantryRequestId);
  const id = String(order.id || "");
  if (id.startsWith("pantry-")) return id.slice("pantry-".length);
  return null;
}
