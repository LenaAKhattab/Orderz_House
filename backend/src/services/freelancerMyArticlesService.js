/**
 * Freelancer "مقالاتي" portfolio — read-only aggregation over existing Article tables.
 */
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const articlePublishService = require("./bildazoArticlePublishService");
const submissionsService = require("./marketplaceArticleSubmissionsService");
const { mapApplicationRow } = require("./marketplaceArticleApplicationsService");
const { articleApplicationsSchemaReady } = require("../utils/marketplaceArticleApplicationsSchema");
const { bildazoAuthorLinkSchemaReady } = require("../utils/bildazoAuthorLinkSchema");
const { bildazoArticlePublishSchemaReady } = require("../utils/bildazoArticlePublishSchema");
const {
  PORTFOLIO_STATUS_KEYS,
  resolvePortfolioStatus,
  portfolioStatusLabelAr,
} = require("../utils/freelancerMyArticlesPortfolio");

function formatJod(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(3);
}

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

async function loadWriterProfileUrl(freelancerUserId, db) {
  try {
    if (!(await bildazoAuthorLinkSchemaReady(db))) return null;
    const { rows } = await db.query(
      `SELECT bildazo_profile_url, status
         FROM freelancer_bildazo_author_links
        WHERE freelancer_user_id = $1
        LIMIT 1`,
      [Number(freelancerUserId)],
    );
    const row = rows[0];
    if (!row || String(row.status) !== "linked") return null;
    return row.bildazo_profile_url || null;
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

async function listFreelancerMyArticles(freelancerUserId, { statusFilter = null, limit = 50, offset = 0 } = {}) {
  if (!(await articleApplicationsSchemaReady())) {
    return { items: [], total: 0, writerProfileUrl: null, portfolioStatuses: PORTFOLIO_STATUS_KEYS };
  }

  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const filterKey = statusFilter ? String(statusFilter).trim() : null;
  if (filterKey && !PORTFOLIO_STATUS_KEYS.includes(filterKey)) {
    throw createAppError("حالة المقالات غير صالحة.", 400, {
      exposeToClient: true,
      publicCode: "MY_ARTICLES_INVALID_STATUS",
    });
  }

  const publishReady = await bildazoArticlePublishSchemaReady(pool);
  const publishJoin = publishReady
    ? `LEFT JOIN bildazo_article_publish_records p ON p.orderz_application_id = a.id`
    : "";
  const publishSelect = publishReady
    ? `, p.status AS bildazo_publish_status,
       p.bildazo_article_url,
       p.published_at AS bildazo_published_at`
    : "";

  const settlementJoin = `
    LEFT JOIN marketplace_article_settlements st ON st.article_application_id = a.id`;

  const submissionJoin = `
    LEFT JOIN marketplace_article_submissions sub ON sub.article_application_id = a.id`;

  const { rows } = await pool.query(
    `SELECT a.*,
            art.title AS article_title,
            art.status AS article_status,
            sub.id AS submission_id,
            sub.status AS submission_status,
            sub.submitted_at AS manuscript_submitted_at,
            sub.approved_at AS manuscript_approved_at,
            sub.reviewer_notes AS submission_reviewer_notes,
            st.gross_jod,
            st.writer_net_jod
            ${publishSelect}
       FROM marketplace_article_applications a
       JOIN marketplace_articles art ON art.id = a.article_id
       ${submissionJoin}
       ${settlementJoin}
       ${publishJoin}
      WHERE a.freelancer_user_id = $1
      ORDER BY COALESCE(a.selected_at, a.submitted_at, a.created_at) DESC, a.id DESC
      LIMIT 500`,
    [Number(freelancerUserId)],
  );

  const writerProfileUrl = await loadWriterProfileUrl(freelancerUserId, pool);
  const mapped = [];

  for (const row of rows) {
    const application = mapApplicationRow(row);
    const submission = row.submission_id
      ? submissionsService.mapSubmissionRow({
          id: row.submission_id,
          application_id: row.id,
          article_id: row.article_id,
          freelancer_user_id: row.freelancer_user_id,
          title: row.submission_title,
          content: null,
          status: row.submission_status,
          reviewer_notes: row.submission_reviewer_notes,
          submitted_at: row.manuscript_submitted_at,
          reviewed_at: null,
          created_at: row.manuscript_submitted_at,
          updated_at: row.manuscript_submitted_at,
        })
      : null;
    const bildazoPublish = publishReady
      ? articlePublishService.mapPublicPublishRecord({
          status: row.bildazo_publish_status,
          bildazo_article_url: row.bildazo_article_url,
        })
      : null;

    const portfolioStatus = resolvePortfolioStatus({
      applicationStatus: application.status,
      submissionStatus: submission?.status || row.submission_status,
      bildazoPublishStatus: bildazoPublish?.status || row.bildazo_publish_status,
    });

    if (filterKey && portfolioStatus !== filterKey) continue;

    mapped.push({
      applicationId: application.id,
      articleId: application.articleId,
      articleTitle: application.articleTitle || row.article_title || null,
      applicationStatus: application.status,
      portfolioStatus,
      portfolioStatusLabelAr: portfolioStatusLabelAr(portfolioStatus),
      assignedAt: application.selectedAt || application.assignedAt || null,
      submissionDate: submission?.submittedAt || row.manuscript_submitted_at || null,
      articleGrossValueJod:
        row.gross_jod != null ? formatJod(row.gross_jod) : formatJod(application.articleValueJodSnapshot),
      freelancerNetEarningJod:
        row.writer_net_jod != null ? formatJod(row.writer_net_jod) : null,
      reviewStatus: submission?.status || application.status || null,
      bildazoPublish,
      writerProfileUrl: writerProfileUrl || null,
      detailPath: `/dashboard/freelancer/articles/${application.articleId}`,
      actions: buildPortfolioActions({
        portfolioStatus,
        articleId: application.articleId,
        bildazoPublish,
        writerProfileUrl,
        canSubmitManuscript: Boolean(submission?.canResubmit || !submission),
      }),
    });
  }

  const pageItems = mapped.slice(off, off + lim);

  return {
    items: pageItems,
    total: mapped.length,
    writerProfileUrl,
    portfolioStatuses: PORTFOLIO_STATUS_KEYS,
  };
}

function buildPortfolioActions({
  portfolioStatus,
  articleId,
  bildazoPublish,
  writerProfileUrl,
  canSubmitManuscript,
}) {
  const actions = [{ key: "view_details", labelAr: "عرض التفاصيل", href: `/dashboard/freelancer/articles/${articleId}` }];

  if (portfolioStatus === "awaiting_execution" && canSubmitManuscript) {
    actions.push({
      key: "submit_manuscript",
      labelAr: "تسليم المقال",
      href: `/dashboard/freelancer/articles/${articleId}`,
    });
  }
  if (portfolioStatus === "revision_requested") {
    actions.push({
      key: "resubmit_manuscript",
      labelAr: "إعادة التسليم",
      href: `/dashboard/freelancer/articles/${articleId}`,
    });
  }
  if (bildazoPublish?.articleUrl) {
    actions.push({
      key: "view_bildazo_article",
      labelAr: "مشاهدة المقال",
      href: bildazoPublish.articleUrl,
      external: true,
    });
  }
  if (writerProfileUrl) {
    actions.push({
      key: "view_writer_profile",
      labelAr: "مشاهدة ملفي ككاتب",
      href: writerProfileUrl,
      external: true,
    });
  }
  return actions;
}

module.exports = {
  listFreelancerMyArticles,
  loadWriterProfileUrl,
  resolvePortfolioStatus,
  buildPortfolioActions,
};
