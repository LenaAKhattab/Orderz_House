/**
 * Admin fake_orders CRUD — route policy, service contract, and guarded delete/update behavior.
 * Run: npm run test:fake-orders-crud
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/admin_fake_orders_crud_test_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "adminFakeOrdersRoutes.js"),
  "utf8",
);
const serviceSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "fakeOrdersService.js"),
  "utf8",
);

function sliceFn(src, startName, endName) {
  const start = src.indexOf(startName);
  const end = endName ? src.indexOf(endName, start + 1) : src.length;
  assert.ok(start >= 0, `missing ${startName}`);
  return src.slice(start, end > start ? end : src.length);
}

function loadFakeOrdersServiceWithMockPool(mockPool) {
  const dbPath = require.resolve("../src/config/db");
  const servicePath = require.resolve("../src/services/fakeOrdersService");
  delete require.cache[dbPath];
  delete require.cache[servicePath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: mockPool, connectDB: async () => {} },
  };
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("../src/services/fakeOrdersService");
}

function createCrudMockPool({
  visible = false,
  adminRole = "admin",
  orderExists = true,
  currentOrder = {},
  hasVisibleRoundItem = false,
  roundItemExpired = false,
} = {}) {
  const state = {
    visible,
    deleted: false,
    updated: false,
    hidden: false,
    published: true,
    openForPool: true,
    hasVisibleRoundItem,
    roundItemExpired,
    lastInsertParams: null,
    lastUpdateSql: null,
    lastUpdateParams: null,
    currentOrder: {
      project_type: "bidding",
      budget: null,
      bid_budget_min: 80,
      bid_budget_max: 120,
      duration_value: 7,
      duration_unit: "days",
      ...currentOrder,
    },
  };
  const client = {
    async query(sql, params = []) {
      const s = String(sql);
      if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (s.includes("SELECT role, is_active FROM users")) {
        return { rows: adminRole ? [{ role: adminRole, is_active: true }] : [] };
      }
      if (s.includes("SELECT EXISTS") && s.includes("fake_order_round_items")) {
        return { rows: [{ visible: state.visible }] };
      }
      if (s.includes("SELECT id FROM fake_orders WHERE id = $1 FOR UPDATE")) {
        if (!orderExists) return { rows: [] };
        return { rows: [{ id: params[0] }] };
      }
      if (s.includes("FROM fake_order_round_items ri") && s.includes("FOR UPDATE OF ri")) {
        if (state.hasVisibleRoundItem && !state.roundItemExpired) {
          return { rows: [{ id: 501 }] };
        }
        return { rows: [] };
      }
      if (s.includes("FROM fake_order_round_items ri") && s.includes("ri.status = 'expired'")) {
        if (state.roundItemExpired) return { rows: [{ "?column?": 1 }] };
        return { rows: [] };
      }
      if (s.includes("UPDATE fake_order_round_items") && s.includes("status = 'expired'")) {
        if (!state.hasVisibleRoundItem || state.roundItemExpired) return { rows: [], rowCount: 0 };
        state.hidden = true;
        state.roundItemExpired = true;
        state.visible = false;
        state.hasVisibleRoundItem = false;
        return { rows: [], rowCount: 1 };
      }
      if (s.includes("FROM fake_orders WHERE id = $1 FOR UPDATE")) {
        if (!orderExists) return { rows: [] };
        return {
          rows: [
            {
              id: params[0],
              title: "Test order",
              description: "Test description long enough",
              ...state.currentOrder,
            },
          ],
        };
      }
      if (s.includes("UPDATE fake_orders") && s.includes("fake_status = 'expired'")) {
        state.updated = true;
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith("UPDATE fake_orders SET")) {
        state.updated = true;
        state.lastUpdateSql = s;
        state.lastUpdateParams = params;
        if (s.includes("is_published")) {
          state.published = params.includes(false) ? false : state.published;
        }
        return { rows: [], rowCount: 1 };
      }
      if (s.startsWith("DELETE FROM fake_orders")) {
        if (state.visible) return { rows: [], rowCount: 0 };
        state.deleted = true;
        return { rows: [], rowCount: 1 };
      }
      if (s.includes("SELECT 1 FROM categories")) return { rowCount: 1, rows: [{ "?column?": 1 }] };
      if (s.includes("show_fake_badge_to_freelancers")) return { rows: [{ show_fake_badge_to_freelancers: false }] };
      if (s.includes("INSERT INTO fake_orders")) {
        state.lastInsertParams = params;
        return { rows: [{ id: 9001 }] };
      }
      if (s.includes("FROM fake_orders fo") && s.includes("WHERE fo.id = $1")) {
        const pt = state.currentOrder.project_type || "fixed";
        return {
          rows: [
            {
              id: params[0],
              order_code: "ORD-TEST",
              title: "Test",
              description: "Desc",
              category_id: 1,
              category_name: "Design",
              is_published: state.published,
              is_open_for_pool: state.openForPool,
              is_archived: false,
              project_type: pt,
              budget: pt === "fixed" ? 100 : null,
              bid_budget_min: pt === "bidding" ? 80 : null,
              bid_budget_max: pt === "bidding" ? 120 : null,
              duration_value: 7,
              duration_unit: "days",
              order_status: "published",
              fake_status: "active",
              template_id: null,
              source_type: "admin_created",
              visible_now: state.visible,
              applicants_count: 0,
            },
          ],
        };
      }
      if (s.includes("SELECT 1 FROM orders WHERE order_code") || s.includes("SELECT 1 FROM fake_orders WHERE order_code")) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error(`unexpected sql in mock: ${s.slice(0, 120)}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
    query: client.query.bind(client),
    state,
  };
  return pool;
}

/** INSERT param indices after project_type at $7 (0-based index 6). */
function parseInsertBudgetFields(params) {
  return {
    projectType: params[6],
    budget: params[7],
    currencyCode: params[8],
    bidBudgetMin: params[16],
    bidBudgetMax: params[17],
  };
}

describe("admin fake orders routes policy", () => {
  it("registers fake-orders CRUD under trainingOrdersGuard", () => {
    assert.match(routesSrc, /trainingOrdersGuard/);
    assert.match(routesSrc, /PERMISSION_KEYS\.TRAINING_ORDERS/);
    assert.match(routesSrc, /router\.get\("\/training-orders\/fake-orders"/);
    // Multiline router.post( path, ... ) — match path token, not single-line form.
    assert.match(routesSrc, /router\.post\(\s*\n\s*"\/training-orders\/fake-orders"/);
    assert.match(routesSrc, /router\.patch\(\s*\n\s*"\/training-orders\/fake-orders\/:id"/);
    assert.match(routesSrc, /hide-current-round/);
    assert.match(routesSrc, /hideFakeOrderFromCurrentRound/);
    assert.match(routesSrc, /router\.delete\(\s*\n\s*"\/training-orders\/fake-orders\/:id"/);
  });

  it("keeps legacy template routes separate from fake-orders create", () => {
    assert.match(routesSrc, /router\.post\(\s*\n\s*"\/training-orders\/templates"/);
    assert.match(routesSrc, /createFakeOrder/);
    assert.match(routesSrc, /createTemplate/);
    assert.match(routesSrc, /fake-orders/);
    assert.match(routesSrc, /X-Internal-Template-Mutation|ALLOW_ADMIN_TEMPLATE_HTTP_MUTATION/);
  });

  it("admin pool page submits to fake-orders API, not templates", () => {
    const pageSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "pages", "dashboard", "trainingOrders", "TrainingOrderTemplatesPage.jsx"),
      "utf8",
    );
    const apiSrc = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "services", "api.js"),
      "utf8",
    );
    assert.match(pageSrc, /adminCreateTrainingFakeOrderRequest/);
    assert.match(pageSrc, /mode="fake-order"/);
    assert.doesNotMatch(pageSrc, /adminCreateTrainingTemplateRequest/);
    assert.match(apiSrc, /adminCreateTrainingFakeOrderRequest[\s\S]*\/admin\/training-orders\/fake-orders/);
    assert.match(apiSrc, /adminCreateTrainingTemplateRequest[\s\S]*Template creation from the admin UI is disabled/);
  });

  it("blocks admin HTTP template mutations unless internal header is set", () => {
    const controllerSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "controllers", "adminFakeOrdersController.js"),
      "utf8",
    );
    assert.match(controllerSrc, /rejectAdminTemplateHttpMutationUnlessInternal/);
    assert.match(controllerSrc, /template_http_mutation_disabled/);
    assert.match(controllerSrc, /status\(410\)/);
    assert.match(controllerSrc, /Legacy templates are disabled/);
    assert.match(controllerSrc, /if \(rejectAdminTemplateHttpMutationUnlessInternal\(req, res\)\) return/);
  });

  it("createTemplate service is blocked unless legacy flag is set", () => {
    assert.match(serviceSrc, /assertLegacyTemplateServiceMutationAllowed/);
    assert.match(serviceSrc, /template_service_mutation_disabled/);
    assert.match(serviceSrc, /statusCode = 410/);
  });

  it("generateFakeOrders blocks template insert mode", () => {
    const genSrc = fs.readFileSync(
      path.join(__dirname, "..", "scripts", "generateFakeOrders.js"),
      "utf8",
    );
    assert.match(genSrc, /Template generation is disabled/);
    assert.match(genSrc, /if \(args\.insert\)/);
  });
});

describe("admin fake orders CRUD — service contract", () => {
  const createFn = sliceFn(serviceSrc, "async function createFakeOrder", "async function updateFakeOrder");
  const updateFn = sliceFn(serviceSrc, "async function updateFakeOrder", "async function hideFakeOrderFromCurrentRound");
  const hideFn = sliceFn(serviceSrc, "async function hideFakeOrderFromCurrentRound", "async function deleteFakeOrder");
  const deleteFn = sliceFn(serviceSrc, "async function deleteFakeOrder", "function buildFakeOrderRowFromTemplateForPoolConversion");

  it("createFakeOrder inserts into fake_orders only with template_id NULL", () => {
    assert.match(createFn, /INSERT INTO fake_orders/);
    assert.doesNotMatch(createFn, /INSERT INTO fake_order_templates/);
    assert.match(createFn, /template_id,\s*\n\s*fake_status/);
    assert.match(createFn, /NULL,\s*\n\s*'active', TRUE, NULL/);
  });

  it("createFakeOrder uses resolveFakeOrderDbBudgetColumns for constraint-safe INSERT", () => {
    assert.match(createFn, /resolveFakeOrderDbBudgetColumns/);
    assert.match(createFn, /dbBudget\.bidBudgetMin/);
    assert.match(createFn, /dbBudget\.bidBudgetMax/);
    assert.match(createFn, /dbBudget\.currencyCode/);
  });

  it("updateFakeOrder clears incompatible budget fields per project type", () => {
    assert.match(updateFn, /resolveFakeOrderDbBudgetColumns/);
    assert.match(updateFn, /bid_budget_min =/);
    assert.match(updateFn, /currency_code =/);
  });

  it("maps PG budget constraint violations to 400", () => {
    assert.match(serviceSrc, /rethrowFakeOrderBudgetConstraintError/);
    assert.match(serviceSrc, /orders_currency_by_project_type/);
    assert.match(serviceSrc, /statusCode = 400/);
  });

  it("updateFakeOrder blocks protected fields while order is visible", () => {
    assert.match(updateFn, /isFakeOrderCurrentlyVisible/);
    assert.match(updateFn, /statusCode = 409/);
    assert.match(updateFn, /categoryId/);
    assert.match(updateFn, /isActive/);
  });

  it("updateFakeOrder maps isActive to pool eligibility flags", () => {
    assert.match(updateFn, /is_published =/);
    assert.match(updateFn, /is_open_for_pool =/);
  });

  it("deleteFakeOrder hard-deletes when not visible", () => {
    assert.match(deleteFn, /DELETE FROM fake_orders WHERE id = \$1/);
    assert.doesNotMatch(deleteFn, /DELETE FROM fake_order_templates/);
  });

  it("deleteFakeOrder rejects visible marketplace orders with 409", () => {
    assert.match(deleteFn, /if \(visible\)/);
    assert.match(deleteFn, /statusCode = 409/);
  });

  it("hideFakeOrderFromCurrentRound expires active round item without deleting fake_orders", () => {
    assert.match(hideFn, /UPDATE fake_order_round_items/);
    assert.match(hideFn, /status = 'expired'/);
    assert.doesNotMatch(hideFn, /DELETE FROM fake_orders/);
    assert.doesNotMatch(hideFn, /visible_until = LEAST/);
    assert.match(hideFn, /invalidatePublicHomeOrderStatsCache/);
  });

  it("hideFakeOrderFromCurrentRound returns 404 when order missing", () => {
    assert.match(hideFn, /statusCode = 404/);
  });

  it("hideFakeOrderFromCurrentRound returns 409 when not currently visible", () => {
    assert.match(hideFn, /statusCode = 409/);
    assert.match(hideFn, /غير ظاهر حالياً/);
  });
});

describe("admin fake orders CRUD — mocked service behavior", () => {
  beforeEach(() => {
    const dbPath = require.resolve("../src/config/db");
    const servicePath = require.resolve("../src/services/fakeOrdersService");
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });

  it("createFakeOrder returns mapped row without touching templates", async () => {
    const pool = createCrudMockPool();
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.createFakeOrder({
      actorUserId: 1,
      payload: {
        title: "Pool order",
        description: "Training order description",
        categoryId: 1,
        projectType: "fixed",
        budget: 100,
        durationValue: 7,
        durationUnit: "days",
      },
    });
    assert.ok(out);
    assert.equal(String(out.id), "9001");
    assert.equal(out.templateId, null);
  });

  it("createFakeOrder with projectType=fixed sets budget and clears bid fields", async () => {
    const pool = createCrudMockPool();
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await svc.createFakeOrder({
      actorUserId: 1,
      payload: {
        title: "Fixed pool order",
        description: "Fixed training order description",
        categoryId: 1,
        projectType: "fixed",
        budget: 150,
        durationValue: 5,
        durationUnit: "days",
      },
    });
    const cols = parseInsertBudgetFields(pool.state.lastInsertParams);
    assert.equal(cols.projectType, "fixed");
    assert.ok(cols.budget > 0);
    assert.equal(cols.currencyCode, "JOD");
    assert.equal(cols.bidBudgetMin, null);
    assert.equal(cols.bidBudgetMax, null);
    assert.equal(pool.state.lastInsertParams[13], "admin_created");
  });

  it("createFakeOrder with projectType=bidding sets bid range and clears budget", async () => {
    const pool = createCrudMockPool();
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await svc.createFakeOrder({
      actorUserId: 1,
      payload: {
        title: "Bidding pool order",
        description: "Bidding training order description",
        categoryId: 1,
        projectType: "bidding",
        bidBudgetMin: 50,
        bidBudgetMax: 100,
        durationMin: 3,
        durationMax: 7,
        durationUnit: "days",
      },
    });
    const cols = parseInsertBudgetFields(pool.state.lastInsertParams);
    assert.equal(cols.projectType, "bidding");
    assert.equal(cols.budget, null);
    assert.equal(cols.currencyCode, "JOD");
    assert.ok(cols.bidBudgetMin > 0);
    assert.ok(cols.bidBudgetMax >= cols.bidBudgetMin);
    assert.equal(pool.state.lastInsertParams[13], "admin_created");
  });

  it("updateFakeOrder PATCH bidding to fixed clears bid fields and sets budget", async () => {
    const pool = createCrudMockPool({
      visible: false,
      currentOrder: { project_type: "bidding", budget: null, bid_budget_min: 50, bid_budget_max: 100 },
    });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await svc.updateFakeOrder({
      actorUserId: 1,
      id: 42,
      payload: {
        projectType: "fixed",
        budget: 200,
      },
    });
    assert.match(pool.state.lastUpdateSql, /bid_budget_min =/);
    assert.match(pool.state.lastUpdateSql, /budget =/);
    assert.match(pool.state.lastUpdateSql, /currency_code =/);
    assert.ok(pool.state.lastUpdateParams.includes(null));
    assert.ok(pool.state.lastUpdateParams.includes("fixed"));
    assert.ok(pool.state.lastUpdateParams.some((v) => typeof v === "number" && v > 0));
  });

  it("updateFakeOrder PATCH fixed to bidding clears budget and sets bid fields", async () => {
    const pool = createCrudMockPool({
      visible: false,
      currentOrder: { project_type: "fixed", budget: 200, bid_budget_min: null, bid_budget_max: null },
    });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await svc.updateFakeOrder({
      actorUserId: 1,
      id: 42,
      payload: {
        projectType: "bidding",
        bidBudgetMin: 60,
        bidBudgetMax: 90,
      },
    });
    assert.match(pool.state.lastUpdateSql, /project_type =/);
    assert.match(pool.state.lastUpdateSql, /bid_budget_min =/);
    assert.equal(pool.state.lastUpdateParams.includes("bidding"), true);
    assert.equal(pool.state.lastUpdateParams.includes(null), true);
    const nums = pool.state.lastUpdateParams.filter((v) => typeof v === "number" && v > 0);
    assert.ok(nums.length >= 2, "expected normalized bid min/max in update params");
  });

  it("createFakeOrder maps PG budget constraint violation to 400", async () => {
    const pool = createCrudMockPool();
    const client = await pool.connect();
    const origInsert = client.query.bind(client);
    client.query = async (sql, params = []) => {
      if (String(sql).includes("INSERT INTO fake_orders")) {
        const err = new Error("check violation");
        err.code = "23514";
        err.constraint = "orders_currency_by_project_type_chk";
        throw err;
      }
      return origInsert(sql, params);
    };
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () =>
        svc.createFakeOrder({
          actorUserId: 1,
          payload: {
            title: "Bad order",
            description: "Constraint test order description",
            categoryId: 1,
            projectType: "fixed",
            budget: 100,
            durationValue: 7,
            durationUnit: "days",
          },
        }),
      (err) => err.statusCode === 400 && /Budget fields are not compatible/.test(err.message),
    );
  });

  it("deleteFakeOrder removes row when not visible", async () => {
    const pool = createCrudMockPool({ visible: false });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.deleteFakeOrder({ actorUserId: 1, id: 42 });
    assert.deepEqual(out, { ok: true });
    assert.equal(pool.state.deleted, true);
  });

  it("deleteFakeOrder returns 409 when order is visible", async () => {
    const pool = createCrudMockPool({ visible: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.deleteFakeOrder({ actorUserId: 1, id: 42 }),
      (err) => err.statusCode === 409,
    );
    assert.equal(pool.state.deleted, false);
  });

  it("updateFakeOrder returns 409 when editing protected fields on visible order", async () => {
    const pool = createCrudMockPool({ visible: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.updateFakeOrder({ actorUserId: 1, id: 42, payload: { isActive: false } }),
      (err) => err.statusCode === 409,
    );
  });

  it("updateFakeOrder allows title edit on visible order", async () => {
    const pool = createCrudMockPool({ visible: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.updateFakeOrder({ actorUserId: 1, id: 42, payload: { title: "Updated title" } });
    assert.equal(out.title, "Test");
    assert.equal(pool.state.updated, true);
  });

  it("updateFakeOrder toggles isActive when not visible", async () => {
    const pool = createCrudMockPool({ visible: false });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await svc.updateFakeOrder({ actorUserId: 1, id: 42, payload: { isActive: false } });
    assert.equal(pool.state.updated, true);
  });

  it("rejects non-admin actors", async () => {
    const pool = createCrudMockPool({ adminRole: null });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.deleteFakeOrder({ actorUserId: 99, id: 42 }),
      (err) => err.statusCode === 403,
    );
  });

  it("hideFakeOrderFromCurrentRound expires visible round item and keeps fake_order row", async () => {
    const pool = createCrudMockPool({ visible: true, hasVisibleRoundItem: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.hideFakeOrderFromCurrentRound({ actorUserId: 1, id: 42 });
    assert.deepEqual(out, { ok: true, fakeOrderId: "42" });
    assert.equal(pool.state.hidden, true);
    assert.equal(pool.state.deleted, false);
    assert.equal(pool.state.visible, false);
  });

  it("hideFakeOrderFromCurrentRound returns 404 when order missing", async () => {
    const pool = createCrudMockPool({ orderExists: false });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.hideFakeOrderFromCurrentRound({ actorUserId: 1, id: 42 }),
      (err) => err.statusCode === 404,
    );
  });

  it("hideFakeOrderFromCurrentRound returns 409 when not visible", async () => {
    const pool = createCrudMockPool({ visible: false, hasVisibleRoundItem: false });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.hideFakeOrderFromCurrentRound({ actorUserId: 1, id: 42 }),
      (err) => err.statusCode === 409,
    );
  });

  it("hideFakeOrderFromCurrentRound returns 409 when round item already hidden", async () => {
    const pool = createCrudMockPool({ visible: false, roundItemExpired: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.hideFakeOrderFromCurrentRound({ actorUserId: 1, id: 42 }),
      (err) => err.statusCode === 409 && /مسبقاً/.test(err.message),
    );
  });

  it("delete visible still returns 409 after hide contract unchanged", async () => {
    const pool = createCrudMockPool({ visible: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.deleteFakeOrder({ actorUserId: 1, id: 42 }),
      (err) => err.statusCode === 409,
    );
  });

  it("delete hidden non-visible order succeeds", async () => {
    const pool = createCrudMockPool({ visible: false, hasVisibleRoundItem: false, roundItemExpired: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.deleteFakeOrder({ actorUserId: 1, id: 42 });
    assert.deepEqual(out, { ok: true });
    assert.equal(pool.state.deleted, true);
  });

  it("hide rejects non-admin actors", async () => {
    const pool = createCrudMockPool({ adminRole: null, hasVisibleRoundItem: true });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.hideFakeOrderFromCurrentRound({ actorUserId: 99, id: 42 }),
      (err) => err.statusCode === 403,
    );
  });
});
