/**
 * Phase A3 — campaigns / waves / budget foundation (static + mocked client).
 * Does not apply migrations. No Production / git / Stripe / orders.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a3_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  FREELANCER_ACTIVATION_ERROR_CODES,
} = require("../src/constants/freelancerActivationEngine");
const campaignService = require("../src/services/freelancerActivationCampaignService");
const trialService = require("../src/services/freelancerActivationEngineService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function settingsRow() {
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
  };
}

function createFakeClient(mem) {
  mem.campaigns = mem.campaigns || [];
  mem.waves = mem.waves || [];
  mem.entries = mem.entries || [];
  mem.nextCampaignId = mem.nextCampaignId || 1;
  mem.nextWaveId = mem.nextWaveId || 1;
  mem.nextEntryId = mem.nextEntryId || 1;
  mem.settings = mem.settings || settingsRow();
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
      if (s.includes("freelancer_activation_engine_enabled")) {
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
        mem.entries.push({
          id: mem.nextEntryId++,
          campaign_id: params[0],
          wave_id: params[1],
          entry_type: params[2],
          amount_jod: params[3],
        });
        return { rows: [] };
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
      if (s.includes("FROM marketplace_articles WHERE activation_campaign_id")) {
        return { rows: [{ n: mem.linkedArticlesCount || 0 }] };
      }
      if (s.includes("FROM marketplace_article_applications")) {
        return { rows: [{ assigned_n: 0, accepted_n: 0 }] };
      }
      if (s.includes("UPDATE freelancer_activation_waves") && s.includes("status = 'paused'")) {
        for (const w of mem.waves) {
          if (Number(w.campaign_id) === Number(params[0]) && w.status === "active") w.status = "paused";
        }
        return { rows: [] };
      }
      if (s.includes("UPDATE freelancer_activation_waves SET")) {
        const w = mem.waves.find((x) => Number(x.id) === Number(params[0]));
        if (w) {
          w.name = params[1];
          w.status = params[2];
          w.budget_jod = params[3];
        }
        return { rows: w ? [w] : [] };
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
      if (s.includes("UPDATE freelancer_activation_campaigns SET")) {
        const c = mem.campaigns.find((x) => Number(x.id) === Number(params[0]));
        if (c) {
          c.name = params[1];
          c.status = params[2];
          c.total_budget_jod = params[3];
        }
        return { rows: c ? [c] : [] };
      }
      throw new Error(`Unexpected SQL in A3 fake: ${s.slice(0, 180)}`);
    },
  };
}

describe("Phase A3 migration safety", () => {
  it("169 is additive and does not edit 167/168", () => {
    const sql = read("sql/migrations/169_freelancer_activation_campaigns_a3.sql");
    assert.match(sql, /169_freelancer_activation_campaigns_a3/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_activation_campaigns/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_activation_waves/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_activation_budget_entries/);
    assert.match(sql, /activation_campaign_id/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/);
    assert.doesNotMatch(read("sql/migrations/167_freelancer_activation_engine_a1.sql"), /freelancer_activation_campaigns/);
    assert.doesNotMatch(read("sql/migrations/168_freelancer_activation_trial_bid_grant.sql"), /freelancer_activation_campaigns/);
  });

  it("super-admin campaign routes require Super Admin", () => {
    const src = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(src, /requireSuperAdmin/);
    assert.match(src, /freelancer-activation\/campaigns/);
    assert.match(src, /emergency-stop/);
  });

  it("does not reserve/spend budget or call Stripe/orders from campaign service", () => {
    const apply = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(apply, /assertActivationOpportunityOpen/);
    const campaign = read("src/services/freelancerActivationCampaignService.js");
    assert.doesNotMatch(campaign, /require\(["'].*ordersService/);
    assert.doesNotMatch(campaign, /require\(["'].*stripe/i);
    assert.doesNotMatch(campaign, /require\(["'].*pantry/i);
    assert.doesNotMatch(campaign, /require\(["'].*bildazo/i);
    assert.doesNotMatch(campaign, /submitArticleApplication/);
    assert.doesNotMatch(campaign, /reserveBidCreditsFefo/);
  });
});

describe("Phase A3 campaign/wave/budget", () => {
  it("rejects invalid share sum", () => {
    assert.throws(
      () => campaignService.assertShareSplit({
        articleTotalMillis: 1000,
        freelancerMillis: 500,
        companyMillis: 300,
        reviewerMillis: 100,
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.INVALID_SHARE_SPLIT,
    );
  });

  it("rejects invalid negative budget", () => {
    assert.throws(
      () => campaignService.normalizeCampaignInput({ name: "x", totalBudgetJod: "-1" }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.INVALID_BUDGET,
    );
  });

  it("budget summary computes total/reserved/used/remaining", () => {
    const out = campaignService.computeBudgetSummaryFromParts({
      totalMillis: 100000,
      reservedMillis: 20000,
      usedMillis: 10000,
      allocatedToWavesMillis: 40000,
    });
    assert.equal(out.totalBudgetJod, "100.000");
    assert.equal(out.reservedBudgetJod, "20.000");
    assert.equal(out.usedBudgetJod, "10.000");
    assert.equal(out.remainingBudgetJod, "70.000");
    assert.equal(out.unallocatedBudgetJod, "60.000");
  });

  it("create campaign with valid defaults", async () => {
    const mem = {};
    const client = createFakeClient(mem);
    const out = await campaignService.createActivationCampaign(
      { name: "Wave 1 fund", totalBudgetJod: "100.000" },
      { client, actorUserId: 1 },
    );
    assert.equal(out.campaign.name, "Wave 1 fund");
    assert.equal(out.campaign.status, "draft");
    assert.equal(out.campaign.trialBidLimit, 20);
    assert.equal(out.campaign.dailyBidLimit, 2);
    assert.equal(out.campaign.freelancerShareJod, "0.500");
    assert.equal(out.budget.remainingBudgetJod, "100.000");
    assert.equal(mem.entries[0].entry_type, "budget_allocated");
  });

  it("create wave under campaign and reject over-allocation", async () => {
    const mem = {};
    const client = createFakeClient(mem);
    const created = await campaignService.createActivationCampaign(
      { name: "Cap", totalBudgetJod: "50.000" },
      { client },
    );
    const wave = await campaignService.createActivationWave(
      created.campaign.id,
      { name: "W1", budgetJod: "40.000" },
      { client },
    );
    assert.equal(wave.wave.budgetJod, "40.000");
    await assert.rejects(
      () => campaignService.createActivationWave(
        created.campaign.id,
        { name: "W2", budgetJod: "20.000" },
        { client },
      ),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.WAVE_BUDGET_EXCEEDS_CAMPAIGN,
    );
  });

  it("pause resume and emergency stop toggle campaign state", async () => {
    const mem = {};
    const client = createFakeClient(mem);
    const created = await campaignService.createActivationCampaign(
      { name: "Live", totalBudgetJod: "10.000", status: "draft" },
      { client },
    );
    const paused = await campaignService.pauseCampaign(created.campaign.id, { client });
    assert.equal(paused.campaign.status, "paused");
    assert.equal(paused.campaign.pauseNewAssignments, true);
    const resumed = await campaignService.resumeCampaign(created.campaign.id, { client });
    assert.equal(resumed.campaign.status, "active");
    const stopped = await campaignService.emergencyStopCampaign(created.campaign.id, { client });
    assert.equal(stopped.campaign.status, "paused");
    assert.equal(stopped.campaign.emergencyStopEnabled, true);
  });

  it("engine off remains a no-op for article apply even if a campaign exists", async () => {
    const mem = { settings: settingsRow() };
    const client = createFakeClient(mem);
    await campaignService.createActivationCampaign({ name: "Exists", totalBudgetJod: "10.000" }, { client });
    const out = await trialService.evaluateTrialMiniArticleApplyGate({
      client,
      freelancerUserId: 41,
      surface: "mini_article",
    });
    assert.equal(out.skipped, true);
    assert.equal(out.allowed, true);
    assert.equal(out.reason, "ENGINE_OFF");
  });
});
