/**
 * Trial pending earnings lock + 40-day forfeiture — static + mocked unit tests.
 * Run: node --test test/freelancerActivationTrialEarningsForfeiture.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/trial_pending_earnings_forfeiture_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const policy = require("../src/constants/trialPendingEarningsPolicy");
const forfeiture = require("../src/services/trialPendingEarningsForfeitureService");
const earned = require("../src/services/freelancerActivationEarnedBalanceService");
const settlement = require("../src/services/marketplaceArticleSettlementService");
const { MINI_ARTICLE_SUBMISSION_TERMS_VERSION } = require("../src/constants/marketplaceArticleSubmissionTerms");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Migration 178", () => {
  it("is additive and defines grace + forfeiture audit", () => {
    const sql = read("sql/migrations/178_trial_pending_earnings_forfeiture.sql");
    assert.match(sql, /178:/);
    assert.match(sql, /freelancer_activation_trial_pending_earnings_grace_days/);
    assert.match(sql, /forfeited/);
    assert.match(sql, /company_trial_forfeiture/);
    assert.match(sql, /trial_pending_earnings_forfeiture_events/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
  });
});

describe("Policy terms gating", () => {
  it("v2 accepts forfeiture; v1 does not", () => {
    assert.equal(policy.termsVersionAcceptsForfeiturePolicy("mini_article_submission_terms_2026-08-v1"), false);
    assert.equal(policy.termsVersionAcceptsForfeiturePolicy(MINI_ARTICLE_SUBMISSION_TERMS_VERSION), true);
    assert.equal(
      policy.entryEligibleForForfeiturePolicy({
        entryMetadata: {},
        submissionTermsVersion: MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
      }),
      true,
    );
    assert.equal(
      policy.entryEligibleForForfeiturePolicy({
        entryMetadata: {},
        submissionTermsVersion: "mini_article_submission_terms_2026-08-v1",
      }),
      false,
    );
  });
});

describe("Earned balance mapping", () => {
  it("pending starter maps to pending_locked when policy active", () => {
    const row = {
      entry_type: "writer_starter_pending",
      entry_status: "pending",
      amount_jod: "0.500",
      writer_net_jod: "0.500",
    };
    const mapped = earned.mapEarnedBalanceEntry(row, {
      lockPolicy: { state: "grace_period" },
    });
    assert.equal(mapped.status, "pending_locked");
    assert.equal(mapped.locked, true);
    assert.equal(mapped.withdrawable, false);
  });

  it("forfeited entries excluded from pending totals", () => {
    const summary = earned.summarizeEntries([
      {
        status: "forfeited",
        amountJod: "1.000",
        withdrawable: false,
      },
      {
        status: "pending_locked",
        amountJod: "0.500",
        locked: true,
        withdrawable: false,
      },
    ]);
    assert.equal(summary.totalPendingJod, "0.500");
    assert.equal(summary.totalForfeitedJod, "1.000");
    assert.equal(summary.totalLockedPendingJod, "0.500");
  });
});

describe("Forfeiture deadline math", () => {
  it("computes deadline as ends_at + grace days", () => {
    const ends = "2026-01-01T00:00:00.000Z";
    const deadline = forfeiture.computeForfeitureDeadline(ends, 40);
    assert.ok(deadline);
    const diffDays = Math.round((deadline.getTime() - new Date(ends).getTime()) / 86400000);
    assert.equal(diffDays, 40);
  });
});

describe("Release wiring", () => {
  it("release only targets pending writer_starter_pending", () => {
    const src = read("src/services/marketplaceArticleSettlementService.js");
    assert.match(src, /releaseStarterPendingArticleEarnings/);
    assert.match(src, /status = 'pending'/);
    assert.doesNotMatch(src, /status = 'forfeited'/);
  });

  it("settlement stamps trial earnings policy metadata when v2 terms", () => {
    const src = read("src/services/marketplaceArticleSettlementService.js");
    assert.match(src, /trialEarningsPolicyVersion/);
  });
});

describe("Lazy forfeiture evaluation (mocked)", () => {
  let mem;
  beforeEach(() => {
    forfeiture.clearForfeitureSchemaCache();
    mem = {
      schemaReady: true,
      settings: { grace_days: 40 },
      trial: {
        id: 9,
        freelancer_user_id: 41,
        status: "trial_expired_high_intent",
        ends_at: "2026-01-01T00:00:00.000Z",
      },
      entries: [
        {
          id: 501,
          settlement_id: 1,
          article_id: 7,
          article_application_id: 41,
          beneficiary_user_id: 41,
          entry_type: "writer_starter_pending",
          status: "pending",
          amount_jod: "0.500",
          metadata: { trialEarningsPolicyVersion: MINI_ARTICLE_SUBMISSION_TERMS_VERSION },
          submission_terms_version: MINI_ARTICLE_SUBMISSION_TERMS_VERSION,
        },
      ],
      events: [],
      companyEntries: [],
    };
  });

  function mockClient() {
    return {
      async query(sql, params = []) {
        const s = String(sql);
        if (/\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/.test(s)) return { rows: [] };
        if (s.includes("to_regclass('public.trial_pending_earnings_forfeiture_events')")) {
          return { rows: [{ tbl: mem.schemaReady ? "trial_pending_earnings_forfeiture_events" : null }] };
        }
        if (s.includes("freelancer_activation_trial_pending_earnings_grace_days")) {
          return { rows: [{ grace_days: mem.settings.grace_days }] };
        }
        if (s.includes("FROM freelancer_marketplace_memberships")) return { rows: [] };
        if (s.includes("FROM freelancer_activation_trials WHERE freelancer_user_id")) {
          return { rows: mem.trial ? [mem.trial] : [] };
        }
        if (s.includes("UPDATE freelancer_activation_trials") && s.includes("trial_expired")) {
          return { rows: [mem.trial] };
        }
        if (s.includes("FROM marketplace_article_financial_entries e") && s.includes("FOR UPDATE")) {
          return { rows: mem.entries };
        }
        if (s.includes("UPDATE marketplace_article_financial_entries") && s.includes("forfeited")) {
          const id = params[0];
          const row = mem.entries.find((e) => e.id === id);
          if (row) row.status = "forfeited";
          return { rows: row ? [row] : [] };
        }
        if (s.includes("INSERT INTO marketplace_article_financial_entries") && String(params[3] || "") === "company_trial_forfeiture") {
          const row = { id: 9001, idempotency_key: params[5] };
          mem.companyEntries.push(row);
          return { rows: [row] };
        }
        if (s.includes("SELECT id FROM marketplace_article_financial_entries WHERE idempotency_key")) {
          const key = params[0];
          const found = mem.companyEntries.find((e) => e.idempotency_key === key);
          return { rows: found ? [{ id: found.id }] : [] };
        }
        if (s.includes("INSERT INTO trial_pending_earnings_forfeiture_events")) {
          mem.events.push({ idempotency_key: params[8] });
          return { rows: [] };
        }
        if (s.includes("INSERT INTO freelancer_activation_events")) return { rows: [] };
        if (s.includes("trial_pending_forfeiture:writer_entry")) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
  }

  it("skips legacy v1 terms entries", async () => {
    mem.entries[0].submission_terms_version = "mini_article_submission_terms_2026-08-v1";
    mem.entries[0].metadata = {};
    const out = await forfeiture.evaluateAndApplyForfeitureIfDue(41, {
      client: mockClient(),
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    assert.equal(out.forfeitedCount, 0);
    assert.equal(out.skippedLegacyCount, 1);
    assert.equal(mem.entries[0].status, "pending");
  });

  it("forfeits v2 policy entries after grace deadline", async () => {
    const out = await forfeiture.evaluateAndApplyForfeitureIfDue(41, {
      client: mockClient(),
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    assert.equal(out.forfeitedCount, 1);
    assert.equal(mem.entries[0].status, "forfeited");
    assert.equal(mem.companyEntries.length, 1);
    assert.equal(mem.events.length, 1);
  });

  it("does not forfeit during grace period", async () => {
    const out = await forfeiture.evaluateAndApplyForfeitureIfDue(41, {
      client: mockClient(),
      now: new Date("2026-01-15T00:00:00.000Z"),
    });
    assert.equal(out.skipped, true);
    assert.equal(out.reason, "grace_period");
    assert.equal(mem.entries[0].status, "pending");
  });
});
