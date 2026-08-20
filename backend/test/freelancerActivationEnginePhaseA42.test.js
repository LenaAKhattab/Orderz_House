/**
 * Phase A4.2 — campaign/wave budget reserve, release, and use.
 * Does not apply migrations. No Production / git / Stripe / orders.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a42_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  FREELANCER_ACTIVATION_ERROR_CODES,
} = require("../src/constants/freelancerActivationEngine");
const campaignService = require("../src/services/freelancerActivationCampaignService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function settingsRow(overrides = {}) {
  return {
    freelancer_activation_engine_enabled: false,
    freelancer_activation_trial_duration_days: 10,
    freelancer_activation_trial_bids: 20,
    freelancer_activation_daily_bid_limit: 2,
    freelancer_activation_successful_work_cap: 2,
    freelancer_activation_requires_training: true,
    freelancer_activation_requires_verification: true,
    freelancer_activation_silver_plan_code: "silver",
    freelancer_activation_archive_after_days: 45,
    ...overrides,
  };
}

function addJod(a, b) {
  return (Number(a || 0) + Number(b || 0)).toFixed(3);
}

function createFakeClient(mem) {
  mem.campaigns = mem.campaigns || [];
  mem.waves = mem.waves || [];
  mem.entries = mem.entries || [];
  mem.nextCampaignId = mem.nextCampaignId || 1;
  mem.nextWaveId = mem.nextWaveId || 1;
  mem.nextEntryId = mem.nextEntryId || 1;
  mem.settings = mem.settings || settingsRow();
  mem.stamps = mem.stamps || {};
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
      if (s.includes("freelancer_activation_engine_enabled") && s.includes("SELECT")) {
        return { rows: [mem.settings] };
      }
      if (s.includes("INSERT INTO freelancer_activation_campaigns")) {
        const row = {
          id: mem.nextCampaignId++,
          name: params[0],
          status: params[1],
          total_budget_jod: params[2],
          reserved_budget_jod: "0.000",
          used_budget_jod: "0.000",
          article_total_value_jod: params[3],
          freelancer_share_jod: params[4],
          company_share_jod: params[5],
          reviewer_share_jod: params[6],
          trial_bid_limit: params[7],
          trial_duration_days: params[8],
          daily_bid_limit: params[9],
          minimum_bidders_per_article: params[10],
          max_trial_wins: params[11],
          daily_article_budget_jod: params[12],
          max_daily_articles: params[13],
          verification_required: params[14],
          training_required: params[15],
          auto_publish_to_bildazo: params[16],
          emergency_stop_enabled: false,
          pause_new_assignments: false,
          silver_plan_code: params[17],
          silver_price_jod: params[18],
          work_inventory_percentage: params[19],
          starts_at: params[20],
          ends_at: params[21],
          created_by_user_id: params[22],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mem.campaigns.push(row);
        return { rows: [row] };
      }
      if (s.includes("INSERT INTO freelancer_activation_budget_entries")) {
        if (mem.failNextBudgetInsert) {
          mem.failNextBudgetInsert = false;
          const err = new Error("duplicate");
          err.code = "23505";
          throw err;
        }
        const row = {
          id: mem.nextEntryId++,
          campaign_id: params[0],
          wave_id: params[1],
          entry_type: params[2],
          amount_jod: params[3],
          article_id: params[6] || null,
          application_id: params[7] || null,
          freelancer_user_id: params[8] || null,
        };
        const dup = mem.entries.find(
          (e) =>
            Number(e.application_id) === Number(row.application_id)
            && e.entry_type === row.entry_type
            && row.application_id,
        );
        if (dup) {
          const err = new Error("duplicate");
          err.code = "23505";
          throw err;
        }
        mem.entries.push(row);
        return { rows: [row] };
      }
      if (s.includes("INSERT INTO freelancer_activation_waves")) {
        const row = {
          id: mem.nextWaveId++,
          campaign_id: params[0],
          name: params[1],
          status: params[2],
          budget_jod: params[3],
          reserved_budget_jod: "0.000",
          used_budget_jod: "0.000",
          target_freelancers: params[4],
          daily_budget_jod: params[5],
          max_daily_articles: params[6],
          starts_at: params[7],
          ends_at: params[8],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mem.waves.push(row);
        return { rows: [row] };
      }
      if (s.includes("FROM freelancer_activation_budget_entries") && s.includes("application_id")) {
        const found = mem.entries.find(
          (e) => Number(e.application_id) === Number(params[0]) && e.entry_type === params[1],
        );
        return { rows: found ? [found] : [] };
      }
      if (s.includes("FROM freelancer_activation_waves") && s.includes("WHERE id = $1")) {
        const found = mem.waves.find((w) => Number(w.id) === Number(params[0]));
        return { rows: found ? [found] : [] };
      }
      if (s.includes("FROM freelancer_activation_waves")) {
        const cid = Number(params[0]);
        return { rows: mem.waves.filter((w) => Number(w.campaign_id) === cid) };
      }
      if (s.includes("FROM freelancer_activation_campaigns WHERE id")) {
        const found = mem.campaigns.find((c) => Number(c.id) === Number(params[0]));
        return { rows: found ? [found] : [] };
      }
      if (s.includes("FROM freelancer_activation_campaigns")) {
        return { rows: mem.campaigns };
      }
      if (s.includes("FROM freelancer_activation_budget_entries")) {
        return { rows: mem.entries.filter((e) => Number(e.campaign_id) === Number(params[0])) };
      }
      if (s.includes("FROM marketplace_article_applications")) {
        return { rows: [{ assigned_n: mem.assignedN || 0, accepted_n: mem.acceptedN || 0 }] };
      }
      if (s.includes("FROM marketplace_articles WHERE")) {
        return { rows: [{ n: mem.linkedArticlesCount || 0 }] };
      }
      if (s.includes("UPDATE freelancer_activation_campaigns") && s.includes("reserved_budget_jod = reserved_budget_jod")) {
        const c = mem.campaigns.find((x) => Number(x.id) === Number(params[0]));
        if (c) {
          c.reserved_budget_jod = addJod(c.reserved_budget_jod, params[1]);
          c.used_budget_jod = addJod(c.used_budget_jod, params[2]);
        }
        return { rows: c ? [c] : [] };
      }
      if (s.includes("UPDATE freelancer_activation_waves") && s.includes("reserved_budget_jod = reserved_budget_jod")) {
        const w = mem.waves.find((x) => Number(x.id) === Number(params[0]));
        if (w) {
          w.reserved_budget_jod = addJod(w.reserved_budget_jod, params[1]);
          w.used_budget_jod = addJod(w.used_budget_jod, params[2]);
        }
        return { rows: w ? [w] : [] };
      }
      if (s.includes("UPDATE marketplace_article_applications") && s.includes("activation_budget")) {
        mem.stamps[String(params[0])] = { ...(mem.stamps[String(params[0])] || {}), params };
        return { rows: [] };
      }
      if (s.includes("UPDATE freelancer_activation_waves") && s.includes("status = 'paused'")) {
        for (const w of mem.waves) {
          if (Number(w.campaign_id) === Number(params[0]) && w.status === "active") w.status = "paused";
        }
        return { rows: [] };
      }
      if (s.includes("UPDATE freelancer_activation_campaigns SET") && s.includes("emergency_stop_enabled")) {
        const c = mem.campaigns.find((x) => Number(x.id) === Number(params[0]));
        if (c) {
          c.status = params[1];
          c.emergency_stop_enabled = params[2];
          c.pause_new_assignments = params[3];
        }
        return { rows: c ? [c] : [] };
      }
      throw new Error(`Unexpected SQL in A4.2 fake: ${s.slice(0, 180)}`);
    },
  };
}

async function seedLinked(client, mem, { campaignTotal = "20.000", waveBudget = "5.000" } = {}) {
  const created = await campaignService.createActivationCampaign(
    {
      name: "Budget fund",
      totalBudgetJod: campaignTotal,
      articleTotalValueJod: "1.000",
      status: "draft",
    },
    { client },
  );
  mem.campaigns[0].status = "active";
  const wave = await campaignService.createActivationWave(
    created.campaign.id,
    { name: "W1", budgetJod: waveBudget, status: "draft" },
    { client },
  );
  mem.waves[0].status = "active";
  return { campaignId: created.campaign.id, waveId: wave.wave.id };
}

function articleApp(ids) {
  return {
    article: {
      id: 88,
      activation_campaign_id: ids.campaignId,
      activation_wave_id: ids.waveId,
      article_value_jod: "1.000",
    },
    application: {
      id: 501,
      freelancer_user_id: 41,
      activation_campaign_id: ids.campaignId,
      activation_wave_id: ids.waveId,
    },
  };
}

describe("Phase A4.2 migration and wiring", () => {
  it("170 is additive and does not edit 167/168/169", () => {
    const sql = read("sql/migrations/170_freelancer_activation_budget_a42.sql");
    assert.match(sql, /170_freelancer_activation_budget_a42/);
    assert.match(sql, /activation_budget_reserved_at/);
    assert.match(sql, /idx_fae_budget_entries_app_reserved/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/);
    assert.doesNotMatch(read("sql/migrations/169_freelancer_activation_campaigns_a3.sql"), /activation_budget_reserved_at/);
  });

  it("reserves before selected status; uses after settlement; revision does not release", () => {
    const apply = read("src/services/marketplaceArticleApplicationsService.js");
    const reserveIdx = apply.indexOf("reserveActivationBudgetForAssignment");
    const selectedIdx = apply.indexOf("SET status = 'selected'");
    assert.ok(reserveIdx > 0 && reserveIdx < selectedIdx);
    const rejectFn = apply.slice(apply.indexOf("async function rejectArticleApplication"));
    assert.match(rejectFn, /releaseActivationBudgetIfReserved/);
    const revision = read("src/services/marketplaceArticleSubmissionsService.js");
    assert.doesNotMatch(revision, /releaseActivationBudgetIfReserved/);
    const settle = read("src/services/marketplaceArticleSettlementService.js");
    assert.match(settle, /consumeBidCreditReservation/);
    assert.match(settle, /markActivationBudgetUsed/);
    const afterApprove = settle.slice(settle.indexOf("await submissionsService.markSubmissionApproved"));
    assert.ok(
      afterApprove.indexOf("markActivationBudgetUsed") >= 0
        && afterApprove.indexOf("markActivationBudgetUsed") < afterApprove.indexOf("enqueueBildazoPublish"),
    );
    assert.doesNotMatch(settle, /publishAcceptedArticleToBildazo/);
    assert.doesNotMatch(read("src/services/freelancerActivationCampaignService.js"), /require\(["'].*ordersService/);
    assert.doesNotMatch(read("src/services/freelancerActivationCampaignService.js"), /require\(["'].*stripe/i);
  });
});

describe("Phase A4.2 budget amount and summary", () => {
  it("uses article gross when present, else campaign total — never freelancer share", () => {
    // A9.1: live released article total_article_value / article_value_jod wins for reserve/use.
    assert.equal(
      campaignService.resolveActivationArticleBudgetAmount({
        campaign: {
          articleTotalValueJod: "1.000",
          freelancerShareJod: "0.500",
        },
        article: { article_value_jod: "2.000" },
      }),
      "2.000",
    );
    assert.equal(
      campaignService.resolveActivationArticleBudgetAmount({
        campaign: {
          articleTotalValueJod: "1.000",
          freelancerShareJod: "0.500",
        },
        article: {},
      }),
      "1.000",
    );
  });

  it("budget summary computes reserved/used/remaining from counters", () => {
    const out = campaignService.computeBudgetSummaryFromParts({
      totalMillis: 20000,
      reservedMillis: 1000,
      usedMillis: 2000,
      allocatedToWavesMillis: 5000,
    });
    assert.equal(out.totalBudgetJod, "20.000");
    assert.equal(out.reservedBudgetJod, "1.000");
    assert.equal(out.usedBudgetJod, "2.000");
    assert.equal(out.remainingBudgetJod, "17.000");
    assert.equal(out.unallocatedBudgetJod, "15.000");
  });
});

describe("Phase A4.2 reserve / release / use", () => {
  it("engine off skips reserve", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: false }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem);
    const { article, application } = articleApp(ids);
    const out = await campaignService.reserveActivationBudgetForAssignment({
      client,
      article,
      application,
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "ENGINE_OFF");
    assert.equal(mem.campaigns[0].reserved_budget_jod, "0.000");
  });

  it("unattached article skips reserve", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const out = await campaignService.reserveActivationBudgetForAssignment({
      client,
      article: { id: 1 },
      application: { id: 9, freelancer_user_id: 2 },
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "NO_CAMPAIGN");
  });

  it("attached article with enough budget reserves once", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem);
    const { article, application } = articleApp(ids);
    const first = await campaignService.reserveActivationBudgetForAssignment({
      client,
      article,
      application,
    });
    assert.equal(first.alreadyReserved, false);
    assert.equal(first.amountJod, "1.000");
    assert.equal(mem.campaigns[0].reserved_budget_jod, "1.000");
    assert.equal(mem.waves[0].reserved_budget_jod, "1.000");
    const reservedRows = mem.entries.filter((e) => e.entry_type === "budget_reserved");
    assert.equal(reservedRows.length, 1);
    const second = await campaignService.reserveActivationBudgetForAssignment({
      client,
      article,
      application,
    });
    assert.equal(second.alreadyReserved, true);
    assert.equal(mem.campaigns[0].reserved_budget_jod, "1.000");
    assert.equal(mem.entries.filter((e) => e.entry_type === "budget_reserved").length, 1);
  });

  it("insufficient campaign budget blocks before counters change", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem, { campaignTotal: "0.500", waveBudget: "0.500" });
    const { article, application } = articleApp(ids);
    await assert.rejects(
      () => campaignService.reserveActivationBudgetForAssignment({ client, article, application }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_BUDGET_INSUFFICIENT,
    );
    assert.equal(mem.campaigns[0].reserved_budget_jod, "0.000");
    assert.equal(mem.entries.filter((e) => e.entry_type === "budget_reserved").length, 0);
  });

  it("insufficient wave budget blocks before counters change", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem, { campaignTotal: "20.000", waveBudget: "0.500" });
    const { article, application } = articleApp(ids);
    await assert.rejects(
      () => campaignService.reserveActivationBudgetForAssignment({ client, article, application }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.WAVE_BUDGET_INSUFFICIENT,
    );
    assert.equal(mem.campaigns[0].reserved_budget_jod, "0.000");
    assert.equal(mem.waves[0].reserved_budget_jod, "0.000");
  });

  it("rejected assigned work releases reserved budget once", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem);
    const { article, application } = articleApp(ids);
    await campaignService.reserveActivationBudgetForAssignment({ client, article, application });
    const first = await campaignService.releaseActivationBudgetIfReserved({
      client,
      article,
      application,
      reason: "rejected",
    });
    assert.equal(first.released, true);
    assert.equal(mem.campaigns[0].reserved_budget_jod, "0.000");
    assert.equal(mem.entries.filter((e) => e.entry_type === "budget_released").length, 1);
    const second = await campaignService.releaseActivationBudgetIfReserved({
      client,
      article,
      application,
      reason: "rejected",
    });
    assert.equal(second.alreadyReleased, true);
    assert.equal(mem.entries.filter((e) => e.entry_type === "budget_released").length, 1);
  });

  it("final approval moves reserved to used once", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem);
    const { article, application } = articleApp(ids);
    await campaignService.reserveActivationBudgetForAssignment({ client, article, application });
    const first = await campaignService.markActivationBudgetUsed({ client, article, application });
    assert.equal(first.alreadyUsed, false);
    assert.equal(mem.campaigns[0].reserved_budget_jod, "0.000");
    assert.equal(mem.campaigns[0].used_budget_jod, "1.000");
    assert.equal(mem.waves[0].used_budget_jod, "1.000");
    const second = await campaignService.markActivationBudgetUsed({ client, article, application });
    assert.equal(second.alreadyUsed, true);
    assert.equal(mem.campaigns[0].used_budget_jod, "1.000");
    assert.equal(mem.entries.filter((e) => e.entry_type === "budget_used").length, 1);
  });

  it("does not release after budget is used", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedLinked(client, mem);
    const { article, application } = articleApp(ids);
    await campaignService.reserveActivationBudgetForAssignment({ client, article, application });
    await campaignService.markActivationBudgetUsed({ client, article, application });
    const out = await campaignService.releaseActivationBudgetIfReserved({
      client,
      article,
      application,
    });
    assert.equal(out.alreadyUsed, true);
    assert.equal(mem.campaigns[0].used_budget_jod, "1.000");
    assert.equal(mem.entries.filter((e) => e.entry_type === "budget_released").length, 0);
  });
});
