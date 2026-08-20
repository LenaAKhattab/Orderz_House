/**
 * Phase A4.1 — article campaign/wave attachment + pause/emergency-stop guards.
 * Does not apply migrations. No Production / git / Stripe / orders.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a41_placeholder";

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

function createFakeClient(mem) {
  mem.campaigns = mem.campaigns || [];
  mem.waves = mem.waves || [];
  mem.entries = mem.entries || [];
  mem.articleAttachments = mem.articleAttachments || {};
  mem.nextCampaignId = mem.nextCampaignId || 1;
  mem.nextWaveId = mem.nextWaveId || 1;
  mem.nextEntryId = mem.nextEntryId || 1;
  mem.settings = mem.settings || settingsRow();
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
      if (s.includes("UPDATE marketplace_articles") && s.includes("activation_campaign_id")) {
        mem.articleAttachments[String(params[0])] = {
          campaignId: params[1],
          waveId: params[2],
        };
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
      if (s.includes("UPDATE freelancer_activation_campaigns SET") && s.includes("pause_new_assignments")) {
        const c = mem.campaigns.find((x) => Number(x.id) === Number(params[0]));
        if (c) {
          c.status = params[1];
          c.pause_new_assignments = params[2];
          c.emergency_stop_enabled = params[3];
        }
        return { rows: c ? [c] : [] };
      }
      throw new Error(`Unexpected SQL in A4.1 fake: ${s.slice(0, 180)}`);
    },
  };
}

async function seedActiveCampaign(client, mem, { status = "active" } = {}) {
  const created = await campaignService.createActivationCampaign(
    { name: "Attachable", totalBudgetJod: "20.000", status: "draft" },
    { client },
  );
  mem.campaigns[0].status = status;
  const wave = await campaignService.createActivationWave(
    created.campaign.id,
    { name: "W1", budgetJod: "5.000", status: "draft" },
    { client },
  );
  mem.waves[0].status = "active";
  return { campaignId: created.campaign.id, waveId: wave.wave.id };
}

describe("Phase A4.1 migration safety", () => {
  it("does not add a new migration and does not edit 167/168/169", () => {
    assert.equal(fs.existsSync(path.join(root, "sql/migrations/170_freelancer_activation_a41.sql")), false);
    const sql169 = read("sql/migrations/169_freelancer_activation_campaigns_a3.sql");
    assert.match(sql169, /marketplace_articles[\s\S]*activation_campaign_id/);
    assert.doesNotMatch(read("src/services/freelancerActivationCampaignService.js"), /require\(["'].*ordersService/);
    assert.doesNotMatch(read("src/services/freelancerActivationCampaignService.js"), /require\(["'].*stripe/i);
    assert.doesNotMatch(read("src/services/marketplaceArticleSettlementService.js"), /assertActivationOpportunityOpen/);
    assert.doesNotMatch(read("src/services/bildazoArticlePublishService.js"), /assertActivationOpportunityOpen/);
  });

  it("apply copies campaign/wave ids and guards before insert/reserve", () => {
    const apply = read("src/services/marketplaceArticleApplicationsService.js");
    const submit = apply.slice(apply.indexOf("async function submitArticleApplication"));
    const guardIdx = submit.indexOf("assertActivationOpportunityOpen");
    const insertIdx = submit.indexOf("activation_campaign_id, activation_wave_id");
    const reserveIdx = submit.indexOf("reserveBidCreditsFefo");
    const collectionIdx = submit.indexOf("onArticleApplicationSubmitted");
    assert.ok(guardIdx > 0 && insertIdx > guardIdx && reserveIdx > insertIdx);
    assert.ok(collectionIdx > reserveIdx);
    const selectIdx = apply.indexOf("async function selectArticleApplication");
    const assignGuard = apply.indexOf("assertActivationOpportunityOpen", selectIdx);
    const overrideIdx = apply.indexOf("enforceFairSelectionOverride", selectIdx);
    assert.ok(assignGuard > selectIdx && assignGuard < overrideIdx);
  });

  it("does not change fair-ranking sort internals", () => {
    const fair = read("src/services/articleFairDistributionAdapterService.js");
    assert.doesNotMatch(fair, /assertActivationOpportunityOpen/);
    assert.doesNotMatch(fair, /emergency_stop_enabled/);
  });
});

describe("Phase A4.1 attachment", () => {
  it("infers campaign from wave and rejects archived/completed attach", async () => {
    const mem = {};
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    const inferred = await campaignService.resolveActivationAttachment(
      { activationWaveId: ids.waveId },
      { client },
    );
    assert.equal(inferred.campaignId, ids.campaignId);
    assert.equal(inferred.waveId, ids.waveId);

    mem.campaigns[0].status = "archived";
    await assert.rejects(
      () => campaignService.resolveActivationAttachment(
        { activationCampaignId: ids.campaignId },
        { client },
      ),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.INVALID_ATTACHMENT,
    );
    mem.campaigns[0].status = "active";
    mem.waves[0].status = "completed";
    await assert.rejects(
      () => campaignService.resolveActivationAttachment(
        { activationCampaignId: ids.campaignId, activationWaveId: ids.waveId },
        { client },
      ),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.INVALID_ATTACHMENT,
    );
  });

  it("persists article attachment ids", async () => {
    const mem = {};
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    await campaignService.persistArticleActivationAttachment(
      99,
      { campaignId: ids.campaignId, waveId: ids.waveId },
      { client },
    );
    assert.deepEqual(mem.articleAttachments["99"], {
      campaignId: ids.campaignId,
      waveId: ids.waveId,
    });
  });
});

describe("Phase A4.1 apply/assignment guards", () => {
  it("engine off skips even when article is attached", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: false }) };
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    const out = await campaignService.evaluateActivationOpportunityGate({
      article: { activation_campaign_id: ids.campaignId, activation_wave_id: ids.waveId },
      client,
    });
    assert.equal(out.skipped, true);
    assert.equal(out.allowed, true);
    assert.equal(out.reason, "ENGINE_OFF");
  });

  it("article without campaign is unaffected when engine is on", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const out = await campaignService.evaluateActivationOpportunityGate({
      article: { id: 1 },
      client,
    });
    assert.equal(out.skipped, true);
    assert.equal(out.allowed, true);
    assert.equal(out.reason, "NO_CAMPAIGN");
  });

  it("engine on + active campaign/wave allows apply", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem, { status: "active" });
    const out = await campaignService.evaluateActivationOpportunityGate({
      article: { activation_campaign_id: ids.campaignId, activation_wave_id: ids.waveId },
      client,
      now: new Date("2026-08-19T12:00:00.000Z"),
    });
    assert.equal(out.allowed, true);
    assert.equal(out.skipped, false);
  });

  it("campaign emergency stop blocks before insert/reserve", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    await campaignService.emergencyStopCampaign(ids.campaignId, { client });
    await assert.rejects(
      () => campaignService.assertActivationOpportunityOpen({
        article: { activation_campaign_id: ids.campaignId, activation_wave_id: ids.waveId },
        client,
      }),
      (err) =>
        err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_EMERGENCY_STOPPED &&
        /تم إيقاف الحملة/.test(err.message),
    );
  });

  it("campaign paused blocks apply", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    await campaignService.pauseCampaign(ids.campaignId, { client });
    await assert.rejects(
      () => campaignService.assertActivationOpportunityOpen({
        article: { activation_campaign_id: ids.campaignId },
        client,
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_PAUSED,
    );
  });

  it("wave paused blocks apply and assignment", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    mem.waves[0].status = "paused";
    await assert.rejects(
      () => campaignService.assertActivationOpportunityOpen({
        article: { activation_campaign_id: ids.campaignId, activation_wave_id: ids.waveId },
        client,
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.WAVE_PAUSED,
    );
  });

  it("outside configured dates blocks with NOT_ACTIVE codes", async () => {
    const mem = { settings: settingsRow({ freelancer_activation_engine_enabled: true }) };
    const client = createFakeClient(mem);
    const ids = await seedActiveCampaign(client, mem);
    mem.campaigns[0].starts_at = "2026-09-01T00:00:00.000Z";
    mem.campaigns[0].ends_at = "2026-09-10T00:00:00.000Z";
    await assert.rejects(
      () => campaignService.assertActivationOpportunityOpen({
        article: { activation_campaign_id: ids.campaignId, activation_wave_id: ids.waveId },
        client,
        now: new Date("2026-08-19T12:00:00.000Z"),
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.CAMPAIGN_NOT_ACTIVE,
    );
    mem.campaigns[0].starts_at = null;
    mem.campaigns[0].ends_at = null;
    mem.waves[0].starts_at = "2026-09-01T00:00:00.000Z";
    await assert.rejects(
      () => campaignService.assertActivationOpportunityOpen({
        article: { activation_campaign_id: ids.campaignId, activation_wave_id: ids.waveId },
        client,
        now: new Date("2026-08-19T12:00:00.000Z"),
      }),
      (err) => err.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.WAVE_NOT_ACTIVE,
    );
  });
});
