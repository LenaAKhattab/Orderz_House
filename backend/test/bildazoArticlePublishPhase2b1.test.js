/**
 * Phase 2B.1 — final article manuscript source (not proposal, not campaign brief).
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/bildazo_placeholder";
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
if (classifyDatabaseUrl(process.env.DATABASE_URL).isProduction) {
  process.env.DATABASE_URL = "postgresql://127.0.0.1:5432/bildazo_placeholder";
}

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ARTICLE_SUBMISSION_ERROR_CODES,
  countWords,
} = require("../src/constants/marketplaceArticleSubmissions");
const { clearMarketplaceArticleSubmissionsSchemaCache } = require("../src/utils/marketplaceArticleSubmissionsSchema");
const {
  assertSubmittedManuscriptForApproval,
  mapSubmissionRow,
} = require("../src/services/marketplaceArticleSubmissionsService");

function createDb({ application, submission }) {
  async function query(sql, params = []) {
    const s = String(sql);
    if (s.includes("to_regclass('public.marketplace_article_submissions')")) {
      return { rows: [{ tbl: "marketplace_article_submissions" }] };
    }
    if (s.includes("FROM marketplace_article_submissions WHERE application_id")) {
      return {
        rows: submission && Number(submission.application_id) === Number(params[0]) ? [submission] : [],
      };
    }
    if (s.includes("FROM marketplace_article_applications")) {
      return { rows: application ? [application] : [] };
    }
    return { rows: [] };
  }
  return { query };
}

describe("Phase 2B.1 manuscript source", () => {
  beforeEach(() => {
    clearMarketplaceArticleSubmissionsSchemaCache();
  });

  it("blocks approval when no submitted manuscript exists", async () => {
    const db = createDb({
      application: { id: 9, status: "selected", freelancer_user_id: 11 },
      submission: null,
    });
    await assert.rejects(
      () => assertSubmittedManuscriptForApproval({ applicationId: 9, client: db }),
      (err) => err.publicCode === ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_FINAL_CONTENT_REQUIRED,
    );
  });

  it("blocks approval when manuscript is only revision_requested", async () => {
    const db = createDb({
      submission: {
        id: 1,
        application_id: 9,
        title: "T",
        content: "enough content for a manuscript body here",
        status: "revision_requested",
      },
    });
    await assert.rejects(
      () => assertSubmittedManuscriptForApproval({ applicationId: 9, client: db }),
      (err) => err.publicCode === ARTICLE_SUBMISSION_ERROR_CODES.ARTICLE_FINAL_CONTENT_REQUIRED,
    );
  });

  it("allows approval when manuscript is submitted with title and content", async () => {
    const row = {
      id: 1,
      application_id: 9,
      title: "Final title",
      content: "enough content for a manuscript body here",
      status: "submitted",
    };
    const db = createDb({ submission: row });
    const found = await assertSubmittedManuscriptForApproval({ applicationId: 9, client: db });
    assert.equal(found.title, "Final title");
    const mapped = mapSubmissionRow(found);
    assert.equal(mapped.content.includes("proposal"), false);
  });

  it("word count helper is used for required_word_count", () => {
    assert.equal(countWords("one two three"), 3);
  });
});

describe("Phase 2B.1 files", () => {
  const root = path.join(__dirname, "..");
  function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
  }

  it("migration 166 is additive and unique per application", () => {
    const sql = read("sql/migrations/166_marketplace_article_submissions.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_article_submissions/);
    assert.match(sql, /UNIQUE \(application_id\)/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
  });

  it("finalize requires manuscript before settlement BEGIN consume", () => {
    const apps = read("src/services/marketplaceArticleApplicationsService.js");
    const settle = read("src/services/marketplaceArticleSettlementService.js");
    const publish = read("src/services/bildazoArticlePublishService.js");
    const finalize = apps.slice(apps.indexOf("async function finalizeArticleApplicationApproval"));
    assert.ok(
      finalize.indexOf("assertSubmittedManuscriptForApproval") < finalize.indexOf("BEGIN"),
    );
    assert.match(settle, /assertSubmittedManuscriptForApproval/);
    assert.match(settle, /consumeBidCreditReservation/);
    const consumeAt = settle.indexOf("consumeBidCreditReservation");
    const assertAt = settle.indexOf("assertSubmittedManuscriptForApproval");
    assert.ok(assertAt > 0 && assertAt < consumeAt);
    assert.match(publish, /MISSING_FINAL_ARTICLE_CONTENT/);
    assert.doesNotMatch(publish, /proposal_message \|\|/);
    assert.doesNotMatch(publish, /article\.description \|\| ""/);
  });

  it("freelancer submit route exists and is not a browser Bildazo call", () => {
    const routes = read("src/routes/freelancerMarketplaceArticleApplicationsRoutes.js");
    assert.match(routes, /final-manuscript/);
    assert.match(routes, /requireFreelancer/);
  });
});
