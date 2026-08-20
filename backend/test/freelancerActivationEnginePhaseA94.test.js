/**
 * Phase A9.4 — Live released Mini Article monitoring.
 * Does not apply migrations. No Production / git / Stripe / cron.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA94.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a94_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const live = require("../src/services/freelancerActivationLiveArticleMonitoringService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A9.4 isolation", () => {
  it("adds monitoring service without payment domains or new migration requirement", () => {
    const migrations = fs.readdirSync(path.join(root, "sql/migrations"));
    assert.ok(!migrations.some((f) => f.startsWith("176_")));
    const svc = read("src/services/freelancerActivationLiveArticleMonitoringService.js");
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/);
    assert.doesNotMatch(svc, /require\(["'].*financialClaims/);
    assert.doesNotMatch(svc, /node-cron|setInterval\s*\(/);
    assert.match(svc, /listLiveActivationArticles/);
    assert.match(svc, /runLiveArticleAutoAssignment/);
    assert.match(svc, /deriveActivationBudgetState/);
    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(routes, /live-articles/);
    assert.match(routes, /run-auto-assignment/);
    assert.match(routes, /requireSuperAdmin/);
  });
});

describe("Phase A9.4 summary and action helpers", () => {
  it("empty summary is safe zeros", () => {
    const s = live.emptySummary();
    assert.equal(s.totalReleased, 0);
    assert.equal(s.waitingForBidders, 0);
    assert.equal(s.autoAssigned, 0);
    assert.equal(s.published, 0);
  });

  it("resolveAutoAssignStatus covers waiting/ready/completed/disabled", () => {
    assert.equal(
      live.resolveAutoAssignStatus({
        article: { activation_campaign_id: 1, activation_auto_assign_enabled: false },
        readiness: { status: "disabled" },
        latestRun: null,
        hasSelected: false,
      }),
      "disabled",
    );
    assert.equal(
      live.resolveAutoAssignStatus({
        article: {
          activation_campaign_id: 1,
          activation_auto_assign_enabled: true,
          activation_auto_assign_mode: "weighted_fair",
          activation_auto_assign_when_min_bidders_reached: true,
        },
        readiness: { status: "waiting_for_bidders" },
        latestRun: null,
        hasSelected: false,
      }),
      "waiting_for_bidders",
    );
    assert.equal(
      live.resolveAutoAssignStatus({
        article: {
          activation_campaign_id: 1,
          activation_auto_assign_enabled: true,
          activation_auto_assign_mode: "weighted_fair",
          activation_auto_assign_when_min_bidders_reached: true,
        },
        readiness: { ready: true, status: "ready" },
        latestRun: null,
        hasSelected: false,
      }),
      "ready",
    );
    assert.equal(
      live.resolveAutoAssignStatus({
        article: { activation_campaign_id: 1 },
        readiness: null,
        latestRun: { status: "completed", autoAssignedBadge: true },
        hasSelected: true,
      }),
      "completed",
    );
  });

  it("buildActionFlags exposes only safe implemented actions", () => {
    const flags = live.buildActionFlags({
      article: { status: "published", activation_campaign_id: 1 },
      autoAssignStatus: "ready",
      hasSelected: false,
      manuscriptStatus: null,
      bildazoCanRetry: true,
      inventoryItemId: 9,
      campaignStatus: "active",
    });
    assert.equal(flags.canRunAutoAssignment, true);
    assert.equal(flags.canViewApplications, true);
    assert.equal(flags.canOpenArticle, true);
    assert.equal(flags.canReleaseAnotherFromInventory, true);
    assert.equal(flags.canRetryBildazoPublish, true);
    assert.equal(flags.canPauseCampaign, true);
  });
});

describe("Phase A9.4 list with fake client", () => {
  it("empty dataset returns safe summary", async () => {
    const client = {
      async query(sql) {
        if (/COUNT\(\*\)/i.test(sql)) return { rows: [{ cnt: 0 }] };
        return { rows: [] };
      },
    };
    const out = await live.listLiveActivationArticles({ limit: 10 }, { client });
    assert.equal(out.schemaReady, true);
    assert.equal(out.items.length, 0);
    assert.equal(out.summary.totalReleased, 0);
    assert.equal(out.pagination.total, 0);
  });
});
