/**
 * Phase A2 — migration 145 SQL safety (read-only file assertions).
 * Run: node --test test/marketplaceArticlesMigration.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const migrationPath = path.join(
  __dirname,
  "../sql/migrations/145_marketplace_article_level_model.sql",
);

describe("145_marketplace_article_level_model migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("creates marketplace_articles with level/value/words/references/status", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_articles/);
    assert.match(sql, /article_level/);
    assert.match(sql, /article_value_jod/);
    assert.match(sql, /required_word_count/);
    assert.match(sql, /required_references_count/);
    assert.match(sql, /is_fake_or_training/);
    assert.match(sql, /draft.*published.*closed.*cancelled/s);
    assert.match(sql, /marketplace_articles_level_value_invariant_chk/);
    assert.match(sql, /article_value_jod = \(article_level::numeric\)/);
  });

  it("does not create applications/rounds/token movement or touch legacy plans", () => {
    assert.doesNotMatch(sql, /article_application/i);
    assert.doesNotMatch(sql, /competition_round/i);
    assert.doesNotMatch(sql, /INSERT INTO work_token_ledger_entries/i);
    assert.doesNotMatch(sql, /ALTER TABLE\s+plans\b/i);
    assert.doesNotMatch(sql, /work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO marketplace_articles/i);
  });

  it("registers schema_migrations version 145", () => {
    assert.match(sql, /145_marketplace_article_level_model/);
  });
});
