/**
 * Phase A5 — Earned Balance over Mini Article settlement ledger + trial lock/forfeiture policy.
 */

const { pool } = require("../config/db");
const { millisToJodString, parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");
const forfeitureService = require("./trialPendingEarningsForfeitureService");
const { loadWriterProfileUrl } = require("./freelancerMyArticlesService");

const WRITER_ENTRY_TYPES = Object.freeze(["writer_starter_pending", "writer_available"]);
const PUBLISHED_STATUSES = Object.freeze(["published", "already_imported"]);

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function formatJod(value) {
  try {
    return millisToJodString(parseJodToMillis(value, { label: "earnedAmountJod" }));
  } catch {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(3) : "0.000";
  }
}

function emptyEarnedBalance() {
  return {
    totalPendingJod: "0.000",
    totalLockedPendingJod: "0.000",
    totalForfeitedJod: "0.000",
    totalAvailableJod: "0.000",
    totalAcceptedArticles: 0,
    totalPublishedArticles: 0,
    lockPolicy: null,
    withdrawalPolicy: {
      allowed: false,
      reason: "company_kyc_required",
      messageAr: EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR,
      messageEn: EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN,
    },
    entries: [],
  };
}

const EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR =
  "الرصيد متاح بعد الاشتراك، لكن السحب يتطلب اعتماد الحساب.";
const EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN =
  "Earnings are available after subscription, but withdrawal requires account approval.";

async function loadFreelancerCompanyApproved(runner, freelancerUserId) {
  try {
    const { rows } = await runner.query(
      `SELECT activation_status
         FROM freelancer_subscriptions
        WHERE freelancer_user_id = $1 AND is_current = TRUE
        ORDER BY id DESC
        LIMIT 1`,
      [Number(freelancerUserId)],
    );
    return String(rows[0]?.activation_status || "").toLowerCase() === "company_approved";
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") return false;
    throw err;
  }
}

function buildWithdrawalPolicy(companyApproved) {
  if (companyApproved) {
    return {
      allowed: true,
      reason: null,
      messageAr: null,
      messageEn: null,
    };
  }
  return {
    allowed: false,
    reason: "company_kyc_required",
    messageAr: EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR,
    messageEn: EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN,
  };
}

function mapEntryStatus(row, { lockPolicy = null } = {}) {
  const type = String(row.entry_type || "");
  const status = String(row.entry_status || row.status || "");
  if (status === "void") return "voided";
  if (status === "forfeited" || type === "writer_starter_pending" && status === "forfeited") {
    return "forfeited";
  }
  if (type === "writer_starter_pending" && status === "pending") {
    if (
      lockPolicy
      && lockPolicy.state
      && lockPolicy.state !== "none"
      && lockPolicy.state !== "released"
    ) {
      return "pending_locked";
    }
    return "pending";
  }
  if (type === "writer_starter_pending" && status === "released") return "settled_externally";
  if (type === "writer_available") return "settled_externally";
  if (status === "pending") return "pending";
  return "settled_externally";
}

function isPublished(row) {
  return PUBLISHED_STATUSES.includes(String(row.publish_status || ""));
}

function resolveDisplayAmountJod(row) {
  // Frozen settlement writer net only — never live campaign freelancer_share_jod.
  const frozen =
    row.writer_net_jod ?? row.ledger_amount_jod ?? row.amount_jod ?? null;
  if (frozen != null && Number.isFinite(Number(frozen))) {
    return formatJod(frozen);
  }
  return formatJod(0);
}

function mapEarnedBalanceEntry(row, { lockPolicy = null, companyApproved = false } = {}) {
  const ledgerStatus = mapEntryStatus(row, { lockPolicy });
  const status =
    ledgerStatus === "settled_externally" && !companyApproved
      ? "awaiting_account_approval"
      : ledgerStatus;
  const published = isPublished(row);
  const locked = status === "pending_locked";
  const withdrawable = ledgerStatus === "settled_externally" && companyApproved;
  return {
    applicationId: String(row.article_application_id ?? row.application_id),
    articleId: String(row.article_id),
    articleTitle: row.article_title || null,
    amountJod: resolveDisplayAmountJod(row),
    status,
    locked,
    withdrawable,
    withdrawalBlockedReason:
      ledgerStatus === "settled_externally" && !companyApproved ? "company_kyc_required" : null,
    acceptedAt: row.settled_at || row.created_at || null,
    publishedAt: published ? (row.published_at || null) : null,
    bildazoUrl: published && row.bildazo_article_url ? String(row.bildazo_article_url) : null,
    campaignName: row.campaign_name || null,
    waveName: row.wave_name || null,
  };
}

function summarizeEntries(entries) {
  let pendingMillis = 0;
  let lockedMillis = 0;
  let forfeitedMillis = 0;
  let availableMillis = 0;
  let accepted = 0;
  let published = 0;
  for (const entry of entries) {
    if (entry.status === "voided") continue;
    accepted += 1;
    if (entry.bildazoUrl) published += 1;
    let millis = 0;
    try {
      millis = parseJodToMillis(entry.amountJod, { label: "earnedSummary" });
    } catch {
      millis = 0;
    }
    if (entry.status === "forfeited") {
      forfeitedMillis += millis;
      continue;
    }
    if (entry.status === "pending_locked" || entry.status === "pending") {
      if (entry.status === "pending_locked") lockedMillis += millis;
      pendingMillis += millis;
      continue;
    }
    if (entry.withdrawable) {
      availableMillis += millis;
    }
  }
  return {
    totalPendingJod: millisToJodString(pendingMillis),
    totalLockedPendingJod: millisToJodString(lockedMillis),
    totalForfeitedJod: millisToJodString(forfeitedMillis),
    totalAvailableJod: millisToJodString(availableMillis),
    totalAcceptedArticles: accepted,
    totalPublishedArticles: published,
    entries,
  };
}

const EARNED_BALANCE_SQL = `
SELECT
  e.article_application_id,
  e.article_id,
  e.amount_jod AS ledger_amount_jod,
  e.status AS entry_status,
  e.entry_type,
  e.metadata AS entry_metadata,
  e.created_at,
  s.settled_at,
  s.writer_net_jod,
  art.title AS article_title,
  a.activation_campaign_id,
  a.activation_wave_id,
  c.name AS campaign_name,
  c.freelancer_share_jod,
  w.name AS wave_name,
  p.bildazo_article_url,
  p.status AS publish_status,
  p.published_at
 FROM marketplace_article_financial_entries e
 JOIN marketplace_article_settlements s ON s.id = e.settlement_id
 JOIN marketplace_articles art ON art.id = e.article_id
 JOIN marketplace_article_applications a ON a.id = e.article_application_id
 LEFT JOIN freelancer_activation_campaigns c ON c.id = a.activation_campaign_id
 LEFT JOIN freelancer_activation_waves w ON w.id = a.activation_wave_id
 LEFT JOIN bildazo_article_publish_records p ON p.orderz_application_id = e.article_application_id
WHERE e.beneficiary_user_id = $1
  AND e.entry_type = ANY($2::text[])
ORDER BY COALESCE(s.settled_at, e.created_at) DESC, e.id DESC
LIMIT 50`;

const EARNED_BALANCE_SQL_CORE = `
SELECT
  e.article_application_id,
  e.article_id,
  e.amount_jod AS ledger_amount_jod,
  e.status AS entry_status,
  e.entry_type,
  e.metadata AS entry_metadata,
  e.created_at,
  s.settled_at,
  s.writer_net_jod,
  art.title AS article_title
 FROM marketplace_article_financial_entries e
 JOIN marketplace_article_settlements s ON s.id = e.settlement_id
 JOIN marketplace_articles art ON art.id = e.article_id
WHERE e.beneficiary_user_id = $1
  AND e.entry_type = ANY($2::text[])
ORDER BY COALESCE(s.settled_at, e.created_at) DESC, e.id DESC
LIMIT 50`;

async function loadEarnedBalanceRows(runner, freelancerUserId) {
  try {
    const { rows } = await runner.query(EARNED_BALANCE_SQL, [
      Number(freelancerUserId),
      [...WRITER_ENTRY_TYPES],
    ]);
    return rows;
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
    const { rows } = await runner.query(EARNED_BALANCE_SQL_CORE, [
      Number(freelancerUserId),
      [...WRITER_ENTRY_TYPES],
    ]);
    return rows;
  }
}

async function getFreelancerEarnedBalance(freelancerUserId, { client = null, now = new Date(), evaluateForfeiture = true } = {}) {
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) return emptyEarnedBalance();
  const runner = client || pool;
  try {
    if (evaluateForfeiture) {
      await forfeitureService.evaluateAndApplyForfeitureIfDue(id, { client: runner, now });
    }
    const lockPolicy = await forfeitureService.resolveEarningsLockPolicy(id, { client: runner, now });
    const companyApproved = await loadFreelancerCompanyApproved(runner, id);
    const rows = await loadEarnedBalanceRows(runner, id);
    const mapped = (rows || []).map((row) =>
      mapEarnedBalanceEntry(row, { lockPolicy, companyApproved }),
    );
    const summary = summarizeEntries(mapped);
    const writerProfileUrl = await loadWriterProfileUrl(id, runner);
    return {
      ...summary,
      writerProfileUrl: writerProfileUrl || null,
      lockPolicy: {
        state: lockPolicy.state,
        graceDays: lockPolicy.graceDays,
        trialEndsAt: lockPolicy.trialEndsAt,
        forfeitureDeadlineAt: lockPolicy.forfeitureDeadlineAt,
        graceDaysRemaining: lockPolicy.graceDaysRemaining,
        showSilverCta: lockPolicy.showSilverCta,
        messages: lockPolicy.messages,
      },
      withdrawalPolicy: buildWithdrawalPolicy(companyApproved),
    };
  } catch (err) {
    if (isMissingSchema(err)) return emptyEarnedBalance();
    throw err;
  }
}

function emptyAdminEarnedBalance() {
  return {
    totalPendingJod: "0.000",
    totalLockedPendingJod: "0.000",
    totalReleasedJod: "0.000",
    totalForfeitedJod: "0.000",
    totalCompanyRetainedJod: "0.000",
    totalAcceptedArticles: 0,
    totalPublishedArticles: 0,
    byCampaign: [],
  };
}

function adminMapEntryStatus(row) {
  const type = String(row.entry_type || "");
  const status = String(row.entry_status || row.status || "");
  if (status === "forfeited") return "forfeited";
  if (type === "writer_starter_pending" && status === "pending") return "pending";
  if (type === "writer_starter_pending" && status === "released") return "released";
  if (type === "writer_available") return "released";
  return status;
}

async function getSuperAdminEarnedBalanceSummary({ client = null, now = new Date() } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT
         e.article_application_id,
         e.article_id,
         e.beneficiary_user_id,
         a.activation_campaign_id AS campaign_id,
         c.name AS campaign_name,
         a.activation_wave_id AS wave_id,
         w.name AS wave_name,
         e.amount_jod,
         e.status AS entry_status,
         e.entry_type,
         c.freelancer_share_jod,
         p.status AS publish_status
        FROM marketplace_article_financial_entries e
        JOIN marketplace_article_applications a ON a.id = e.article_application_id
        LEFT JOIN freelancer_activation_campaigns c ON c.id = a.activation_campaign_id
        LEFT JOIN freelancer_activation_waves w ON w.id = a.activation_wave_id
        LEFT JOIN bildazo_article_publish_records p ON p.orderz_application_id = e.article_application_id
       WHERE e.entry_type = ANY($1::text[])
          OR e.entry_type = 'company_trial_forfeiture'`,
      [[...WRITER_ENTRY_TYPES]],
    );

    const campaigns = new Map();
    let pendingMillis = 0;
    let releasedMillis = 0;
    let forfeitedMillis = 0;
    let companyRetainedMillis = 0;
    let accepted = 0;
    let published = 0;

    for (const row of rows || []) {
      if (row.entry_type === "company_trial_forfeiture") {
        try {
          companyRetainedMillis += parseJodToMillis(row.amount_jod, { label: "companyForfeiture" });
        } catch {
          /* skip */
        }
        continue;
      }

      const bucketStatus = adminMapEntryStatus(row);
      const mapped = mapEarnedBalanceEntry({
        ...row,
        article_application_id: row.article_application_id || "0",
        article_id: row.article_id || "0",
        ledger_amount_jod: row.amount_jod,
      });
      if (mapped.status === "voided") continue;
      accepted += 1;
      if (PUBLISHED_STATUSES.includes(String(row.publish_status || ""))) published += 1;

      let millis = 0;
      try {
        millis = parseJodToMillis(mapped.amountJod, { label: "adminEarned" });
      } catch {
        millis = 0;
      }

      if (bucketStatus === "forfeited") forfeitedMillis += millis;
      else if (bucketStatus === "pending") pendingMillis += millis;
      else if (bucketStatus === "released") releasedMillis += millis;

      const key = row.campaign_id != null ? String(row.campaign_id) : "unattached";
      if (!campaigns.has(key)) {
        campaigns.set(key, {
          campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
          campaignName: row.campaign_name || null,
          waveId: row.wave_id != null ? String(row.wave_id) : null,
          waveName: row.wave_name || null,
          pendingJodMillis: 0,
          releasedJodMillis: 0,
          forfeitedJodMillis: 0,
          acceptedCount: 0,
          publishedCount: 0,
        });
      }
      const bucket = campaigns.get(key);
      bucket.acceptedCount += 1;
      if (PUBLISHED_STATUSES.includes(String(row.publish_status || ""))) bucket.publishedCount += 1;
      if (bucketStatus === "forfeited") bucket.forfeitedJodMillis += millis;
      else if (bucketStatus === "pending") bucket.pendingJodMillis += millis;
      else if (bucketStatus === "released") bucket.releasedJodMillis += millis;
    }

    return {
      totalPendingJod: millisToJodString(pendingMillis),
      totalLockedPendingJod: millisToJodString(pendingMillis),
      totalReleasedJod: millisToJodString(releasedMillis),
      totalForfeitedJod: millisToJodString(forfeitedMillis),
      totalCompanyRetainedJod: millisToJodString(companyRetainedMillis),
      totalAcceptedArticles: accepted,
      totalPublishedArticles: published,
      byCampaign: [...campaigns.values()].map((b) => ({
        campaignId: b.campaignId,
        campaignName: b.campaignName,
        waveId: b.waveId,
        waveName: b.waveName,
        pendingJod: millisToJodString(b.pendingJodMillis),
        releasedJod: millisToJodString(b.releasedJodMillis),
        forfeitedJod: millisToJodString(b.forfeitedJodMillis),
        acceptedCount: b.acceptedCount,
        publishedCount: b.publishedCount,
      })),
      evaluatedAt: new Date(now).toISOString(),
    };
  } catch (err) {
    if (isMissingSchema(err)) return emptyAdminEarnedBalance();
    throw err;
  }
}

module.exports = {
  emptyEarnedBalance,
  mapEarnedBalanceEntry,
  mapEntryStatus,
  resolveDisplayAmountJod,
  summarizeEntries,
  getFreelancerEarnedBalance,
  getSuperAdminEarnedBalanceSummary,
  buildWithdrawalPolicy,
  loadFreelancerCompanyApproved,
  EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR,
  EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN,
  WRITER_ENTRY_TYPES,
};
