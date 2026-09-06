/**
 * Phase A7.1 — Freelancer Activation Engine KPI analytics (read-only).
 *
 * Aggregates existing trial / event / campaign / article / earned-balance sources.
 * Does not mutate rows, call payment providers, or expose PII.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { millisToJodString, parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");
const { FREELANCER_ACTIVATION_EVENT_TYPES } = require("../constants/freelancerActivationEngine");

const WRITER_ENTRY_TYPES = Object.freeze(["writer_starter_pending", "writer_available"]);
const PUBLISHED_STATUSES = Object.freeze(["published", "already_imported"]);
const ASSIGNMENT_STATUSES = Object.freeze([
  "selected",
  "assigned",
  "writing",
  "submitted",
  "under_review",
  "revision_requested",
  "approved",
]);

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function toPositiveIntOrNull(value, label) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw createAppError(`${label} must be a positive integer.`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_KPI_FILTER",
    });
  }
  return n;
}

function toDateOrNull(value, label) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw createAppError(`${label} must be a valid ISO date.`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_KPI_FILTER",
    });
  }
  return d;
}

function parseKpiFilters(filters = {}) {
  const campaignId = toPositiveIntOrNull(filters.campaignId, "campaignId");
  const waveId = toPositiveIntOrNull(filters.waveId, "waveId");
  const dateFrom = toDateOrNull(filters.dateFrom, "dateFrom");
  const dateTo = toDateOrNull(filters.dateTo, "dateTo");
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw createAppError("dateFrom must be before or equal to dateTo.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_KPI_FILTER",
    });
  }
  return {
    campaignId,
    waveId,
    dateFrom: dateFrom ? dateFrom.toISOString() : null,
    dateTo: dateTo ? dateTo.toISOString() : null,
  };
}

function safeRate(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return Number((n / d).toFixed(6));
}

function safeAvgDays(rows, startKey, endKey) {
  let sum = 0;
  let count = 0;
  for (const row of rows || []) {
    const start = row[startKey] ? new Date(row[startKey]).getTime() : NaN;
    const end = row[endKey] ? new Date(row[endKey]).getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    sum += (end - start) / 86400000;
    count += 1;
  }
  if (count < 1) return null;
  return Number((sum / count).toFixed(4));
}

function formatJodFromMillis(millis) {
  return millisToJodString(Math.max(0, Number(millis) || 0));
}

function emptyUnavailable() {
  return [
    {
      key: "funnel.registeredUsers",
      reason: "Activation Engine does not attribute platform registration to the trial funnel.",
    },
    {
      key: "funnel.verifiedUsers",
      reason: "Email/activation verification is not stored as Activation Engine funnel events.",
    },
    {
      key: "funnel.trainingCompletedUsers",
      reason: "Training completion is checked at gate time; no activation-scoped training funnel counter exists.",
    },
    {
      key: "rates.registeredToPaidRate",
      reason: "registeredUsers is unavailable.",
    },
    {
      key: "financial.subscriptionRevenueJod",
      reason:
        "Marketplace Silver uses company-approval activation requests without a reliable Activation Engine payment amount ledger.",
    },
  ];
}

function emptyKpiPayload(filters, { schemaReady = true } = {}) {
  const unavailableMetrics = emptyUnavailable();
  if (!schemaReady) {
    unavailableMetrics.push({
      key: "*",
      reason: "Activation Engine schema is not ready (migration 167+ not applied).",
    });
  }
  return {
    schemaReady,
    funnel: {
      registeredUsers: null,
      verifiedUsers: null,
      trainingCompletedUsers: null,
      trialActivatedUsers: 0,
      firstBidUsers: 0,
      firstAssignmentUsers: 0,
      firstAcceptedWorkUsers: 0,
      firstPublishedWorkUsers: 0,
      silverCtaShownUsers: 0,
      silverPaymentStartedUsers: 0,
      silverPaidUsers: 0,
    },
    rates: {
      trialActivatedToPaidRate: null,
      firstAcceptedToPaidRate: null,
      firstPublishedToPaidRate: null,
      ctaShownToPaymentStartedRate: null,
      paymentStartedToPaidRate: null,
      registeredToPaidRate: null,
    },
    timing: {
      averageTimeToFirstBid: null,
      averageTimeToFirstWin: null,
      averageTimeToFirstAccepted: null,
      averageTimeToFirstPublished: null,
    },
    articleQuality: {
      acceptedArticleCount: 0,
      rejectedArticleCount: 0,
      revisionRequestedCount: 0,
      publishedArticleCount: 0,
      articleAcceptanceRate: null,
      articleRejectionRate: null,
      revisionRate: null,
    },
    financial: {
      campaignBudgetTotalJod: "0.000",
      campaignBudgetReservedJod: "0.000",
      campaignBudgetUsedJod: "0.000",
      campaignBudgetRemainingJod: "0.000",
      pendingFreelancerEarnedJod: "0.000",
      subscriptionRevenueJod: null,
      costPerPaidFreelancer: null,
      workInventoryReserveAllocatedJod: null,
      workInventoryReserveActiveJod: null,
    },
    metadata: {
      generatedAt: new Date().toISOString(),
      filters,
      unavailableMetrics,
      notes: [
        "A7.1 backend KPI API only — UI is deferred to A7.2.",
        "Timing averages are in days.",
        "first_win_at on trials is unused; firstAssignmentUsers uses application selection/assignment statuses.",
        "first_published_at on trials is unused; firstPublishedWorkUsers uses Bildazo publish records.",
      ],
    },
  };
}

function pushNote(payload, note) {
  if (!payload.metadata.notes.includes(note)) {
    payload.metadata.notes.push(note);
  }
}

function pushUnavailable(payload, key, reason) {
  const exists = payload.metadata.unavailableMetrics.some((m) => m.key === key);
  if (!exists) {
    payload.metadata.unavailableMetrics.push({ key, reason });
  }
}

/**
 * In-memory / test-friendly aggregation over preloaded rows.
 * Production path loads rows then calls this so SQL stays simple and fake clients stay small.
 */
function computeKpisFromRows({
  filters,
  trials = [],
  events = [],
  applications = [],
  submissions = [],
  publishRecords = [],
  campaigns = [],
  waves = [],
  earnedRows = [],
  workInventoryRows = [],
  now = new Date(),
} = {}) {
  const payload = emptyKpiPayload(filters, { schemaReady: true });
  payload.metadata.generatedAt = now.toISOString();

  const dateFromMs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const dateToMs = filters.dateTo ? new Date(filters.dateTo).getTime() : null;

  function inDateRange(ts) {
    if (!ts) return false;
    const ms = new Date(ts).getTime();
    if (!Number.isFinite(ms)) return false;
    if (dateFromMs != null && ms < dateFromMs) return false;
    if (dateToMs != null && ms > dateToMs) return false;
    return true;
  }

  function matchesCampaignWave(row) {
    const campaignId = row.activation_campaign_id ?? row.campaign_id ?? null;
    const waveId = row.activation_wave_id ?? row.wave_id ?? null;
    if (filters.campaignId != null && Number(campaignId) !== Number(filters.campaignId)) {
      return false;
    }
    if (filters.waveId != null && Number(waveId) !== Number(filters.waveId)) {
      return false;
    }
    return true;
  }

  let scopedFreelancerIds = null;
  if (filters.campaignId != null || filters.waveId != null) {
    scopedFreelancerIds = new Set();
    for (const app of applications) {
      if (!matchesCampaignWave(app)) continue;
      const uid = Number(app.freelancer_user_id);
      if (Number.isInteger(uid) && uid > 0) scopedFreelancerIds.add(uid);
    }
  }

  function inCohort(userId) {
    if (!scopedFreelancerIds) return true;
    return scopedFreelancerIds.has(Number(userId));
  }

  const trialRows = trials.filter((t) => inCohort(t.freelancer_user_id));

  const trialActivatedUsers = trialRows.filter(
    (t) => t.started_at && inDateRange(t.started_at),
  ).length;
  const firstBidUsers = trialRows.filter(
    (t) => t.first_bid_at && inDateRange(t.first_bid_at),
  ).length;
  const firstAcceptedWorkUsers = trialRows.filter(
    (t) => t.first_accepted_at && inDateRange(t.first_accepted_at),
  ).length;

  const assignmentByUser = new Map();
  for (const app of applications) {
    if (!matchesCampaignWave(app)) continue;
    if (!inCohort(app.freelancer_user_id)) continue;
    const status = String(app.status || "");
    const selectedAt = app.selected_at || app.assigned_at || null;
    const isAssigned =
      ASSIGNMENT_STATUSES.includes(status) || Boolean(selectedAt);
    if (!isAssigned) continue;
    const ts = selectedAt || app.updated_at || app.created_at;
    if (!inDateRange(ts)) continue;
    const uid = Number(app.freelancer_user_id);
    const prev = assignmentByUser.get(uid);
    if (!prev || new Date(ts).getTime() < new Date(prev).getTime()) {
      assignmentByUser.set(uid, ts);
    }
  }
  const firstAssignmentUsers = assignmentByUser.size;

  const publishedByUser = new Map();
  const appById = new Map();
  for (const app of applications) {
    appById.set(Number(app.id), app);
  }
  for (const pub of publishRecords) {
    if (!PUBLISHED_STATUSES.includes(String(pub.status || ""))) continue;
    const app = appById.get(Number(pub.orderz_application_id ?? pub.application_id));
    if (!app) continue;
    if (!matchesCampaignWave(app)) continue;
    if (!inCohort(app.freelancer_user_id)) continue;
    const ts = pub.published_at || pub.created_at;
    if (!inDateRange(ts)) continue;
    const uid = Number(app.freelancer_user_id);
    const prev = publishedByUser.get(uid);
    if (!prev || new Date(ts).getTime() < new Date(prev).getTime()) {
      publishedByUser.set(uid, ts);
    }
  }
  // Fallback: trial first_published_at if publish join empty but column populated
  let firstPublishedWorkUsers = publishedByUser.size;
  if (firstPublishedWorkUsers === 0) {
    const fromTrials = trialRows.filter(
      (t) => t.first_published_at && inDateRange(t.first_published_at),
    ).length;
    if (fromTrials > 0) {
      firstPublishedWorkUsers = fromTrials;
      pushNote(
        payload,
        "firstPublishedWorkUsers fell back to freelancer_activation_trials.first_published_at (publish records empty).",
      );
    }
  }

  function distinctEventUsers(eventType) {
    const set = new Set();
    for (const ev of events) {
      if (String(ev.event_type) !== eventType) continue;
      if (!inCohort(ev.freelancer_user_id)) continue;
      if (!inDateRange(ev.created_at)) continue;
      set.add(Number(ev.freelancer_user_id));
    }
    return set.size;
  }

  const silverCtaShownUsers = Math.max(
    distinctEventUsers(FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN),
    trialRows.filter((t) => t.silver_cta_first_shown_at && inDateRange(t.silver_cta_first_shown_at))
      .length,
  );
  const silverPaymentStartedUsers = distinctEventUsers(
    FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
  );
  const paidFromTrials = trialRows.filter((t) => {
    const paidAt = t.silver_paid_at;
    const isPaid = t.status === "paid_active" || Boolean(paidAt);
    if (!isPaid) return false;
    return inDateRange(paidAt || t.updated_at || t.started_at);
  }).length;
  const silverPaidUsers = Math.max(
    paidFromTrials,
    distinctEventUsers(FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED),
  );

  payload.funnel.trialActivatedUsers = trialActivatedUsers;
  payload.funnel.firstBidUsers = firstBidUsers;
  payload.funnel.firstAssignmentUsers = firstAssignmentUsers;
  payload.funnel.firstAcceptedWorkUsers = firstAcceptedWorkUsers;
  payload.funnel.firstPublishedWorkUsers = firstPublishedWorkUsers;
  payload.funnel.silverCtaShownUsers = silverCtaShownUsers;
  payload.funnel.silverPaymentStartedUsers = silverPaymentStartedUsers;
  payload.funnel.silverPaidUsers = silverPaidUsers;

  payload.rates.trialActivatedToPaidRate = safeRate(silverPaidUsers, trialActivatedUsers);
  payload.rates.firstAcceptedToPaidRate = safeRate(silverPaidUsers, firstAcceptedWorkUsers);
  payload.rates.firstPublishedToPaidRate = safeRate(silverPaidUsers, firstPublishedWorkUsers);
  payload.rates.ctaShownToPaymentStartedRate = safeRate(
    silverPaymentStartedUsers,
    silverCtaShownUsers,
  );
  payload.rates.paymentStartedToPaidRate = safeRate(silverPaidUsers, silverPaymentStartedUsers);
  payload.rates.registeredToPaidRate = null;

  payload.timing.averageTimeToFirstBid = safeAvgDays(
    trialRows.filter((t) => t.started_at && t.first_bid_at && inDateRange(t.first_bid_at)),
    "started_at",
    "first_bid_at",
  );

  const winTimingRows = [];
  for (const [uid, selectedAt] of assignmentByUser.entries()) {
    const trial = trialRows.find((t) => Number(t.freelancer_user_id) === Number(uid));
    if (!trial?.started_at) continue;
    winTimingRows.push({ started_at: trial.started_at, first_win_at: selectedAt });
  }
  payload.timing.averageTimeToFirstWin = safeAvgDays(winTimingRows, "started_at", "first_win_at");
  if (payload.timing.averageTimeToFirstWin == null) {
    pushUnavailable(
      payload,
      "timing.averageTimeToFirstWin",
      "No assignment timestamps available for average (trials.first_win_at is unused).",
    );
  }

  payload.timing.averageTimeToFirstAccepted = safeAvgDays(
    trialRows.filter(
      (t) => t.started_at && t.first_accepted_at && inDateRange(t.first_accepted_at),
    ),
    "started_at",
    "first_accepted_at",
  );

  const publishedTimingRows = [];
  for (const [uid, publishedAt] of publishedByUser.entries()) {
    const trial = trialRows.find((t) => Number(t.freelancer_user_id) === Number(uid));
    if (!trial?.started_at) continue;
    publishedTimingRows.push({ started_at: trial.started_at, first_published_at: publishedAt });
  }
  if (publishedTimingRows.length === 0) {
    payload.timing.averageTimeToFirstPublished = safeAvgDays(
      trialRows.filter(
        (t) => t.started_at && t.first_published_at && inDateRange(t.first_published_at),
      ),
      "started_at",
      "first_published_at",
    );
  } else {
    payload.timing.averageTimeToFirstPublished = safeAvgDays(
      publishedTimingRows,
      "started_at",
      "first_published_at",
    );
  }

  // Article quality from submissions (activation-linked apps only when filter present;
  // when no filter, count submissions on apps that have any activation campaign id OR all
  // activation-linked submissions; if none linked, still count submissions joined to apps
  // that belong to activation cohort when scoped).
  let accepted = 0;
  let rejected = 0;
  let revision = 0;
  let submissionTotal = 0;
  for (const sub of submissions) {
    const app =
      appById.get(Number(sub.article_application_id ?? sub.application_id)) || null;
    if (filters.campaignId != null || filters.waveId != null) {
      if (!app || !matchesCampaignWave(app)) continue;
    } else if (app && app.activation_campaign_id == null && app.activation_wave_id == null) {
      // Global KPIs: prefer activation-linked manuscripts; skip non-activation apps
      // when any activation-linked submission exists in the dataset.
      continue;
    }
    const ts = sub.updated_at || sub.created_at || sub.submitted_at;
    if (dateFromMs != null || dateToMs != null) {
      if (!inDateRange(ts)) continue;
    }
    submissionTotal += 1;
    const status = String(sub.status || "");
    if (status === "approved") accepted += 1;
    else if (status === "rejected") rejected += 1;
    else if (status === "revision_requested") revision += 1;
  }

  // If global filter skipped everything because apps lack campaign ids, recount all
  // submissions (activation engine may run before attach) — mark as approximate.
  if (
    filters.campaignId == null &&
    filters.waveId == null &&
    submissionTotal === 0 &&
    submissions.length > 0
  ) {
    for (const sub of submissions) {
      const ts = sub.updated_at || sub.created_at || sub.submitted_at;
      if (dateFromMs != null || dateToMs != null) {
        if (!inDateRange(ts)) continue;
      }
      submissionTotal += 1;
      const status = String(sub.status || "");
      if (status === "approved") accepted += 1;
      else if (status === "rejected") rejected += 1;
      else if (status === "revision_requested") revision += 1;
    }
    if (submissionTotal > 0) {
      pushNote(
        payload,
        "articleQuality includes manuscripts not linked to an activation campaign (no campaign/wave filter).",
      );
    }
  }

  let publishedArticleCount = 0;
  for (const pub of publishRecords) {
    if (!PUBLISHED_STATUSES.includes(String(pub.status || ""))) continue;
    const app = appById.get(Number(pub.orderz_application_id ?? pub.application_id));
    if (filters.campaignId != null || filters.waveId != null) {
      if (!app || !matchesCampaignWave(app)) continue;
    } else if (app && app.activation_campaign_id == null && app.activation_wave_id == null) {
      continue;
    }
    const ts = pub.published_at || pub.created_at;
    if (dateFromMs != null || dateToMs != null) {
      if (!inDateRange(ts)) continue;
    }
    publishedArticleCount += 1;
  }
  if (
    filters.campaignId == null &&
    filters.waveId == null &&
    publishedArticleCount === 0 &&
    publishRecords.some((p) => PUBLISHED_STATUSES.includes(String(p.status || "")))
  ) {
    for (const pub of publishRecords) {
      if (!PUBLISHED_STATUSES.includes(String(pub.status || ""))) continue;
      const ts = pub.published_at || pub.created_at;
      if (dateFromMs != null || dateToMs != null) {
        if (!inDateRange(ts)) continue;
      }
      publishedArticleCount += 1;
    }
  }

  payload.articleQuality.acceptedArticleCount = accepted;
  payload.articleQuality.rejectedArticleCount = rejected;
  payload.articleQuality.revisionRequestedCount = revision;
  payload.articleQuality.publishedArticleCount = publishedArticleCount;
  const qualityDenom = accepted + rejected + revision;
  payload.articleQuality.articleAcceptanceRate = safeRate(accepted, qualityDenom);
  payload.articleQuality.articleRejectionRate = safeRate(rejected, qualityDenom);
  payload.articleQuality.revisionRate = safeRate(revision, qualityDenom);

  // Financial budgets — A4.2 campaign/wave counters
  let totalMillis = 0;
  let reservedMillis = 0;
  let usedMillis = 0;
  if (filters.waveId != null) {
    const wave = waves.find((w) => Number(w.id) === Number(filters.waveId));
    if (wave) {
      if (filters.campaignId != null && Number(wave.campaign_id) !== Number(filters.campaignId)) {
        pushNote(payload, "waveId does not belong to the provided campaignId; budget totals are zero.");
      } else {
        try {
          totalMillis = parseJodToMillis(String(wave.budget_jod ?? "0"), { label: "waveBudget" });
          reservedMillis = parseJodToMillis(String(wave.reserved_budget_jod ?? "0"), {
            label: "waveReserved",
          });
          usedMillis = parseJodToMillis(String(wave.used_budget_jod ?? "0"), { label: "waveUsed" });
        } catch {
          totalMillis = 0;
          reservedMillis = 0;
          usedMillis = 0;
        }
      }
    }
  } else {
    const scopedCampaigns =
      filters.campaignId != null
        ? campaigns.filter((c) => Number(c.id) === Number(filters.campaignId))
        : campaigns;
    for (const c of scopedCampaigns) {
      try {
        totalMillis += parseJodToMillis(String(c.total_budget_jod ?? "0"), {
          label: "campaignTotal",
        });
        reservedMillis += parseJodToMillis(String(c.reserved_budget_jod ?? "0"), {
          label: "campaignReserved",
        });
        usedMillis += parseJodToMillis(String(c.used_budget_jod ?? "0"), {
          label: "campaignUsed",
        });
      } catch {
        /* skip bad row */
      }
    }
  }
  const remainingMillis = Math.max(0, totalMillis - reservedMillis - usedMillis);
  payload.financial.campaignBudgetTotalJod = formatJodFromMillis(totalMillis);
  payload.financial.campaignBudgetReservedJod = formatJodFromMillis(reservedMillis);
  payload.financial.campaignBudgetUsedJod = formatJodFromMillis(usedMillis);
  payload.financial.campaignBudgetRemainingJod = formatJodFromMillis(remainingMillis);

  let pendingMillis = 0;
  for (const row of earnedRows) {
    if (!matchesCampaignWave(row) && (filters.campaignId != null || filters.waveId != null)) {
      continue;
    }
    if (filters.campaignId == null && filters.waveId == null) {
      // include all writer pending rows for activation engine pending total
    }
    const entryType = String(row.entry_type || "");
    const entryStatus = String(row.entry_status || row.status || "");
    if (entryType === "writer_starter_pending" && entryStatus === "pending") {
      const share =
        row.freelancer_share_jod != null && row.activation_campaign_id != null
          ? row.freelancer_share_jod
          : row.amount_jod ?? row.ledger_amount_jod;
      try {
        pendingMillis += parseJodToMillis(share || "0", { label: "pendingEarned" });
      } catch {
        /* skip */
      }
    }
  }
  payload.financial.pendingFreelancerEarnedJod = formatJodFromMillis(pendingMillis);
  payload.financial.subscriptionRevenueJod = null;

  // A8 Work Inventory Reserve totals (null only when schema missing)
  if (workInventoryRows == null) {
    payload.financial.workInventoryReserveAllocatedJod = null;
    payload.financial.workInventoryReserveActiveJod = null;
    pushUnavailable(
      payload,
      "financial.workInventoryReserveAllocatedJod",
      "Work Inventory Reserve ledger schema is not ready.",
    );
    pushUnavailable(
      payload,
      "financial.workInventoryReserveActiveJod",
      "Work Inventory Reserve ledger schema is not ready.",
    );
  } else {
    let allocatedMillis = 0;
    let activeMillis = 0;
    for (const row of workInventoryRows) {
      const type = String(row.entry_type || "");
      const status = String(row.status || "");
      try {
        const amt = parseJodToMillis(String(row.reserve_amount_jod ?? "0"), {
          label: "wirKpi",
        });
        if (type === "membership_reserve_allocated") {
          allocatedMillis += amt;
          if (status === "active") activeMillis += amt;
        }
      } catch {
        /* skip */
      }
    }
    payload.financial.workInventoryReserveAllocatedJod = formatJodFromMillis(allocatedMillis);
    payload.financial.workInventoryReserveActiveJod = formatJodFromMillis(activeMillis);
  }

  if (silverPaidUsers > 0 && usedMillis > 0) {
    payload.financial.costPerPaidFreelancer = formatJodFromMillis(
      Math.round(usedMillis / silverPaidUsers),
    );
  } else {
    payload.financial.costPerPaidFreelancer = null;
    if (silverPaidUsers < 1) {
      pushUnavailable(
        payload,
        "financial.costPerPaidFreelancer",
        "Paid freelancer count is zero.",
      );
    } else if (usedMillis <= 0) {
      pushUnavailable(
        payload,
        "financial.costPerPaidFreelancer",
        "Campaign used budget is zero; cost base unavailable.",
      );
    }
  }

  // Ensure no PII keys
  const json = JSON.stringify(payload);
  if (/"email"|"phone"|"password"/i.test(json)) {
    throw createAppError("KPI payload unexpectedly contained PII fields.", 500);
  }

  return payload;
}

async function loadKpiSourceRows(runner, filters) {
  const campaignId = filters.campaignId;
  const waveId = filters.waveId;

  const [
    trials,
    events,
    applications,
    submissions,
    publishRecords,
    campaigns,
    waves,
    earnedRows,
    workInventory,
  ] = await Promise.all([
      runner.query(`SELECT * FROM freelancer_activation_trials`),
      runner.query(
        `SELECT freelancer_user_id, trial_id, event_type, created_at
           FROM freelancer_activation_events
          WHERE event_type = ANY($1::text[])`,
        [
          [
            FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_CTA_SHOWN,
            FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAYMENT_STARTED,
            FREELANCER_ACTIVATION_EVENT_TYPES.SILVER_PAID_DETECTED,
            FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATED,
          ],
        ],
      ),
      runner.query(
        `SELECT id, freelancer_user_id, status, selected_at, assigned_at, created_at, updated_at,
                activation_campaign_id, activation_wave_id
           FROM marketplace_article_applications
          WHERE ($1::bigint IS NULL OR activation_campaign_id = $1)
            AND ($2::bigint IS NULL OR activation_wave_id = $2)`,
        [campaignId, waveId],
      ).catch(async (err) => {
        if (!isMissingSchema(err)) throw err;
        return runner.query(
          `SELECT id, freelancer_user_id, status, created_at, updated_at
             FROM marketplace_article_applications`,
        );
      }),
      runner.query(
        `SELECT s.id, s.article_application_id, s.status, s.created_at, s.updated_at
           FROM marketplace_article_submissions s`,
      ).catch((err) => {
        if (isMissingSchema(err)) return { rows: [] };
        throw err;
      }),
      runner.query(
        `SELECT orderz_application_id, status, published_at, created_at
           FROM bildazo_article_publish_records`,
      ).catch((err) => {
        if (isMissingSchema(err)) return { rows: [] };
        throw err;
      }),
      runner.query(
        `SELECT id, total_budget_jod, reserved_budget_jod, used_budget_jod
           FROM freelancer_activation_campaigns
          WHERE ($1::bigint IS NULL OR id = $1)`,
        [campaignId],
      ).catch((err) => {
        if (isMissingSchema(err)) return { rows: [] };
        throw err;
      }),
      runner.query(
        `SELECT id, campaign_id, budget_jod, reserved_budget_jod, used_budget_jod
           FROM freelancer_activation_waves
          WHERE ($1::bigint IS NULL OR id = $1)
            AND ($2::bigint IS NULL OR campaign_id = $2)`,
        [waveId, campaignId],
      ).catch((err) => {
        if (isMissingSchema(err)) return { rows: [] };
        throw err;
      }),
      runner.query(
        `SELECT
           e.amount_jod,
           e.status AS entry_status,
           e.entry_type,
           a.activation_campaign_id,
           a.activation_wave_id,
           c.freelancer_share_jod
          FROM marketplace_article_financial_entries e
          JOIN marketplace_article_applications a ON a.id = e.article_application_id
          LEFT JOIN freelancer_activation_campaigns c ON c.id = a.activation_campaign_id
         WHERE e.entry_type = ANY($1::text[])
           AND ($2::bigint IS NULL OR a.activation_campaign_id = $2)
           AND ($3::bigint IS NULL OR a.activation_wave_id = $3)`,
        [[...WRITER_ENTRY_TYPES], campaignId, waveId],
      ).catch((err) => {
        if (isMissingSchema(err)) return { rows: [] };
        throw err;
      }),
      runner
        .query(
          `SELECT entry_type, status, reserve_amount_jod
             FROM freelancer_activation_work_inventory_reserve_entries`,
        )
        .catch((err) => {
          if (isMissingSchema(err)) return { rows: null, _missing: true };
          throw err;
        }),
    ]);

  return {
    trials: trials.rows || [],
    events: events.rows || [],
    applications: applications.rows || [],
    submissions: submissions.rows || [],
    publishRecords: publishRecords.rows || [],
    campaigns: campaigns.rows || [],
    waves: waves.rows || [],
    earnedRows: earnedRows.rows || [],
    workInventoryRows: workInventory && workInventory._missing ? null : workInventory.rows || [],
  };
}

async function getFreelancerActivationKpis(filters = {}, { client = null, now = new Date() } = {}) {
  const parsed = parseKpiFilters(filters);
  const runner = client || pool;

  try {
    await runner.query(`SELECT 1 FROM freelancer_activation_trials LIMIT 1`);
  } catch (err) {
    if (isMissingSchema(err)) {
      return emptyKpiPayload(parsed, { schemaReady: false });
    }
    throw err;
  }

  try {
    const rows = await loadKpiSourceRows(runner, parsed);
    return computeKpisFromRows({
      filters: parsed,
      ...rows,
      now,
    });
  } catch (err) {
    if (isMissingSchema(err)) {
      return emptyKpiPayload(parsed, { schemaReady: false });
    }
    throw err;
  }
}

module.exports = {
  getFreelancerActivationKpis,
  parseKpiFilters,
  computeKpisFromRows,
  safeRate,
  safeAvgDays,
  emptyKpiPayload,
  ASSIGNMENT_STATUSES,
  PUBLISHED_STATUSES,
};
