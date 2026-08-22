/**
 * Super Admin compact Bildazo integration summary for a freelancer.
 */
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { bildazoAuthorLinkSchemaReady } = require("../utils/bildazoAuthorLinkSchema");
const { bildazoArticlePublishSchemaReady } = require("../utils/bildazoArticlePublishSchema");
const { isBildazoAuthorSyncEnabled } = require("../config/bildazoAuthorSync");
const { isBildazoArticlePublishEnabled } = require("../config/bildazoArticlePublish");
const { BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES } = require("../constants/bildazoArticlePublish");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

async function getSuperAdminFreelancerBildazoIntegrationSummary(freelancerUserId, { db = pool } = {}) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    throw createAppError("Invalid freelancer user id.", 400, { exposeToClient: true });
  }

  const authorSchemaReady = await bildazoAuthorLinkSchemaReady(db);
  const publishSchemaReady = await bildazoArticlePublishSchemaReady(db);

  let link = null;
  if (authorSchemaReady) {
    try {
      const { rows } = await db.query(
        `SELECT * FROM freelancer_bildazo_author_links WHERE freelancer_user_id = $1 LIMIT 1`,
        [uid],
      );
      link = rows[0] || null;
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
    }
  }

  let publishStats = {
    publishedCount: 0,
    pendingCount: 0,
    failedCount: 0,
    lastPublishedAt: null,
    lastPublishedTitle: null,
    lastPublishedUrl: null,
  };

  if (publishSchemaReady) {
    try {
      const { rows: statsRows } = await db.query(
        `SELECT
           COUNT(*) FILTER (WHERE p.status = ANY($2::text[]))::int AS published_count,
           COUNT(*) FILTER (WHERE p.status IN ('pending', 'needs_manual_review', 'skipped'))::int AS pending_count,
           COUNT(*) FILTER (WHERE p.status = 'failed')::int AS failed_count
         FROM bildazo_article_publish_records p
        WHERE p.freelancer_user_id = $1`,
        [uid, [...BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES]],
      );
      publishStats.publishedCount = Number(statsRows[0]?.published_count) || 0;
      publishStats.pendingCount = Number(statsRows[0]?.pending_count) || 0;
      publishStats.failedCount = Number(statsRows[0]?.failed_count) || 0;

      const { rows: lastRows } = await db.query(
        `SELECT p.published_at, p.bildazo_article_url, art.title AS article_title
           FROM bildazo_article_publish_records p
           JOIN marketplace_article_applications a ON a.id = p.orderz_application_id
           JOIN marketplace_articles art ON art.id = a.article_id
          WHERE p.freelancer_user_id = $1
            AND p.status = ANY($2::text[])
          ORDER BY p.published_at DESC NULLS LAST, p.id DESC
          LIMIT 1`,
        [uid, [...BILDAZO_ARTICLE_PUBLISH_SUCCESS_STATUSES]],
      );
      if (lastRows[0]) {
        publishStats.lastPublishedAt = lastRows[0].published_at || null;
        publishStats.lastPublishedUrl = lastRows[0].bildazo_article_url || null;
        publishStats.lastPublishedTitle = lastRows[0].article_title || null;
      }
    } catch (err) {
      if (!isMissingSchema(err)) throw err;
    }
  }

  return {
    schemaReady: authorSchemaReady,
    integrationStatus: {
      authorGateEnabled: Boolean(require("../config/bildazoAuthorGate").isBildazoAuthorGateEnabled()),
      authorSyncEnabled: isBildazoAuthorSyncEnabled(),
      articlePublishEnabled: isBildazoArticlePublishEnabled(),
    },
    accountStatus: link?.status || "not_started",
    writerId: link?.bildazo_user_id || null,
    writerPublicId: link?.bildazo_public_id || null,
    writerProfileUrl: link?.bildazo_profile_url || null,
    linkedAt: link?.linked_at || null,
    lastError: link?.last_error || null,
    publishedArticlesCount: publishStats.publishedCount,
    pendingPublishCount: publishStats.pendingCount,
    failedPublishCount: publishStats.failedCount,
    lastPublishedArticle: publishStats.lastPublishedAt
      ? {
          title: publishStats.lastPublishedTitle,
          url: publishStats.lastPublishedUrl,
          publishedAt: publishStats.lastPublishedAt,
        }
      : null,
    adminLinksPagePath: "/dashboard/super-admin/bildazo-author-links",
    syncActionAvailable: false,
    syncActionNoteAr:
      "لا توجد نقطة مزامنة S2S منفصلة للإدارة. استخدم صفحة «ربط حسابات Bildazo» أو إعادة محاولة النشر من طلبات المقالات.",
  };
}

module.exports = {
  getSuperAdminFreelancerBildazoIntegrationSummary,
};
