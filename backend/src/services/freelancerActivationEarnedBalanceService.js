/**
 * Phase A5 — read-only Earned Balance over existing Mini Article settlement ledger.
 * Does not insert wallet, claims, Stripe, or duplicate money rows.
 */

const { pool } = require("../config/db");
const { millisToJodString, parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");

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
    totalAcceptedArticles: 0,
    totalPublishedArticles: 0,
    entries: [],
  };
}

function mapEntryStatus(row) {
  const type = String(row.entry_type || "");
  const status = String(row.entry_status || row.status || "");
  if (status === "void") return "voided";
  if (type === "writer_starter_pending" && status === "pending") return "pending";
  if (type === "writer_starter_pending" && status === "released") return "settled_externally";
  if (type === "writer_available") return "settled_externally";
  if (status === "pending") return "pending";
  return "settled_externally";
}

function isPublished(row) {
  return PUBLISHED_STATUSES.includes(String(row.publish_status || ""));
}

function resolveDisplayAmountJod(row) {
  // F1: prefer frozen settlement writer net / ledger amount over live campaign share.
  const frozen =
    row.writer_net_jod ?? row.ledger_amount_jod ?? row.amount_jod ?? null;
  if (frozen != null && Number.isFinite(Number(frozen))) {
    return formatJod(frozen);
  }
  return formatJod(0);
}

function mapEarnedBalanceEntry(row) {
  const status = mapEntryStatus(row);
  const published = isPublished(row);
  return {
    applicationId: String(row.article_application_id ?? row.application_id),
    articleId: String(row.article_id),
    articleTitle: row.article_title || null,
    amountJod: resolveDisplayAmountJod(row),
    status,
    acceptedAt: row.settled_at || row.created_at || null,
    publishedAt: published ? (row.published_at || null) : null,
    bildazoUrl: published && row.bildazo_article_url ? String(row.bildazo_article_url) : null,
    campaignName: row.campaign_name || null,
    waveName: row.wave_name || null,
  };
}

function summarizeEntries(entries) {
  let pendingMillis = 0;
  let accepted = 0;
  let published = 0;
  for (const entry of entries) {
    if (entry.status === "voided") continue;
    accepted += 1;
    if (entry.bildazoUrl) published += 1;
    if (entry.status === "pending") {
      try {
        pendingMillis += parseJodToMillis(entry.amountJod, { label: "pendingJod" });
      } catch {
        /* skip bad amount */
      }
    }
  }
  return {
    totalPendingJod: millisToJodString(pendingMillis),
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

async function getFreelancerEarnedBalance(freelancerUserId, { client } = {}) {
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) return emptyEarnedBalance();
  const runner = client || pool;
  try {
    const rows = await loadEarnedBalanceRows(runner, id);
    return summarizeEntries((rows || []).map(mapEarnedBalanceEntry));
  } catch (err) {
    if (isMissingSchema(err)) return emptyEarnedBalance();
    throw err;
  }
}

function emptyAdminEarnedBalance() {
  return {
    totalPendingJod: "0.000",
    totalAcceptedArticles: 0,
    totalPublishedArticles: 0,
    byCampaign: [],
  };
}

async function getSuperAdminEarnedBalanceSummary({ client } = {}) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT
         e.article_application_id,
         e.article_id,
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
       WHERE e.entry_type = ANY($1::text[])`,
      [[...WRITER_ENTRY_TYPES]],
    );
    const campaigns = new Map();
    let pendingMillis = 0;
    let accepted = 0;
    let published = 0;
    for (const row of rows || []) {
      const mapped = mapEarnedBalanceEntry({
        ...row,
        article_application_id: row.article_application_id || "0",
        article_id: row.article_id || "0",
        ledger_amount_jod: row.amount_jod,
        activation_campaign_id: row.campaign_id,
      });
      if (mapped.status === "voided") continue;
      accepted += 1;
      if (PUBLISHED_STATUSES.includes(String(row.publish_status || ""))) published += 1;
      if (mapped.status === "pending") {
        try {
          pendingMillis += parseJodToMillis(mapped.amountJod, { label: "adminPendingJod" });
        } catch {
          /* skip */
        }
      }
      const key = row.campaign_id != null ? String(row.campaign_id) : "unattached";
      if (!campaigns.has(key)) {
        campaigns.set(key, {
          campaignId: row.campaign_id != null ? String(row.campaign_id) : null,
          campaignName: row.campaign_name || null,
          waveId: row.wave_id != null ? String(row.wave_id) : null,
          waveName: row.wave_name || null,
          pendingJodMillis: 0,
          acceptedCount: 0,
          publishedCount: 0,
        });
      }
      const bucket = campaigns.get(key);
      bucket.acceptedCount += 1;
      if (PUBLISHED_STATUSES.includes(String(row.publish_status || ""))) bucket.publishedCount += 1;
      if (mapped.status === "pending") {
        try {
          bucket.pendingJodMillis += parseJodToMillis(mapped.amountJod, { label: "campaignPending" });
        } catch {
          /* skip */
        }
      }
    }
    return {
      totalPendingJod: millisToJodString(pendingMillis),
      totalAcceptedArticles: accepted,
      totalPublishedArticles: published,
      byCampaign: [...campaigns.values()].map((b) => ({
        campaignId: b.campaignId,
        campaignName: b.campaignName,
        waveId: b.waveId,
        waveName: b.waveName,
        pendingJod: millisToJodString(b.pendingJodMillis),
        acceptedCount: b.acceptedCount,
        publishedCount: b.publishedCount,
      })),
    };
  } catch (err) {
    if (isMissingSchema(err)) return emptyAdminEarnedBalance();
    throw err;
  }
}

module.exports = {
  emptyEarnedBalance,
  mapEarnedBalanceEntry,
  resolveDisplayAmountJod,
  summarizeEntries,
  getFreelancerEarnedBalance,
  getSuperAdminEarnedBalanceSummary,
};
