/**
 * Frontend wiring smoke for Work Token Wallet Phase 4 (read-only card).
 * Run from frontend/: node --test src/components/freelancer/freelancerWorkTokenWalletCard.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FreelancerWorkTokenWalletCard wiring", () => {
  it("is mounted on FreelancerPlansPage and uses read-only API", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/FreelancerPlansPage.jsx"),
      "utf8",
    );
    const card = fs.readFileSync(
      path.join(__dirname, "FreelancerWorkTokenWalletCard.jsx"),
      "utf8",
    );
    const api = fs.readFileSync(path.join(__dirname, "../../services/api.js"), "utf8");

    assert.match(page, /FreelancerWorkTokenWalletCard/);
    assert.match(card, /getFreelancerWorkTokenWalletRequest/);
    assert.doesNotMatch(card, /Buy Tokens|Reserve Tokens|Spend Tokens|bid now/i);
    assert.match(api, /getFreelancerWorkTokenWalletRequest/);
    assert.match(api, /\/freelancer\/work-token-wallet/);
  });
});
