/**
 * Phase A9.1 — Mini Article operating fund, plan allocations, inventory.
 * Does not apply migrations. No Production / git / Stripe / auto-assign.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA91.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a91_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ops = require("../src/services/freelancerActivationArticleOpsService");
const {
  FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS,
} = require("../src/constants/freelancerActivationArticleOps");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A9.1 isolation", () => {
  it("adds migration 173 and does not touch payment domains", () => {
    const migrations = fs.readdirSync(path.join(root, "sql/migrations"));
    assert.ok(migrations.some((f) => f.startsWith("173_freelancer_activation_article_fund")));
    const sql = read("sql/migrations/173_freelancer_activation_article_fund_inventory_a91.sql");
    assert.match(sql, /freelancer_activation_article_fund_entries/);
    assert.match(sql, /freelancer_activation_plan_daily_allocations/);
    assert.match(sql, /freelancer_activation_article_inventory_items/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
    const svc = read("src/services/freelancerActivationArticleOpsService.js");
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/);
    assert.doesNotMatch(svc, /require\(["'].*financialClaims/);
    assert.doesNotMatch(svc, /require\(["'].*node-cron|node-cron\.schedule|setInterval\s*\(/);
    assert.match(svc, /autoAssigned:\s*false/);
    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(routes, /article-fund/);
    assert.match(routes, /plan-allocations/);
    assert.match(routes, /article-inventory/);
  });
});

describe("Phase A9.1 share split defaults", () => {
  it("validates trial/silver/pro default splits", () => {
    const starter = ops.assertShareSplit(FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.starter);
    assert.equal(starter.totalArticleValueJod, "1.000");
    assert.equal(starter.freelancerShareJod, "0.500");
    assert.equal(starter.companyShareJod, "0.300");
    assert.equal(starter.reviewerShareJod, "0.200");

    const silver = ops.assertShareSplit(FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.silver);
    assert.equal(silver.totalArticleValueJod, "2.000");
    assert.equal(silver.freelancerShareJod, "1.000");

    const pro = ops.assertShareSplit(FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.pro);
    assert.equal(pro.totalArticleValueJod, "3.000");
    assert.equal(pro.freelancerShareJod, "1.500");
  });

  it("rejects invalid share totals", () => {
    assert.throws(
      () =>
        ops.assertShareSplit({
          totalArticleValueJod: "1.000",
          freelancerShareJod: "0.400",
          companyShareJod: "0.300",
          reviewerShareJod: "0.200",
        }),
      (err) => err.publicCode === "ACTIVATION_PLAN_ALLOCATION_INVALID_SHARE_SPLIT",
    );
  });

  it("keeps full value separate from freelancer share in override helper", () => {
    const override = ops.buildActivationArticleEconomicOverride({
      article_value_jod: "1.000",
      activation_freelancer_share_jod: "0.500",
      activation_company_share_jod: "0.300",
      activation_reviewer_share_jod: "0.200",
      activation_plan_tier_code: "starter",
    });
    assert.equal(override.grossJod, "1.000");
    assert.equal(override.writerNetJod, "0.500");
    assert.equal(override.reviewerFeeJod, "0.200");
    assert.equal(override.companyShareJod, "0.300");
  });
});

describe("Phase A9.1 fund ledger (fake client)", () => {
  function createFundClient(mem) {
    mem.entries = mem.entries || [];
    mem.nextId = mem.nextId || 1;
    return {
      async query(sql, params = []) {
        const s = String(sql);
        if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
        if (s.includes("FROM freelancer_activation_article_fund_entries") && s.includes("AS balance")) {
          let bal = 0;
          for (const e of mem.entries) {
            if (e.entry_type === "fund_deposit") bal += Number(e.amount_jod);
            if (e.entry_type === "fund_withdrawal") bal -= Number(e.amount_jod);
            if (e.entry_type === "daily_allocation") bal -= Number(e.amount_jod);
            if (e.entry_type === "daily_allocation_released") bal += Number(e.amount_jod);
          }
          return { rows: [{ balance: bal.toFixed(3) }] };
        }
        if (s.includes("COALESCE(SUM") && s.includes("deposits")) {
          let d = 0;
          let w = 0;
          for (const e of mem.entries) {
            if (e.entry_type === "fund_deposit") d += Number(e.amount_jod);
            if (e.entry_type === "fund_withdrawal") w += Number(e.amount_jod);
          }
          return { rows: [{ deposits: d.toFixed(3), withdrawals: w.toFixed(3) }] };
        }
        if (s.includes("INSERT INTO freelancer_activation_article_fund_entries")) {
          const row = {
            id: mem.nextId++,
            campaign_id: params[0],
            wave_id: params[1],
            entry_type: params[2],
            amount_jod: params[3],
            reason: params[4],
            metadata: params[5],
            created_by_user_id: params[6],
            created_at: "2026-08-20T12:00:00.000Z",
          };
          mem.entries.push(row);
          return { rows: [row] };
        }
        if (s.includes("FROM freelancer_activation_article_fund_entries")) {
          return { rows: [...mem.entries].reverse() };
        }
        throw new Error(`Unexpected SQL: ${s.slice(0, 160)}`);
      },
      release() {},
    };
  }

  it("deposit increases balance; withdrawal decreases; overdraw blocked", async () => {
    const mem = {};
    const client = createFundClient(mem);
    const d1 = await ops.addArticleFundDeposit({
      amountJod: "10.000",
      campaignId: 1,
      client,
    });
    assert.equal(d1.summary.currentBalanceJod, "10.000");
    const w1 = await ops.withdrawArticleFundAmount({
      amountJod: "3.000",
      campaignId: 1,
      client,
    });
    assert.equal(w1.summary.currentBalanceJod, "7.000");
    await assert.rejects(
      () =>
        ops.withdrawArticleFundAmount({
          amountJod: "20.000",
          campaignId: 1,
          client,
        }),
      (err) =>
        err.publicCode === "ACTIVATION_ARTICLE_FUND_INSUFFICIENT" ||
        err.publicCode === "ACTIVATION_ARTICLE_FUND_INSUFFICIENT_BALANCE" ||
        String(err.publicCode || "").includes("INSUFFICIENT"),
    );
    assert.equal(mem.entries.filter((e) => e.entry_type === "fund_deposit").length, 1);
    assert.equal(mem.entries.filter((e) => e.entry_type === "fund_withdrawal").length, 1);
    assert.doesNotMatch(JSON.stringify(mem), /wallet|claim|stripe/i);
  });
});

describe("Phase A9.1 release flags", () => {
  it("release helper returns autoAssigned false in service contract comments/tests", () => {
    const svc = read("src/services/freelancerActivationArticleOpsService.js");
    assert.match(svc, /autoAssigned: false/);
    assert.match(svc, /Does not assign winner/);
  });

  it("manual release creates marketplace_articles with split fields and gates on emergency/fund", () => {
    const svc = read("src/services/freelancerActivationArticleOpsService.js");
    assert.match(svc, /INSERT INTO marketplace_articles/);
    assert.match(svc, /activation_plan_tier_code/);
    assert.match(svc, /activation_freelancer_share_jod/);
    assert.match(svc, /activation_inventory_item_id/);
    assert.match(svc, /evaluateActivationOpportunityGate/);
    assert.match(svc, /رصيد صندوق المقالات غير كافٍ/);
    assert.doesNotMatch(svc, /status:\s*['"]selected['"]|assignWinner|auto.?assign winner/i);
  });

  it("inventory and allocation tables are created in migration 173", () => {
    const sql = read("sql/migrations/173_freelancer_activation_article_fund_inventory_a91.sql");
    assert.match(sql, /plan_tier_code/);
    assert.match(sql, /total_article_value_jod/);
    assert.match(sql, /freelancer_share_jod/);
    assert.match(sql, /status.*ready|ready.*status/s);
    assert.match(sql, /release_strategy/);
    assert.match(sql, /Separate from A4\.2 assignment budget_entries/);
  });
});
