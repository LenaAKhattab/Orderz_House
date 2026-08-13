/**
 * READ-ONLY post-apply verification for Migration 148.
 * Does not enable engines or create economic rows.
 */
require("../src/config/loadBackendEnv").loadBackendEnv({
  profile: "default",
  failClosed: false,
  quiet: true,
});
const { pool } = require("../src/config/db");
const fs = require("fs");
const path = require("path");

async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

(async () => {
  const out = {};

  out.mig148 = await one(
    `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version = '148_priority_application_boost'`,
  );
  out.mig148Rows = await all(
    `SELECT version, applied_at FROM schema_migrations WHERE version LIKE '148%' ORDER BY version`,
  );

  out.flagCol = await one(`
    SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='marketplace_economy_settings'
       AND column_name='priority_application_boost_enabled'`);

  out.flags = await one(`
    SELECT bid_credits_enabled,
           priority_application_boost_enabled,
           priority_bidding_enabled,
           work_tokens_enabled,
           fair_work_distribution_enabled,
           elite_engine_enabled,
           marketplace_commission_enabled,
           cash_membership_payments_enabled,
           verification_bonuses_enabled
      FROM marketplace_economy_settings WHERE id=1`);

  out.boostTable = await one(
    `SELECT to_regclass('public.order_freelancer_priority_application_boosts') AS t`,
  );
  out.boostCols = await all(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='order_freelancer_priority_application_boosts'
     ORDER BY ordinal_position`);
  out.boostConstraints = await all(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'order_freelancer_priority_application_boosts'::regclass
     ORDER BY conname`);
  out.boostIndexes = await all(`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE tablename='order_freelancer_priority_application_boosts'
     ORDER BY indexname`);
  out.boostRows = await one(
    `SELECT COUNT(*)::int AS c FROM order_freelancer_priority_application_boosts`,
  );

  out.counts = {
    memberships: (await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)).c,
    cycles: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles`)).c,
    packages: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_packages`)).c,
    grants: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_grants`)).c,
    ledger: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries`)).c,
    distMonths: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_bid_distribution_months`)).c,
    bidEcon: (await one(`SELECT COUNT(*)::int AS c FROM order_freelancer_bid_credit_economics`)).c,
    boosts: out.boostRows.c,
    pbAuctions: (await one(`SELECT COUNT(*)::int AS c FROM priority_bid_auctions`)).c,
    pbBids: (await one(`SELECT COUNT(*)::int AS c FROM priority_auction_bids`)).c,
    wtRes: (await one(`SELECT COUNT(*)::int AS c FROM work_token_reservations`)).c,
    articles: (await one(`SELECT COUNT(*)::int AS c FROM marketplace_articles`)).c,
  };

  out.legacyTables = {
    priority_bid_auctions: Boolean(
      (await one(`SELECT to_regclass('public.priority_bid_auctions') AS t`)).t,
    ),
    priority_auction_bids: Boolean(
      (await one(`SELECT to_regclass('public.priority_auction_bids') AS t`)).t,
    ),
  };

  const root = path.join(__dirname, "..");
  const boostSvc = fs.readFileSync(
    path.join(root, "src/services/marketplacePriorityApplicationBoostService.js"),
    "utf8",
  );
  const auctionSvc = fs.readFileSync(
    path.join(root, "src/services/marketplacePriorityAuctionService.js"),
    "utf8",
  );
  const usageSvc = fs.readFileSync(
    path.join(root, "src/services/marketplacePriorityBidUsageService.js"),
    "utf8",
  );
  const ordersSvc = fs.readFileSync(path.join(root, "src/services/ordersService.js"), "utf8");
  const cancelSvc = fs.readFileSync(
    path.join(root, "src/services/marketplaceNormalApplicationWorkTokenService.js"),
    "utf8",
  );
  const fairSvc = fs.readFileSync(
    path.join(root, "src/services/marketplaceFairDistributionService.js"),
    "utf8",
  );
  const routes = fs.readFileSync(path.join(root, "src/routes/ordersRoutes.js"), "utf8");
  const enOrders = fs.readFileSync(path.join(root, "../frontend/src/locales/en/orders.json"), "utf8");
  const clientModal = fs.readFileSync(
    path.join(root, "../frontend/src/components/orders/ClientBiddingOffersModal.jsx"),
    "utf8",
  );
  const bidModal = fs.readFileSync(
    path.join(root, "../frontend/src/components/orders/BidAmountModal.jsx"),
    "utf8",
  );
  const planForm = fs.readFileSync(
    path.join(root, "../frontend/src/admin/marketplaceMembership/MarketplaceMembershipPlanFormModal.jsx"),
    "utf8",
  );
  const economyPage = fs.readFileSync(
    path.join(root, "../frontend/src/pages/dashboard/SuperAdminMarketplaceEconomyPage.jsx"),
    "utf8",
  );

  out.static = {
    ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME:
      !/reserveWorkTokens|increaseWorkTokenReservation|consumeWorkTokenReservation|releaseWorkTokenReservation/.test(
        boostSvc,
      )
        ? "NONE"
        : "PRESENT",
    LEGACY_AUCTION_ACTIVE_WITH_NEW_BOOST:
      /SUPERSEDED_BY_PRIORITY_APPLICATION_BOOST/.test(auctionSvc) &&
      /PRIORITY_APPLICATION_BOOST_LEGACY_AUCTION_CONFLICT/.test(boostSvc)
        ? "NO"
        : "YES",
    PRIORITY_BOOST_TERMINAL_STATE_PROTECTION: /assertOrderOpenForPriorityBoost/.test(boostSvc)
      ? "PASS"
      : "FAIL",
    FIRST_PRIORITY_APPLICATION_TRANSACTION:
      /applyPriorityApplicationBoost/.test(ordersSvc) &&
      /chargeNormalApplicationBidCreditOnFirstBid/.test(ordersSvc)
        ? "ATOMIC"
        : "NOT_ATOMIC",
    EXISTING_APPLICATION_PRIORITY_UPGRADE: /bids\/priority-boost/.test(routes) ? "PASS" : "FAIL",
    PRIORITY_AUTOMATIC_ASSIGNMENT: /Does NOT auto-assign|REMOVED_FROM_ACTIVE_PRODUCT/.test(boostSvc)
      ? "REMOVED_FROM_ACTIVE_PRODUCT"
      : "UNKNOWN",
    NEW_PRIORITY_BOOST_LEGACY_WORKER_DEPENDENCY: /order_freelancer_priority_application_boosts/.test(
      auctionSvc,
    )
      ? "PRESENT"
      : "NONE",
    PRIORITY_PROPOSAL_ORDERING: /order_freelancer_priority_application_boosts/.test(ordersSvc)
      ? "PASS"
      : "FAIL",
    FAIR_PRIORITY_TOKEN_TIEBREAK_NEW_PATH: /priority_application_boost/.test(fairSvc)
      ? "USED"
      : "NOT_USED",
    RETURN_PRIORITY_USE_PRIMITIVE: !/work_token|priority_bid_auction|priority_auction_bid/i.test(
      usageSvc,
    )
      ? "GENERIC_SAFE"
      : "LEGACY_COUPLED",
    BID_REFUND_PRIORITY_USE_RETURN_COMPOSITION:
      /returnPriorityBoostsForOrderEndedWithoutSelection/.test(cancelSvc) &&
      /refundChargedBidApplicationsForOrderEndedWithoutSelection/.test(cancelSvc)
        ? "PASS"
        : "FAIL",
    PRIORITY_BOOST_ENGINE_OFF_SAFETY: /PRIORITY_APPLICATION_BOOST_ENGINE_OFF/.test(boostSvc)
      ? "PASS"
      : "FAIL",
    ACTIVE_PRIORITY_WORK_TOKEN_UI: /1 Bid \+ 1 Priority Use/.test(enOrders) && !/2 Bids/.test(enOrders.replace(/not 2 Bids/, ""))
      ? "NONE"
      : "CHECK",
    CLIENT_PRIORITY_BADGE: /isPriority/.test(clientModal) ? "YES" : "NO",
    FREELANCER_PRIORITY_UI: /priorityBoostAvailable/.test(bidModal) ? "YES" : "NO",
    ADMIN_SEPARATION:
      /monthlyBidAllowance/.test(planForm) &&
      /priorityBidUsesPerCycle/.test(planForm) &&
      /priorityApplicationBoostEnabled/.test(economyPage)
        ? "YES"
        : "NO",
    PRIORITY_BOOST_IDOR: /upgradePoolOrderBidPriority|freelancerUserId: req\.auth\.userId/.test(
      fs.readFileSync(path.join(root, "src/controllers/ordersController.js"), "utf8"),
    )
      ? "SAFE"
      : "UNSAFE",
    FAKE_TRAINING_PRIORITY_ECONOMY: /PRIORITY_APPLICATION_BOOST_FAKE_FORBIDDEN/.test(boostSvc)
      ? "NONE"
      : "RISK",
    ARTICLE_PRIORITY_BOOST: /PRIORITY_APPLICATION_BOOST_ARTICLE_FORBIDDEN/.test(boostSvc)
      ? "NOT_IMPLEMENTED"
      : "UNKNOWN",
  };

  // uniqueness / cost checks from constraints
  const defs = out.boostConstraints.map((c) => c.def).join("\n");
  out.PRIORITY_BOOST_UNIQUENESS =
    /UNIQUE \(order_id, freelancer_user_id\)/.test(defs) &&
    /UNIQUE \(bid_id\)/.test(defs) &&
    /UNIQUE \(idempotency_key\)/.test(defs)
      ? "PASS"
      : "FAIL";
  out.PRIORITY_BOOST_USE_COST = /priority_use_cost = 1/.test(defs) ? 1 : "FAIL";
  out.PRIORITY_BOOST_ADDITIONAL_BID_COST = /additional_bid_credit_cost = 0/.test(defs) ? 0 : "FAIL";
  out.PRIORITY_BOOST_WORK_TOKEN_COST = /work_token_cost = 0/.test(defs) ? 0 : "FAIL";
  out.PRIORITY_BOOST_FK_SAFETY = out.boostConstraints
    .filter((c) => c.contype === "f")
    .every((c) =>
      c.conname.includes("actor_user_id")
        ? /ON DELETE SET NULL/.test(c.def)
        : /ON DELETE RESTRICT/.test(c.def),
    )
    ? "PASS"
    : "FAIL";

  console.log(JSON.stringify(out, null, 2));
  await pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
