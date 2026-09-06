/**
 * OZ04 — minimum_not_met fund refund + recycle marketplace_articles to draft.
 * Run: node --test test/oz04MinimumNotMetFundRefund.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://oz04_test:oz04_test@127.0.0.1:5432/oz04_test_unused";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

const oz04 = require("../src/services/marketplaceArticleOz04MinimumNotMetService");
const collection = require("../src/services/opportunityBidCollectionService");

describe("OZ04 — no migration", () => {
  it("uses existing daily_allocation_released entry type (migration 173)", () => {
    const sql = read("sql/migrations/173_freelancer_activation_article_fund_inventory_a91.sql");
    assert.match(sql, /daily_allocation_released/);
    assert.doesNotMatch(
      fs.readdirSync(path.join(root, "sql/migrations")).join("\n"),
      /185_.*oz04|184_.*oz04/i,
    );
  });

  it("wires closeArticleRoundMinimumNotMet to OZ04 recycle/refund", () => {
    const src = read("src/services/opportunityBidCollectionService.js");
    assert.match(src, /marketplaceArticleOz04MinimumNotMetService/);
    assert.match(src, /recycleAndRefundAfterMinimumNotMet/);
    assert.match(src, /articleRecycled/);
  });
});

function makeFundMemClient({
  article = {
    id: 77,
    status: "published",
    publication_status: "not_applicable",
    bid_collection_outcome: null,
  },
  winner = false,
  fundEntries = [],
} = {}) {
  let nextId = Math.max(0, ...fundEntries.map((e) => Number(e.id) || 0)) + 1;
  const mem = {
    article: { ...article },
    fundEntries: fundEntries.map((e) => ({ ...e, metadata: e.metadata || {} })),
    appsCancelled: false,
  };

  const client = {
    async query(sql, params = []) {
      const s = String(sql);

      if (/FROM marketplace_articles WHERE id = \$1 FOR UPDATE/.test(s)) {
        return { rows: mem.article ? [{ ...mem.article }] : [] };
      }
      if (
        /FROM marketplace_article_applications/.test(s) &&
        /selected','assigned'/.test(s)
      ) {
        return { rows: winner ? [{ id: 1 }] : [] };
      }
      if (/FROM marketplace_article_applications/.test(s) && /FOR UPDATE/.test(s)) {
        return {
          rows: [
            { id: 1, status: "pending", bid_reservation_id: 101 },
            { id: 2, status: "pending", bid_reservation_id: 102 },
          ],
        };
      }
      if (/FROM marketplace_articles WHERE id/.test(s) && !/UPDATE/.test(s) && !/FOR UPDATE/.test(s)) {
        return { rows: mem.article ? [{ ...mem.article, activation_inventory_item_id: null }] : [] };
      }

      if (/FROM freelancer_activation_article_fund_entries/.test(s) && /daily_allocation'/.test(s) && /NOT EXISTS/.test(s)) {
        const key = String(params[0]);
        const active = mem.fundEntries
          .filter(
            (e) =>
              e.entry_type === "daily_allocation" &&
              (String(e.metadata?.marketplaceArticleId) === key ||
                String(e.metadata?.oz03ArticleId) === key),
          )
          .filter((d) => {
            return !mem.fundEntries.some(
              (r) =>
                r.entry_type === "daily_allocation_released" &&
                (String(r.metadata?.originalFundEntryId) === String(d.id) ||
                  (String(r.metadata?.reason || r.reason || "") === "minimum_not_met_refund" &&
                    (String(r.metadata?.marketplaceArticleId) === key ||
                      String(r.metadata?.oz03ArticleId) === key) &&
                    r.metadata?.originalFundEntryId == null &&
                    Number(r.id) > Number(d.id))),
            );
          })
          .sort((a, b) => Number(b.id) - Number(a.id));
        return { rows: active[0] ? [active[0]] : [] };
      }

      if (
        /FROM freelancer_activation_article_fund_entries/.test(s) &&
        /daily_allocation_released/.test(s) &&
        /SELECT id, amount_jod/.test(s)
      ) {
        const key = String(params[0]);
        const reason = String(params[1]);
        let list = mem.fundEntries.filter(
          (e) =>
            e.entry_type === "daily_allocation_released" &&
            (String(e.metadata?.marketplaceArticleId) === key ||
              String(e.metadata?.oz03ArticleId) === key) &&
            String(e.metadata?.reason || e.reason || "") === reason,
        );
        if (params[2] != null && /originalFundEntryId/.test(s)) {
          list = list.filter((e) => String(e.metadata?.originalFundEntryId) === String(params[2]));
        } else if (params[2] != null && /bidCollectionRoundId/.test(s)) {
          list = list.filter((e) => String(e.metadata?.bidCollectionRoundId) === String(params[2]));
        }
        list.sort((a, b) => Number(a.id) - Number(b.id));
        return { rows: list[0] ? [list[0]] : [] };
      }

      if (/INSERT INTO freelancer_activation_article_fund_entries/.test(s) && /daily_allocation_released/.test(s)) {
        const row = {
          id: nextId++,
          campaign_id: params[0],
          wave_id: params[1],
          entry_type: "daily_allocation_released",
          amount_jod: params[2],
          reason: params[3],
          metadata: typeof params[4] === "string" ? JSON.parse(params[4]) : params[4],
          created_by_user_id: params[5],
          created_at: new Date().toISOString(),
        };
        mem.fundEntries.push(row);
        return { rows: [row] };
      }

      if (/INSERT INTO freelancer_activation_article_fund_entries/.test(s) && /daily_allocation'/.test(s)) {
        const row = {
          id: nextId++,
          campaign_id: params[0],
          wave_id: params[1],
          entry_type: "daily_allocation",
          amount_jod: params[2],
          reason: params[3],
          metadata: typeof params[4] === "string" ? JSON.parse(params[4]) : params[4],
          created_by_user_id: params[5],
          created_at: new Date().toISOString(),
        };
        mem.fundEntries.push(row);
        return { rows: [row] };
      }

      if (/UPDATE marketplace_articles/.test(s) && /status = 'draft'/.test(s)) {
        if (!mem.article || !["published", "closed"].includes(mem.article.status)) {
          return { rows: [] };
        }
        mem.article = {
          ...mem.article,
          status: "draft",
          bid_collection_outcome: "minimum_not_met",
          closed_at: null,
          application_deadline_at: null,
        };
        return { rows: [{ id: mem.article.id, status: "draft" }] };
      }

      if (/bid_collection_status = 'minimum_not_met'/.test(s)) {
        return { rows: [{ id: params[0], bid_collection_status: "minimum_not_met" }] };
      }
      if (/SET status = 'cancelled'/.test(s)) {
        mem.appsCancelled = true;
        return { rows: [], rowCount: 2 };
      }
      if (/UPDATE marketplace_articles/.test(s) && /status = 'closed'/.test(s)) {
        if (mem.article?.status === "published") mem.article.status = "closed";
        return { rows: [] };
      }
      if (/UPDATE freelancer_activation_article_inventory_items/.test(s)) {
        return { rows: [] };
      }
      if (/SELECT activation_inventory_item_id/.test(s)) {
        return { rows: [{ activation_inventory_item_id: null }] };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  return { client, mem };
}

describe("OZ04 — recycle + refund", () => {
  it("refunds exact deduction once and recycles article to draft", async () => {
    const { client, mem } = makeFundMemClient({
      fundEntries: [
        {
          id: 10,
          entry_type: "daily_allocation",
          amount_jod: "1.000",
          campaign_id: 1,
          wave_id: null,
          metadata: { marketplaceArticleId: "77", oz03ArticleId: "77" },
        },
      ],
    });
    const out = await oz04.recycleAndRefundAfterMinimumNotMet(client, {
      articleId: 77,
      roundId: 5,
      now: new Date("2026-08-29T12:00:00.000Z"),
    });
    assert.equal(out.recycled, true);
    assert.equal(out.statusAfter, "draft");
    assert.equal(mem.article.status, "draft");
    assert.equal(out.fundRefund.refunded, true);
    assert.equal(out.fundRefund.amountJod, "1.000");
    assert.equal(out.fundRefund.originalFundEntryId, 10);
    const refunds = mem.fundEntries.filter((e) => e.entry_type === "daily_allocation_released");
    assert.equal(refunds.length, 1);
    assert.equal(refunds[0].metadata.reason, "minimum_not_met_refund");
    assert.equal(refunds[0].metadata.originalFundEntryId, "10");
    assert.match(String(refunds[0].reason), /عدم اكتمال عدد المتقدمين/);
  });

  it("repeated minimum_not_met does not double-refund", async () => {
    const { client, mem } = makeFundMemClient({
      fundEntries: [
        {
          id: 10,
          entry_type: "daily_allocation",
          amount_jod: "2.000",
          campaign_id: 1,
          metadata: { marketplaceArticleId: "77" },
        },
      ],
    });
    const first = await oz04.recycleAndRefundAfterMinimumNotMet(client, {
      articleId: 77,
      roundId: 5,
    });
    assert.equal(first.fundRefund.refunded, true);
    mem.article.status = "published";
    const second = await oz04.recycleAndRefundAfterMinimumNotMet(client, {
      articleId: 77,
      roundId: 5,
    });
    assert.equal(second.fundRefund.idempotent || second.fundRefund.skipped, true);
    assert.equal(second.fundRefund.refunded, false);
    assert.equal(
      mem.fundEntries.filter((e) => e.entry_type === "daily_allocation_released").length,
      1,
    );
  });

  it("missing funding entry does not crash and reports warning", async () => {
    const { client } = makeFundMemClient({ fundEntries: [] });
    const out = await oz04.recycleAndRefundAfterMinimumNotMet(client, {
      articleId: 77,
      roundId: 9,
    });
    assert.equal(out.recycled, true);
    assert.equal(out.fundRefund.refunded, false);
    assert.equal(out.fundRefund.reason, "funding_entry_missing");
    assert.ok(out.fundRefund.warning);
  });

  it("winner/assignment skips refund and recycle", async () => {
    const { client, mem } = makeFundMemClient({
      winner: true,
      fundEntries: [
        {
          id: 10,
          entry_type: "daily_allocation",
          amount_jod: "1.000",
          campaign_id: 1,
          metadata: { marketplaceArticleId: "77" },
        },
      ],
    });
    const out = await oz04.recycleAndRefundAfterMinimumNotMet(client, {
      articleId: 77,
      roundId: 5,
    });
    assert.equal(out.recycled, false);
    assert.equal(out.fundRefund.reason, "winner_or_assignment_exists");
    assert.equal(mem.article.status, "published");
    assert.equal(
      mem.fundEntries.filter((e) => e.entry_type === "daily_allocation_released").length,
      0,
    );
  });

  it("active deduction becomes null after refund so future release can deduct again", async () => {
    const { client, mem } = makeFundMemClient({
      fundEntries: [
        {
          id: 10,
          entry_type: "daily_allocation",
          amount_jod: "1.000",
          campaign_id: 1,
          metadata: { marketplaceArticleId: "77", oz03ArticleId: "77" },
        },
      ],
    });
    assert.ok(await oz04.findActiveFundDeductionForArticle(client, 77));
    await oz04.recycleAndRefundAfterMinimumNotMet(client, { articleId: 77, roundId: 5 });
    assert.equal(await oz04.findActiveFundDeductionForArticle(client, 77), null);

    // simulate future release deduction
    mem.fundEntries.push({
      id: 99,
      entry_type: "daily_allocation",
      amount_jod: "1.000",
      campaign_id: 1,
      metadata: { marketplaceArticleId: "77", oz03ArticleId: "77" },
    });
    const active2 = await oz04.findActiveFundDeductionForArticle(client, 77);
    assert.equal(Number(active2.id), 99);
  });

  it("does not create duplicate marketplace_articles rows (source contract)", () => {
    const src = read("src/services/marketplaceArticleOz04MinimumNotMetService.js");
    assert.doesNotMatch(src, /INSERT INTO marketplace_articles/);
    assert.match(src, /status = 'draft'/);
  });
});

describe("OZ04 — closeArticleRoundMinimumNotMet integration", () => {
  it("cancels apps, releases reservations, refunds fund, recycles to draft", async () => {
    const released = [];
    const reservationService = require("../src/services/marketplaceBidCreditReservationService");
    const origRelease = reservationService.releaseBidCreditReservation;
    reservationService.releaseBidCreditReservation = async ({ reservationId }) => {
      released.push(reservationId);
      return { released: true };
    };

    const { client, mem } = makeFundMemClient({
      fundEntries: [
        {
          id: 10,
          entry_type: "daily_allocation",
          amount_jod: "1.000",
          campaign_id: 1,
          metadata: { marketplaceArticleId: "77", oz03ArticleId: "77" },
        },
      ],
    });

    try {
      const out = await collection.closeArticleRoundMinimumNotMet(client, {
        id: 5,
        opportunity_id: 77,
        opportunity_type: "mini_bid_article",
        required_bid_count: 10,
        bid_collection_status: "collecting",
      });
      assert.equal(out.skipped, false);
      assert.equal(out.status, "minimum_not_met");
      assert.deepEqual(released, [101, 102]);
      assert.equal(out.articleRecycled, true);
      assert.equal(out.fundRefund?.refunded, true);
      assert.equal(mem.article.status, "draft");
      assert.equal(mem.appsCancelled, true);
      assert.equal(
        mem.fundEntries.filter((e) => e.entry_type === "daily_allocation_released").length,
        1,
      );
    } finally {
      reservationService.releaseBidCreditReservation = origRelease;
    }
  });
});

describe("OZ04 — UI Arabic reason", () => {
  it("hub and ops panel show refund ledger copy", () => {
    const hub = read("..", "frontend", "src", "pages", "dashboard", "SuperAdminArticlesHubPage.jsx");
    const panel = read(
      "..",
      "frontend",
      "src",
      "components",
      "admin",
      "FreelancerActivationArticleOpsPanel.jsx",
    );
    assert.match(hub, /إرجاع تمويل بسبب عدم اكتمال عدد المتقدمين/);
    assert.match(panel, /إرجاع تمويل بسبب عدم اكتمال عدد المتقدمين/);
    assert.match(hub, /articles-fund-ledger/);
  });
});
