const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("createInternalOrder supports institutional options without changing default signature", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/services/ordersService.js"),
    "utf8",
  );
  assert.match(src, /async function createInternalOrder\(\{ actorUserId, actorRole, payload, uploadedFiles = \[\], options = \{\} \}\)/);
  assert.match(src, /skipFreelancerBroadcast/);
  assert.match(src, /visibilityScope === "institution"/);
  assert.match(src, /COALESCE\(o\.visibility_scope, 'public'\) = 'public'/);
});

test("training pool real side excludes institution-scoped orders", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../src/services/trainingPoolList.js"),
    "utf8",
  );
  assert.match(src, /COALESCE\(o\.visibility_scope, 'public'\) = 'public'/);
});

test("institutional routes are mounted separately from admin orders create", () => {
  const appSrc = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
  assert.match(appSrc, /institutionalStorageRoutes/);
  assert.match(appSrc, /institutionPoolRoutes/);
  const adminOrders = fs.readFileSync(
    path.join(__dirname, "../src/routes/adminOrdersRoutes.js"),
    "utf8",
  );
  assert.doesNotMatch(adminOrders, /institutional-order-storage/);
});

test("AdminCreateOrderPage still uses wizard without institutional mode", () => {
  const page = fs.readFileSync(
    path.join(__dirname, "../../frontend/src/pages/dashboard/AdminCreateOrderPage.jsx"),
    "utf8",
  );
  assert.match(page, /AdminInternalOrderWizard/);
  assert.doesNotMatch(page, /institutional/);
  assert.match(page, /variant="page"/);
});
