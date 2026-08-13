/**
 * Phase B5 — Marketplace Article Applications.
 *
 * Dedicated domain (NOT order_freelancer_bids / Priority Boost / Fair / Elite).
 * Membership gate: plan.article_access_level >= article.article_level.
 * Bid economics: flat 1 Bid on first valid submit; no-selection refund on Article
 * close/cancel with zero selected (pending charged apps only).
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
  articleApplicationsSchemaReady,
  clearArticleApplicationsSchemaCache,
} = require("../utils/marketplaceArticleApplicationsSchema");
const {
  resolveCurrentMarketplaceMembershipForFreelancer,
} = require("./marketplaceMembershipsService");
const { isBenefitUsableStatus } = require("../constants/marketplaceMemberships");
const marketplaceMembershipCyclesService = require("./marketplaceMembershipCyclesService");
const notificationService = require("./notificationService");
const articleBidEconomics = require("./marketplaceArticleApplicationBidCreditService");

function toIdString(value) {
  if (value == null) return null;
  return String(value);
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
    selectedByUserId: row.selected_by_user_id != null ? toIdString(row.selected_by_user_id) : null,
    rejectedByUserId: row.rejected_by_user_id != null ? toIdString(row.rejected_by_user_id) : null,
    idempotencyKey: row.idempotency_key || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    // Joined optional fields
    freelancerEmail: row.freelancer_email || null,
    freelancerAccountId: row.freelancer_account_id || null,
    freelancerFirstName: row.freelancer_first_name || null,
    freelancerFamilyName: row.freelancer_family_name || null,
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

async function cancelPendingApplicationsForArticle(articleId, client) {
  if (!(await articleApplicationsSchemaReady(client))) return 0;
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

async function findApplicationByArticleFreelancer(client, articleId, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_article_applications
      WHERE article_id = $1 AND freelancer_user_id = $2
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
  return mapApplicationRow(rows[0]);
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

  const ownClient = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (ownClient) await client.query("BEGIN");

    // Fail-closed: Bid economy required (no free Article applications).
    await articleBidEconomics.assertArticleBidEconomyActive(client);

    const article = await loadArticleForUpdate(client, aid);
    assertArticleOpenForApplications(article);

    const { membership, accessLevel, cycleId } = await resolveUsableMembershipContext(client, fid);
    assertMembershipAccessLevel(accessLevel, article.article_level);

    const existing = await findApplicationByArticleFreelancer(client, aid, fid);
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

    const idem = buildArticleApplicationIdempotencyKey(aid, fid);
    let inserted;
    try {
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
        [
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
        ],
      );
      inserted = rows[0];
    } catch (err) {
      if (err && (err.code === "23505" || /unique/i.test(String(err.message || "")))) {
        const raced = await findApplicationByArticleFreelancer(client, aid, fid);
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
      }
      throw err;
    }

    // Same transaction: FEFO consume 1 Bid + economics row (rolls back with application on failure).
    const charge = await articleBidEconomics.chargeArticleApplicationBidCredit({
      client,
      articleId: aid,
      freelancerUserId: fid,
      articleApplicationId: Number(inserted.id),
      actorUserId: fid,
      now,
    });

    if (ownClient) await client.query("COMMIT");

    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: fid,
          recipientRole: "freelancer",
          type: "article_application_submitted",
          title: "تم تقديم طلب المقال",
          message: "تم استلام طلبك للمقال بنجاح.",
          entityType: "marketplace_article_application",
          entityId: Number(inserted.id),
          link: `/dashboard/freelancer/articles/${aid}`,
          priority: "low",
          metadata: { articleId: aid, applicationId: Number(inserted.id) },
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
      approvedBidCost: ARTICLE_APPLICATION_BID_COST,
      bidCreditConsumed: charge.charged ? ARTICLE_APPLICATION_BID_COST : 0,
      bidCredit: {
        consumed: Boolean(charge.charged),
        cost: ARTICLE_APPLICATION_BID_COST,
        availableBidsAfter:
          charge.availableBidsAfter != null ? charge.availableBidsAfter : null,
        skipped: Boolean(charge.skipped),
        reason: charge.reason || null,
      },
      workTokenConsumed: 0,
      economicsRuntime: ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
      economics: charge.economics || null,
      priorityBoost: ARTICLE_PRIORITY_BOOST,
      fairDistribution: ARTICLE_FAIR_DISTRIBUTION,
      workTokenEntry: ARTICLE_WORK_TOKEN_ENTRY,
      activeWorkTokenRuntime: ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
      editAdditionalBidCost: ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
      withdrawalRefundPolicy: ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
      noSelectionRefundPolicy: ARTICLE_APPLICATION_NO_SELECTION_REFUND,
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
    // No Bid refund — ARTICLE_APPLICATION_WITHDRAWAL_REFUND = NONE.
    return {
      application: mapApplicationRow(updated[0]),
      alreadyWithdrawn: false,
      bidRefunded: 0,
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
  const row = await findApplicationByArticleFreelancer(pool, articleId, freelancerUserId);
  return mapApplicationRow(row);
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
  return rows.map(mapApplicationRow);
}

async function selectArticleApplication({ applicationId, actorUserId } = {}) {
  await assertSchemaAndEngine();
  const id = Number(applicationId);
  const actor = Number(actorUserId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
      await client.query("COMMIT");
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

    await client.query("COMMIT");

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
        },
        `article_application_selected:${id}`,
      );
    } catch {
      /* non-blocking */
    }

    return { application: mapApplicationRow(updated[0]), alreadySelected: false };
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
    if (row.status !== "pending") {
      throw createAppError("Application is not rejectable.", 409, {
        exposeToClient: true,
        publicCode: ARTICLE_APPLICATION_ERROR_CODES.ARTICLE_APPLICATION_NOT_SELECTABLE,
      });
    }
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

    try {
      await notificationService.createIfNotExists(
        {
          recipientUserId: Number(row.freelancer_user_id),
          recipientRole: "freelancer",
          type: "article_application_rejected",
          title: "تحديث طلب المقال",
          message: "لم يتم اختيار طلبك لهذا المقال.",
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

    // ARTICLE_APPLICATION_REJECTION_REFUND = NONE — no Bid restore.
    return {
      application: mapApplicationRow(updated[0]),
      alreadyRejected: false,
      bidRefunded: 0,
      rejectionRefundPolicy: ARTICLE_APPLICATION_REJECTION_REFUND,
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

  if (!row || row.is_fake_or_training || String(row.status) !== "published") {
    return {
      eligible: false,
      reason: "ARTICLE_NOT_OPEN_FOR_APPLICATIONS",
      articleLevel: row ? Number(row.article_level) : null,
      membershipArticleAccessLevel: null,
      ...baseEcon,
    };
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
      ...baseEcon,
    };
  }

  if (!(membershipAccess >= Number(row.article_level))) {
    return {
      eligible: false,
      reason: "ARTICLE_ACCESS_LEVEL_INSUFFICIENT",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      ...baseEcon,
    };
  }

  if (!bidQuote.articleApplicationsEnabled) {
    return {
      eligible: false,
      reason: "ARTICLE_APPLICATIONS_ENGINE_OFF",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      ...baseEcon,
    };
  }

  if (!bidQuote.bidCreditsEnabled) {
    return {
      eligible: false,
      reason: "ARTICLE_BID_ECONOMY_DISABLED",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      ...baseEcon,
    };
  }

  if (bidQuote.canApply === false && bidQuote.reason === "insufficient_bid_credits") {
    return {
      eligible: false,
      reason: "INSUFFICIENT_BID_CREDITS",
      articleLevel: Number(row.article_level),
      membershipArticleAccessLevel: membershipAccess,
      ...baseEcon,
    };
  }

  return {
    eligible: true,
    reason: null,
    articleLevel: Number(row.article_level),
    membershipArticleAccessLevel: membershipAccess,
    ...baseEcon,
  };
}

module.exports = {
  mapApplicationRow,
  assertSchemaAndEngine,
  countApplicationsForArticle,
  articleHasApplications,
  assertArticleMetadataMutable,
  cancelPendingApplicationsForArticle,
  submitArticleApplication,
  editArticleApplication,
  withdrawArticleApplication,
  listMyArticleApplications,
  getMyApplicationForArticle,
  listApplicationsForArticleAdmin,
  selectArticleApplication,
  rejectArticleApplication,
  getArticleApplicationEligibility,
  getApplicationById,
  clearArticleApplicationsSchemaCache,
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_APPLICATION_BID_ECONOMICS_RUNTIME,
  ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
};
