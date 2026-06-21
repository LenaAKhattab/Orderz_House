/**
 * Unit checks for paginated admin subscriptions list (no DB required).
 * Run: node backend/test/listSubscriptionsPagination.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const servicePath = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");
const src = fs.readFileSync(servicePath, "utf8");

assert.ok(!src.includes("LIMIT 200"), "hard LIMIT 200 must be removed from listSubscriptions");
assert.ok(src.includes("LIMIT $"), "paginated LIMIT/OFFSET must be present");
assert.ok(src.includes("totalPages"), "pagination metadata must be built in service");
assert.ok(src.includes("plan_id = $"), "planId server filter must exist");
assert.ok(src.includes("ILIKE"), "search ILIKE must exist");

console.log("listSubscriptionsPagination.test.js: OK");
