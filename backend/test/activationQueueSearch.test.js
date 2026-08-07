/**
 * Activation-queue search: parameterized ILIKE within ACTIVATION_QUEUE_WHERE_SQL.
 * Run: node --test test/activationQueueSearch.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/activation_queue_search_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const servicePath = path.join(__dirname, "..", "src", "services", "subscriptionsService.js");
const controllerPath = path.join(__dirname, "..", "src", "controllers", "subscriptionsController.js");
const validatorsPath = path.join(__dirname, "..", "src", "validators", "subscriptionsValidators.js");
const routesPath = path.join(__dirname, "..", "src", "routes", "adminSubscriptionsRoutes.js");

const serviceSrc = fs.readFileSync(servicePath, "utf8");
const controllerSrc = fs.readFileSync(controllerPath, "utf8");
const validatorsSrc = fs.readFileSync(validatorsPath, "utf8");
const routesSrc = fs.readFileSync(routesPath, "utf8");

const { escapeIlikePattern } = require("../src/services/subscriptionsService");

describe("activation queue search — wiring", () => {
  it("accepts optional search on activation-queue validators", () => {
    const block = validatorsSrc.slice(
      validatorsSrc.indexOf("listActivationQueueValidators"),
      validatorsSrc.indexOf("listSubscriptionsValidators"),
    );
    assert.match(block, /query\("search"\)/);
    assert.match(block, /\.optional\(\)/);
    assert.match(block, /\.isString\(\)/);
    assert.match(block, /\.trim\(\)/);
    assert.match(block, /isLength\(\{\s*max:\s*120\s*\}/);
  });

  it("controller passes trimmed search into listActivationQueueSubscriptions", () => {
    assert.match(controllerSrc, /listActivationQueueSubscriptions\(\{[\s\S]*search:/);
    assert.match(controllerSrc, /String\(req\.query\.search\)\.trim\(\)/);
    assert.match(controllerSrc, /searchRaw \|\| null/);
  });

  it("keeps activation-queue on the existing route (no new endpoint)", () => {
    assert.match(routesSrc, /\/subscriptions\/activation-queue/);
    assert.match(routesSrc, /listActivationQueueValidators/);
  });
});

describe("activation queue search — SQL safety and fields", () => {
  it("builds search on top of ACTIVATION_QUEUE_WHERE_SQL (not a separate queue)", () => {
    assert.match(serviceSrc, /ACTIVATION_QUEUE_WHERE_SQL/);
    assert.match(
      serviceSrc,
      /whereSql = `\$\{ACTIVATION_QUEUE_WHERE_SQL\}[\s\S]*AND \([\s\S]*u\.first_name ILIKE/,
    );
  });

  it("searches first_name, father_name, family_name, email, and full name via CONCAT_WS", () => {
    assert.match(serviceSrc, /u\.first_name ILIKE \$\{p\} ESCAPE/);
    assert.match(serviceSrc, /u\.father_name ILIKE \$\{p\} ESCAPE/);
    assert.match(serviceSrc, /u\.family_name ILIKE \$\{p\} ESCAPE/);
    assert.match(serviceSrc, /u\.email ILIKE \$\{p\} ESCAPE/);
    assert.match(
      serviceSrc,
      /CONCAT_WS\(' ', u\.first_name, u\.father_name, u\.family_name\) ILIKE \$\{p\} ESCAPE/,
    );
  });

  it("uses parameterized ILIKE with ESCAPE (no string-concatenated user search)", () => {
    assert.match(serviceSrc, /values\.push\(pattern\)/);
    assert.match(serviceSrc, /ILIKE \$\{p\} ESCAPE '\\\\'/);
    assert.doesNotMatch(
      serviceSrc,
      /ILIKE '%\$\{search/,
    );
    assert.doesNotMatch(serviceSrc, /ILIKE "%\$\{/);
  });

  it("applies the same whereSql to COUNT and SELECT", () => {
    assert.match(serviceSrc, /SELECT COUNT\(\*\)::int AS total \$\{fromJoin\} WHERE \$\{whereSql\}/);
    assert.match(serviceSrc, /WHERE \$\{whereSql\}[\s\S]*ORDER BY \$\{ACTIVATION_QUEUE_ORDER_SQL\}/);
  });

  it("preserves queue business predicates", () => {
    assert.match(serviceSrc, /fs\.is_current = TRUE/);
    assert.match(serviceSrc, /fs\.activation_status = 'company_pending'/);
    assert.match(serviceSrc, /fs\.payment_status IN \('paid', 'pending', 'not_required'\)/);
    assert.match(serviceSrc, /fs\.status NOT IN \('expired', 'cancelled'\)/);
  });

  it("treats empty/whitespace search as absent (searchTerm gate)", () => {
    assert.match(serviceSrc, /const searchTerm = search != null \? String\(search\)\.trim\(\) : ""/);
    assert.match(serviceSrc, /if \(searchTerm\)/);
  });

  it("keeps LIMIT/OFFSET parameterized after search values", () => {
    assert.match(serviceSrc, /LIMIT \$\$\{limitParam\} OFFSET \$\$\{offsetParam\}/);
    assert.match(serviceSrc, /\[\.\.\.values, lim, offset\]/);
  });
});

describe("escapeIlikePattern", () => {
  it("escapes %, _, and backslash so wildcards stay literal", () => {
    assert.equal(escapeIlikePattern("100%_off"), "100\\%\\_off");
    assert.equal(escapeIlikePattern("a\\b"), "a\\\\b");
    assert.equal(escapeIlikePattern("mohammad"), "mohammad");
    assert.equal(escapeIlikePattern("محمد"), "محمد");
  });

  it("supports case-insensitive Latin patterns via surrounding ILIKE usage", () => {
    // Documented contract: pattern is wrapped as %escaped% and matched with ILIKE.
    const pattern = `%${escapeIlikePattern("Gmail.COM")}%`;
    assert.equal(pattern, "%Gmail.COM%");
    assert.match(serviceSrc, /ILIKE \$\{p\} ESCAPE/);
  });
});
