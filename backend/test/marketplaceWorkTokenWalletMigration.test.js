/**
 * Migration 139 — Work Token Wallet + Ledger parser/safety tests (hardened).
 * No Production DB mutations.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/marketplace_work_token_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sqlPath = path.join(
  __dirname,
  "../sql/migrations/139_marketplace_work_token_wallet_ledger.sql",
);
const sql = fs.readFileSync(sqlPath, "utf8");

describe("139 Work Token wallet migration (hardened)", () => {
  it("creates wallet, reservations, and ledger tables", () => {
    assert.match(sql, /CREATE TABLE IF NOT EXISTS freelancer_work_token_wallets/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS work_token_reservations/);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS work_token_ledger_entries/);
  });

  it("uses wallet-scoped reservation uniqueness (not global)", () => {
    assert.match(
      sql,
      /CONSTRAINT work_token_reservations_wallet_reference_uidx\s+UNIQUE \(wallet_id, reference_type, reference_id\)/,
    );
    assert.doesNotMatch(
      sql,
      /CONSTRAINT work_token_reservations_reference_uidx UNIQUE \(reference_type, reference_id\)/,
    );
  });

  it("separates ledger idempotency_key from business reference", () => {
    assert.match(sql, /idempotency_key VARCHAR\(180\) NOT NULL/);
    assert.match(
      sql,
      /work_token_ledger_entries_wallet_idempotency_uidx[\s\S]*\(wallet_id, idempotency_key\)/,
    );
    assert.doesNotMatch(
      sql,
      /work_token_ledger_entries_idempotency_uidx[\s\S]*\(wallet_id, event_type, reference_type, reference_id\)/,
    );
  });

  it("enforces non-negative balances and one wallet per freelancer", () => {
    assert.match(sql, /CHECK \(available_tokens >= 0\)/);
    assert.match(sql, /CHECK \(reserved_tokens >= 0\)/);
    assert.match(
      sql,
      /CONSTRAINT freelancer_work_token_wallets_freelancer_uidx UNIQUE \(freelancer_user_id\)/,
    );
  });

  it("uses RESTRICT FKs and does not cascade-delete history", () => {
    assert.match(sql, /REFERENCES users\(id\) ON DELETE RESTRICT/);
    assert.match(sql, /REFERENCES freelancer_work_token_wallets\(id\) ON DELETE RESTRICT/);
    assert.doesNotMatch(sql, /ON DELETE CASCADE/);
  });

  it("does not flip economy flags, seed wallets, or grant tokens", () => {
    assert.doesNotMatch(sql, /work_tokens_enabled\s*=\s*TRUE/i);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_work_token_wallets/i);
    assert.doesNotMatch(sql, /UPDATE marketplace_economy_settings/i);
  });

  it("records schema_migrations version 139", () => {
    assert.match(sql, /139_marketplace_work_token_wallet_ledger/);
  });
});
