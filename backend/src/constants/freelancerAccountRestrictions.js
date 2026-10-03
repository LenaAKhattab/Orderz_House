/** Super Admin marketplace moderation / review-hold constants. */

const RESTRICTION_TYPES = Object.freeze({
  ACCOUNT_REVIEW_HOLD: "ACCOUNT_REVIEW_HOLD",
  MARKETPLACE_RESTRICTED: "MARKETPLACE_RESTRICTED",
  CONTENT_REVIEW: "CONTENT_REVIEW",
  FULL_SUSPENSION: "FULL_SUSPENSION",
});

const RESTRICTION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
});

const RESTRICTION_SCOPES = Object.freeze({
  ALL_MARKETPLACE: "ALL_MARKETPLACE",
  BIDS: "bids",
  DIRECT_CLAIMS: "direct_claims",
  ORDER_ASSIGNMENTS: "order_assignments",
  ARTICLES: "articles",
  COMPETITIONS: "competitions",
  MESSAGING: "messaging",
});

const BID_MODERATION_STATUS = Object.freeze({
  PUBLISHED: "published",
  HELD: "held",
  RELEASED: "released",
  REJECTED_FROM_REVIEW: "rejected_from_review",
  EXPIRED_WITHOUT_PUBLISH: "expired_without_publish",
});

const AUDIT_ACTIONS = Object.freeze({
  ACCOUNT_RESTRICTION_CREATED: "account_restriction_created",
  ACCOUNT_RESTRICTION_UPDATED: "account_restriction_updated",
  ACCOUNT_RESTRICTION_REVOKED: "account_restriction_revoked",
  ACCOUNT_RESTRICTION_EXTENDED: "account_restriction_extended",
  BID_HELD_FOR_REVIEW: "bid_held_for_review",
  BID_RELEASED: "bid_released",
  BID_REJECTED_FROM_REVIEW: "bid_rejected_from_review",
  BID_EXPIRED_WITHOUT_PUBLISH: "bid_expired_without_publish",
  CLAIM_HELD_FOR_REVIEW: "claim_held_for_review",
  ARTICLE_HELD_FOR_REVIEW: "article_held_for_review",
  ARTICLE_RELEASED: "article_released",
  ARTICLE_REJECTED_FROM_REVIEW: "article_rejected_from_review",
});

const PUBLIC_MESSAGES = Object.freeze({
  BID_HELD_AR: "تم استلام عرضك وهو قيد المراجعة",
  BID_HELD_EN: "Your bid was received and is under review.",
  CLAIM_HELD_AR: "طلبك قيد المراجعة",
  CLAIM_HELD_EN: "Your request is under review.",
  ARTICLE_HELD_AR: "قيد المراجعة",
  ARTICLE_HELD_EN: "Under review",
});

module.exports = {
  RESTRICTION_TYPES,
  RESTRICTION_STATUSES,
  RESTRICTION_SCOPES,
  BID_MODERATION_STATUS,
  AUDIT_ACTIONS,
  PUBLIC_MESSAGES,
};
