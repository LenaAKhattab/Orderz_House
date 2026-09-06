/**
 * Phase A5 — Earned Balance UX + manuscript terms snapshot.
 * Does not apply migrations. No Production / git / Stripe / orders.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/freelancer_activation_a5_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const earned = require("../src/services/freelancerActivationEarnedBalanceService");
const submissions = require("../src/services/marketplaceArticleSubmissionsService");
const { ARTICLE_SUBMISSION_ERROR_CODES } = require("../src/constants/marketplaceArticleSubmissions");
const {
  MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
} = require("../src/constants/marketplaceArticleSubmissionTerms");
const {
  clearMarketplaceArticleSubmissionsSchemaCache,
} = require("../src/utils/marketplaceArticleSubmissionsSchema");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function createEarnedClient(mem) {
  return {
    async query(sql, params = []) {
      const s = String(sql);
      if (s.includes("marketplace_article_financial_entries")) {
        const uid = params[0] != null && !Array.isArray(params[0]) ? Number(params[0]) : null;
        let rows = mem.rows || [];
        if (uid != null && Number.isInteger(uid)) {
          rows = rows.filter((r) => Number(r.beneficiary_user_id) === uid);
        }
        return { rows };
      }
      return { rows: [] };
    },
  };
}

function writerRow(overrides = {}) {
  return {
    beneficiary_user_id: 10,
    article_application_id: 41,
    article_id: 7,
    ledger_amount_jod: "0.500",
    amount_jod: "0.500",
    entry_status: "pending",
    entry_type: "writer_starter_pending",
    created_at: "2026-08-18T10:00:00.000Z",
    settled_at: "2026-08-18T10:05:00.000Z",
    writer_net_jod: "0.500",
    article_title: "Trial Mini Article",
    activation_campaign_id: 3,
    freelancer_share_jod: "0.500",
    campaign_name: "Wave Fund",
    wave_name: "W1",
    bildazo_article_url: null,
    publish_status: null,
    published_at: null,
    company_share_jod: "0.300",
    reviewer_fee_jod: "0.200",
    ...overrides,
  };
}

describe("Phase A5 migration and isolation", () => {
  it("171 is additive and does not edit 167-170", () => {
    const sql = read("sql/migrations/171_marketplace_article_submission_terms_a5.sql");
    assert.match(sql, /171_marketplace_article_submission_terms_a5/);
    assert.match(sql, /terms_version/);
    assert.match(sql, /terms_accepted_at/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/);
    assert.doesNotMatch(sql, /\bTRUNCATE\b/);
    assert.doesNotMatch(sql, /\bDELETE FROM\b/);
    assert.doesNotMatch(read("sql/migrations/170_freelancer_activation_budget_a42.sql"), /terms_version/);
    assert.doesNotMatch(read("sql/migrations/166_marketplace_article_submissions.sql"), /terms_accepted_ip/);
  });

  it("does not write wallet, claims, Stripe, or settlement", () => {
    const src = read("src/services/freelancerActivationEarnedBalanceService.js");
    assert.match(src, /beneficiary_user_id = \$1/);
    assert.match(src, /writer_starter_pending/);
    assert.doesNotMatch(src, /INSERT INTO marketplace_article_financial_entries/);
    assert.doesNotMatch(src, /financialClaimsService/);
    assert.doesNotMatch(src, /require\(["'].*ordersService/);
    assert.doesNotMatch(src, /require\(["'].*stripe/i);
    assert.doesNotMatch(src, /consumeBidCreditReservation/);
    assert.doesNotMatch(src, /publishAcceptedArticleToBildazo/);
    assert.doesNotMatch(read("src/services/marketplaceArticleSettlementService.js"), /getFreelancerEarnedBalance/);
  });
});

describe("Phase A5 earned balance", () => {
  it("returns zero for no entries", async () => {
    const out = await earned.getFreelancerEarnedBalance(10, {
      client: createEarnedClient({ rows: [] }),
    });
    assert.equal(out.totalPendingJod, "0.000");
    assert.equal(out.totalAcceptedArticles, 0);
    assert.equal(out.totalPublishedArticles, 0);
    assert.deepEqual(out.entries, []);
  });

  it("accepted activation article appears with freelancer share amount", async () => {
    const out = await earned.getFreelancerEarnedBalance(10, {
      client: createEarnedClient({ rows: [writerRow()] }),
    });
    assert.equal(out.totalPendingJod, "0.500");
    assert.equal(out.totalAcceptedArticles, 1);
    assert.equal(out.entries[0].amountJod, "0.500");
    assert.equal(out.entries[0].status, "pending");
    assert.equal(out.entries[0].articleTitle, "Trial Mini Article");
    assert.equal(out.entries[0].campaignName, "Wave Fund");
    assert.equal(out.entries[0].companyShareJod, undefined);
    assert.equal(out.entries[0].reviewerFeeJod, undefined);
    assert.equal(out.entries[0].reservedBudgetJod, undefined);
  });

  it("published article includes Bildazo URL", async () => {
    const out = await earned.getFreelancerEarnedBalance(10, {
      client: createEarnedClient({
        rows: [
          writerRow({
            bildazo_article_url: "https://bildazo.example/a/1",
            publish_status: "published",
            published_at: "2026-08-19T00:00:00.000Z",
          }),
        ],
      }),
    });
    assert.equal(out.totalPublishedArticles, 1);
    assert.equal(out.entries[0].bildazoUrl, "https://bildazo.example/a/1");
  });

  it("current freelancer cannot read others’ earned entries", async () => {
    const out = await earned.getFreelancerEarnedBalance(10, {
      client: createEarnedClient({
        rows: [
          writerRow({ beneficiary_user_id: 10, article_application_id: 1 }),
          writerRow({ beneficiary_user_id: 99, article_application_id: 2, article_title: "Secret" }),
        ],
      }),
    });
    assert.equal(out.entries.length, 1);
    assert.equal(out.entries[0].applicationId, "1");
    assert.equal(out.entries.some((e) => e.articleTitle === "Secret"), false);
  });
});

describe("Phase A5 manuscript terms", () => {
  it("requires terms acceptance and stores snapshot", async () => {
    assert.throws(
      () => submissions.assertManuscriptTermsAccepted(false),
      (err) => err.publicCode === ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_SUBMISSION_TERMS_REQUIRED,
    );
    const mem = {
      application: {
        id: 41,
        article_id: 7,
        freelancer_user_id: 10,
        status: "selected",
        required_word_count: 0,
      },
      submissions: [],
    };
    const client = {
      async query(sql, params = []) {
        const s = String(sql);
        if (s.includes("to_regclass")) return { rows: [{ tbl: "marketplace_article_submissions" }] };
        if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
        if (s.includes("FROM marketplace_article_applications")) {
          return { rows: [{ ...mem.application, required_word_count: 0 }] };
        }
        if (s.includes("FROM marketplace_article_submissions WHERE application_id")) {
          return { rows: mem.submissions };
        }
        if (s.includes("INSERT INTO marketplace_article_submissions")) {
          const row = {
            id: 1,
            application_id: params[0],
            article_id: params[1],
            freelancer_user_id: params[2],
            title: params[3],
            content: params[4],
            status: "submitted",
            terms_version: params[5],
            terms_accepted_at: params[6],
            terms_accepted_ip: params[7],
            terms_accepted_user_agent: params[8],
            terms_snapshot_key: params[9],
            terms_text_snapshot: params[10],
            submitted_at: new Date().toISOString(),
          };
          mem.submissions = [row];
          return { rows: [row] };
        }
        if (s.includes("UPDATE marketplace_article_submissions") && s.includes("terms_version")) {
          mem.submissions[0] = {
            ...mem.submissions[0],
            title: params[1],
            content: params[2],
            terms_version: params[3],
            terms_accepted_at: params[4],
            terms_text_snapshot: params[8],
            status: "submitted",
          };
          return { rows: [mem.submissions[0]] };
        }
        if (s.includes("UPDATE marketplace_article_applications")) return { rows: [] };
        return { rows: [] };
      },
    };
    clearMarketplaceArticleSubmissionsSchemaCache();
    const created = await submissions.submitFinalArticleManuscript({
      applicationId: 41,
      freelancerUserId: 10,
      title: "Final title here",
      content: "x".repeat(60),
      termsAccepted: true,
      requestMeta: { ip: "127.0.0.1", userAgent: "test-agent" },
      client,
    });
    assert.equal(created.created, true);
    assert.equal(created.submission.termsAccepted, true);
    assert.equal(created.submission.termsVersion, MINI_ARTICLE_SUBMISSION_TERMS_VERSION);
    assert.match(String(mem.submissions[0].terms_text_snapshot), /provisional_product_copy/);
    assert.match(MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR, /Bildazo/);
    assert.equal(created.submission.termsAcceptedIp, undefined);

    const again = await submissions.submitFinalArticleManuscript({
      applicationId: 41,
      freelancerUserId: 10,
      title: "Revised title here",
      content: "y".repeat(60),
      termsAccepted: true,
      requestMeta: { ip: "127.0.0.1" },
      client,
    });
    assert.equal(again.created, false);
    assert.equal(again.submission.title, "Revised title here");
    assert.equal(again.submission.termsAccepted, true);
  });

  it("legacy submission without terms does not crash mapping", () => {
    const mapped = submissions.mapSubmissionRow({
      id: 9,
      application_id: 3,
      article_id: 2,
      freelancer_user_id: 8,
      title: "Old",
      content: "body",
      status: "submitted",
      submitted_at: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(mapped.termsAccepted, false);
    assert.equal(mapped.termsVersion, null);
    assert.equal(mapped.termsAcceptedAt, null);
  });
});
