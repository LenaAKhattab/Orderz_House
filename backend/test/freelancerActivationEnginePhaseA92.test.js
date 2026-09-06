/**
 * Phase A9.2 — Daily release engine + inventory recycling.
 * Does not apply migrations. No Production / git / Stripe / auto-assign / cron.
 *
 * Run: node --test test/freelancerActivationEnginePhaseA92.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a92_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const engine = require("../src/services/freelancerActivationArticleReleaseEngineService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Phase A9.2 isolation", () => {
  it("adds migration 174 and does not touch payment domains", () => {
    const migrations = fs.readdirSync(path.join(root, "sql/migrations"));
    assert.ok(migrations.some((f) => f.startsWith("174_freelancer_activation_article_release")));
    assert.ok(migrations.some((f) => f.startsWith("177_freelancer_activation_release_interval")));
    assert.ok(
      migrations.some((f) =>
        f.startsWith("180_freelancer_activation_inventory_visibility_duration_hours"),
      ),
    );
    const sql = read("sql/migrations/174_freelancer_activation_article_release_engine_a92.sql");
    assert.match(sql, /freelancer_activation_article_release_runs/);
    assert.match(sql, /freelancer_activation_article_release_items/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
    const intervalSql = read("sql/migrations/177_freelancer_activation_release_interval_days_a92.sql");
    assert.match(intervalSql, /release_interval_days/);
    assert.match(intervalSql, /DEFAULT 1/);
    const svc = read("src/services/freelancerActivationArticleReleaseEngineService.js");
    assert.doesNotMatch(svc, /require\(["'].*stripe/i);
    assert.doesNotMatch(svc, /require\(["'].*ordersService/);
    assert.doesNotMatch(svc, /require\(["'].*financialClaims/);
    assert.doesNotMatch(svc, /require\(["'].*node-cron|node-cron\.schedule|setInterval\s*\(/);
    assert.match(svc, /autoAssigned:\s*false/);
    assert.match(svc, /isReleaseDayForInterval/);
    assert.match(svc, /not_release_day/);
    assert.match(svc, /ليس يوم إنزال حسب الجدولة الحالية/);
    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(routes, /article-release\/preview/);
    assert.match(routes, /article-release\/run/);
  });
});

describe("Phase A9.2 capacity math", () => {
  it("stricter of budget and count wins; fund caps further", () => {
    const alloc = {
      totalArticleValueJod: "1.000",
      dailyBudgetJod: "3.000",
      maxDailyArticles: 10,
    };
    const cap = engine.computeDailyReleaseCapacity({
      allocation: alloc,
      fundBalanceMillis: 2500,
      alreadyReleasedToday: 0,
    });
    assert.equal(cap.capByBudget, 3);
    assert.equal(cap.capByCount, 10);
    assert.equal(cap.capByFund, 2);
    assert.equal(cap.remainingCapacity, 2);
  });

  it("subtracts already released today", () => {
    const cap = engine.computeDailyReleaseCapacity({
      allocation: {
        totalArticleValueJod: "1.000",
        dailyBudgetJod: "5.000",
        maxDailyArticles: 5,
      },
      fundBalanceMillis: 10000,
      alreadyReleasedToday: 3,
    });
    assert.equal(cap.remainingCapacity, 2);
  });
});

describe("Phase A9.2 inventory recycle helpers", () => {
  it("one_time cannot reuse after release; reusable can when recycle allowed", () => {
    assert.equal(
      engine.inventoryCanRelease(
        { status: "ready", release_strategy: "one_time", released_count: 0 },
        { allowRecycle: false },
      ),
      true,
    );
    assert.equal(
      engine.inventoryCanRelease(
        { status: "released", release_strategy: "one_time", released_count: 1 },
        { allowRecycle: true },
      ),
      false,
    );
    assert.equal(
      engine.inventoryCanRelease(
        {
          status: "released",
          release_strategy: "reusable",
          released_count: 1,
          max_releases: 5,
        },
        { allowRecycle: true },
      ),
      true,
    );
    assert.equal(
      engine.inventoryCanRelease(
        {
          status: "released",
          release_strategy: "reusable",
          released_count: 5,
          max_releases: 5,
        },
        { allowRecycle: true },
      ),
      false,
    );
    assert.equal(
      engine.inventoryCanRelease(
        { status: "archived", release_strategy: "reusable", released_count: 0 },
        { allowRecycle: true },
      ),
      false,
    );
  });
});

describe("Phase A9.2 release plan with fake client", () => {
  function createMemClient(mem) {
    mem.allocations = mem.allocations || [];
    mem.inventory = mem.inventory || [];
    mem.articles = mem.articles || [];
    mem.fundEntries = mem.fundEntries || [];
    mem.runs = mem.runs || [];
    mem.runItems = mem.runItems || [];
    mem.settings = mem.settings || { freelancer_activation_engine_enabled: true };
    mem.campaign = mem.campaign || {
      id: 1,
      name: "Test",
      status: "active",
      total_budget_jod: "100.000",
      reserved_budget_jod: "0.000",
      used_budget_jod: "0.000",
      article_total_value_jod: "1.000",
      freelancer_share_jod: "0.500",
      company_share_jod: "0.300",
      reviewer_share_jod: "0.200",
      trial_bid_limit: 20,
      trial_duration_days: 10,
      daily_bid_limit: 2,
      minimum_bidders_per_article: 10,
      max_trial_wins: 2,
      emergency_stop_enabled: false,
      pause_new_assignments: false,
      silver_plan_code: "silver",
      silver_price_jod: "19.000",
      starts_at: null,
      ends_at: null,
    };
    mem.nextArticleId = mem.nextArticleId || 100;
    mem.nextRunId = mem.nextRunId || 1;
    mem.nextItemId = mem.nextItemId || 1;

    return {
      async query(sql, params = []) {
        const s = String(sql);
        if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };

        if (s.includes("FROM marketplace_economy_settings")) {
          return {
            rows: [
              {
                freelancer_activation_engine_enabled: mem.settings.freelancer_activation_engine_enabled !== false,
                freelancer_activation_trial_duration_days: 10,
                freelancer_activation_trial_bids: 20,
                freelancer_activation_daily_bid_limit: 2,
                freelancer_activation_successful_work_cap: 2,
                freelancer_activation_requires_training: true,
                freelancer_activation_requires_verification: true,
                freelancer_activation_silver_plan_code: "silver",
                freelancer_activation_archive_after_days: 30,
                freelancer_activation_work_inventory_enabled: false,
                freelancer_activation_work_inventory_percentage: 0,
              },
            ],
          };
        }
        if (s.includes("FROM freelancer_activation_campaigns") && s.includes("WHERE id")) {
          return { rows: mem.campaign && Number(params[0]) === Number(mem.campaign.id) ? [mem.campaign] : [] };
        }
        if (s.includes("FROM freelancer_activation_waves")) {
          return { rows: mem.wave ? [mem.wave] : [] };
        }
        if (s.includes("FROM freelancer_activation_plan_daily_allocations")) {
          return { rows: mem.allocations };
        }
        if (s.includes("FROM freelancer_activation_article_fund_entries") && /AS balance/i.test(s)) {
          let bal = 0;
          for (const e of mem.fundEntries) {
            if (e.entry_type === "fund_deposit") bal += Number(e.amount_jod);
            if (e.entry_type === "fund_withdrawal") bal -= Number(e.amount_jod);
            if (e.entry_type === "daily_allocation") bal -= Number(e.amount_jod);
            if (e.entry_type === "daily_allocation_released") bal += Number(e.amount_jod);
          }
          return { rows: [{ balance: bal.toFixed(3) }] };
        }
        if (s.includes("COALESCE(SUM") && s.includes("deposits")) {
          return { rows: [{ deposits: "0", withdrawals: "0" }] };
        }
        if (s.includes("FROM marketplace_articles") && s.includes("COUNT")) {
          const date = String(params[2]);
          const cnt = mem.articles.filter(
            (a) =>
              Number(a.activation_campaign_id) === Number(params[0]) &&
              a.activation_plan_tier_code === params[1] &&
              String(a.published_at).slice(0, 10) === date,
          ).length;
          return { rows: [{ cnt }] };
        }
        if (
          s.includes("FROM marketplace_articles") &&
          s.includes("activation_inventory_item_id") &&
          s.includes("status = 'published'")
        ) {
          const invId = Number(params[0]);
          const found = mem.articles.find(
            (a) => Number(a.activation_inventory_item_id) === invId && a.status === "published",
          );
          return { rows: found ? [{ id: found.id }] : [] };
        }
        if (s.includes("to_regclass") || s.includes("information_schema.columns")) {
          return { rows: [{ rounds: "opportunity_bid_collection_rounds", article_col: true }] };
        }
        if (s.includes("FROM marketplace_economy_settings")) {
          return {
            rows: [
              {
                id: 1,
                article_min_required_bids: 10,
                article_allowed_required_bid_counts: JSON.stringify([10, 15, 20, 30]),
                article_default_required_bid_count: 10,
                article_auto_close_when_threshold_reached: true,
                article_auto_assign_when_threshold_reached: false,
                article_refund_policy: "full_on_minimum_not_met",
              },
            ],
          };
        }
        if (s.includes("INSERT INTO marketplace_economy_settings")) {
          return { rows: [{ id: 1 }] };
        }
        if (s.includes("INSERT INTO opportunity_bid_collection_rounds")) {
          const round = {
            id: mem.nextRoundId || (mem.nextRoundId = 1),
            opportunity_type: params[0],
            opportunity_id: params[1],
            round_number: params[2],
            required_bid_count: params[3],
            bid_collection_status: "collecting",
            bid_collection_deadline_at: params[4],
            auto_close_when_threshold_reached: params[5],
            auto_assign_when_threshold_reached: params[6],
          };
          mem.nextRoundId += 1;
          mem.rounds = mem.rounds || [];
          mem.rounds.push(round);
          return { rows: [round] };
        }
        if (
          s.includes("UPDATE marketplace_articles") &&
          s.includes("current_bid_collection_round_id")
        ) {
          const article = mem.articles.find((a) => Number(a.id) === Number(params[0]));
          if (article) {
            article.required_bid_count = params[1];
            article.current_bid_collection_round_id = params[2];
            if (params[3] != null) article.application_deadline_at = params[3];
          }
          return { rows: article ? [article] : [] };
        }
        if (s.includes("FROM marketplace_articles") && s.includes("WHERE id")) {
          const article = mem.articles.find((a) => Number(a.id) === Number(params[0]));
          return { rows: article ? [article] : [] };
        }
        if (s.includes("FROM freelancer_activation_article_inventory_items") && s.includes("ORDER BY")) {
          return {
            rows: mem.inventory.filter(
              (i) =>
                Number(i.campaign_id) === Number(params[0]) &&
                i.plan_tier_code === params[1] &&
                ["ready", "released"].includes(i.status),
            ),
          };
        }
        if (s.includes("FROM freelancer_activation_article_inventory_items") && s.includes("FOR UPDATE")) {
          const row = mem.inventory.find((i) => Number(i.id) === Number(params[0]));
          return { rows: row ? [row] : [] };
        }
        if (s.includes("INSERT INTO marketplace_articles")) {
          // New shape includes application_deadline_at at $9; legacy falls back by length.
          const hasDeadline = Array.isArray(params) && params.length >= 20;
          const article = {
            id: mem.nextArticleId++,
            title: params[0],
            description: params[1],
            article_level: params[4],
            article_value_jod: params[5],
            required_bid_count: params[7],
            application_deadline_at: hasDeadline ? params[8] : null,
            activation_campaign_id: hasDeadline ? params[9] : params[8],
            activation_wave_id: hasDeadline ? params[10] : params[9],
            activation_plan_tier_code: hasDeadline ? params[11] : params[10],
            activation_freelancer_share_jod: hasDeadline ? params[12] : params[11],
            activation_company_share_jod: hasDeadline ? params[13] : params[12],
            activation_reviewer_share_jod: hasDeadline ? params[14] : params[13],
            activation_inventory_item_id: hasDeadline ? params[15] : params[14],
            current_bid_collection_round_id: null,
            status: "published",
            published_at: `${mem.runDate || "2026-08-20"}T12:00:00.000Z`,
          };
          mem.articles.push(article);
          return { rows: [article] };
        }
        if (s.includes("UPDATE freelancer_activation_article_inventory_items")) {
          const item = mem.inventory.find((i) => Number(i.id) === Number(params[0]));
          if (item) {
            item.released_count = params[1];
            item.status = params[2];
            item.last_released_at = "2026-08-20T12:00:00.000Z";
          }
          return { rows: [] };
        }
        if (s.includes("INSERT INTO freelancer_activation_article_fund_entries")) {
          const entryType = s.includes("'daily_allocation'")
            ? "daily_allocation"
            : params[2];
          const amount = s.includes("'daily_allocation'") ? params[2] : params[3];
          const row = {
            id: mem.fundEntries.length + 1,
            campaign_id: params[0],
            wave_id: params[1],
            entry_type: entryType,
            amount_jod: amount,
            reason: s.includes("'daily_allocation'") ? params[3] : params[4],
            metadata: s.includes("'daily_allocation'") ? params[4] : params[5],
            created_by_user_id: s.includes("'daily_allocation'") ? params[5] : params[6],
          };
          mem.fundEntries.push(row);
          return { rows: [row] };
        }
        if (s.includes("FROM freelancer_activation_article_release_runs") && s.includes("status = 'completed'")) {
          const found = mem.runs.find(
            (r) =>
              Number(r.campaign_id) === Number(params[0]) &&
              r.run_date === params[3] &&
              r.run_type === params[4] &&
              r.status === "completed" &&
              String(r.plan_tier_code || "") === String(params[2] || ""),
          );
          return { rows: found ? [found] : [] };
        }
        if (s.includes("INSERT INTO freelancer_activation_article_release_runs")) {
          const row = {
            id: mem.nextRunId++,
            campaign_id: params[0],
            wave_id: params[1],
            plan_tier_code: params[2],
            run_date: params[3],
            run_type: params[4],
            status: params[5],
            requested_by_user_id: params[6],
            released_count: params[7],
            total_reserved_value_jod: params[8],
            metadata: params[9],
            created_at: "2026-08-20T12:00:00.000Z",
            updated_at: "2026-08-20T12:00:00.000Z",
          };
          mem.runs.push(row);
          return { rows: [row] };
        }
        if (s.includes("UPDATE freelancer_activation_article_release_runs")) {
          const row = mem.runs.find((r) => Number(r.id) === Number(params[0]));
          if (row) {
            row.status = params[1];
            row.released_count = params[2];
            row.total_reserved_value_jod = params[3];
            row.updated_at = "2026-08-20T12:00:00.000Z";
          }
          return { rows: row ? [row] : [] };
        }
        if (s.includes("INSERT INTO freelancer_activation_article_release_items")) {
          const row = {
            id: mem.nextItemId++,
            run_id: params[0],
            inventory_item_id: params[1],
            marketplace_article_id: params[2],
            plan_tier_code: params[3],
            total_article_value_jod: params[4],
            freelancer_share_jod: params[5],
            company_share_jod: params[6],
            reviewer_share_jod: params[7],
            status: params[8],
            skip_reason: params[9],
            metadata: params[10],
            created_at: "2026-08-20T12:00:00.000Z",
          };
          mem.runItems.push(row);
          return { rows: [row] };
        }
        if (s.includes("FROM freelancer_activation_article_release_items")) {
          return { rows: mem.runItems.filter((i) => Number(i.run_id) === Number(params[0])) };
        }
        if (s.includes("FROM freelancer_activation_article_release_runs") && s.includes("WHERE id")) {
          const row = mem.runs.find((r) => Number(r.id) === Number(params[0]));
          return { rows: row ? [row] : [] };
        }
        if (s.includes("FROM freelancer_activation_article_release_runs")) {
          return { rows: mem.runs };
        }
        if (s.includes("FROM freelancer_activation_article_fund_entries")) {
          return { rows: mem.fundEntries };
        }
        throw new Error(`Unexpected SQL: ${s.slice(0, 180)}`);
      },
      release() {},
    };
  }

  function baseCampaign(overrides = {}) {
    return {
      id: 1,
      name: "Test",
      status: "active",
      total_budget_jod: "100.000",
      reserved_budget_jod: "0.000",
      used_budget_jod: "0.000",
      article_total_value_jod: "1.000",
      freelancer_share_jod: "0.500",
      company_share_jod: "0.300",
      reviewer_share_jod: "0.200",
      trial_bid_limit: 20,
      trial_duration_days: 10,
      daily_bid_limit: 2,
      minimum_bidders_per_article: 10,
      max_trial_wins: 2,
      emergency_stop_enabled: false,
      pause_new_assignments: false,
      silver_plan_code: "silver",
      silver_price_jod: "19.000",
      starts_at: null,
      ends_at: null,
      ...overrides,
    };
  }

  function baseMem(overrides = {}) {
    return {
      runDate: "2026-08-20",
      campaign: baseCampaign(),
      fundEntries: [{ entry_type: "fund_deposit", amount_jod: "10.000" }],
      allocations: [
        {
          id: 1,
          campaign_id: 1,
          wave_id: null,
          plan_tier_code: "starter",
          daily_budget_jod: "5.000",
          max_daily_articles: 3,
          total_article_value_jod: "1.000",
          freelancer_share_jod: "0.500",
          company_share_jod: "0.300",
          reviewer_share_jod: "0.200",
          minimum_bidders_per_article: 10,
          is_enabled: true,
          release_mode: "daily_auto",
          recycle_when_inventory_empty: false,
        },
      ],
      inventory: [
        {
          id: 11,
          campaign_id: 1,
          wave_id: null,
          plan_tier_code: "starter",
          title: "A",
          description: "",
          category_id: null,
          subcategory_id: null,
          total_article_value_jod: "1.000",
          freelancer_share_jod: "0.500",
          company_share_jod: "0.300",
          reviewer_share_jod: "0.200",
          minimum_bidders_per_article: 10,
          status: "ready",
          release_strategy: "one_time",
          max_releases: null,
          released_count: 0,
        },
        {
          id: 12,
          campaign_id: 1,
          wave_id: null,
          plan_tier_code: "starter",
          title: "B",
          description: "",
          category_id: null,
          subcategory_id: null,
          total_article_value_jod: "1.000",
          freelancer_share_jod: "0.500",
          company_share_jod: "0.300",
          reviewer_share_jod: "0.200",
          minimum_bidders_per_article: 10,
          status: "ready",
          release_strategy: "one_time",
          max_releases: null,
          released_count: 0,
        },
      ],
      ...overrides,
    };
  }

  it("dry-run preview does not create articles", async () => {
    const mem = baseMem();
    const client = createMemClient(mem);
    // mapAllocation expects camel after listPlanAllocations - listPlanAllocations maps rows
    // Our fake returns snake_case rows; listPlanAllocations maps them. Good.
    const preview = await engine.previewDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      client,
    });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.autoAssigned, false);
    assert.ok(preview.plannedCount >= 1);
    assert.equal(mem.articles.length, 0);
    assert.equal(mem.runs.length, 0);
  });

  it("run release creates live articles and records fund daily_allocation", async () => {
    const mem = baseMem();
    const client = createMemClient(mem);
    const out = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(out.autoAssigned, false);
    assert.equal(out.dryRun, false);
    assert.ok(out.articles.length >= 1);
    assert.ok(mem.articles.length >= 1);
    assert.equal(mem.articles[0].activation_plan_tier_code, "starter");
    assert.equal(String(mem.articles[0].activation_freelancer_share_jod), "0.500");
    assert.ok(mem.fundEntries.some((e) => e.entry_type === "daily_allocation"));
    assert.doesNotMatch(JSON.stringify(mem), /wallet|claim|stripe/i);
  });

  it("max daily articles limits release count", async () => {
    const mem = baseMem({
      allocations: [
        {
          ...baseMem().allocations[0],
          max_daily_articles: 1,
          daily_budget_jod: "10.000",
        },
      ],
    });
    const client = createMemClient(mem);
    const out = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(out.articles.length, 1);
  });

  it("fund insufficiency blocks release", async () => {
    const mem = baseMem({ fundEntries: [] });
    const client = createMemClient(mem);
    const out = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(out.articles?.length || 0, 0);
    assert.equal(mem.articles.length, 0);
  });

  it("emergency-stopped campaign blocks release", async () => {
    const mem = baseMem({
      campaign: baseCampaign({ emergency_stop_enabled: true }),
    });
    const client = createMemClient(mem);
    const out = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(mem.articles.length, 0);
    assert.ok(
      (out.allocationSummaries || []).some((s) =>
        String(s.skipReason || "").includes("EMERGENCY"),
      ) || out.run?.status === "skipped",
    );
  });

  it("paused campaign blocks release", async () => {
    const mem = baseMem({
      campaign: baseCampaign({ status: "paused", pause_new_assignments: true }),
    });
    const client = createMemClient(mem);
    await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(mem.articles.length, 0);
  });

  it("disabled allocation is skipped", async () => {
    const mem = baseMem({
      allocations: [{ ...baseMem().allocations[0], is_enabled: false }],
    });
    const client = createMemClient(mem);
    await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(mem.articles.length, 0);
  });

  it("manual allocation mode is skipped by daily_auto unless admin manual run", async () => {
    const mem = baseMem({
      allocations: [{ ...baseMem().allocations[0], release_mode: "manual" }],
    });
    const clientAuto = createMemClient(mem);
    await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client: clientAuto,
    });
    assert.equal(mem.articles.length, 0);

    const mem2 = baseMem({
      allocations: [{ ...baseMem().allocations[0], release_mode: "manual" }],
    });
    const clientManual = createMemClient(mem2);
    const out = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "manual",
      client: clientManual,
    });
    assert.ok(out.articles.length >= 1);
  });

  it("recycle false stops when ready inventory empty; recycle true uses reusable", async () => {
    const reusableItem = {
      id: 21,
      campaign_id: 1,
      wave_id: null,
      plan_tier_code: "starter",
      title: "Reusable",
      description: "",
      category_id: null,
      subcategory_id: null,
      total_article_value_jod: "1.000",
      freelancer_share_jod: "0.500",
      company_share_jod: "0.300",
      reviewer_share_jod: "0.200",
      minimum_bidders_per_article: 10,
      status: "released",
      release_strategy: "reusable",
      max_releases: 5,
      released_count: 1,
    };

    const memNo = baseMem({
      inventory: [reusableItem],
      allocations: [{ ...baseMem().allocations[0], recycle_when_inventory_empty: false }],
    });
    await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client: createMemClient(memNo),
    });
    assert.equal(memNo.articles.length, 0);

    const memYes = baseMem({
      inventory: [{ ...reusableItem }],
      allocations: [{ ...baseMem().allocations[0], recycle_when_inventory_empty: true }],
    });
    const out = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client: createMemClient(memYes),
    });
    assert.ok(out.articles.length >= 1);
  });

  it("release run is idempotent for same day/tier", async () => {
    const mem = baseMem();
    const client = createMemClient(mem);
    const first = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    const count1 = mem.articles.length;
    assert.ok(count1 >= 1);
    const second = await engine.runDailyMiniArticleRelease({
      campaignId: 1,
      planTierCode: "starter",
      date: "2026-08-20",
      runType: "daily_auto",
      client,
    });
    assert.equal(second.idempotent, true);
    assert.equal(mem.articles.length, count1);
    assert.equal(first.autoAssigned, false);
  });
});

describe("Phase A9.2+ release interval days", () => {
  it("interval 1 allows every day", () => {
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-20",
        intervalDays: 1,
        anchorDate: "2026-08-01",
      }),
      true,
    );
    assert.equal(engine.normalizeReleaseIntervalDays(null), 1);
    assert.equal(engine.normalizeReleaseIntervalDays(0), 1);
  });

  it("interval 2 skips non-matching days from anchor", () => {
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-01",
        intervalDays: 2,
        anchorDate: "2026-08-01",
      }),
      true,
    );
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-02",
        intervalDays: 2,
        anchorDate: "2026-08-01",
      }),
      false,
    );
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-03",
        intervalDays: 2,
        anchorDate: "2026-08-01",
      }),
      true,
    );
  });

  it("interval 3 skips non-matching days from anchor", () => {
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-01",
        intervalDays: 3,
        anchorDate: "2026-08-01",
      }),
      true,
    );
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-02",
        intervalDays: 3,
        anchorDate: "2026-08-01",
      }),
      false,
    );
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-04",
        intervalDays: 3,
        anchorDate: "2026-08-01",
      }),
      true,
    );
  });

  it("manual bypass leaves interval skip for auto path; daily remains compatible", () => {
    assert.equal(engine.NOT_RELEASE_DAY_MESSAGE_AR, "ليس يوم إنزال حسب الجدولة الحالية.");
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-02",
        intervalDays: 2,
        anchorDate: "2026-08-01",
      }),
      false,
    );
    assert.equal(
      engine.isReleaseDayForInterval({
        runDate: "2026-08-02",
        intervalDays: 1,
        anchorDate: "2026-08-01",
      }),
      true,
    );
    const svc = read("src/services/freelancerActivationArticleReleaseEngineService.js");
    assert.match(svc, /bypassInterval:\s*includeManualMode/);
    assert.match(svc, /skipReason:\s*"not_release_day"/);
  });
});

describe("Phase A9 article-operations default setup (no multi-campaign UI)", () => {
  it("exposes getOrCreateDefaultArticleOperationsCampaign and article-operations routes", () => {
    const camp = read("src/services/freelancerActivationCampaignService.js");
    assert.match(camp, /getOrCreateDefaultArticleOperationsCampaign/);
    assert.match(camp, /resolveArticleOperationsCampaignId/);
    assert.match(camp, /DEFAULT_ARTICLE_OPERATIONS_SETUP_NAME/);
    const routes = read("src/routes/superAdminFreelancerActivationRoutes.js");
    assert.match(routes, /article-operations\/setup/);
    assert.match(routes, /article-operations\/plan-allocations/);
    const constants = read("src/constants/freelancerActivationArticleOps.js");
    assert.match(constants, /DEFAULT_ARTICLE_OPERATIONS_SETUP_NAME/);
    assert.match(constants, /إعداد المقالات الرئيسي/);
  });
});
