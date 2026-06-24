/**
 * Admin training order applicants — read-only by fake_order_id.
 * Run: npm run test:fake-orders-applicants (or full npm test)
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/admin_fake_order_applicants_test_placeholder";

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const routesSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "routes", "adminFakeOrdersRoutes.js"),
  "utf8",
);
const controllerSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "controllers", "adminFakeOrdersController.js"),
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

function makeApplicantRow(id, createdAtOffsetMs = 0) {
  const createdAt = new Date(Date.now() - createdAtOffsetMs).toISOString();
  return {
    id,
    fake_order_id: 42,
    round_id: 319,
    freelancer_user_id: 7 + id,
    amount: 100,
    proposal_message: "Hello",
    status: "pending",
    created_at: createdAt,
    fake_order_title: "Test order",
    category_name: "Design",
    round_title: "Round 319",
    first_name: "Ali",
    father_name: null,
    family_name: `User${id}`,
    account_id: 9000 + id,
    plan_title: "Pro",
  };
}

function sortApplicantRows(rows) {
  return [...rows].sort((a, b) => {
    const byCreated = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (byCreated !== 0) return byCreated;
    return Number(b.id) - Number(a.id);
  });
}

function createApplicantsMockPool({ adminRole = "admin", rows = [], title = "Test order" } = {}) {
  const sortedRows = sortApplicantRows(rows);
  const state = { lastLimit: null, lastOffset: null };
  const client = {
    async query(sql, params = []) {
      const s = String(sql);
      if (s.includes("SELECT role, is_active FROM users")) {
        return { rows: adminRole ? [{ role: adminRole, is_active: true }] : [] };
      }
      if (s.includes("SELECT COUNT(*)::int AS c") && s.includes("fake_order_applications fa")) {
        assert.equal(params[0], 42);
        return { rows: [{ c: sortedRows.length }] };
      }
      if (s.includes("SELECT title FROM fake_orders WHERE id = $1")) {
        return { rows: [{ title }] };
      }
      if (
        s.includes("FROM fake_order_applications fa")
        && s.includes("WHERE fa.fake_order_id = $1")
        && s.includes("ORDER BY fa.created_at DESC, fa.id DESC")
        && s.includes("LIMIT $2 OFFSET $3")
      ) {
        assert.equal(params[0], 42);
        state.lastLimit = params[1];
        state.lastOffset = params[2];
        const start = Number(params[2]) || 0;
        const lim = Number(params[1]) || 100;
        return { rows: sortedRows.slice(start, start + lim) };
      }
      throw new Error(`unexpected sql in applicants mock: ${s.slice(0, 160)}`);
    },
    release() {},
  };
  return {
    state,
    connect: async () => client,
    query: client.query.bind(client),
  };
}

describe("admin fake order applicants routes", () => {
  it("registers GET /training-orders/fake-orders/:fakeOrderId/applications behind training guard", () => {
    assert.match(routesSrc, /router\.get\("\/training-orders\/fake-orders\/:fakeOrderId\/applications"/);
    assert.match(routesSrc, /listApplicationsByFakeOrder/);
    assert.match(routesSrc, /trainingOrdersGuard/);
  });

  it("controller returns read-only applicants payload with pagination", () => {
    assert.match(controllerSrc, /applicantsTotal: out\.applicantsTotal/);
    assert.match(controllerSrc, /pagination: out\.pagination/);
    assert.match(controllerSrc, /page: req\.query\.page/);
    assert.match(controllerSrc, /limit: req\.query\.limit/);
    assert.doesNotMatch(
      controllerSrc.slice(
        controllerSrc.indexOf("const listApplicationsByFakeOrder"),
        controllerSrc.indexOf("const startTrainingRound"),
      ),
      /UPDATE fake_order|DELETE FROM|INSERT INTO/,
    );
  });

  it("orders applicants newest first before pagination in SQL", () => {
    const fnStart = serviceSrc.indexOf("async function listApplicationsForFakeOrder");
    const fnEnd = serviceSrc.indexOf("/** @type {ReturnType<typeof setInterval>", fnStart);
    const fnBody = serviceSrc.slice(fnStart, fnEnd);
    assert.match(fnBody, /ORDER BY fa\.created_at DESC, fa\.id DESC/);
    assert.match(fnBody, /LIMIT \$2 OFFSET \$3/);
  });
});

describe("listApplicationsForFakeOrder — mocked behavior", () => {
  beforeEach(() => {
    const dbPath = require.resolve("../src/config/db");
    const servicePath = require.resolve("../src/services/fakeOrdersService");
    delete require.cache[dbPath];
    delete require.cache[servicePath];
  });

  it("returns applicant rows for fake_order_id", async () => {
    const pool = createApplicantsMockPool({ rows: [makeApplicantRow(1)] });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.listApplicationsForFakeOrder({ actorUserId: 1, fakeOrderId: 42 });
    assert.equal(out.applicants.length, 1);
    assert.equal(out.applicants[0].fakeOrderId, "42");
    assert.equal(out.applicants[0].freelancerName, "Ali User1");
    assert.equal(out.applicants[0].amount, 100);
    assert.equal(out.applicantsTotal, 1);
  });

  it("returns empty list when no applicants with applicantsTotal = 0", async () => {
    const pool = createApplicantsMockPool({ rows: [] });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const out = await svc.listApplicationsForFakeOrder({ actorUserId: 1, fakeOrderId: 42 });
    assert.deepEqual(out.applicants, []);
    assert.equal(out.applicantsTotal, 0);
    assert.equal(out.pagination.total, 0);
  });

  it("paginates with page=1&limit=5 and returns newest first", async () => {
    const rows = [
      makeApplicantRow(1, 5000),
      makeApplicantRow(2, 4000),
      makeApplicantRow(3, 3000),
      makeApplicantRow(4, 2000),
      makeApplicantRow(5, 1000),
      makeApplicantRow(6, 0),
    ];
    const pool = createApplicantsMockPool({ rows });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    const page1 = await svc.listApplicationsForFakeOrder({
      actorUserId: 1,
      fakeOrderId: 42,
      page: 1,
      limit: 5,
    });
    assert.equal(page1.applicantsTotal, 6);
    assert.equal(page1.applicants.length, 5);
    assert.equal(page1.pagination.page, 1);
    assert.equal(page1.pagination.limit, 5);
    assert.equal(page1.pagination.totalPages, 2);
    assert.deepEqual(
      page1.applicants.map((row) => row.id),
      ["6", "5", "4", "3", "2"],
    );

    const page2 = await svc.listApplicationsForFakeOrder({
      actorUserId: 1,
      fakeOrderId: 42,
      page: 2,
      limit: 5,
    });
    assert.equal(page2.applicants.length, 1);
    assert.equal(page2.applicants[0].id, "1");
    assert.equal(pool.state.lastOffset, 5);
  });

  it("rejects unauthorized actors", async () => {
    const pool = createApplicantsMockPool({ adminRole: null });
    const svc = loadFakeOrdersServiceWithMockPool(pool);
    await assert.rejects(
      () => svc.listApplicationsForFakeOrder({ actorUserId: 99, fakeOrderId: 42 }),
      (err) => err.statusCode === 403,
    );
  });
});
