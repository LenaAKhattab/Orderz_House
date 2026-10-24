/**
 * A single bind parameter used both as a varchar column value and in `CASE WHEN $n = '…'`
 * makes Postgres reject the statement ("inconsistent types deduced for parameter").
 * These statements cast the parameter once so it has one type.
 *
 * Run: node --test test/sqlParameterTyping.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("single-type bind parameters in status updates", () => {
  it("priced bid insert (moderation_status)", () => {
    const src = read("src/services/ordersService.js");
    assert.match(src, /\$5::varchar, \$6, \$7, CASE WHEN \$5::varchar = 'held'/);
  });

  it("subscription cancel/inactivate (status + cancelled_at)", () => {
    const src = read("src/services/subscriptionsService.js");
    assert.match(src, /SET status = \$2::text,\s+cancelled_at = CASE WHEN \$2::text = 'cancelled'/);
  });

  it("Bildazo author link status update", () => {
    const src = read("src/services/bildazoAuthorLinkAdminService.js");
    assert.match(src, /SET status = \$2::text,[\s\S]{0,80}CASE WHEN \$2::text = 'failed'/);
  });

  it("institutional scheduler tick", () => {
    const src = read("src/services/institutionalScheduleService.js");
    assert.match(src, /last_tick_status = \$1::text,[\s\S]{0,120}CASE WHEN \$1::text = 'success'[\s\S]{0,80}CASE WHEN \$1::text = 'failed'/);
  });
});
