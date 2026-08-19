/**
 * Phase E2 — Article final approval settlement + Starter pending release + Bildazo outbox.
 */

const { createAppError } = require("../utils/AppError");
const {
  ARTICLE_E2_ERROR_CODES,
  ARTICLE_DESTINATION_BILDAZO,
  STARTER_PENDING_EARNINGS_RELEASE_TRIGGER,
} = require("../constants/marketplaceArticleEconomy");
const {
  assertCampaignBudgetCanFundGross,
  canFundAnotherEligibleArticle,
  millisToJodString,
  parseJodToMillis,
} = require("../utils/marketplaceArticleMoney");
const reservationService = require("./marketplaceBidCreditReservationService");
const economyService = require("./marketplaceArticleEconomyService");
const notificationService = require("./notificationService");
const submissionsService = require("./marketplaceArticleSubmissionsService");

async function enqueueBildazoPublish({ client, settlement, article, application }) {
  const key = `bildazo_publish:settlement:${settlement.id}`;
  const { rows } = await client.query(
    `INSERT INTO marketplace_article_bildazo_outbox (
       settlement_id, article_id, article_application_id, status,
       payload, idempotency_key
     ) VALUES ($1,$2,$3,'pending',$4::jsonb,$5)
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [
      settlement.id,
      article.id,
      application.id,
      JSON.stringify({
        settlementId: Number(settlement.id),
        articleId: Number(article.id),
        applicationId: Number(application.id),
        title: article.title,
        destination: article.destination || ARTICLE_DESTINATION_BILDAZO,
        writerUserId: Number(application.freelancer_user_id),
        grossJod: settlement.gross_jod,
      }),
      key,
    ],
  );
  return rows[0];
}

/**
 * Atomic final approval:
 * lock campaign → verify capacity/budget → consume reservation → settle → counters → outbox
 */
async function finalizeArticleApproval({
  client,
  articleApplicationId,
  actorUserId = null,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("finalizeArticleApproval requires a transaction client.", 500);
  }
  const appId = Number(articleApplicationId);
  const { rows: appRows } = await client.query(
    `SELECT * FROM marketplace_article_applications WHERE id = $1 FOR UPDATE`,
    [appId],
  );
  const application = appRows[0];
  if (!application) {
    throw createAppError("Article application not found.", 404, {
      exposeToClient: true,
      publicCode: "ARTICLE_APPLICATION_NOT_FOUND",
    });
  }

  const existingSettlement = await client.query(
    `SELECT * FROM marketplace_article_settlements WHERE article_application_id = $1`,
    [appId],
  );
  if (existingSettlement.rows[0]) {
    return {
      settlement: existingSettlement.rows[0],
      idempotent: true,
      alreadySettled: true,
    };
  }

  await submissionsService.assertSubmittedManuscriptForApproval({
    applicationId: appId,
    client,
  });

  if (String(application.status) === "approved") {
    throw createAppError("Application already approved without settlement row.", 409, {
      exposeToClient: false,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_SETTLEMENT_ALREADY_EXISTS,
    });
  }

  const snapshot =
    application.economic_snapshot && typeof application.economic_snapshot === "object"
      ? application.economic_snapshot
      : typeof application.economic_snapshot === "string"
        ? JSON.parse(application.economic_snapshot)
        : null;
  if (!snapshot || !snapshot.grossJod) {
    throw createAppError("Economic snapshot is required before final approval.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_SNAPSHOT_REQUIRED,
    });
  }

  const { rows: articleRows } = await client.query(
    `SELECT * FROM marketplace_articles WHERE id = $1 FOR UPDATE`,
    [application.article_id],
  );
  const article = articleRows[0];
  if (!article) {
    throw createAppError("Article campaign not found.", 404);
  }

  if (Number(article.accepted_article_count) >= Number(article.target_article_count)) {
    throw createAppError("Campaign target article count exhausted.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_CAMPAIGN_TARGET_EXHAUSTED,
    });
  }

  assertCampaignBudgetCanFundGross({
    budgetTotalJod: article.budget_total_jod,
    budgetSpentJod: article.budget_spent_jod,
    grossJod: snapshot.grossJod,
  });

  if (!application.bid_reservation_id) {
    throw createAppError("Active Bid reservation required for final approval.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_BID_RESERVATION_REQUIRED,
    });
  }

  const consume = await reservationService.consumeBidCreditReservation({
    client,
    reservationId: application.bid_reservation_id,
    now,
    actorUserId,
  });

  const writerMode = snapshot.writerEarningsMode === "pending" ? "pending" : "available";
  const settleKey = `article_settle:app:${appId}`;
  const { rows: settleRows } = await client.query(
    `INSERT INTO marketplace_article_settlements (
       article_id, article_application_id, freelancer_user_id, reviewer_user_id,
       membership_tier_code, gross_jod, company_share_percent, company_share_jod,
       reviewer_fee_jod, writer_net_jod, writer_earnings_mode,
       bid_reservation_id, bid_consumed, economic_snapshot,
       settled_at, settled_by_user_id, idempotency_key
     ) VALUES (
       $1,$2,$3,$4,
       $5,$6::numeric,$7::numeric,$8::numeric,
       $9::numeric,$10::numeric,$11,
       $12,$13,$14::jsonb,
       $15,$16,$17
     )
     ON CONFLICT (article_application_id) DO NOTHING
     RETURNING *`,
    [
      article.id,
      appId,
      application.freelancer_user_id,
      article.reviewer_user_id,
      String(snapshot.membershipTierCode || "unknown"),
      snapshot.grossJod,
      snapshot.companySharePercent,
      snapshot.companyShareJod,
      snapshot.reviewerFeeJod,
      snapshot.writerNetJod,
      writerMode,
      application.bid_reservation_id,
      consume.amount || 0,
      JSON.stringify(snapshot),
      new Date(now).toISOString(),
      actorUserId,
      settleKey,
    ],
  );

  let settlement = settleRows[0];
  if (!settlement) {
    const again = await client.query(
      `SELECT * FROM marketplace_article_settlements WHERE article_application_id = $1`,
      [appId],
    );
    settlement = again.rows[0];
    return { settlement, idempotent: true, alreadySettled: true };
  }

  const entries = [
    {
      type: writerMode === "pending" ? "writer_starter_pending" : "writer_available",
      userId: application.freelancer_user_id,
      amount: snapshot.writerNetJod,
      status: writerMode === "pending" ? "pending" : "posted",
      key: `article_fin:writer:${appId}`,
    },
    {
      type: "reviewer",
      userId: article.reviewer_user_id,
      amount: snapshot.reviewerFeeJod,
      status: "posted",
      key: `article_fin:reviewer:${appId}`,
    },
    {
      type: "company",
      userId: null,
      amount: snapshot.companyShareJod,
      status: "posted",
      key: `article_fin:company:${appId}`,
    },
  ];
  for (const e of entries) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO marketplace_article_financial_entries (
         settlement_id, article_id, article_application_id, entry_type,
         beneficiary_user_id, amount_jod, status, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6::numeric,$7,$8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        settlement.id,
        article.id,
        appId,
        e.type,
        e.userId,
        e.amount,
        e.status,
        e.key,
      ],
    );
  }

  const spentAfter = millisToJodString(
    parseJodToMillis(article.budget_spent_jod) + parseJodToMillis(snapshot.grossJod),
  );
  const acceptedAfter = Number(article.accepted_article_count) + 1;
  const economy = await economyService.getArticleEconomyConfig(client);
  let eligible = article.eligible_tier_codes;
  if (typeof eligible === "string") {
    try {
      eligible = JSON.parse(eligible);
    } catch {
      eligible = ["starter", "silver", "pro", "elite"];
    }
  }
  const canFundMore = canFundAnotherEligibleArticle({
    budgetTotalJod: article.budget_total_jod,
    budgetSpentJod: spentAfter,
    eligibleTier: eligible,
    economy,
  });
  const targetReached = acceptedAfter >= Number(article.target_article_count);
  let stopReason = null;
  let nextStatus = article.status;
  if (targetReached) {
    stopReason = "target_reached";
    nextStatus = "closed";
  } else if (!canFundMore) {
    stopReason = "budget_exhausted";
    nextStatus = "closed";
  }

  await client.query(
    `UPDATE marketplace_articles
        SET accepted_article_count = $2,
            budget_spent_jod = $3::numeric,
            campaign_stop_reason = COALESCE($4, campaign_stop_reason),
            status = CASE WHEN $5 = 'closed' THEN 'closed' ELSE status END,
            closed_at = CASE WHEN $5 = 'closed' THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
            updated_at = NOW()
      WHERE id = $1`,
    [article.id, acceptedAfter, spentAfter, stopReason, nextStatus],
  );

  await client.query(
    `UPDATE marketplace_article_applications
        SET status = 'approved',
            approved_at = $2,
            updated_at = NOW()
      WHERE id = $1`,
    [appId, new Date(now).toISOString()],
  );

  await submissionsService.markSubmissionApproved({
    applicationId: appId,
    actorUserId,
    now,
    client,
  });

  const outbox = await enqueueBildazoPublish({
    client,
    settlement,
    article,
    application,
  });

  try {
    await notificationService.createIfNotExists(
      {
        recipientUserId: application.freelancer_user_id,
        recipientRole: "freelancer",
        type: "article_final_approved",
        title: "تم اعتماد مقالك",
        message: "تم اعتماد المقال وتسوية الأرباح وفق عضويتك.",
        entityType: "marketplace_article_application",
        entityId: appId,
        metadata: {
          settlementId: Number(settlement.id),
          writerNetJod: snapshot.writerNetJod,
          writerEarningsMode: writerMode,
        },
      },
      `article_final_approved:${appId}`,
      client,
    );
  } catch {
    /* notifications non-fatal */
  }

  if (stopReason) {
    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: actorUserId,
          recipientRole: "super_admin",
          type: "article_campaign_auto_stopped",
          title: "Article campaign auto-stopped",
          message: `Campaign ${article.id} stopped: ${stopReason}`,
          entityType: "marketplace_article",
          entityId: article.id,
        },
        `article_campaign_auto_stopped:${article.id}:${stopReason}`,
        client,
      );
    } catch {
      /* ignore */
    }
  }

  return {
    settlement,
    idempotent: false,
    bidConsume: consume,
    outbox,
    campaign: {
      acceptedArticleCount: acceptedAfter,
      budgetSpentJod: spentAfter,
      stopReason,
      autoStopped: Boolean(stopReason),
    },
    writerEarningsMode: writerMode,
  };
}

/**
 * Release Starter pending Article earnings when paid membership activates.
 * Trigger: PAID_MEMBERSHIP_ACTIVATION (not payment alone).
 */
async function releaseStarterPendingArticleEarnings({
  client,
  freelancerUserId,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("releaseStarterPendingArticleEarnings requires client.", 500);
  }
  const fid = Number(freelancerUserId);
  const { rows } = await client.query(
    `SELECT * FROM marketplace_article_financial_entries
      WHERE beneficiary_user_id = $1
        AND entry_type = 'writer_starter_pending'
        AND status = 'pending'
      FOR UPDATE`,
    [fid],
  );
  const released = [];
  for (const row of rows) {
    const releaseKey = `starter_pending_release:entry:${row.id}`;
    // eslint-disable-next-line no-await-in-loop
    const { rows: upd } = await client.query(
      `UPDATE marketplace_article_financial_entries
          SET status = 'released',
              entry_type = 'writer_available',
              released_at = $2,
              release_idempotency_key = $3,
              updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
        WHERE id = $1 AND status = 'pending'
        RETURNING *`,
      [
        row.id,
        new Date(now).toISOString(),
        releaseKey,
        JSON.stringify({
          trigger: STARTER_PENDING_EARNINGS_RELEASE_TRIGGER,
          releasedAt: new Date(now).toISOString(),
        }),
      ],
    );
    if (upd[0]) released.push(upd[0]);
  }
  return {
    releasedCount: released.length,
    released,
    trigger: STARTER_PENDING_EARNINGS_RELEASE_TRIGGER,
  };
}

module.exports = {
  finalizeArticleApproval,
  releaseStarterPendingArticleEarnings,
  enqueueBildazoPublish,
};
