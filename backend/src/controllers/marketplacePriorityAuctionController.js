/**
 * Phase 6 Priority Bid Auction — Freelancer + Super Admin + internal tick controllers.
 */
const priorityAuctionService = require("../services/marketplacePriorityAuctionService");

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function getMyAuctionView(req, res, next) {
  try {
    const auctionId = parseId(req.params.auctionId);
    if (!auctionId) {
      return res.status(400).json({ success: false, code: "INVALID_AUCTION_ID", message: "Invalid auction id." });
    }
    const view = await priorityAuctionService.getFreelancerAuctionView({
      auctionId,
      freelancerUserId: req.user.id,
    });
    if (!view) {
      return res.status(404).json({ success: false, code: "PRIORITY_AUCTION_NOT_FOUND", message: "Auction not found." });
    }
    return res.json({ success: true, data: view });
  } catch (err) {
    return next(err);
  }
}

async function submitMyPriorityBid(req, res, next) {
  try {
    const auctionId = parseId(req.params.auctionId);
    const bidTokens = Number(req.body?.bidTokens);
    if (!auctionId) {
      return res.status(400).json({ success: false, code: "INVALID_AUCTION_ID", message: "Invalid auction id." });
    }
    const out = await priorityAuctionService.submitPriorityBid({
      auctionId,
      freelancerUserId: req.user.id,
      bidTokens,
      actorUserId: req.user.id,
      poolKind: "real",
    });
    return res.status(201).json({ success: true, data: { bid: out.bid, auction: out.auction } });
  } catch (err) {
    return next(err);
  }
}

async function increaseMyPriorityBid(req, res, next) {
  try {
    const auctionId = parseId(req.params.auctionId);
    const newBidTokens = Number(req.body?.bidTokens ?? req.body?.newBidTokens);
    if (!auctionId) {
      return res.status(400).json({ success: false, code: "INVALID_AUCTION_ID", message: "Invalid auction id." });
    }
    const out = await priorityAuctionService.increasePriorityBid({
      auctionId,
      freelancerUserId: req.user.id,
      newBidTokens,
      actorUserId: req.user.id,
    });
    return res.json({ success: true, data: { bid: out.bid, skipped: Boolean(out.skipped) } });
  } catch (err) {
    return next(err);
  }
}

async function adminGetAuction(req, res, next) {
  try {
    const auctionId = parseId(req.params.auctionId);
    if (!auctionId) {
      return res.status(400).json({ success: false, code: "INVALID_AUCTION_ID", message: "Invalid auction id." });
    }
    const auction = await priorityAuctionService.getAuctionById(auctionId);
    if (!auction) {
      return res.status(404).json({ success: false, code: "PRIORITY_AUCTION_NOT_FOUND", message: "Auction not found." });
    }
    const bids = await priorityAuctionService.listAuctionBids(auctionId);
    return res.json({
      success: true,
      data: {
        auction,
        bidCount: bids.length,
        bids: bids.map((b) => ({
          id: b.id,
          freelancerUserId: b.freelancerUserId,
          bidTokens: b.bidTokens,
          status: b.status,
          submittedAt: b.submittedAt,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Explicit Super Admin create — shares canonical createPriorityAuctionForOrder
 * (same invariants as automatic priced-bidding open trigger; one auction per Order).
 */
async function adminCreateAuction(req, res, next) {
  try {
    const orderId = parseId(req.body?.orderId);
    if (!orderId) {
      return res.status(400).json({ success: false, code: "INVALID_ORDER_ID", message: "orderId is required." });
    }
    const out = await priorityAuctionService.createPriorityAuctionForOrder({
      orderId,
      actorUserId: req.user.id,
      creationSource: priorityAuctionService.PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL,
      idempotent: true,
    });
    return res.status(out.created ? 201 : 200).json({
      success: true,
      data: {
        auction: out.auction,
        created: out.created,
        reused: out.reused,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function runPriorityAuctionResolveTick(req, res, next) {
  try {
    // Phase B7B: fail closed — do not settle / consume / release Work Tokens.
    return res.status(410).json({
      success: false,
      code: "PRIORITY_AUCTION_DEPRECATED",
      message: "Legacy Priority Auction resolve tick is deprecated.",
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getMyAuctionView,
  submitMyPriorityBid,
  increaseMyPriorityBid,
  adminGetAuction,
  adminCreateAuction,
  runPriorityAuctionResolveTick,
};
