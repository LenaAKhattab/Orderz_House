/**
 * Phase B5 Article Applications + Bid economics — isolated DB gate tests.
 * Run via: node scripts/runMarketplaceArticleApplicationsPhaseB5Gate.js
 */
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PHASE B5 GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceArticleApplicationsPhaseB5Gate.js");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-article-applications-b5-gate-secret";
}

const { pool } = require("../src/config/db");
const articlesService = require("../src/services/marketplaceArticlesService");
const appsService = require("../src/services/marketplaceArticleApplicationsService");
const membershipsService = require("../src/services/marketplaceMembershipsService");
const plansService = require("../src/services/marketplaceMembershipPlansService");
const accounting = require("../src/services/marketplaceBidCreditAccountingService");
const {
  clearArticleApplicationsSchemaCache,
} = require("../src/utils/marketplaceArticleApplicationsSchema");
const {
  clearArticleApplicationBidEconomicsSchemaCache,
} = require("../src/services/marketplaceArticleApplicationBidCreditService");
const {
  ARTICLE_APPLICATION_BID_COST,
  ARTICLE_WORK_TOKEN_ENTRY,
  ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME,
  ARTICLE_PRIORITY_BOOST,
  ARTICLE_FAIR_DISTRIBUTION,
  ARTICLE_APPLICATION_HISTORICAL_BACKFILL,
  ARTICLE_VALUE_TO_BID_COST_MAPPING,
  ARTICLE_LEVEL_TO_BID_COST_MAPPING,
  ARTICLE_APPLICATION_NO_SELECTION_REFUND,
  ARTICLE_APPLICATION_WITHDRAWAL_REFUND,
  ARTICLE_APPLICATION_REJECTION_REFUND,
  ARTICLE_APPLICATION_LOSER_REFUND,
  ARTICLE_APPLICATION_FREE_FALLBACK_WHEN_BID_ENGINE_OFF,
  ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST,
  buildArticleApplicationBidConsumeIdempotencyKey,
} = require("../src/constants/marketplaceArticleApplications");

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `b5_${role}_${suffix}@example.com`;
  const accountId = `B${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'B5', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

async function ensureCategoryPair() {
  let cat = await pool.query(`SELECT id FROM categories ORDER BY id LIMIT 1`);
  if (!cat.rows[0]) {
    cat = await pool.query(
      `INSERT INTO categories (slug, name) VALUES ('content-writing', 'Content') RETURNING id`,
    );
  }
  const categoryId = cat.rows[0].id;
  let sub = await pool.query(
    `SELECT id FROM subcategories WHERE category_id = $1 ORDER BY id LIMIT 1`,
    [categoryId],
  );
  if (!sub.rows[0]) {
    sub = await pool.query(
      `INSERT INTO subcategories (category_id, slug, name)
       VALUES ($1, 'blogs', 'Blogs') RETURNING id`,
      [categoryId],
    );
  }
  return { categoryId, subcategoryId: sub.rows[0].id };
}

async function findOrCreatePlanWithAccess(accessLevel) {
  const list = await plansService.listAdminMarketplaceMembershipPlans({ includeInactive: true });
  const hit = (list || []).find(
    (p) =>
      Number(p.articleAccessLevel) === Number(accessLevel) &&
      String(p.tierCode || "").includes(`B5_A${accessLevel}`),
  );
  if (hit) return hit;
  const byLevel = (list || []).find((p) => Number(p.articleAccessLevel) === Number(accessLevel));
  if (byLevel) return byLevel;
  const suffix = crypto.randomBytes(3).toString("hex");
  return plansService.createMarketplaceMembershipPlan({
    tierCode: `B5_A${accessLevel}_${suffix}`.slice(0, 32),
    nameAr: `B5 Access ${accessLevel}`,
    nameEn: `B5 Access ${accessLevel}`,
    slug: `b5-access-${accessLevel}-${suffix}`,
    isActive: true,
    sortOrder: 900 + Number(accessLevel),
    monthlyPriceJod: accessLevel === 1 ? 0 : 10,
    unlimitedRealOrderValue: true,
    cashAllowed: false,
    articleAccessLevel: accessLevel,
    monthlyBidAllowance: 0,
    priorityBidEnabled: false,
    priorityBidUsesPerCycle: 0,
  });
}

async function activateMembership(freelancerUserId, accessLevel) {
  const plan = await findOrCreatePlanWithAccess(accessLevel);
  return membershipsService.createAndActivateMarketplaceMembership({
    freelancerUserId,
    marketplacePlanId: plan.id,
    source: "system",
    paidTermMonths: 1,
  });
}

async function setEngines({ articleApps = true, bidCredits = true } = {}) {
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET article_applications_enabled = $1,
            bid_credits_enabled = $2,
            updated_at = NOW()
      WHERE id = 1`,
    [Boolean(articleApps), Boolean(bidCredits)],
  );
}

async function grantBids(freelancerUserId, amount = 1, { expiresAt, grantedAt, keySuffix } = {}) {
  const now = grantedAt || new Date();
  const exp =
    expiresAt || new Date(now.getTime() + 30 * 86400000);
  return accounting.createBidCreditGrant({
    freelancerUserId: Number(freelancerUserId),
    sourceType: "admin_manual",
    amount,
    expiresAt: exp,
    eventType: "ADMIN_BID_GRANT",
    idempotencyKey: `b5-grant-${freelancerUserId}-${keySuffix || crypto.randomBytes(4).toString("hex")}`,
    reason: "b5_gate_grant",
    grantedAt: now,
  });
}

async function availableBids(freelancerUserId, now = new Date()) {
  const client = await pool.connect();
  try {
    return accounting.sumAvailableBidCredits({
      client,
      freelancerUserId: Number(freelancerUserId),
      now,
    });
  } finally {
    client.release();
  }
}

describe("Phase B5 — constants", () => {
  it("owner-approved policy + isolations", () => {
    assert.equal(ARTICLE_APPLICATION_BID_COST, 1);
    assert.equal(ARTICLE_WORK_TOKEN_ENTRY, "CANCELLED");
    assert.equal(ACTIVE_ARTICLE_WORK_TOKEN_RUNTIME, "NONE");
    assert.equal(ARTICLE_PRIORITY_BOOST, "NOT_IMPLEMENTED");
    assert.equal(ARTICLE_FAIR_DISTRIBUTION, "NOT_IMPLEMENTED");
    assert.equal(ARTICLE_APPLICATION_HISTORICAL_BACKFILL, "NONE");
    assert.equal(ARTICLE_VALUE_TO_BID_COST_MAPPING, "NONE");
    assert.equal(ARTICLE_LEVEL_TO_BID_COST_MAPPING, "NONE");
    assert.equal(ARTICLE_APPLICATION_NO_SELECTION_REFUND, "100_PERCENT");
    assert.equal(ARTICLE_APPLICATION_WITHDRAWAL_REFUND, "NONE");
    assert.equal(ARTICLE_APPLICATION_REJECTION_REFUND, "NONE");
    assert.equal(ARTICLE_APPLICATION_LOSER_REFUND, "NONE");
    assert.equal(ARTICLE_APPLICATION_FREE_FALLBACK_WHEN_BID_ENGINE_OFF, "NO");
    assert.equal(ARTICLE_APPLICATION_EDIT_ADDITIONAL_BID_COST, 0);
  });
});

describe("Phase B5 — isolated DB gate (foundation + economics)", () => {
  let admin;
  let categoryId;
  let subcategoryId;

  before(async () => {
    clearArticleApplicationsSchemaCache();
    clearArticleApplicationBidEconomicsSchemaCache();
    admin = await seedUser("super_admin");
    ({ categoryId, subcategoryId } = await ensureCategoryPair());
    await setEngines({ articleApps: true, bidCredits: true });
  });

  after(async () => {
    await setEngines({ articleApps: false, bidCredits: false }).catch(() => {});
    await pool.end().catch(() => {});
  });

  async function createPublishedArticle(level, { fake = false, status = "published" } = {}) {
    return articlesService.createMarketplaceArticle(
      {
        title: `B5 L${level} ${crypto.randomBytes(3).toString("hex")}`,
        description: "B5 article",
        articleLevel: level,
        requiredWordCount: 500,
        requiredReferencesCount: 1,
        status,
        categoryId,
        subcategoryId,
        isFakeOrTraining: fake,
      },
      { actorUserId: admin.id },
    );
  }

  async function readyFreelancer(accessLevel, bids = 2) {
    const fl = await seedUser("freelancer");
    await activateMembership(fl.id, accessLevel);
    if (bids > 0) await grantBids(fl.id, bids);
    return fl;
  }

  it("1 published real consumes exactly 1 Bid + economics row + ledger", async () => {
    const fl = await readyFreelancer(5, 3);
    const before = await availableBids(fl.id);
    const pub = await createPublishedArticle(1);
    const ok = await appsService.submitArticleApplication({
      articleId: pub.id,
      freelancerUserId: fl.id,
      proposalMessage: "hello",
    });
    assert.equal(ok.created, true);
    assert.equal(ok.bidCreditConsumed, 1);
    assert.equal(ok.workTokenConsumed, 0);
    const after = await availableBids(fl.id);
    assert.equal(after, before - 1);

    const { rows: econ } = await pool.query(
      `SELECT * FROM marketplace_article_application_bid_credit_economics
        WHERE article_application_id = $1`,
      [ok.application.id],
    );
    assert.equal(econ.length, 1);
    assert.equal(Number(econ[0].bid_credit_cost), 1);
    assert.equal(econ[0].charge_status, "charged");
    assert.equal(econ[0].refund_status, "none");

    const { rows: ledger } = await pool.query(
      `SELECT * FROM marketplace_bid_credit_ledger_entries
        WHERE idempotency_key = $1`,
      [buildArticleApplicationBidConsumeIdempotencyKey(pub.id, fl.id)],
    );
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].event_type, "ARTICLE_APPLICATION_BID_CONSUME");
    assert.equal(Number(ledger[0].amount), 1);
    assert.equal(Number(ledger[0].direction), -1);
  });

  it("draft/closed/cancelled/fake denied; fake consumes 0", async () => {
    const fl = await readyFreelancer(5, 5);
    for (const status of ["draft", "closed", "cancelled"]) {
      const a = await createPublishedArticle(1, { status });
      await assert.rejects(
        () =>
          appsService.submitArticleApplication({
            articleId: a.id,
            freelancerUserId: fl.id,
          }),
        (err) => err.publicCode === "ARTICLE_NOT_OPEN_FOR_APPLICATIONS",
      );
    }
    const fake = await createPublishedArticle(1, { fake: true });
    const before = await availableBids(fl.id);
    await assert.rejects(
      () =>
        appsService.submitArticleApplication({
          articleId: fake.id,
          freelancerUserId: fl.id,
        }),
      (err) => err.publicCode === "ARTICLE_FAKE_TRAINING_FORBIDDEN",
    );
    assert.equal(await availableBids(fl.id), before);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics e
         JOIN marketplace_article_applications a ON a.id = e.article_application_id
        WHERE a.article_id = $1`,
      [fake.id],
    );
    assert.equal(rows[0].c, 0);
  });

  it("membership access matrix", async () => {
    const cases = [
      { access: 1, article: 1, ok: true },
      { access: 1, article: 2, ok: false },
      { access: 3, article: 1, ok: true },
      { access: 3, article: 3, ok: true },
      { access: 3, article: 4, ok: false },
      { access: 5, article: 5, ok: true },
    ];
    for (const c of cases) {
      const fl = await readyFreelancer(c.access, 2);
      const article = await createPublishedArticle(c.article);
      if (c.ok) {
        const r = await appsService.submitArticleApplication({
          articleId: article.id,
          freelancerUserId: fl.id,
        });
        assert.equal(r.created, true, `access ${c.access} → L${c.article}`);
        assert.equal(r.bidCreditConsumed, 1);
      } else {
        await assert.rejects(
          () =>
            appsService.submitArticleApplication({
              articleId: article.id,
              freelancerUserId: fl.id,
            }),
          (err) => err.publicCode === "ARTICLE_ACCESS_LEVEL_INSUFFICIENT",
        );
      }
    }
  });

  it("no usable membership denied", async () => {
    const fl = await seedUser("freelancer");
    await grantBids(fl.id, 2);
    const article = await createPublishedArticle(1);
    await assert.rejects(
      () =>
        appsService.submitArticleApplication({
          articleId: article.id,
          freelancerUserId: fl.id,
        }),
      (err) => err.publicCode === "ARTICLE_NO_USABLE_MEMBERSHIP",
    );
  });

  it("insufficient Bids rejects and rolls back application", async () => {
    const fl = await readyFreelancer(1, 0);
    const article = await createPublishedArticle(1);
    await assert.rejects(
      () =>
        appsService.submitArticleApplication({
          articleId: article.id,
          freelancerUserId: fl.id,
        }),
      (err) => err.publicCode === "INSUFFICIENT_BID_CREDITS",
    );
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_applications
        WHERE article_id = $1 AND freelancer_user_id = $2`,
      [article.id, fl.id],
    );
    assert.equal(rows[0].c, 0);
    const { rows: econ } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics
        WHERE article_id = $1 AND freelancer_user_id = $2`,
      [article.id, fl.id],
    );
    assert.equal(econ[0].c, 0);
  });

  it("Bid engine OFF rejects free application (fail-closed)", async () => {
    await setEngines({ articleApps: true, bidCredits: false });
    const fl = await readyFreelancer(1, 3);
    const article = await createPublishedArticle(1);
    await assert.rejects(
      () =>
        appsService.submitArticleApplication({
          articleId: article.id,
          freelancerUserId: fl.id,
        }),
      (err) => err.publicCode === "ARTICLE_BID_ECONOMY_DISABLED",
    );
    await setEngines({ articleApps: true, bidCredits: true });
  });

  it("article apps engine OFF rejects", async () => {
    await setEngines({ articleApps: false, bidCredits: true });
    const fl = await readyFreelancer(1, 2);
    const article = await createPublishedArticle(1);
    await assert.rejects(
      () =>
        appsService.submitArticleApplication({
          articleId: article.id,
          freelancerUserId: fl.id,
        }),
      (err) => err.publicCode === "ARTICLE_APPLICATIONS_ENGINE_OFF",
    );
    await setEngines({ articleApps: true, bidCredits: true });
  });

  it("duplicate + concurrent uniqueness; retry consumes once", async () => {
    const fl = await readyFreelancer(2, 5);
    const article = await createPublishedArticle(2);
    const first = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
    });
    assert.equal(first.created, true);
    assert.equal(first.bidCreditConsumed, 1);
    const second = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
    });
    assert.equal(second.created, false);
    assert.equal(second.duplicatePrevented, true);
    assert.equal(second.bidCreditConsumed, 0);

    const before = await availableBids(fl.id);
    const results = await Promise.all([
      appsService.submitArticleApplication({
        articleId: article.id,
        freelancerUserId: fl.id,
      }),
      appsService.submitArticleApplication({
        articleId: article.id,
        freelancerUserId: fl.id,
      }),
    ]);
    assert.ok(results.every((r) => r.application.id === first.application.id));
    assert.equal(await availableBids(fl.id), before);

    const { rows: econ } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics
        WHERE article_id = $1 AND freelancer_user_id = $2`,
      [article.id, fl.id],
    );
    assert.equal(econ[0].c, 1);
    const { rows: ledger } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries
        WHERE event_type = 'ARTICLE_APPLICATION_BID_CONSUME'
          AND idempotency_key = $1`,
      [buildArticleApplicationBidConsumeIdempotencyKey(article.id, fl.id)],
    );
    assert.equal(ledger[0].c, 1);
  });

  it("FEFO earliest expiry used; expired grant cannot fund", async () => {
    const fl = await readyFreelancer(1, 0);
    const now = new Date("2026-08-01T12:00:00.000Z");
    await grantBids(fl.id, 1, {
      grantedAt: now,
      expiresAt: new Date("2026-08-10T00:00:00.000Z"),
      keySuffix: "early",
    });
    await grantBids(fl.id, 1, {
      grantedAt: now,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      keySuffix: "late",
    });
    const article = await createPublishedArticle(1);
    const r = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
      now,
    });
    assert.equal(r.created, true);
    const { rows: econ } = await pool.query(
      `SELECT primary_grant_id, fefo_allocations FROM marketplace_article_application_bid_credit_economics
        WHERE article_application_id = $1`,
      [r.application.id],
    );
    const { rows: early } = await pool.query(
      `SELECT id FROM marketplace_bid_credit_grants
        WHERE freelancer_user_id = $1 AND expires_at = $2`,
      [fl.id, new Date("2026-08-10T00:00:00.000Z").toISOString()],
    );
    assert.equal(String(econ[0].primary_grant_id), String(early[0].id));

    const fl2 = await readyFreelancer(1, 0);
    await grantBids(fl2.id, 1, {
      grantedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2026-01-15T00:00:00.000Z"),
      keySuffix: "expired-only",
    });
    const article2 = await createPublishedArticle(1);
    await assert.rejects(
      () =>
        appsService.submitArticleApplication({
          articleId: article2.id,
          freelancerUserId: fl2.id,
          now: new Date("2026-02-01T00:00:00.000Z"),
        }),
      (err) => err.publicCode === "INSUFFICIENT_BID_CREDITS",
    );
  });

  it("edit consumes 0 additional; withdraw refunds 0", async () => {
    const fl = await readyFreelancer(1, 3);
    const article = await createPublishedArticle(1);
    const { application } = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
      proposalMessage: "v1",
    });
    const before = await availableBids(fl.id);
    const edited = await appsService.editArticleApplication({
      applicationId: application.id,
      freelancerUserId: fl.id,
      proposalMessage: "v2",
    });
    assert.equal(edited.additionalBidCost, 0);
    assert.equal(edited.bidCreditConsumed, 0);
    assert.equal(await availableBids(fl.id), before);
    const w = await appsService.withdrawArticleApplication({
      applicationId: application.id,
      freelancerUserId: fl.id,
    });
    assert.equal(w.application.status, "withdrawn");
    assert.equal(w.bidRefunded, 0);
    assert.equal(await availableBids(fl.id), before);
    const { rows: econ } = await pool.query(
      `SELECT refund_status FROM marketplace_article_application_bid_credit_economics
        WHERE article_application_id = $1`,
      [application.id],
    );
    assert.equal(econ[0].refund_status, "none");
  });

  it("rejection refund NONE; loser refund NONE; selected close no mass refund", async () => {
    const a = await readyFreelancer(1, 2);
    const b = await readyFreelancer(1, 2);
    const article = await createPublishedArticle(1);
    const appA = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: a.id,
    });
    await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: b.id,
    });
    const balA = await availableBids(a.id);

    await appsService.rejectArticleApplication({
      applicationId: appA.application.id,
      actorUserId: admin.id,
    });
    assert.equal(await availableBids(a.id), balA);

    const c = await readyFreelancer(1, 2);
    const article2 = await createPublishedArticle(1);
    const win = await appsService.submitArticleApplication({
      articleId: article2.id,
      freelancerUserId: c.id,
    });
    const lose = await appsService.submitArticleApplication({
      articleId: article2.id,
      freelancerUserId: b.id,
    });
    const balLoseBefore = await availableBids(b.id);
    const balWinBeforeSelect = await availableBids(c.id);
    await appsService.selectArticleApplication({
      applicationId: win.application.id,
      actorUserId: admin.id,
    });
    const loser = await appsService.getApplicationById(lose.application.id, { forAdmin: true });
    assert.equal(loser.status, "rejected");
    assert.equal(await availableBids(b.id), balLoseBefore);

    await articlesService.updateMarketplaceArticle(
      article2.id,
      { status: "closed" },
      { actorUserId: admin.id },
    );
    const { rows: refunded } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics
        WHERE article_id = $1 AND refund_status = 'refunded'`,
      [article2.id],
    );
    assert.equal(refunded[0].c, 0);
    assert.equal(await availableBids(c.id), balWinBeforeSelect);
  });

  it("closed/cancelled with zero selected refunds each pending charged app once", async () => {
    const freelancers = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      freelancers.push(await readyFreelancer(1, 2));
    }
    const article = await createPublishedArticle(1);
    const apps = [];
    for (const fl of freelancers) {
      // eslint-disable-next-line no-await-in-loop
      apps.push(
        // eslint-disable-next-line no-await-in-loop
        await appsService.submitArticleApplication({
          articleId: article.id,
          freelancerUserId: fl.id,
        }),
      );
    }
    const balsBefore = [];
    for (const fl of freelancers) {
      // eslint-disable-next-line no-await-in-loop
      balsBefore.push(await availableBids(fl.id));
    }

    await articlesService.updateMarketplaceArticle(
      article.id,
      { status: "cancelled" },
      { actorUserId: admin.id },
    );

    for (let i = 0; i < freelancers.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal(await availableBids(freelancers[i].id), balsBefore[i] + 1);
      // eslint-disable-next-line no-await-in-loop
      const app = await appsService.getApplicationById(apps[i].application.id);
      assert.equal(app.status, "cancelled");
    }
    const { rows: econ } = await pool.query(
      `SELECT refund_status, refund_mode FROM marketplace_article_application_bid_credit_economics
        WHERE article_id = $1 ORDER BY id`,
      [article.id],
    );
    assert.equal(econ.length, 3);
    assert.ok(econ.every((e) => e.refund_status === "refunded"));
    assert.ok(econ.every((e) => e.refund_mode === "same_bucket_restore"));

    const { rows: refundLedger } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_bid_credit_ledger_entries
        WHERE event_type = 'ARTICLE_APPLICATION_BID_REFUND'
          AND metadata->>'articleId' = $1`,
      [String(article.id)],
    );
    assert.equal(refundLedger[0].c, 3);

    // Idempotent re-close path (already cancelled) — no double refund
    const balsMid = [];
    for (const fl of freelancers) {
      // eslint-disable-next-line no-await-in-loop
      balsMid.push(await availableBids(fl.id));
    }
    await articlesService.updateMarketplaceArticle(
      article.id,
      { status: "cancelled", title: `re-${article.title}`.slice(0, 240) },
      { actorUserId: admin.id },
    );
    for (let i = 0; i < freelancers.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal(await availableBids(freelancers[i].id), balsMid[i]);
    }
  });

  it("expired source → compensating grant +30d; consume ledger immutable", async () => {
    const fl = await readyFreelancer(1, 0);
    const grantAt = new Date("2026-03-01T00:00:00.000Z");
    const expiresAt = new Date("2026-03-20T00:00:00.000Z");
    await grantBids(fl.id, 1, { grantedAt: grantAt, expiresAt, keySuffix: "comp" });
    const article = await createPublishedArticle(1);
    const applyNow = new Date("2026-03-10T00:00:00.000Z");
    const r = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
      now: applyNow,
    });
    const { rows: consume } = await pool.query(
      `SELECT * FROM marketplace_bid_credit_ledger_entries
        WHERE idempotency_key = $1`,
      [buildArticleApplicationBidConsumeIdempotencyKey(article.id, fl.id)],
    );
    assert.equal(consume.length, 1);
    const consumeId = consume[0].id;
    const consumeAmount = Number(consume[0].amount);

    const refundNow = new Date("2026-04-01T00:00:00.000Z");
    // Force close with custom now via direct refund helper after status update
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE marketplace_articles SET status = 'closed', closed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [article.id],
      );
      const articleBid = require("../src/services/marketplaceArticleApplicationBidCreditService");
      await articleBid.refundNoSelectionArticleApplications({
        client,
        articleId: Number(article.id),
        actorUserId: admin.id,
        now: refundNow,
      });
      await appsService.cancelPendingApplicationsForArticle(article.id, client);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const { rows: econ } = await pool.query(
      `SELECT * FROM marketplace_article_application_bid_credit_economics
        WHERE article_application_id = $1`,
      [r.application.id],
    );
    assert.equal(econ[0].refund_status, "refunded");
    assert.equal(econ[0].refund_mode, "compensating_grant_30d");
    assert.ok(econ[0].compensating_grant_id);

    const { rows: grant } = await pool.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1`,
      [econ[0].compensating_grant_id],
    );
    assert.equal(grant[0].source_type, "article_application_refund");
    assert.equal(Number(grant[0].amount_granted), 1);
    const expectedExp = new Date(refundNow.getTime() + 30 * 86400000).getTime();
    assert.equal(new Date(grant[0].expires_at).getTime(), expectedExp);

    const { rows: consumeAgain } = await pool.query(
      `SELECT amount, event_type FROM marketplace_bid_credit_ledger_entries WHERE id = $1`,
      [consumeId],
    );
    assert.equal(Number(consumeAgain[0].amount), consumeAmount);
    assert.equal(consumeAgain[0].event_type, "ARTICLE_APPLICATION_BID_CONSUME");
  });

  it("withdrawn application not refunded on close", async () => {
    const fl = await readyFreelancer(1, 2);
    const article = await createPublishedArticle(1);
    const { application } = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
    });
    await appsService.withdrawArticleApplication({
      applicationId: application.id,
      freelancerUserId: fl.id,
    });
    const before = await availableBids(fl.id);
    await articlesService.updateMarketplaceArticle(
      article.id,
      { status: "closed" },
      { actorUserId: admin.id },
    );
    assert.equal(await availableBids(fl.id), before);
    const { rows } = await pool.query(
      `SELECT refund_status FROM marketplace_article_application_bid_credit_economics
        WHERE article_application_id = $1`,
      [application.id],
    );
    assert.equal(rows[0].refund_status, "none");
  });

  it("metadata freeze after first application", async () => {
    const fl = await readyFreelancer(3, 2);
    const article = await createPublishedArticle(2);
    await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
    });
    await assert.rejects(
      () =>
        articlesService.updateMarketplaceArticle(
          article.id,
          { articleLevel: 3 },
          { actorUserId: admin.id },
        ),
      (err) => err.publicCode === "ARTICLE_METADATA_FROZEN",
    );
  });

  it("isolations markers on successful apply", async () => {
    const fl = await readyFreelancer(1, 2);
    const article = await createPublishedArticle(1);
    const r = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: fl.id,
    });
    assert.equal(r.bidCreditConsumed, 1);
    assert.equal(r.workTokenConsumed, 0);
    assert.equal(r.priorityBoost, "NOT_IMPLEMENTED");
    assert.equal(r.fairDistribution, "NOT_IMPLEMENTED");
    assert.equal(r.workTokenEntry, "CANCELLED");
    assert.equal(r.activeWorkTokenRuntime, "NONE");
  });

  it("select/close concurrency: cannot both select and no-selection refund", async () => {
    const a = await readyFreelancer(1, 2);
    const b = await readyFreelancer(1, 2);
    const article = await createPublishedArticle(1);
    const appA = await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: a.id,
    });
    await appsService.submitArticleApplication({
      articleId: article.id,
      freelancerUserId: b.id,
    });

    const results = await Promise.allSettled([
      appsService.selectArticleApplication({
        applicationId: appA.application.id,
        actorUserId: admin.id,
      }),
      articlesService.updateMarketplaceArticle(
        article.id,
        { status: "closed" },
        { actorUserId: admin.id },
      ),
    ]);
    assert.ok(results.some((r) => r.status === "fulfilled"));

    const { rows: selected } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_applications
        WHERE article_id = $1 AND status = 'selected'`,
      [article.id],
    );
    const { rows: refunded } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_application_bid_credit_economics
        WHERE article_id = $1 AND refund_status = 'refunded'`,
      [article.id],
    );
    // Either selected exists with 0 no-selection refunds, or no selected with refunds for pending.
    if (selected[0].c > 0) {
      assert.equal(refunded[0].c, 0);
    } else {
      assert.ok(refunded[0].c >= 1);
    }
  });
});
