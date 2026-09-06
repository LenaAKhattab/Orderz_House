/**
 * Phase B5 — Article application Bid Credit charge + eligible no-selection refund.
 *
 * Cost: ARTICLE_APPLICATION_BID_COST (1) flat.
 * Refund: Article closed/cancelled with ZERO selected applications.
 *   pending charged apps only (not withdrawn/rejected).
 * Fail-closed: article_applications_enabled AND bid_credits_enabled required.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isBidCreditsEngineActive,
  isArticleApplicationsEngineActive,
} = require("./marketplaceEconomySettingsService");
const {
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_APPLICATION_NO_SELECTION_COMPENSATING_GRANT_DAYS,
  ARTICLE_APPLICATION_BID_CONSUME_EVENT,
  ARTICLE_APPLICATION_BID_REFUND_EVENT,
  ARTICLE_APPLICATION_REFUND_GRANT_SOURCE,
  ARTICLE_APPLICATION_ERROR_CODES,
  buildArticleApplicationBidConsumeIdempotencyKey,
  buildArticleApplicationBidRefundIdempotencyKey,
} = require("../constants/marketplaceArticleApplications");
const { BID_CREDIT_ERROR_CODES } = require("../constants/marketplaceBidCredits");
const accounting = require("./marketplaceBidCreditAccountingService");
const distribution = require("./marketplaceBidCreditDistributionService");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");

let economicsTableReadyCache = null;

async function articleApplicationBidEconomicsSchemaReady(db = pool) {
  if (economicsTableReadyCache === true) return true;
  if (economicsTableReadyCache === false) return false;
  const { rows } = await db.query(
    `SELECT to_regclass('public.marketplace_article_application_bid_credit_economics') AS t`,
  );
  economicsTableReadyCache = Boolean(rows[0]?.t);
  return economicsTableReadyCache;
}

function clearArticleApplicationBidEconomicsSchemaCache() {
  economicsTableReadyCache = null;
}

function mapEconomicsRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    articleApplicationId: String(row.article_application_id),
    articleId: String(row.article_id),
    freelancerUserId: String(row.freelancer_user_id),
    bidCreditCost: Number(row.bid_credit_cost) || ARTICLE_APPLICATION_BID_COST,
    chargeStatus: row.charge_status,
    refundStatus: row.refund_status,
    refundMode: row.refund_mode || null,
    consumeLedgerEntryId:
      row.consume_ledger_entry_id != null ? String(row.consume_ledger_entry_id) : null,
    primaryGrantId: row.primary_grant_id != null ? String(row.primary_grant_id) : null,
    grantExpiresAtSnapshot: row.grant_expires_at_snapshot || null,
    refundLedgerEntryId:
      row.refund_ledger_entry_id != null ? String(row.refund_ledger_entry_id) : null,
    compensatingGrantId:
      row.compensating_grant_id != null ? String(row.compensating_grant_id) : null,
    refundIdempotencyKey: row.refund_idempotency_key || null,
    idempotencyKey: row.idempotency_key,
    fefoAllocations: row.fefo_allocations || [],
    chargedAt: row.charged_at || null,
    refundedAt: row.refunded_at || null,
    createdAt: row.created_at || null,
  };
}

/**
 * Fail-closed activation: both Article applications + Bid Credits engines required.
 */
async function assertArticleBidEconomyActive(client = pool) {
  const settings = await getMarketplaceEconomySettings(client);
  if (!isArticleApplicationsEngineActive(settings)) {
    throw createAppError("Article applications engine is not enabled.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATIONS_ENGINE_OFF,
    });
  }
  if (!isBidCreditsEngineActive(settings)) {
    throw createAppError(
      "Article applications require Bid Credits engine. Free applications are not allowed.",
      409,
      {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_BID_ECONOMY_DISABLED,
      },
    );
  }
  if (!(await marketplaceBidCreditsSchemaReady(client))) {
    throw createAppError("Bid Credits schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }
  if (!(await articleApplicationBidEconomicsSchemaReady(client))) {
    throw createAppError("Article Bid economics schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_BID_ECONOMICS_SCHEMA_NOT_READY,
    });
  }
  return settings;
}

async function findEconomicsByApplicationId(client, applicationId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_article_application_bid_credit_economics
      WHERE article_application_id = $1
      LIMIT 1`,
    [Number(applicationId)],
  );
  return rows[0] || null;
}

async function findEconomicsByIdForUpdate(client, economicsId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_article_application_bid_credit_economics
      WHERE id = $1 FOR UPDATE`,
    [Number(economicsId)],
  );
  return rows[0] || null;
}

async function quoteArticleApplicationBidCost({ freelancerUserId = null, now = new Date() } = {}) {
  const settings = await getMarketplaceEconomySettings();
  const articleEngine = isArticleApplicationsEngineActive(settings);
  const bidEngine = isBidCreditsEngineActive(settings);
  const schemaReady =
    (await marketplaceBidCreditsSchemaReady()) &&
    (await articleApplicationBidEconomicsSchemaReady());

  const base = {
    approvedBidCost: ARTICLE_APPLICATION_BID_COST,
    articleApplicationsEnabled: articleEngine,
    bidCreditsEnabled: bidEngine,
    schemaReady,
    availableBids: null,
    canApply: null,
    freeFallback: false,
  };

  if (!articleEngine) {
    return { ...base, canApply: false, reason: "article_applications_engine_off" };
  }
  if (!bidEngine) {
    return { ...base, canApply: false, reason: "bid_credits_engine_off" };
  }
  if (!schemaReady || freelancerUserId == null) {
    return {
      ...base,
      canApply: null,
      reason: !schemaReady ? "schema_not_ready" : null,
    };
  }

  await distribution.reconcileFreelancerBidDistributions({
    freelancerUserId: Number(freelancerUserId),
    now,
  });
  const client = await pool.connect();
  try {
    const available = await accounting.sumAvailableBidCredits({
      client,
      freelancerUserId: Number(freelancerUserId),
      now,
    });
    return {
      ...base,
      availableBids: available,
      canApply: available >= ARTICLE_APPLICATION_BID_COST,
      reason: available >= ARTICLE_APPLICATION_BID_COST ? null : "insufficient_bid_credits",
    };
  } finally {
    client.release();
  }
}

/**
 * DEPRECATED (E2): immediate Article Bid consume on application.
 * Active runtime uses reservation → consume on final approval.
 * Kept for historical B5 table compatibility only — must not be called by submit path.
 */
async function chargeArticleApplicationBidCredit({
  client,
  articleId,
  freelancerUserId,
  articleApplicationId,
  actorUserId = null,
  now = new Date(),
} = {}) {
  void client;
  void articleId;
  void freelancerUserId;
  void articleApplicationId;
  void actorUserId;
  void now;
  return {
    charged: false,
    skipped: true,
    reason: "DEPRECATED_INACTIVE_E2_USE_RESERVATION",
    bidCreditCost: 0,
    economics: null,
    deprecated: true,
    oldBehavior: "DEPRECATED_INACTIVE",
  };
}

async function refundSingleArticleApplicationBidEconomics({
  client,
  economicsRow,
  reason = "article_ended_without_selection",
  actorUserId = null,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("refundSingleArticleApplicationBidEconomics requires an open DB client.", 500);
  }
  if (!economicsRow || economicsRow.charge_status !== "charged") {
    return { refunded: false, skipped: true, reason: "not_charged" };
  }
  if (economicsRow.refund_status === "refunded") {
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(economicsRow) };
  }

  const locked = await findEconomicsByIdForUpdate(client, economicsRow.id);
  if (!locked) return { refunded: false, skipped: true, reason: "missing" };
  if (locked.refund_status === "refunded") {
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(locked) };
  }

  const refundKey = buildArticleApplicationBidRefundIdempotencyKey(
    locked.article_id,
    locked.freelancer_user_id,
  );
  const instant = new Date(now);

  let grantId =
    locked.primary_grant_id != null
      ? Number(locked.primary_grant_id)
      : Number(locked.fefo_allocations?.[0]?.grantId || 0) || null;

  let grant = null;
  if (grantId) {
    const { rows: gRows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
      [grantId],
    );
    grant = gRows[0] || null;
  }

  const sourceStillValid =
    grant &&
    new Date(grant.expires_at) > instant &&
    Number(grant.amount_consumed) >= ARTICLE_APPLICATION_BID_COST;

  let refundMode;
  let refundLedgerEntryId = null;
  let compensatingGrantId = null;

  if (sourceStillValid) {
    refundMode = "same_bucket_restore";
    const { rows: updatedGrant } = await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET amount_consumed = amount_consumed - $2,
              status = CASE
                WHEN status IN ('exhausted', 'active')
                  AND (amount_granted - (amount_consumed - $2) - amount_expired) > 0
                THEN 'active'
                ELSE status
              END,
              exhausted_at = CASE
                WHEN (amount_granted - (amount_consumed - $2) - amount_expired) > 0 THEN NULL
                ELSE exhausted_at
              END,
              updated_at = NOW()
        WHERE id = $1
          AND amount_consumed >= $2
        RETURNING *`,
      [grant.id, ARTICLE_APPLICATION_BID_COST],
    );
    if (!updatedGrant[0]) {
      throw createAppError("Unable to restore Bid Credit to original grant.", 409, {
        exposeToClient: false,
      });
    }

    const { rows: ledgerRows } = await client.query(
      `INSERT INTO marketplace_bid_credit_ledger_entries (
         freelancer_user_id, grant_id, event_type, amount, direction,
         reference_type, reference_id, idempotency_key,
         reason, actor_user_id, metadata
       ) VALUES (
         $1, $2, $3, $4, 1,
         'marketplace_article_application_bid_credit_economics', $5, $6,
         $7, $8, $9::jsonb
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        locked.freelancer_user_id,
        grant.id,
        ARTICLE_APPLICATION_BID_REFUND_EVENT,
        ARTICLE_APPLICATION_BID_COST,
        String(locked.id),
        refundKey,
        reason,
        actorUserId,
        JSON.stringify({
          economicsId: String(locked.id),
          articleId: String(locked.article_id),
          articleApplicationId: String(locked.article_application_id),
          refundMode,
          originalGrantId: String(grant.id),
        }),
      ],
    );
    if (ledgerRows[0]) {
      refundLedgerEntryId = ledgerRows[0].id;
    } else {
      const { rows: existingLedger } = await client.query(
        `SELECT id FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1`,
        [refundKey],
      );
      refundLedgerEntryId = existingLedger[0]?.id || null;
    }
  } else {
    refundMode = "compensating_grant_30d";
    const expiresAt = new Date(
      instant.getTime() + ARTICLE_APPLICATION_NO_SELECTION_COMPENSATING_GRANT_DAYS * 86400000,
    );
    const created = await accounting.createBidCreditGrant({
      client,
      freelancerUserId: locked.freelancer_user_id,
      sourceType: ARTICLE_APPLICATION_REFUND_GRANT_SOURCE,
      amount: ARTICLE_APPLICATION_BID_COST,
      expiresAt,
      eventType: ARTICLE_APPLICATION_BID_REFUND_EVENT,
      idempotencyKey: refundKey,
      reason,
      actorUserId,
      referenceType: "marketplace_article_application_bid_credit_economics",
      referenceId: String(locked.id),
      metadata: {
        economicsId: String(locked.id),
        articleId: String(locked.article_id),
        articleApplicationId: String(locked.article_application_id),
        refundMode,
        originalGrantId: grantId != null ? String(grantId) : null,
        originalGrantExpired: true,
        compensatingDays: ARTICLE_APPLICATION_NO_SELECTION_COMPENSATING_GRANT_DAYS,
      },
      grantedAt: instant,
    });
    compensatingGrantId = created.grant?.id ? Number(created.grant.id) : null;
    const { rows: ledgerRows } = await client.query(
      `SELECT id FROM marketplace_bid_credit_ledger_entries
        WHERE idempotency_key = $1 OR idempotency_key = $2
        ORDER BY id DESC LIMIT 1`,
      [refundKey, `ledger:${refundKey}`],
    );
    refundLedgerEntryId = ledgerRows[0]?.id || null;
  }

  const { rows: marked } = await client.query(
    `UPDATE marketplace_article_application_bid_credit_economics
        SET refund_status = 'refunded',
            refund_mode = $2,
            refund_ledger_entry_id = COALESCE($3, refund_ledger_entry_id),
            compensating_grant_id = COALESCE($4, compensating_grant_id),
            refund_idempotency_key = COALESCE(refund_idempotency_key, $5),
            refunded_at = COALESCE(refunded_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
        AND charge_status = 'charged'
        AND refund_status = 'none'
      RETURNING *`,
    [
      Number(locked.id),
      refundMode,
      refundLedgerEntryId,
      compensatingGrantId,
      refundKey,
    ],
  );

  if (!marked[0]) {
    const again = await findEconomicsByIdForUpdate(client, locked.id);
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(again) };
  }

  return {
    refunded: true,
    idempotent: false,
    refundMode,
    economics: mapEconomicsRow(marked[0]),
  };
}

/**
 * Article-level no-selection refunds for pending charged applications.
 * Must run under Article/application lock. Skips if any selected exists.
 * Does NOT refund withdrawn/rejected applications.
 */
async function refundNoSelectionArticleApplications({
  client,
  articleId,
  actorUserId = null,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("refundNoSelectionArticleApplications requires an open DB client.", 500);
  }
  if (!(await articleApplicationBidEconomicsSchemaReady(client))) {
    return { refundedCount: 0, results: [], schemaReady: false, skippedReason: "schema_not_ready" };
  }

  // Serialize against concurrent select/close on this Article's applications.
  await client.query(
    `SELECT id FROM marketplace_article_applications WHERE article_id = $1 FOR UPDATE`,
    [Number(articleId)],
  );

  const { rows: selected } = await client.query(
    `SELECT COUNT(*)::int AS c FROM marketplace_article_applications
      WHERE article_id = $1 AND status = 'selected'`,
    [Number(articleId)],
  );
  if (Number(selected[0]?.c) > 0) {
    return {
      refundedCount: 0,
      results: [],
      schemaReady: true,
      skippedReason: "has_selected_freelancer",
    };
  }

  // Refundable: charged + not refunded + application still pending (pre-cancel).
  const { rows } = await client.query(
    `SELECT e.*
       FROM marketplace_article_application_bid_credit_economics e
       JOIN marketplace_article_applications a ON a.id = e.article_application_id
      WHERE e.article_id = $1
        AND e.charge_status = 'charged'
        AND e.refund_status = 'none'
        AND a.status = 'pending'
      ORDER BY e.id ASC
      FOR UPDATE OF e`,
    [Number(articleId)],
  );

  const results = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const out = await refundSingleArticleApplicationBidEconomics({
      client,
      economicsRow: row,
      reason: "article_ended_without_selection",
      actorUserId,
      now,
    });
    results.push(out);
  }

  return {
    refundedCount: results.filter((r) => r.refunded).length,
    results,
    schemaReady: true,
  };
}

module.exports = {
  articleApplicationBidEconomicsSchemaReady,
  clearArticleApplicationBidEconomicsSchemaCache,
  assertArticleBidEconomyActive,
  mapEconomicsRow,
  quoteArticleApplicationBidCost,
  chargeArticleApplicationBidCredit,
  refundSingleArticleApplicationBidEconomics,
  refundNoSelectionArticleApplications,
  findEconomicsByApplicationId,
  ARTICLE_APPLICATION_BID_COST,
};
