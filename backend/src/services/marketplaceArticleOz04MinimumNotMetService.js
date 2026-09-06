/**
 * OZ04 — When a funded marketplace article round ends as minimum_not_met:
 * - refund the exact article-fund deduction (daily_allocation_released)
 * - recycle the same marketplace_articles row back to draft inventory
 * Idempotent. No new migration. No duplicate article rows.
 */

const { millisToJodString } = require("../utils/marketplaceBidPoolMoney");
const articleOps = require("./freelancerActivationArticleOpsService");

const OZ04_REFUND_REASON = "minimum_not_met_refund";
const OZ04_FUND_REFUND_REASON_AR = "إرجاع تمويل بسبب عدم اكتمال عدد المتقدمين";

function articleIdKey(articleId) {
  return String(articleId);
}

/**
 * Active (unrefunded) daily_allocation for this marketplace article.
 * After OZ04 refund, returns null so a future release deducts again.
 */
async function findActiveFundDeductionForArticle(runner, articleId) {
  const key = articleIdKey(articleId);
  const { rows } = await runner.query(
    `SELECT d.id, d.amount_jod, d.metadata, d.created_at, d.campaign_id, d.wave_id, d.reason
       FROM freelancer_activation_article_fund_entries d
      WHERE d.entry_type = 'daily_allocation'
        AND (
          d.metadata->>'marketplaceArticleId' = $1
          OR d.metadata->>'oz03ArticleId' = $1
        )
        AND NOT EXISTS (
          SELECT 1
            FROM freelancer_activation_article_fund_entries r
           WHERE r.entry_type = 'daily_allocation_released'
             AND (
               r.metadata->>'originalFundEntryId' = d.id::text
               OR (
                 COALESCE(r.metadata->>'reason', r.reason, '') = $2
                 AND (
                   r.metadata->>'marketplaceArticleId' = $1
                   OR r.metadata->>'oz03ArticleId' = $1
                 )
                 AND r.metadata->>'originalFundEntryId' IS NULL
                 AND r.id > d.id
               )
             )
        )
      ORDER BY d.id DESC
      LIMIT 1`,
    [key, OZ04_REFUND_REASON],
  );
  return rows[0] || null;
}

async function findExistingMinimumNotMetRefund(
  runner,
  { articleId, roundId = null, originalFundEntryId = null } = {},
) {
  const key = articleIdKey(articleId);
  const params = [key, OZ04_REFUND_REASON];
  let extra = "";
  if (originalFundEntryId != null) {
    params.push(String(originalFundEntryId));
    extra += ` AND metadata->>'originalFundEntryId' = $${params.length}`;
  } else if (roundId != null) {
    params.push(String(roundId));
    extra += ` AND metadata->>'bidCollectionRoundId' = $${params.length}`;
  }
  const { rows } = await runner.query(
    `SELECT id, amount_jod, metadata, reason, created_at
       FROM freelancer_activation_article_fund_entries
      WHERE entry_type = 'daily_allocation_released'
        AND (
          metadata->>'marketplaceArticleId' = $1
          OR metadata->>'oz03ArticleId' = $1
        )
        AND COALESCE(metadata->>'reason', reason, '') = $2
        ${extra}
      ORDER BY id ASC
      LIMIT 1`,
    params,
  );
  return rows[0] || null;
}

async function hasWinningApplication(runner, articleId) {
  const { rows } = await runner.query(
    `SELECT id
       FROM marketplace_article_applications
      WHERE article_id = $1
        AND status IN (
          'selected','assigned','writing','submitted',
          'under_review','revision_requested','approved'
        )
      LIMIT 1`,
    [Number(articleId)],
  );
  return Boolean(rows[0]);
}

function isBildazoPublished(article) {
  if (!article) return false;
  const pub = String(article.publication_status || "").toLowerCase();
  if (pub === "published") return true;
  if (article.bildazo_article_id || article.bildazoArticleId) return true;
  if (article.external_publication_id || article.externalPublicationId) return true;
  return false;
}

async function recordMinimumNotMetFundRefund(
  runner,
  {
    articleId,
    roundId = null,
    deduction = null,
    actorUserId = null,
    now = new Date(),
  } = {},
) {
  const aid = Number(articleId);
  if (!Number.isInteger(aid) || aid < 1) {
    return { refunded: false, skipped: true, reason: "invalid_article" };
  }

  const existingByRound = await findExistingMinimumNotMetRefund(runner, {
    articleId: aid,
    roundId,
  });
  if (existingByRound) {
    return {
      refunded: false,
      idempotent: true,
      skipped: true,
      reason: "already_refunded",
      fundEntryId: Number(existingByRound.id),
      amountJod: String(existingByRound.amount_jod),
    };
  }

  const active =
    deduction ||
    (await findActiveFundDeductionForArticle(runner, aid));

  if (!active) {
    const anyPrior = await findExistingMinimumNotMetRefund(runner, { articleId: aid });
    if (anyPrior) {
      return {
        refunded: false,
        idempotent: true,
        skipped: true,
        reason: "already_refunded",
        fundEntryId: Number(anyPrior.id),
        amountJod: String(anyPrior.amount_jod),
        warning: "no_active_deduction",
      };
    }
    return {
      refunded: false,
      skipped: true,
      reason: "funding_entry_missing",
      warning: "OZ04: no daily_allocation found for marketplace article; recycled without fund refund.",
    };
  }

  const existingByOriginal = await findExistingMinimumNotMetRefund(runner, {
    articleId: aid,
    originalFundEntryId: active.id,
  });
  if (existingByOriginal) {
    return {
      refunded: false,
      idempotent: true,
      skipped: true,
      reason: "already_refunded",
      fundEntryId: Number(existingByOriginal.id),
      amountJod: String(existingByOriginal.amount_jod),
    };
  }

  const amountMillis = articleOps.parseMoney(active.amount_jod, "fund refund");
  if (amountMillis <= 0) {
    return { refunded: false, skipped: true, reason: "invalid_deduction_amount" };
  }

  const meta = {
    oz04: true,
    reason: OZ04_REFUND_REASON,
    marketplaceArticleId: String(aid),
    oz03ArticleId: String(aid),
    originalFundEntryId: String(active.id),
    bidCollectionRoundId: roundId != null ? String(roundId) : null,
    refundedAt: new Date(now).toISOString(),
  };

  const { rows } = await runner.query(
    `INSERT INTO freelancer_activation_article_fund_entries (
       campaign_id, wave_id, entry_type, amount_jod, reason, metadata, created_by_user_id
     ) VALUES ($1, $2, 'daily_allocation_released', $3::numeric, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      active.campaign_id != null ? Number(active.campaign_id) : null,
      active.wave_id != null ? Number(active.wave_id) : null,
      millisToJodString(amountMillis),
      OZ04_FUND_REFUND_REASON_AR,
      JSON.stringify(meta),
      actorUserId != null ? Number(actorUserId) : null,
    ],
  );

  const mapped = articleOps.mapFundEntry(rows[0]);
  return {
    refunded: true,
    idempotent: false,
    skipped: false,
    fundEntryId: mapped?.id != null ? Number(mapped.id) : Number(rows[0].id),
    amountJod: String(rows[0].amount_jod),
    originalFundEntryId: Number(active.id),
    entry: mapped,
  };
}

/**
 * Recycle same marketplace_articles row to draft + refund funded release.
 * Safe for repeated scheduler/manual close calls.
 */
async function recycleAndRefundAfterMinimumNotMet(
  client,
  { articleId, roundId = null, actorUserId = null, now = new Date() } = {},
) {
  const aid = Number(articleId);
  if (!Number.isInteger(aid) || aid < 1) {
    return {
      recycled: false,
      fundRefund: { refunded: false, skipped: true, reason: "invalid_article" },
    };
  }

  const { rows: locked } = await client.query(
    `SELECT * FROM marketplace_articles WHERE id = $1 FOR UPDATE`,
    [aid],
  );
  const article = locked[0];
  if (!article) {
    return {
      recycled: false,
      fundRefund: { refunded: false, skipped: true, reason: "article_not_found" },
    };
  }

  if (await hasWinningApplication(client, aid)) {
    return {
      recycled: false,
      fundRefund: {
        refunded: false,
        skipped: true,
        reason: "winner_or_assignment_exists",
        warning: "OZ04: skip fund refund/recycle — article already has a selected/assigned applicant.",
      },
    };
  }

  if (isBildazoPublished(article)) {
    // Hide from freelancers if still published; do not return to inventory.
    if (String(article.status).toLowerCase() === "published") {
      await client.query(
        `UPDATE marketplace_articles
            SET bid_collection_outcome = COALESCE(bid_collection_outcome, 'minimum_not_met'),
                status = 'closed',
                closed_at = COALESCE(closed_at, $2::timestamptz),
                updated_at = NOW()
          WHERE id = $1`,
        [aid, new Date(now).toISOString()],
      );
    }
    return {
      recycled: false,
      fundRefund: {
        refunded: false,
        skipped: true,
        reason: "already_bildazo_published",
        warning: "OZ04: skip recycle/refund — article already published externally (Bildazo).",
      },
    };
  }

  const fundRefund = await recordMinimumNotMetFundRefund(client, {
    articleId: aid,
    roundId,
    actorUserId,
    now,
  });

  const status = String(article.status || "").toLowerCase();
  let recycled = false;
  if (status === "draft") {
    recycled = true;
  } else if (status === "published" || status === "closed") {
    const { rows: updated } = await client.query(
      `UPDATE marketplace_articles
          SET status = 'draft',
              bid_collection_outcome = 'minimum_not_met',
              closed_at = NULL,
              application_deadline_at = NULL,
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('published', 'closed')
        RETURNING id, status`,
      [aid],
    );
    recycled = Boolean(updated[0]);
  } else {
    // cancelled or other — do not force draft
    await client.query(
      `UPDATE marketplace_articles
          SET bid_collection_outcome = COALESCE(bid_collection_outcome, 'minimum_not_met'),
              updated_at = NOW()
        WHERE id = $1`,
      [aid],
    );
  }

  return {
    recycled,
    articleId: aid,
    statusAfter: recycled ? "draft" : status,
    fundRefund,
    messageAr: recycled
      ? "أُعيد المقال إلى المخزون وأُرجع التمويل عند الحاجة."
      : null,
  };
}

module.exports = {
  OZ04_REFUND_REASON,
  OZ04_FUND_REFUND_REASON_AR,
  findActiveFundDeductionForArticle,
  findExistingMinimumNotMetRefund,
  recordMinimumNotMetFundRefund,
  recycleAndRefundAfterMinimumNotMet,
  hasWinningApplication,
  isBildazoPublished,
};
