/**

 * Admin visible training orders list — read-only paginated endpoint.

 * Run: npm run test:visible-orders

 */

process.env.DATABASE_URL =

  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/admin_visible_orders_test_placeholder";



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



function makeVisibleOrderRow(id, applicantsCount = 0, visibleUntilOffsetMs = 3600_000) {

  return {

    id,

    title: `Order ${id}`,

    order_code: `TRN-${id}`,

    fake_status: "active",

    category_name: "Design",

    round_id: 319,

    visible_until: new Date(Date.now() + visibleUntilOffsetMs).toISOString(),

    round_status: "active",

    applicants_count: applicantsCount,

  };

}



function sortVisibleOrderRows(rows) {

  return [...rows].sort((a, b) => {

    const byApplicants = (Number(b.applicants_count) || 0) - (Number(a.applicants_count) || 0);

    if (byApplicants !== 0) return byApplicants;

    const byVisible = new Date(a.visible_until).getTime() - new Date(b.visible_until).getTime();

    if (byVisible !== 0) return byVisible;

    return Number(b.id) - Number(a.id);

  });

}



function buildSequentialCatalog(total) {

  const rows = [];

  for (let n = 1; n <= total; n += 1) {

    rows.push(makeVisibleOrderRow(1000 + n));

  }

  return sortVisibleOrderRows(rows);

}



function createVisibleOrdersMockPool({ total = 69, adminRole = "admin", catalog = null } = {}) {

  const state = { total, lastLimit: null, lastOffset: null };

  const allRows = catalog ? sortVisibleOrderRows(catalog) : buildSequentialCatalog(total);

  const client = {

    async query(sql, params = []) {

      const s = String(sql);

      if (s.includes("SELECT role, is_active FROM users")) {

        return { rows: adminRole ? [{ role: adminRole, is_active: true }] : [] };

      }

      if (s.includes("COUNT(DISTINCT fo.id)::int AS c") && s.includes("fake_order_round_items")) {

        return { rows: [{ c: catalog ? catalog.length : state.total }] };

      }

      if (s.includes("ORDER BY applicants_count DESC") && s.includes("LIMIT $1 OFFSET $2")) {

        state.lastLimit = params[0];

        state.lastOffset = params[1];

        const start = Number(params[1]) || 0;

        const lim = Number(params[0]) || 10;

        return { rows: allRows.slice(start, start + lim) };

      }

      throw new Error(`unexpected sql in visible orders mock: ${s.slice(0, 140)}`);

    },

    release() {},

  };

  const pool = {

    state,

    connect: async () => client,

    query: client.query.bind(client),

  };

  return pool;

}



describe("admin visible orders routes", () => {

  it("registers GET /training-orders/visible-orders behind training guard", () => {

    assert.match(routesSrc, /router\.get\("\/training-orders\/visible-orders"/);

    assert.match(routesSrc, /listVisibleOrders/);

    assert.match(routesSrc, /trainingOrdersGuard/);

  });

});



describe("listCurrentlyVisibleFakeOrders — service contract", () => {

  it("uses training pool visibility predicates (anyAudience)", () => {

    assert.match(serviceSrc, /async function listCurrentlyVisibleFakeOrders/);

    assert.match(serviceSrc, /trainingPoolVisibleWhereSql\(\{ anyAudience: true \}\)/);

    assert.match(serviceSrc, /applicants_count/);

    assert.match(serviceSrc, /applicantsCount: Number\(row\.applicants_count/);

    assert.doesNotMatch(

      serviceSrc.slice(serviceSrc.indexOf("async function listCurrentlyVisibleFakeOrders"), serviceSrc.indexOf("async function getTrainingOrdersReadiness")),

      /DELETE FROM|UPDATE fake_order|INSERT INTO/,

    );

  });



  it("orders visible rows by applicants count before pagination", () => {

    const fnStart = serviceSrc.indexOf("async function queryCurrentlyVisibleFakeOrdersPaginated");

    const fnEnd = serviceSrc.indexOf("async function listCurrentlyVisibleFakeOrders", fnStart);

    const fnBody = serviceSrc.slice(fnStart, fnEnd);

    assert.match(fnBody, /ORDER BY applicants_count DESC, ri\.visible_until ASC, fo\.id DESC/);

    assert.match(fnBody, /LIMIT \$1 OFFSET \$2/);

  });

});



describe("listCurrentlyVisibleFakeOrders — mocked behavior", () => {

  beforeEach(() => {

    const dbPath = require.resolve("../src/config/db");

    const servicePath = require.resolve("../src/services/fakeOrdersService");

    delete require.cache[dbPath];

    delete require.cache[servicePath];

  });



  it("returns 10 rows on page 1 and total 69", async () => {

    const pool = createVisibleOrdersMockPool({ total: 69 });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    const out = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 1, limit: 10 });

    assert.equal(out.orders.length, 10);

    assert.equal(out.pagination.total, 69);

    assert.equal(out.pagination.totalPages, 7);

    assert.equal(out.pagination.page, 1);

    assert.equal(out.pagination.limit, 10);

    assert.equal(pool.state.lastLimit, 10);

    assert.equal(pool.state.lastOffset, 0);

    assert.equal(out.orders[0].visibleNow, true);

    assert.equal(out.orders[0].applicantsCount, 0);

  });



  it("sorts by applicants count descending (highest first, zero last)", async () => {

    const catalog = [

      makeVisibleOrderRow(101, 0),

      makeVisibleOrderRow(102, 2),

      makeVisibleOrderRow(103, 5),

    ];

    const pool = createVisibleOrdersMockPool({ catalog });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    const out = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 1, limit: 10 });

    assert.deepEqual(

      out.orders.map((row) => ({ id: row.id, applicantsCount: row.applicantsCount })),

      [

        { id: "103", applicantsCount: 5 },

        { id: "102", applicantsCount: 2 },

        { id: "101", applicantsCount: 0 },

      ],

    );

  });



  it("includes applicantsCount per visible order row", async () => {

    const catalog = [makeVisibleOrderRow(201, 2), makeVisibleOrderRow(202, 0)];

    const pool = createVisibleOrdersMockPool({ catalog });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    const out = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 1, limit: 10 });

    assert.equal(typeof out.orders[0].applicantsCount, "number");

    assert.equal(out.orders[0].applicantsCount, 2);

  });



  it("page 2 returns next rows with correct offset after applicant-count sort", async () => {

    const pool = createVisibleOrdersMockPool({ total: 69 });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    const page1 = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 1, limit: 10 });

    const out = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 2, limit: 10 });

    assert.equal(out.orders.length, 10);

    assert.equal(out.pagination.page, 2);

    assert.equal(pool.state.lastOffset, 10);

    assert.equal(out.orders[0].id, page1.orders[10]?.id || buildSequentialCatalog(69)[10].id.toString());

    assert.equal(out.orders[0].id, "1059");

  });



  it("pagination page 1 contains highest applicant-count orders", async () => {

    const catalog = [];

    for (let i = 1; i <= 12; i += 1) {

      catalog.push(makeVisibleOrderRow(300 + i, i <= 2 ? 10 - i : 0));

    }

    const sorted = sortVisibleOrderRows(catalog);

    const pool = createVisibleOrdersMockPool({ catalog });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    const page1 = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 1, limit: 10 });

    const page2 = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 2, limit: 10 });

    assert.deepEqual(page1.orders.map((row) => row.id), sorted.slice(0, 10).map((row) => String(row.id)));

    assert.deepEqual(page2.orders.map((row) => row.id), sorted.slice(10, 12).map((row) => String(row.id)));

    assert.equal(page1.orders[0].applicantsCount, 9);

    assert.equal(page1.orders[1].applicantsCount, 8);

  });



  it("last page returns remaining rows only", async () => {

    const pool = createVisibleOrdersMockPool({ total: 69 });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    const out = await svc.listCurrentlyVisibleFakeOrders({ actorUserId: 1, page: 7, limit: 10 });

    assert.equal(out.orders.length, 9);

    assert.equal(out.pagination.totalPages, 7);

  });



  it("rejects unauthorized actors", async () => {

    const pool = createVisibleOrdersMockPool({ adminRole: null });

    const svc = loadFakeOrdersServiceWithMockPool(pool);

    await assert.rejects(

      () => svc.listCurrentlyVisibleFakeOrders({ actorUserId: 99, page: 1 }),

      (err) => err.statusCode === 403,

    );

  });

});

