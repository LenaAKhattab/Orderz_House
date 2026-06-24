import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));

describe("bid amount modal polish", () => {
  it("uses dedicated modal layout classes and locale keys", () => {
    const modalSrc = readFileSync(join(here, "../../components/orders/BidAmountModal.jsx"), "utf8");
    const cssSrc = readFileSync(join(here, "../../styles/bidAmountModal.css"), "utf8");
    const enLocale = readFileSync(join(here, "../../locales/en/orders.json"), "utf8");

    assert.match(modalSrc, /oh-bid-modal/);
    assert.match(modalSrc, /orders\.bid\.sendTitle/);
    assert.match(modalSrc, /orders\.bid\.summaryLabel/);
    assert.match(modalSrc, /orders\.bid\.inputHelper/);
    assert.match(cssSrc, /\.oh-bid-modal[\s\S]*border-radius: 1\.5rem/);
    assert.match(enLocale, /"sendTitle": "Send your offer for this project"/);
    assert.match(enLocale, /"submitting": "Sending\.\.\."/);
  });
});
