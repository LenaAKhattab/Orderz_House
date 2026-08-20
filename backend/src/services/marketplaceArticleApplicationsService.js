/**
 * Phase B5/E2 — Marketplace Article Applications.
 *
 * Dedicated domain (NOT order_freelancer_bids / Priority Boost / Fair / Elite).
 * Membership gate: plan.article_access_level >= article.article_level.
 * E2 Bid economics: RESERVE on submit; CONSUME on final approval (not immediate B5 charge).
 * Fail-closed: requires article_applications_enabled AND bid_credits_enabled.
 * Work Tokens: CANCELLED — no runtime.
 * Selection: Super Admin explicit select/reject (no automatic winner).
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isArticleApplicationsEngineActive,
} = require("./marketplaceEconomySettingsService");
const {
  ARTICLE_APPLICATION_ERROR_CODES,
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
  ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
  ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
  ARTICLE_APPLICATION_NO_SELECTION_REFUND,
  ARTICLE_APPLICATION_REJECTION_REFUND,
  ARTICLE_PRIORITY_BOOST,
  ARTICLE_FAIR_DISTRIBUTION,
  ARTICLE_WORK_TOKEN_ENTRY,
  ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
  buildArticleApplicationIdempotencyKey,
} = require("../constants/marketplaceArticleApplications");
const {
  OLD_ARTICLE_APPLICATION_IMMEDIATE_BID_CHARGE,
  ARTICLE_APPLICATION_BID_BEHAVIOR,
  ARTICLE_E2_ERROR_CODES,
} = require("../constants/marketplaceArticleEconomy");
const {
  articleApplicationsSchemaReady,
  clearArticleApplicationsSchemaCache,
} = require("../utils/marketplaceArticleApplicationsSchema");
const {
  resolveCurrentMarketplaceMembershipForFreelancer,
} = require("./marketplaceMembershipsService");
const { isBenefitUsableStatus } = require("../constants/marketplaceMemberships");
const reservationService = require("./marketplaceBidCreditReservationService");
const {
  assertBildazoAuthorLinkedForArticleApply,
  getBildazoLinkStatusForEligibility,
} = require("./bildazoAuthorLinkService");
const economyService = require("./marketplaceArticleEconomyService");
const settlementService = require("./marketplaceArticleSettlementService");
const articlePublishService = require("./bildazoArticlePublishService");
const submissionsService = require("./marketplaceArticleSubmissionsService");
const eligibility = require("./marketplaceMembershipEligibilityService");
const marketplaceMembershipCyclesService = require("./marketplaceMembershipCyclesService");
const notificationService = require("./notificationService");
const articleBidEconomics = require("./marketplaceArticleApplicationBidCreditService");

function toIdString(value) {
  if (value == null) return null;
  return String(value);
}

function attachActivationBudgetAdminFields(mapped, row) {
  if (!mapped) return mapped;
  const campaignService = require("./freelancerActivationCampaignService");
  mapped.activationBudgetState = campaignService.deriveActivationBudgetState(row);
  mapped.activationBudgetAmountJod =
    row.activation_budget_amount_jod != null ? String(row.activation_budget_amount_jod) : null;
  mapped.activationBudgetReservedAt = row.activation_budget_reserved_at || null;
  mapped.activationBudgetReleasedAt = row.activation_budget_released_at || null;
  mapped.activationBudgetUsedAt = row.activation_budget_used_at || null;
  return mapped;
}

function mapApplicationRow(row) {
  if (!row) return null;
  return {
    id: toIdString(row.id),
    articleId: toIdString(row.article_id),
    freelancerUserId: toIdString(row.freelancer_user_id),
    membershipId: toIdString(row.membership_id),
    cycleId: row.cycle_id != null ? toIdString(row.cycle_id) : null,
    articleLevelSnapshot: Number(row.article_level_snapshot),
    articleValueJodSnapshot:
      row.article_value_jod_snapshot != null ? Number(row.article_value_jod_snapshot) : null,
    requiredWordCountSnapshot: Number(row.required_word_count_snapshot),
    requiredReferencesCountSnapshot: Number(row.required_references_count_snapshot) || 0,
    membershipArticleAccessLevelSnapshot: Number(row.membership_article_access_level_snapshot),
    status: row.status,
    proposalMessage: row.proposal_message || null,
    submittedAt: row.submitted_at || null,
    withdrawnAt: row.withdrawn_at || null,
    selectedAt: row.selected_at || null,
    rejectedAt: row.rejected_at || null,
    cancelledAt: row.cancelled_at || null,
    approvedAt: row.approved_at || null,
    assignedAt: row.assigned_at || null,
    selectedByUserId: row.selected_by_user_id != null ? toIdString(row.selected_by_user_id) : null,
    rejectedByUserId: row.rejected_by_user_id != null ? toIdString(row.rejected_by_user_id) : null,
    idempotencyKey: row.idempotency_key || null,
    collectionRoundId: row.collection_round_id != null ? toIdString(row.collection_round_id) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    // Joined optional fields
    freelancerEmail: row.freelancer_email || null,
    freelancerAccountId: row.freelancer_account_id || null,
    freelancerFirstName: row.freelancer_first_name || null,
    freelancerFamilyName: row.freelancer_family_name || null,
    activationCampaignId: row.activation_campaign_id != null ? toIdString(row.activation_campaign_id) : null,
    activationWaveId: row.activation_wave_id != null ? toIdString(row.activation_wave_id) : null,
    articleTitle: row.article_title || null,
    articleStatus: row.article_status || null,
    // Safe economic status only (no ledger/grant IDs in UI payloads)
    bidEconomics: row._bid_economics
      ? {
          chargeStatus: row._bid_economics.chargeStatus,
          refundStatus: row._bid_economics.refundStatus,
          refundMode: row._bid_economics.refundMode,
          bidCreditCost: row._bid_economics.bidCreditCost,
        }
      : row.econ_charge_status
        ? {
            chargeStatus: row.econ_charge_status,
            refundStatus: row.econ_refund_status || "none",
            refundMode: row.econ_refund_mode || null,
            bidCreditCost: Number(row.econ_bid_credit_cost) || ARTICLE_APPLICATION_BID_COST,
          }
        : null,
  };
}

async function assertSchemaAndEngine(client = pool) {
  if (!(await articleApplicationsSchemaReady(client))) {
    throw createAppError("Article applications schema is not ready.", 503, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATIONS_SCHEMA_NOT_READY,
    });
  }
  const settings = await getMarketplaceEconomySettings(client);
  if (!isArticleApplicationsEngineActive(settings)) {
    throw createAppError("Article applications engine is not enabled.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATIONS_ENGINE_OFF,
    });
  }
}

async function countApplicationsForArticle(articleId, client = pool) {
  if (!(await articleApplicationsSchemaReady(client))) return 0;
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c FROM marketplace_article_applications WHERE article_id = $1`,
    [Number(articleId)],
  );
  return Number(rows[0]?.c) || 0;
}

async function articleHasApplications(articleId, client = pool) {
  return (await countApplicationsForArticle(articleId, client)) > 0;
}

/**
 * After first application: freeze assignment-defining Article requirements
 * when the patch would change them.
 */
async function assertArticleMetadataMutable(articleId, patch, existingArticle = null, client = pool) {
  const hasApps = await articleHasApplications(articleId, client);
  if (!hasApps) return;

  let existing = existingArticle;
  if (!existing) {
    const { rows } = await client.query(
      `SELECT article_level, article_value_jod, required_word_count, required_references_count
         FROM marketplace_articles WHERE id = $1`,
      [Number(articleId)],
    );
    existing = rows[0]
      ? {
          articleLevel: Number(rows[0].article_level),
          articleValueJod: Number(rows[0].article_value_jod),
          requiredWordCount: Number(rows[0].required_word_count),
          requiredReferencesCount: Number(rows[0].required_references_count) || 0,
        }
      : null;
  }
  if (!existing) return;

  const frozenKeys = [];
  if (patch.articleLevel !== undefined || patch.article_level !== undefined) {
    const next = Number(patch.articleLevel ?? patch.article_level);
    if (next !== Number(existing.articleLevel)) frozenKeys.push("article_level");
  }
  if (patch.articleValueJod !== undefined || patch.article_value_jod !== undefined) {
    const next = Number(patch.articleValueJod ?? patch.article_value_jod);
    if (Number.isFinite(next) && next !== Number(existing.articleValueJod)) {
      frozenKeys.push("article_value_jod");
    }
  }
  if (patch.requiredWordCount !== undefined || patch.required_word_count !== undefined) {
    const next = Number(patch.requiredWordCount ?? patch.required_word_count);
    if (next !== Number(existing.requiredWordCount)) frozenKeys.push("required_word_count");
  }
  if (
    patch.requiredReferencesCount !== undefined ||
    patch.required_references_count !== undefined
  ) {
    const next = Number(patch.requiredReferencesCount ?? patch.required_references_count);
    if (next !== Number(existing.requiredReferencesCount)) {
      frozenKeys.push("required_references_count");
    }
  }
  if (patch.requiredBidCount !== undefined || patch.required_bid_count !== undefined) {
    const next = Number(patch.requiredBidCount ?? patch.required_bid_count);
    if (existing.requiredBidCount != null && next !== Number(existing.requiredBidCount)) {
      frozenKeys.push("required_bid_count");
    }
  }
  if (frozenKeys.length) {
    throw createAppError(
      "Article assignment metadata is frozen after the first application.",
      409,
      {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_METADATA_FROZEN,
        details: { frozenKeys },
      },
    );
  }
}

async function releaseApplicationReservation(client, applicationRow, reason, now = new Date()) {
  const reservationId =
    applicationRow.bid_reservation_id != null ? Number(applicationRow.bid_reservation_id) : null;
  if (!reservationId) return null;
  try {
    return await reservationService.releaseBidCreditReservation({
      client,
      reservationId,
      reason,
      now,
      restoreDailyLimit: true,
    });
  } catch (err) {
    if (err?.publicCode === "BID_RESERVATION_ALREADY_CONSUMED") throw err;
    if (err?.publicCode === "BID_RESERVATION_NOT_FOUND") return null;
    // Idempotent release already done
    if (err?.publicCode === "ARTICLE_RESERVATION_NOT_ACTIVE") return null;
    throw err;
  }
}

async function consumeApplicationReservation(client, applicationRow, reason, now = new Date(), actorUserId = null) {
  const reservationId =
    applicationRow.bid_reservation_id != null ? Number(applicationRow.bid_reservation_id) : null;
  if (!reservationId) return null;
  try {
    return await reservationService.consumeBidCreditReservation({
      client,
      reservationId,
      reason,
      now,
      actorUserId,
    });
  } catch (err) {
    if (err?.publicCode === "BID_RESERVATION_ALREADY_CONSUMED") {
      return { idempotent: true, consumed: false };
    }
    if (err?.publicCode === "BID_RESERVATION_NOT_FOUND") return null;
    if (err?.publicCode === "ARTICLE_RESERVATION_NOT_ACTIVE") return null;
    throw err;
  }
}

/**
 * Phase A10 — apply Bid outcome policy (consume vs release) without changing FEFO.
 */
async function settleApplicationReservationByPolicy(
  client,
  applicationRow,
  opportunity,
  event,
  { now = new Date(), actorUserId = null } = {},
) {
  const bidOutcomePolicy = require("../constants/marketplaceBidApplicationOutcomePolicy");
  const decision = bidOutcomePolicy.decideBidReservationOutcome(opportunity, event);
  if (decision.action === "consume") {
    const result = await consumeApplicationReservation(
      client,
      applicationRow,
      decision.reason,
      now,
      actorUserId,
    );
    return { ...decision, result, bidRefunded: 0 };
  }
  const result = await releaseApplicationReservation(
    client,
    applicationRow,
    decision.reason,
    now,
  );
  return { ...decision, result, bidRefunded: result ? 1 : 0 };
}

async function cancelPendingApplicationsForArticle(articleId, client) {
  if (!(await articleApplicationsSchemaReady(client))) return 0;
  const { rows: pending } = await client.query(
    `SELECT * FROM marketplace_article_applications
      WHERE article_id = $1 AND status = 'pending'
      FOR UPDATE`,
    [Number(articleId)],
  );
  let article = null;
  try {
    const { rows } = await client.query(`SELECT * FROM marketplace_articles WHERE id = $1`, [
      Number(articleId),
    ]);
    article = rows[0] || null;
  } catch {
    article = null;
  }
  for (const app of pending) {
    // eslint-disable-next-line no-await-in-loop
    await settleApplicationReservationByPolicy(client, app, article || {}, "article_cancelled", {
      now: new Date(),
    });
  }
  const { rowCount } = await client.query(
    `UPDATE marketplace_article_applications
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
      WHERE article_id = $1
        AND status = 'pending'`,
    [Number(articleId)],
  );
  return rowCount || 0;
}

async function cancelAssignedApplicationsForCancelledArticle(articleId, client) {
  if (!(await articleApplicationsSchemaReady(client))) return 0;
  const { rows: assigned } = await client.query(
    `SELECT * FROM marketplace_article_applications
      WHERE article_id = $1
        AND status IN ('selected', 'revision_requested')
      FOR UPDATE`,
    [Number(articleId)],
  );
  const campaignService = require("./freelancerActivationCampaignService");
  for (const app of assigned) {
    const article = { id: articleId, activation_campaign_id: app.activation_campaign_id, activation_wave_id: app.activation_wave_id };
    // eslint-disable-next-line no-await-in-loop
    await campaignService.releaseActivationBudgetIfReserved({
      client,
      article,
      application: app,
      reason: "article_cancelled",
    });
    // eslint-disable-next-line no-await-in-loop
    await settleApplicationReservationByPolicy(client, app, article || {}, "article_cancelled", {
      now: new Date(),
    });
  }
  const { rowCount } = await client.query(
    `UPDATE marketplace_article_applications
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
      WHERE article_id = $1
        AND status IN ('selected', 'revision_requested')`,
    [Number(articleId)],
  );
  return rowCount || 0;
}

async function loadArticleForUpdate(client, articleId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_articles WHERE id = $1 FOR UPDATE`,
    [Number(articleId)],
  );
  return rows[0] || null;
}

function assertArticleOpenForApplications(articleRow) {
  if (!articleRow) {
    throw createAppError("Article not found.", 404, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_NOT_FOUND,
    });
  }
  if (articleRow.is_fake_or_training === true || articleRow.is_fake_or_training === "t") {
    throw createAppError("Fake/training Articles cannot accept applications.", 403, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_FAKE_TRAINING_FORBIDDEN,
    });
  }
  if (String(articleRow.status) !== "published") {
    throw createAppError("Article is not open for applications.", 409, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_NOT_OPEN_FOR_APPLICATIONS,
    });
  }
}

async function resolveUsableMembershipContext(client, freelancerUserId) {
  const { rows: userRows } = await client.query(
    `SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
    [Number(freelancerUserId)],
  );
  const user = userRows[0];
  if (!user || user.role !== "freelancer" || user.is_active !== true) {
    throw createAppError("Freelancer not found or inactive.", 403, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_NO_USABLE_MEMBERSHIP,
    });
  }

  const membership = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, {
    client,
  });
  if (!membership || !isBenefitUsableStatus(membership.status)) {
    throw createAppError("No usable Marketplace Membership.", 403, {
      exposeToClient: true,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_NO_USABLE_MEMBERSHIP,
    });
  }

  const accessLevel = Number(membership.plan?.articleAccessLevel) || 1;
  const cycle = await marketplaceMembershipCyclesService.getCurrentActiveCycle(membership.id, {
    client,
  });

  return {
    membership,
    accessLevel,
    cycleId: cycle?.id != null ? Number(cycle.id) : null,
  };
}

function assertMembershipAccessLevel(accessLevel, articleLevel) {
  if (!(Number(accessLevel) >= Number(articleLevel))) {
    throw createAppError(
      `Membership Article access level ${accessLevel} is insufficient for Article level ${articleLevel}.`,
      403,
      {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_ACCESS_LEVEL_INSUFFICIENT,
        details: {
          membershipArticleAccessLevel: Number(accessLevel),
          articleLevel: Number(articleLevel),
        },
      },
    );
  }
}

async function findApplicationByArticleFreelancer(client, articleId, freelancerUserId, collectionRoundId) {
  if (collectionRoundId != null) {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_article_applications
        WHERE article_id = $1 AND freelancer_user_id = $2 AND collection_round_id = $3
        LIMIT 1`,
      [Number(articleId), Number(freelancerUserId), Number(collectionRoundId)],
    );
    return rows[0] || null;
  }
  const { rows } = await client.query(
    `SELECT * FROM marketplace_article_applications
      WHERE article_id = $1 AND freelancer_user_id = $2
      ORDER BY id DESC
      LIMIT 1`,
    [Number(articleId), Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function getApplicationById(applicationId, { forAdmin = false } = {}) {
  const id = Number(applicationId);
  if (!Number.isInteger(id) || id < 1) return null;
  const join = forAdmin
    ? `LEFT JOIN users u ON u.id = a.freelancer_user_id
       LEFT JOIN marketplace_articles art ON art.id = a.article_id`
    : "";
  const select = forAdmin
    ? `a.*,
       u.email AS freelancer_email,
       u.account_id AS freelancer_account_id,
       u.first_name AS freelancer_first_name,
       u.family_name AS freelancer_family_name,
       art.title AS article_title,
       art.status AS article_status`
    : `a.*`;
  const { rows } = await pool.query(
    `SELECT ${select}
       FROM marketplace_article_applications a
       ${join}
      WHERE a.id = $1
      LIMIT 1`,
    [id],
  );
  const mapped = mapApplicationRow(rows[0]);
  if (!mapped) return null;
  if (forAdmin) attachActivationBudgetAdminFields(mapped, rows[0]);
  const record = await articlePublishService.getPublishRecordForApplication(id);
  mapped.bildazoPublish = forAdmin
    ? articlePublishService.mapAdminPublishRecord(record)
    : articlePublishService.mapPublicPublishRecord(record);
  const submission = await submissionsService.getSubmissionByApplicationId(id);
  mapped.articleSubmission = submissionsService.mapSubmissionRow(submission, { forAdmin });
  return mapped;
}

async function submitArticleApplication({
  articleId,
  freelancerUserId,
  proposalMessage = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  await assertSchemaAndEngine(externalClient || pool);

  const aid = Number(articleId);
  const fid = Number(freelancerUserId);
  if (!Number.isInteger(aid) || aid < 1 || !Number.isInteger(fid) || fid < 1) {
    throw createAppError("Invalid article or freelancer.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_INPUT",
    });
  }

  const message =
    proposalMessage == null || proposalMessage === ""
      ? null
      : String(proposalMessage).trim().slice(0, 5000);

  // Flag-off: no-op. Flag-on: require status=linked before any Bid reservation.
  await assertBildazoAuthorLinkedForArticleApply(fid);

  const ownClient = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (ownClient) await client.query("BEGIN");

    // Fail-closed: Bid economy required (no free Article applications).
    await articleBidEconomics.assertArticleBidEconomyActive(client);

    const article = await loadArticleForUpdate(client, aid);
    assertArticleOpenForApplications(article);
    const collectionService = require("./opportunityBidCollectionService");
    const round = await collectionService.assertArticleIntakeOpen(client, article);

    const activationEngine = require("./freelancerActivationEngineService");
    await activationEngine.assertTrialEligibleForMiniArticleApply({
      client,
      freelancerUserId: fid,
      now,
      surface: "mini_article",
      ignoreUsageLimits: true,
    });

    const { membership, accessLevel, cycleId } = await resolveUsableMembershipContext(client, fid);
    assertMembershipAccessLevel(accessLevel, article.article_level);

    const existing = await findApplicationByArticleFreelancer(client, aid, fid, round?.id);
    if (existing) {
      // Idempotent retry: return existing without additional Bid charge.
      if (ownClient) await client.query("COMMIT");
      return {
        application: mapApplicationRow(existing),
        created: false,
        duplicatePrevented: true,
        approvedBidCost: ARTICLE_APPLICATION_BID_COST,
        bidCreditConsumed: 0,
        workTokenConsumed: 0,
        economicsRuntime: ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
        priorityBoost: ARTICLE_PRIORITY_BOOST,
        fairDistribution: ARTICLE_FAIR_DISTRIBUTION,
        workTokenEntry: ARTICLE_WORK_TOKEN_ENTRY,
        activeWorkTokenRuntime: ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
        editAdditionalBidCost: ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
        withdrawalRefundPolicy: ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
        noSelectionRefundPolicy: ARTICLE_APPLICATION_NO_SELECTION_REFUND,
      };
    }

    await activationEngine.assertTrialEligibleForMiniArticleApply({
      client,
      freelancerUserId: fid,
      now,
      surface: "mini_article",
      ignoreUsageLimits: false,
    });

    const campaignService = require("./freelancerActivationCampaignService");
    await campaignService.assertActivationOpportunityOpen({ article, now, client });

    const idem = buildArticleApplicationIdempotencyKey(aid, fid, round?.id);
    let inserted;
    const activationCampaignId =
      article.activation_campaign_id != null ? Number(article.activation_campaign_id) : null;
    const activationWaveId =
      article.activation_wave_id != null ? Number(article.activation_wave_id) : null;
    const insertParams = [
      aid,
      fid,
      Number(membership.id),
      cycleId,
      Number(article.article_level),
      article.article_value_jod,
      Number(article.required_word_count),
      Number(article.required_references_count) || 0,
      accessLevel,
      message,
      idem,
      round?.id || null,
      activationCampaignId,
      activationWaveId,
    ];
    try {
      const { rows } = await client.query(
        `INSERT INTO marketplace_article_applications (
           article_id, freelancer_user_id, membership_id, cycle_id,
           article_level_snapshot, article_value_jod_snapshot,
           required_word_count_snapshot, required_references_count_snapshot,
           membership_article_access_level_snapshot,
           status, proposal_message, idempotency_key, collection_round_id,
           activation_campaign_id, activation_wave_id
         ) VALUES (
           $1,$2,$3,$4,
           $5,$6::numeric,
           $7,$8,
           $9,
           'pending',$10,$11,$12,$13,$14
         )
         RETURNING *`,
        insertParams,
      );
      inserted = rows[0];
    } catch (err) {
      if (err?.code === "42703") {
        try {
          const { rows } = await client.query(
            `INSERT INTO marketplace_article_applications (
               article_id, freelancer_user_id, membership_id, cycle_id,
               article_level_snapshot, article_value_jod_snapshot,
               required_word_count_snapshot, required_references_count_snapshot,
               membership_article_access_level_snapshot,
               status, proposal_message, idempotency_key, collection_round_id
             ) VALUES (
               $1,$2,$3,$4,
               $5,$6::numeric,
               $7,$8,
               $9,
               'pending',$10,$11,$12
             )
             RETURNING *`,
            insertParams.slice(0, 12),
          );
          inserted = rows[0];
        } catch (inner) {
          if (inner?.code !== "42703") throw inner;
          const { rows } = await client.query(
            `INSERT INTO marketplace_article_applications (
               article_id, freelancer_user_id, membership_id, cycle_id,
               article_level_snapshot, article_value_jod_snapshot,
               required_word_count_snapshot, required_references_count_snapshot,
               membership_article_access_level_snapshot,
               status, proposal_message, idempotency_key
             ) VALUES (
               $1,$2,$3,$4,
               $5,$6::numeric,
               $7,$8,
               $9,
               'pending',$10,$11
             )
             RETURNING *`,
            insertParams.slice(0, 11),
          );
          inserted = rows[0];
        }
      } else if (err && (err.code === "23505" || /unique/i.test(String(err.message || "")))) {
        const raced = await findApplicationByArticleFreelancer(client, aid, fid, round?.id);
        if (raced) {
          if (ownClient) await client.query("COMMIT");
          return {
            application: mapApplicationRow(raced),
            created: false,
            duplicatePrevented: true,
            approvedBidCost: ARTICLE_APPLICATION_BID_COST,
            bidCreditConsumed: 0,
            workTokenConsumed: 0,
            economicsRuntime: ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
            priorityBoost: ARTICLE_PRIORITY_BOOST,
            fairDistribution: ARTICLE_FAIR_DISTRIBUTION,
            workTokenEntry: ARTICLE_WORK_TOKEN_ENTRY,
            activeWorkTokenRuntime: ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
            editAdditionalBidCost: ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
            withdrawalRefundPolicy: ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
            noSelectionRefundPolicy: ARTICLE_APPLICATION_NO_SELECTION_REFUND,
          };
        }
        throw err;
      } else {
        throw err;
      }
    }

    // E2: reserve Bids (not immediate B5 consume). Final approval consumes reservation.
    const economy = await economyService.getArticleEconomyConfig(client);
    const bidCost = economyService.resolveBidCostForCampaign(article, economy);
    await eligibility.assertMarketplaceVerificationComplete(client, fid);

    // Campaign gates: deadline / target / budget / eligible tiers
    if (article.application_deadline_at && new Date(article.application_deadline_at) <= new Date(now)) {
      throw createAppError("Article application deadline has passed.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_CAMPAIGN_DEADLINE_PASSED,
      });
    }
    if (
      article.target_article_count != null &&
      article.accepted_article_count != null &&
      Number(article.accepted_article_count) >= Number(article.target_article_count)
    ) {
      throw createAppError("Campaign target article count exhausted.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_CAMPAIGN_TARGET_EXHAUSTED,
      });
    }
    let eligibleTiers = article.eligible_tier_codes;
    if (typeof eligibleTiers === "string") {
      try {
        eligibleTiers = JSON.parse(eligibleTiers);
      } catch {
        eligibleTiers = null;
      }
    }
    const tierCode = String(membership.plan?.tierCode || "").toLowerCase();
    if (Array.isArray(eligibleTiers) && eligibleTiers.length && !eligibleTiers.map(String).map((t) => t.toLowerCase()).includes(tierCode)) {
      throw createAppError("Your membership plan is not eligible for this Article campaign.", 403, {
        exposeToClient: true,
        publicCode: ARTICLE_E2_ERROR_CODES.ARTICLE_CAMPAIGN_NOT_ELIGIBLE_TIER,
      });
    }

    const reserve = await reservationService.reserveBidCreditsFefo({
      client,
      freelancerUserId: fid,
      amount: bidCost,
      idempotencyKey: `article_app_reserve:${aid}:${fid}`.slice(0, 180),
      referenceType: "marketplace_article_application",
      referenceId: String(inserted.id),
      articleId: aid,
      articleApplicationId: Number(inserted.id),
      purpose: "article_application",
      actorUserId: fid,
      now,
      applyDailyLimit: true,
    });

    try {
      await client.query(
        `UPDATE marketplace_article_applications
            SET bid_reservation_id = $2, updated_at = NOW()
          WHERE id = $1`,
        [inserted.id, reserve.reservation.id],
      );
      inserted.bid_reservation_id = reserve.reservation.id;
    } catch (colErr) {
      if (colErr?.code !== "42703") throw colErr;
      // Pre-154 schema: reservation still held; column link optional.
    }

    await collectionService.onArticleApplicationSubmitted(client, {
      articleId: aid,
      applicationId: inserted.id,
      roundId: round?.id || inserted.collection_round_id || null,
      now,
    });

    try {
      await activationEngine.markTrialFirstBidIfNeeded(client, {
        freelancerUserId: fid,
        now,
      });
    } catch {
      /* trial counters must not fail Bid reserve */
    }

    if (ownClient) await client.query("COMMIT");

    let autoAssignment = null;
    try {
      const autoAssign = require("./freelancerActivationAutoAssignmentService");
      autoAssignment = await autoAssign.maybeTriggerAfterApplication({
        articleId: aid,
        applicationId: Number(inserted.id),
      });
    } catch {
      autoAssignment = { triggered: false, reason: "hook_error" };
    }

    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: fid,
          recipientRole: "freelancer",
          type: "article_application_submitted",
          title: "تم تقديم طلب المقال",
          message: "تم استلام طلبك وحجز العروض المطلوبة.",
          entityType: "marketplace_article_application",
          entityId: Number(inserted.id),
          link: `/dashboard/freelancer/articles/${aid}`,
          priority: "low",
          metadata: {
            articleId: aid,
            applicationId: Number(inserted.id),
            reservationId: reserve.reservation.id,
          },
        },
        `article_application_submitted:${inserted.id}`,
      );
    } catch {
      /* non-blocking */
    }

    return {
      application: mapApplicationRow(inserted),
      created: true,
      duplicatePrevented: false,
      approvedBidCost: bidCost,
      bidCreditConsumed: 0,
      bidCreditReserved: bidCost,
      bidBehavior: ARTICLE_APPLICATION_BID_BEHAVIOR,
      oldImmediateCharge: OLD_ARTICLE_APPLICATION_IMMEDIATE_BID_CHARGE,
      bidCredit: {
        consumed: false,
        reserved: true,
        cost: bidCost,
        reservationId: reserve.reservation.id,
        skipped: false,
        reason: null,
      },
      workTokenConsumed: 0,
      economicsRuntime: ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
      economics: null,
      reservation: reserve.reservation,
      priorityBoost: ARTICLE_PRIORITY_BOOST,
      fairDistribution: ARTICLE_FAIR_DISTRIBUTION,
      workTokenEntry: ARTICLE_WORK_TOKEN_ENTRY,
      activeWorkTokenRuntime: ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
      editAdditionalBidCost: ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
      withdrawalRefundPolicy: ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
      noSelectionRefundPolicy: ARTICLE_APPLICATION_NO_SELECTION_REFUND,
      autoAssignment,
    };
  } catch (err) {
    if (ownClient) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

async function editArticleApplication({
  applicationId,
  freelancerUserId,
  proposalMessage,
} = {}) {
  await assertSchemaAndEngine();
  const id = Number(applicationId);
  const fid = Number(freelancerUserId);
  const message =
    proposalMessage == null ? null : String(proposalMessage).trim().slice(0, 5000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM marketplace_article_applications WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = locked.rows[0];
    if (!row || Number(row.freelancer_user_id) !== fid) {
      throw createAppError("Application not found.", 404, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_FOUND,
      });
    }
    if (row.status !== "pending") {
      throw createAppError("Application is not editable.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_EDITABLE,
      });
    }
    const article = await loadArticleForUpdate(client, row.article_id);
    assertArticleOpenForApplications(article);

    const { rows: updated } = await client.query(
      `UPDATE marketplace_article_applications
          SET proposal_message = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, message],
    );
    await client.query("COMMIT");
    return {
      application: mapApplicationRow(updated[0]),
      additionalBidCost: ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
      bidCreditConsumed: 0,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function withdrawArticleApplication({ applicationId, freelancerUserId } = {}) {
  await assertSchemaAndEngine();
  const id = Number(applicationId);
  const fid = Number(freelancerUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM marketplace_article_applications WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = locked.rows[0];
    if (!row || Number(row.freelancer_user_id) !== fid) {
      throw createAppError("Application not found.", 404, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_FOUND,
      });
    }
    if (row.status === "withdrawn") {
      await client.query("COMMIT");
      return { application: mapApplicationRow(row), alreadyWithdrawn: true, bidRefunded: 0 };
    }
    if (row.status !== "pending") {
      throw createAppError("Application cannot be withdrawn in its current status.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_WITHDRAWABLE,
      });
    }
    const articleRow = await loadArticleForUpdate(client, row.article_id);
    await settleApplicationReservationByPolicy(client, row, articleRow || {}, "withdrawn", {
      now: new Date(),
      actorUserId: fid,
    });
    const { rows: updated } = await client.query(
      `UPDATE marketplace_article_applications
          SET status = 'withdrawn',
              withdrawn_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id],
    );
    await client.query("COMMIT");
    return {
      application: mapApplicationRow(updated[0]),
      alreadyWithdrawn: false,
      bidRefunded: 0,
      bidReservationReleased: false,
      bidReservationConsumed: true,
      withdrawalRefundPolicy: ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listMyArticleApplications(freelancerUserId, { limit = 50, offset = 0 } = {}) {
  if (!(await articleApplicationsSchemaReady())) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT a.*, art.title AS article_title, art.status AS article_status
       FROM marketplace_article_applications a
       JOIN marketplace_articles art ON art.id = a.article_id
      WHERE a.freelancer_user_id = $1
      ORDER BY a.submitted_at DESC, a.id DESC
      LIMIT $2 OFFSET $3`,
    [Number(freelancerUserId), lim, off],
  );
  return rows.map(mapApplicationRow);
}

async function getMyApplicationForArticle(articleId, freelancerUserId) {
  if (!(await articleApplicationsSchemaReady())) return null;
  const { rows: articleRows } = await pool.query(
    `SELECT current_bid_collection_round_id FROM marketplace_articles WHERE id = $1 LIMIT 1`,
    [Number(articleId)],
  );
  const roundId = articleRows[0]?.current_bid_collection_round_id || null;
  const row = await findApplicationByArticleFreelancer(pool, articleId, freelancerUserId, roundId);
  const mapped = mapApplicationRow(row);
  if (!mapped) return null;
  const record = await articlePublishService.getPublishRecordForApplication(mapped.id);
  mapped.bildazoPublish = articlePublishService.mapPublicPublishRecord(record);
  const submission = await submissionsService.getSubmissionByApplicationId(mapped.id);
  mapped.articleSubmission = submissionsService.mapSubmissionRow(submission);
  return mapped;
}

async function listApplicationsForArticleAdmin(articleId, { limit = 100, offset = 0 } = {}) {
  if (!(await articleApplicationsSchemaReady())) return [];
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const econReady = await articleBidEconomics.articleApplicationBidEconomicsSchemaReady();
  const econJoin = econReady
    ? `LEFT JOIN marketplace_article_application_bid_credit_economics e
         ON e.article_application_id = a.id`
    : "";
  const econSelect = econReady
    ? `, e.charge_status AS econ_charge_status,
       e.refund_status AS econ_refund_status,
       e.refund_mode AS econ_refund_mode,
       e.bid_credit_cost AS econ_bid_credit_cost`
    : "";
  const { rows } = await pool.query(
    `SELECT a.*,
            u.email AS freelancer_email,
            u.account_id AS freelancer_account_id,
            u.first_name AS freelancer_first_name,
            u.family_name AS freelancer_family_name
            ${econSelect}
       FROM marketplace_article_applications a
       JOIN users u ON u.id = a.freelancer_user_id
       ${econJoin}
      WHERE a.article_id = $1
      ORDER BY a.submitted_at ASC, a.id ASC
      LIMIT $2 OFFSET $3`,
    [Number(articleId), lim, off],
  );
  const mapped = rows.map((row) => attachActivationBudgetAdminFields(mapApplicationRow(row), row));
  const records = await articlePublishService.listPublishRecordsForArticle(articleId);
  const withPublish = articlePublishService.attachPublishToApplications(mapped, records, {
    forAdmin: true,
  });
  const submissions = await submissionsService.listSubmissionsForArticle(articleId);
  return submissionsService.attachSubmissionsToApplications(withPublish, submissions, {
    forAdmin: true,
  });
}

async function selectArticleApplication({
  applicationId,
  actorUserId,
  overrideReason,
  client: externalClient = null,
  selectionSource = null,
} = {}) {
  await assertSchemaAndEngine();
  const id = Number(applicationId);
  const actor = Number(actorUserId);
  const ownClient = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (ownClient) await client.query("BEGIN");
    const lockedApp = await client.query(
      `SELECT * FROM marketplace_article_applications WHERE id = $1`,
      [id],
    );
    const preliminary = lockedApp.rows[0];
    if (!preliminary) {
      throw createAppError("Application not found.", 404, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_FOUND,
      });
    }

    // Lock Article first, then all applications — compatible with close/cancel refund path.
    await loadArticleForUpdate(client, preliminary.article_id);
    await client.query(
      `SELECT id FROM marketplace_article_applications WHERE article_id = $1 FOR UPDATE`,
      [Number(preliminary.article_id)],
    );

    const { rows: refreshed } = await client.query(
      `SELECT * FROM marketplace_article_applications WHERE id = $1`,
      [id],
    );
    const row = refreshed[0];
    if (!row) {
      throw createAppError("Application not found.", 404, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_FOUND,
      });
    }
    if (row.status === "selected") {
      if (ownClient) await client.query("COMMIT");
      return { application: mapApplicationRow(row), alreadySelected: true };
    }
    if (row.status !== "pending") {
      throw createAppError("Application is not selectable.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_SELECTABLE,
      });
    }
    const article = await loadArticleForUpdate(client, row.article_id);
    if (!article || String(article.status) !== "published") {
      throw createAppError("Article is not open for selection.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_NOT_OPEN_FOR_APPLICATIONS,
      });
    }
    const collectionService = require("./opportunityBidCollectionService");
    await collectionService.assertArticleSelectionAllowed(client, article);
    const campaignService = require("./freelancerActivationCampaignService");
    await campaignService.assertActivationOpportunityOpen({ article, now: new Date(), client });
    const fairAdapter = require("./articleFairDistributionAdapterService");
    fairAdapter.assertApplicationInCurrentRound(article, row);
    const ranking = await fairAdapter.getArticleFairRanking(row.article_id, { client });
    const overrideService = require("./fairDistributionSelectionOverrideService");
    const override = await overrideService.enforceFairSelectionOverride({
      client,
      ranking,
      selectedCandidateId: id,
      idKey: "applicationId",
      overrideReason,
      opportunityType: overrideService.OPPORTUNITY_TYPES.MINI_BID_ARTICLE,
      opportunityId: row.article_id,
      collectionRoundId: article.current_bid_collection_round_id,
      actorUserId: actor,
      publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_FAIR_SELECTION_OVERRIDE_REASON_REQUIRED,
    });

    await campaignService.reserveActivationBudgetForAssignment({
      client,
      article,
      application: row,
      actorUserId: actor,
    });

    const economy = await economyService.getArticleEconomyConfig(client);
    const bidCost = economyService.resolveBidCostForCampaign(article, economy);
    const tierCode = String(row.membership_tier_code || "").toLowerCase();
    // Prefer live membership tier at assignment for snapshot.
    let liveTier = tierCode;
    try {
      const memCtx = await resolveUsableMembershipContext(client, row.freelancer_user_id);
      liveTier = String(memCtx.membership?.plan?.tierCode || memCtx.membership?.tierCode || tierCode).toLowerCase();
      let snapshot = economyService.buildEconomicSnapshot({
        tierCode: liveTier,
        membershipId: memCtx.membership?.id || row.membership_id,
        planId: memCtx.membership?.marketplacePlanId || memCtx.membership?.plan?.id,
        economy,
        bidCost,
        now: new Date(),
      });
      try {
        const articleOps = require("./freelancerActivationArticleOpsService");
        const override = articleOps.buildActivationArticleEconomicOverride(article);
        if (override) {
          snapshot = {
            ...snapshot,
            grossJod: override.grossJod,
            companySharePercent: override.companySharePercent,
            companyShareJod: override.companyShareJod,
            reviewerFeeJod: override.reviewerFeeJod,
            writerNetJod: override.writerNetJod,
            activationPlanTierCode: override.activationPlanTierCode,
            amountSource: override.amountSource,
          };
        }
      } catch {
        /* keep economy snapshot */
      }
      const { rows: updated } = await client.query(
        `UPDATE marketplace_article_applications
            SET status = 'selected',
                selected_at = NOW(),
                selected_by_user_id = $2,
                assigned_at = NOW(),
                economic_snapshot = $3::jsonb,
                economic_snapshot_at = NOW(),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id, Number.isInteger(actor) ? actor : null, JSON.stringify(snapshot)],
      );

      // Reject other pending apps and settle Bid reservations (A10: real → consume on loss).
      const { rows: losers } = await client.query(
        `SELECT * FROM marketplace_article_applications
          WHERE article_id = $1 AND id <> $2 AND status = 'pending'
          FOR UPDATE`,
        [row.article_id, id],
      );
      for (const loser of losers) {
        // eslint-disable-next-line no-await-in-loop
        await settleApplicationReservationByPolicy(client, loser, article, "lost_selection", {
          now: new Date(),
          actorUserId: actor,
        });
      }
      await client.query(
        `UPDATE marketplace_article_applications
            SET status = 'rejected',
                rejected_at = NOW(),
                rejected_by_user_id = $2,
                updated_at = NOW()
          WHERE article_id = $1
            AND id <> $3
            AND status = 'pending'`,
        [row.article_id, Number.isInteger(actor) ? actor : null, id],
      );

      await collectionService.markRoundAssigned(client, article.current_bid_collection_round_id);
      if (ownClient) await client.query("COMMIT");

      try {
        await notificationService.createIfNotExists(
          {
            recipientUserId: Number(row.freelancer_user_id),
            recipientRole: "freelancer",
            type: "article_application_selected",
            title: "تم اختيار طلب المقال",
            message: "تم اختيارك لمقال على المنصة.",
            entityType: "marketplace_article_application",
            entityId: id,
            link: `/dashboard/freelancer/articles/${row.article_id}`,
            priority: "medium",
            metadata: selectionSource ? { selectionSource } : undefined,
          },
          `article_application_selected:${id}`,
        );
      } catch {
        /* non-blocking */
      }

      return {
        application: mapApplicationRow(updated[0]),
        alreadySelected: false,
        economicSnapshot: snapshot,
        snapshotPoint: "ASSIGNMENT_SELECTION",
        overrideRecorded: Boolean(override.overrideRecorded),
        selectionSource: selectionSource || null,
      };
    } catch (snapErr) {
      // Fall through to legacy select if pre-154 columns missing
      if (snapErr?.code !== "42703") throw snapErr;
    }

    const { rows: updated } = await client.query(
      `UPDATE marketplace_article_applications
          SET status = 'selected',
              selected_at = NOW(),
              selected_by_user_id = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, Number.isInteger(actor) ? actor : null],
    );

    // Reject other pending apps (loser refund = NONE — no Bid restore).
    await client.query(
      `UPDATE marketplace_article_applications
          SET status = 'rejected',
              rejected_at = NOW(),
              rejected_by_user_id = $2,
              updated_at = NOW()
        WHERE article_id = $1
          AND id <> $3
          AND status = 'pending'`,
      [row.article_id, Number.isInteger(actor) ? actor : null, id],
    );

    await collectionService.markRoundAssigned(client, article.current_bid_collection_round_id);
    if (ownClient) await client.query("COMMIT");

    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: Number(row.freelancer_user_id),
          recipientRole: "freelancer",
          type: "article_application_selected",
          title: "تم اختيار طلب المقال",
          message: "تم اختيارك لمقال على المنصة.",
          entityType: "marketplace_article_application",
          entityId: id,
          link: `/dashboard/freelancer/articles/${row.article_id}`,
          priority: "medium",
          metadata: selectionSource ? { selectionSource } : undefined,
        },
        `article_application_selected:${id}`,
      );
    } catch {
      /* non-blocking */
    }

    return {
      application: mapApplicationRow(updated[0]),
      alreadySelected: false,
      overrideRecorded: Boolean(override.overrideRecorded),
      selectionSource: selectionSource || null,
    };
  } catch (err) {
    if (ownClient) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (ownClient) client.release();
  }
}

async function rejectArticleApplication({ applicationId, actorUserId } = {}) {
  await assertSchemaAndEngine();
  const id = Number(applicationId);
  const actor = Number(actorUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query(
      `SELECT * FROM marketplace_article_applications WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = locked.rows[0];
    if (!row) {
      throw createAppError("Application not found.", 404, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_FOUND,
      });
    }
    if (row.status === "rejected") {
      await client.query("COMMIT");
      return {
        application: mapApplicationRow(row),
        alreadyRejected: true,
        bidRefunded: 0,
        rejectionRefundPolicy: ARTICLE_APPLICATION_REJECTION_REFUND,
      };
    }
    if (
      row.status !== "pending"
      && row.status !== "selected"
      && row.status !== "revision_requested"
    ) {
      throw createAppError("Application is not rejectable.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_SELECTABLE,
      });
    }
    if (row.status === "selected" || row.status === "revision_requested") {
      const article = await loadArticleForUpdate(client, row.article_id);
      const campaignService = require("./freelancerActivationCampaignService");
      await campaignService.releaseActivationBudgetIfReserved({
        client,
        article,
        application: row,
        actorUserId: actor,
        reason: "rejected",
      });
    }
    // E2/A10: settle reserved Bids on rejection via outcome policy (real → consume).
    const articleForPolicy = await loadArticleForUpdate(client, row.article_id);
    const settle = await settleApplicationReservationByPolicy(
      client,
      row,
      articleForPolicy || {},
      "rejected",
      { now: new Date(), actorUserId: actor },
    );
    const { rows: updated } = await client.query(
      `UPDATE marketplace_article_applications
          SET status = 'rejected',
              rejected_at = NOW(),
              rejected_by_user_id = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [id, Number.isInteger(actor) ? actor : null],
    );
    await client.query("COMMIT");

    const rejectedWithoutRefund = settle.action === "consume";
    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: Number(row.freelancer_user_id),
          recipientRole: "freelancer",
          type: "article_application_rejected",
          title: "تحديث طلب المقال",
          message: rejectedWithoutRefund
            ? "لم يتم اختيار طلبك لهذا المقال."
            : settle.publicMessageAr || "تم إغلاق الطلب وإعادة رصيد التقديم.",
          entityType: "marketplace_article_application",
          entityId: id,
          link: `/dashboard/freelancer/articles/${row.article_id}`,
          priority: "low",
        },
        `article_application_rejected:${id}`,
      );
    } catch {
      /* non-blocking */
    }

    return {
      application: mapApplicationRow(updated[0]),
      alreadyRejected: false,
      bidRefunded: settle.bidRefunded || 0,
      bidReservationReleased: settle.action === "release",
      bidReservationConsumed: settle.action === "consume",
      rejectionRefundPolicy: ARTICLE_APPLICATION_REJECTION_REFUND,
      bidOutcomeReason: settle.reason,
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Eligibility preview for Freelancer UI (no mutation).
 * Includes approved Bid cost + available balance when engines/schema ready.
 */
async function getArticleApplicationEligibility(articleId, freelancerUserId) {
  const article = await pool.query(`SELECT * FROM marketplace_articles WHERE id = $1`, [
    Number(articleId),
  ]);
  const row = article.rows[0];
  const bidQuote = await articleBidEconomics.quoteArticleApplicationBidCost({
    freelancerUserId,
  });

  const baseEcon = {
    approvedBidCost: ARTICLE_APPLICATION_BID_COST,
    bidCost: ARTICLE_APPLICATION_BID_COST,
    economicsRuntime: ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
    availableBids: bidQuote.availableBids,
    bidCreditsEnabled: bidQuote.bidCreditsEnabled,
    articleApplicationsEnabled: bidQuote.articleApplicationsEnabled,
    canAffordBid: bidQuote.canApply,
    freeFallback: false,
  };

  const bildazoAuthorLink = await getBildazoLinkStatusForEligibility(freelancerUserId);

  if (!row || row.is_fake_or_training || String(row.status) !== "published") {
    return {
      eligible: false,
      reason: "ARTICLE_NOT_OPEN_FOR_APPLICATIONS",
      articleLevel: row ? Number(row.article_level) : null,
      membershipArticleAccessLevel: null,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  if (bildazoAuthorLink.gateEnabled && !bildazoAuthorLink.canApplyToArticles) {
    return {
      eligible: false,
      reason: "BILDAZO_AUTHOR_LINK_REQUIRED",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: null,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  try {
    const activationEngine = require("./freelancerActivationEngineService");
    const gate = await activationEngine.evaluateTrialMiniArticleApplyGate({
      freelancerUserId,
      now: new Date(),
      surface: "mini_article",
      ignoreUsageLimits: false,
    });
    if (!gate.skipped && !gate.allowed) {
      return {
        eligible: false,
        reason: gate.code,
        articleLevel: Number(row.article_level),
        membershipArticleAccessLevel: null,
        bildazoAuthorLink,
        trial: gate.meta || null,
        ...baseEcon,
      };
    }
  } catch {
    /* engine schema missing → existing eligibility */
  }

  try {
    const campaignService = require("./freelancerActivationCampaignService");
    const opportunity = await campaignService.evaluateActivationOpportunityGate({
      article: row,
      now: new Date(),
    });
    if (!opportunity.skipped && !opportunity.allowed) {
      return {
        eligible: false,
        reason: opportunity.code,
        articleLevel: Number(row.article_level),
        membershipArticleAccessLevel: null,
        bildazoAuthorLink,
        ...baseEcon,
      };
    }
  } catch {
    /* campaign schema missing → existing eligibility */
  }

  let membershipAccess = null;
  let usable = false;
  try {
    const membership = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId);
    if (membership && isBenefitUsableStatus(membership.status)) {
      usable = true;
      membershipAccess = Number(membership.plan?.articleAccessLevel) || 1;
    }
  } catch {
    usable = false;
  }

  if (!usable) {
    return {
      eligible: false,
      reason: "ARTICLE_NO_USABLE_MEMBERSHIP",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: null,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  if (!(membershipAccess >= Number(row.article_level))) {
    return {
      eligible: false,
      reason: "ARTICLE_ACCESS_LEVEL_INSUFFICIENT",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  if (!bidQuote.articleApplicationsEnabled) {
    return {
      eligible: false,
      reason: "ARTICLE_APPLICATIONS_ENGINE_OFF",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  if (!bidQuote.bidCreditsEnabled) {
    return {
      eligible: false,
      reason: "ARTICLE_BID_ECONOMY_DISABLED",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  if (bidQuote.canApply === false && bidQuote.reason === "insufficient_bid_credits") {
    return {
      eligible: false,
      reason: "INSUFFICIENT_BID_CREDITS",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  const collectionService = require("./opportunityBidCollectionService");
  const bidCollection = await collectionService.getArticleBidCollectionProgress(articleId);
  if (bidCollection && bidCollection.canApply === false) {
    let reason = "ARTICLE_BID_COLLECTION_THRESHOLD_REACHED";
    if (bidCollection.bidCollectionStatus === "minimum_not_met" || bidCollection.status === "minimum_not_met") {
      reason = "ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET";
    } else if (
      bidCollection.deadline &&
      new Date(bidCollection.deadline) <= new Date() &&
      !bidCollection.thresholdReached
    ) {
      reason = "ARTICLE_BID_COLLECTION_DEADLINE_PASSED";
    }
    return {
      eligible: false,
      reason,
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      bidCollection,
      bildazoAuthorLink,
      ...baseEcon,
    };
  }

  return {
    eligible: true,
    reason: null,
    articleLevel: Number(row.article_level),
    membershipArticleAccessLevel: membershipAccess,
    bidCollection,
    bildazoAuthorLink,
    ...baseEcon,
  };
}

async function finalizeArticleApplicationApproval({ applicationId, actorUserId, now = new Date() } = {}) {
  await assertSchemaAndEngine();
  await submissionsService.assertSubmittedManuscriptForApproval({ applicationId });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await settlementService.finalizeArticleApproval({
      client,
      articleApplicationId: applicationId,
      actorUserId,
      now,
    });
    await client.query("COMMIT");
    try {
      const appRow = await client.query(
        `SELECT freelancer_user_id FROM marketplace_article_applications WHERE id = $1`,
        [Number(applicationId)],
      );
      const uid = Number(appRow.rows[0]?.freelancer_user_id);
      if (uid) {
        const activationEngine = require("./freelancerActivationEngineService");
        await activationEngine.syncTrialWorkCountsAfterApproval({
          freelancerUserId: uid,
          now,
        });
      }
    } catch {
      /* counters must never undo settlement */
    }
    let bildazoPublish = null;
    try {
      const published = await articlePublishService.publishAfterArticleAcceptance({
        applicationId,
        actorUserId,
      });
      bildazoPublish = published?.record
        ? articlePublishService.mapAdminPublishRecord(published.record)
        : null;
    } catch {
      /* Bildazo publish is non-fatal; settlement already committed. */
    }
    return { ...result, bildazoPublish };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  mapApplicationRow,
  assertSchemaAndEngine,
  countApplicationsForArticle,
  articleHasApplications,
  assertArticleMetadataMutable,
  cancelPendingApplicationsForArticle,
  cancelAssignedApplicationsForCancelledArticle,
  submitArticleApplication,
  editArticleApplication,
  withdrawArticleApplication,
  listMyArticleApplications,
  getMyApplicationForArticle,
  listApplicationsForArticleAdmin,
  selectArticleApplication,
  rejectArticleApplication,
  finalizeArticleApplicationApproval,
  releaseApplicationReservation,
  consumeApplicationReservation,
  settleApplicationReservationByPolicy,
  getArticleApplicationEligibility,
  getApplicationById,
  findApplicationByArticleFreelancer,
  clearArticleApplicationsSchemaCache,
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
  ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
  ARTICLE_APPLICATION_BID_BEHAVIOR,
  OLD_ARTICLE_APPLICATION_IMMEDIATE_BID_CHARGE,
};
