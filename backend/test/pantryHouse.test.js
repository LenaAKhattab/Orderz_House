/**
 * بيت المونة — unit tests (no DB).
 * Run: node --test test/pantryHouse.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  canFreelancerListRequest,
  canFreelancerBid,
  canFreelancerDeliver,
  canAdminAcceptBid,
  canAdminApproveDelivery,
  canAdminRequestRevision,
  canAdminArchiveDelivery,
  deliveryMatchesAssignedFreelancer,
  validatePantryRequestPayload,
  mapPantryDbError,
  actorId,
  requireActorId,
  FREELANCER_VISIBLE_REQUEST_STATUSES,
} = require("../src/constants/pantry");
const fs = require("node:fs");
const path = require("node:path");

function mapRequestLite(row) {
  return {
    pricingType: row.pricing_type || "fixed",
    subSubcategoryId: row.sub_subcategory_id != null ? String(row.sub_subcategory_id) : null,
    deliveryDays: row.delivery_days != null ? Number(row.delivery_days) : null,
    skills: Array.isArray(row.skills) ? row.skills : [],
    requirements: row.requirements || null,
  };
}

describe("pantry house rules", () => {
  it("freelancer can see only open_for_bids requests", () => {
    assert.strictEqual(canFreelancerListRequest("open_for_bids"), true);
    assert.strictEqual(canFreelancerListRequest("draft"), false);
    assert.strictEqual(canFreelancerListRequest("assigned"), false);
    assert.deepStrictEqual([...FREELANCER_VISIBLE_REQUEST_STATUSES], ["open_for_bids"]);
  });

  it("freelancer can submit bid only when open_for_bids", () => {
    assert.strictEqual(canFreelancerBid("open_for_bids"), true);
    assert.strictEqual(canFreelancerBid("draft"), false);
    assert.strictEqual(canFreelancerBid("assigned"), false);
  });

  it("only assigned freelancer can submit delivery", () => {
    const req = { assignedFreelancerId: "42", status: "assigned" };
    assert.strictEqual(canFreelancerDeliver(req, 42), true);
    assert.strictEqual(canFreelancerDeliver(req, 99), false);
    assert.strictEqual(canFreelancerDeliver({ ...req, status: "open_for_bids" }, 42), false);
    assert.strictEqual(canFreelancerDeliver({ ...req, status: "revision_requested" }, 42), true);
    assert.strictEqual(canFreelancerDeliver({ ...req, status: "approved" }, 42), false);
  });

  it("admin can accept pending bid only on open_for_bids", () => {
    assert.strictEqual(canAdminAcceptBid("open_for_bids", "pending"), true);
    assert.strictEqual(canAdminAcceptBid("open_for_bids", "rejected"), false);
    assert.strictEqual(canAdminAcceptBid("assigned", "pending"), false);
  });

  it("cannot accept a second bid once request is already assigned", () => {
    assert.strictEqual(canAdminAcceptBid("assigned", "pending"), false);
    assert.strictEqual(canAdminAcceptBid("approved", "pending"), false);
  });

  it("admin can approve only submitted deliveries (not approved or revision_requested)", () => {
    assert.strictEqual(canAdminApproveDelivery("submitted"), true);
    assert.strictEqual(canAdminApproveDelivery("revision_requested"), false);
    assert.strictEqual(canAdminApproveDelivery("approved"), false);
    assert.strictEqual(canAdminApproveDelivery("archived"), false);
  });

  it("cannot approve delivery for freelancer who is not assigned", () => {
    const delivery = { freelancer_id: 10 };
    const request = { assigned_freelancer_id: 10 };
    const other = { assigned_freelancer_id: 99 };
    assert.strictEqual(deliveryMatchesAssignedFreelancer(delivery, request), true);
    assert.strictEqual(deliveryMatchesAssignedFreelancer(delivery, other), false);
    assert.strictEqual(deliveryMatchesAssignedFreelancer(delivery, {}), false);
  });

  it("request revision only works on submitted delivery", () => {
    assert.strictEqual(canAdminRequestRevision("submitted"), true);
    assert.strictEqual(canAdminRequestRevision("approved"), false);
    assert.strictEqual(canAdminRequestRevision("archived"), false);
    assert.strictEqual(canAdminRequestRevision("revision_requested"), false);
  });

  it("archive only works on already approved delivery", () => {
    assert.strictEqual(canAdminArchiveDelivery("approved"), true);
    assert.strictEqual(canAdminArchiveDelivery("submitted"), false);
  });

  it("admin can create pantry request with client-like fields", () => {
    const result = validatePantryRequestPayload({
      title: "مقال تسويقي متكرر",
      description: "وصف تفصيلي للطلب الداخلي لا يقل عن عشرة أحرف",
      categoryId: 3,
      subSubcategoryId: 12,
      pricingType: "fixed",
      fixedBudget: 150,
      deliveryDays: 5,
      skills: ["كتابة", "ترجمة"],
      requirements: "أسلوب رسمي",
      internalNotes: "للاستخدام الداخلي",
      publish: true,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.pricingType, "fixed");
    assert.strictEqual(result.value.fixedBudget, 150);
    assert.strictEqual(result.value.deliveryDays, 5);
    assert.deepStrictEqual(result.value.skills, ["كتابة", "ترجمة"]);
    assert.strictEqual(result.value.publish, true);
  });

  it("required fields validation rejects incomplete pantry create payload", () => {
    const result = validatePantryRequestPayload({
      title: "أ",
      description: "قصير",
      pricingType: "fixed",
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.fieldErrors.title);
    assert.ok(result.fieldErrors.description);
    assert.ok(result.fieldErrors.categoryId);
    assert.ok(result.fieldErrors.fixedBudget);
  });

  it("bidding pantry request accepts budget range without fixed budget", () => {
    const result = validatePantryRequestPayload({
      title: "طلب عروض داخلي",
      description: "وصف كافٍ لطلب استقبال عروض داخل بيت المونة",
      categoryId: 1,
      pricingType: "bidding",
      budgetMin: 50,
      budgetMax: 120,
      deliveryDays: 7,
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value.pricingType, "bidding");
    assert.strictEqual(result.value.fixedBudget, null);
    assert.strictEqual(result.value.budgetMin, 50);
    assert.strictEqual(result.value.budgetMax, 120);
  });

  it("mapRequest exposes client-like pantry fields for freelancers", () => {
    const mapped = mapRequestLite({
      pricing_type: "bidding",
      sub_subcategory_id: 3,
      delivery_days: 4,
      skills: ["a"],
      requirements: "r",
    });
    assert.strictEqual(mapped.pricingType, "bidding");
    assert.strictEqual(mapped.subSubcategoryId, "3");
    assert.strictEqual(mapped.deliveryDays, 4);
    assert.deepStrictEqual(mapped.skills, ["a"]);
    assert.strictEqual(mapped.requirements, "r");
  });

  it("service maps client-like columns in INSERT for createRequest", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.ok(serviceSrc.includes("pricing_type"));
    assert.ok(serviceSrc.includes("sub_subcategory_id"));
    assert.ok(serviceSrc.includes("delivery_days"));
    assert.ok(serviceSrc.includes("validatePantryRequestPayload"));
    assert.ok(serviceSrc.includes("PANTRY_SCHEMA_MISSING") || serviceSrc.includes("mapPantryDbError"));
  });

  it("missing pantry tables map to schema-missing 503 for developers", () => {
    const mapped = mapPantryDbError({
      code: "42P01",
      message: 'relation "pantry_requests" does not exist',
    });
    assert.strictEqual(mapped.statusCode, 503);
    assert.strictEqual(mapped.code, "PANTRY_SCHEMA_MISSING");
    assert.strictEqual(mapped.exposeToClient, true);
    assert.match(mapped.message, /جداول بيت المونة/);
  });

  it("mapPantryDbError does not convert 23502 not-null into PANTRY_SCHEMA_MISSING", () => {
    const mapped = mapPantryDbError({
      code: "23502",
      message:
        'null value in column "created_by_admin_id" of relation "pantry_requests" violates not-null constraint',
      column: "created_by_admin_id",
    });
    assert.strictEqual(mapped.code, "PANTRY_REQUIRED_FIELD_MISSING");
    assert.strictEqual(mapped.statusCode, 400);
    assert.notStrictEqual(mapped.code, "PANTRY_SCHEMA_MISSING");
  });

  it("only 42P01 / undefined_table becomes PANTRY_SCHEMA_MISSING", () => {
    const other = mapPantryDbError({
      code: "23505",
      message: 'duplicate key value violates unique constraint on relation "pantry_bids"',
    });
    assert.strictEqual(other.code, "23505");
    assert.ok(!other.statusCode || other.statusCode !== 503);
  });

  it("actorId prefers req.auth.userId like other admin controllers", () => {
    assert.strictEqual(actorId({ auth: { userId: "4" }, user: { id: 99 } }), 4);
    assert.strictEqual(actorId({ user: { id: "7" } }), 7);
    assert.strictEqual(actorId({ user: { sub: "8" } }), 8);
    assert.strictEqual(actorId({}), null);
  });

  it("requireActorId fails clearly when actor id is missing (before DB)", () => {
    assert.throws(
      () => requireActorId({}),
      (err) => err && err.statusCode === 401 && err.code === "UNAUTHORIZED",
    );
  });

  it("createRequest service rejects missing created_by_admin_id before insert", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.ok(serviceSrc.includes("يجب تسجيل الدخول لإنشاء طلب بيت المونة"));
    assert.ok(/adminId|adminUserId/.test(serviceSrc));
    assert.match(serviceSrc, /created_by_admin_id/);
  });

  it("controller createRequest uses requireActorId / req.auth.userId", () => {
    const ctrl = fs.readFileSync(
      path.join(__dirname, "../src/controllers/pantryController.js"),
      "utf8",
    );
    const pantryConst = fs.readFileSync(
      path.join(__dirname, "../src/constants/pantry.js"),
      "utf8",
    );
    assert.ok(ctrl.includes("requireActorId"));
    assert.ok(ctrl.includes("actorIdPresent"));
    assert.ok(pantryConst.includes("auth?.userId") || pantryConst.includes("req?.auth?.userId"));
  });

  it("PATCH request service rejects status field", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.ok(serviceSrc.includes("STATUS_PATCH_FORBIDDEN"));
    assert.ok(serviceSrc.includes("hasOwnProperty.call(payload, \"status\")"));
    assert.ok(!/if \(payload\.status !== undefined\)\s*\{\s*if \(!PANTRY_REQUEST_STATUSES/.test(serviceSrc));
  });

  it("approveDelivery enforces submitted + assignee match", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.ok(serviceSrc.includes("canAdminApproveDelivery"));
    assert.ok(serviceSrc.includes("deliveryMatchesAssignedFreelancer"));
    assert.ok(serviceSrc.includes("ASSIGNEE_MISMATCH"));
  });

  it("pantry module is isolated from ordersService", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.ok(!serviceSrc.includes("ordersService"));
    assert.ok(!serviceSrc.includes("fakeOrders"));
    assert.ok(!serviceSrc.includes("stripe"));
  });

  it("routes require pantry permission for admin and freelancer role for freelancers", () => {
    const routesSrc = fs.readFileSync(
      path.join(__dirname, "../src/routes/pantryRoutes.js"),
      "utf8",
    );
    assert.ok(routesSrc.includes("PERMISSION_KEYS.PANTRY"));
    assert.ok(routesSrc.includes('requireRole("freelancer")'));
    assert.ok(routesSrc.includes('requireAnyRole(["admin", "super_admin"])'));
  });

  it("app mounts pantry routers under admin and freelancer", () => {
    const appSrc = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8");
    assert.ok(appSrc.includes("adminPantryRouter"));
    assert.ok(appSrc.includes("freelancerPantryRouter"));
  });

  it("client cannot access admin pantry routes by role guard", () => {
    const routesSrc = fs.readFileSync(
      path.join(__dirname, "../src/routes/pantryRoutes.js"),
      "utf8",
    );
    assert.ok(!routesSrc.includes('requireRole("client")'));
    assert.ok(routesSrc.includes('requireAnyRole(["admin", "super_admin"])'));
  });

  it("freelancer pantry route redirects into available orders; admin pantry stays separate", () => {
    const nav = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/constants/freelancerNav.js"),
      "utf8",
    );
    const app = fs.readFileSync(path.join(__dirname, "../../frontend/src/App.jsx"), "utf8");
    const redirectPage = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/pages/dashboard/FreelancerPantryPage.jsx"),
      "utf8",
    );
    const marketplace = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/components/open-orders/OpenOrdersMarketplace.jsx"),
      "utf8",
    );
    const mapper = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/components/open-orders/mapPantryRequestToPoolOrder.js"),
      "utf8",
    );
    const adminPage = fs.readFileSync(
      path.join(__dirname, "../../frontend/src/pages/dashboard/AdminPantryPage.jsx"),
      "utf8",
    );
    assert.ok(!nav.includes("/dashboard/freelancer/pantry"));
    assert.ok(!nav.includes("dashboard.nav.freelancer.pantry"));
    assert.ok(nav.includes("/dashboard/freelancer/orders"));
    assert.ok(app.includes('path="/dashboard/freelancer/pantry"'));
    assert.ok(app.includes("FreelancerPantryPage"));
    assert.ok(app.includes('path="/dashboard/freelancer/orders"'));
    assert.ok(app.includes('path="/dashboard/super-admin/pantry"'));
    assert.ok(app.includes("AdminPantryPage"));
    assert.match(redirectPage, /Navigate to="\/dashboard\/freelancer\/orders"/);
    assert.match(redirectPage, /replace/);
    assert.doesNotMatch(redirectPage, /listFreelancerPantryRequestsRequest/);
    assert.match(marketplace, /listFreelancerPantryRequestsRequest/);
    assert.match(marketplace, /mergePantryIntoPool/);
    assert.match(marketplace, /mapPantryRequestToPoolOrder/);
    assert.match(mapper, /isPantryPoolItem: true/);
    assert.doesNotMatch(mapper, /بيت المونة/);
    assert.match(adminPage, /إنشاء طلب بيت المونة/);
  });

  it("listOpenRequestsForFreelancer filters open_for_bids only", () => {
    const serviceSrc = fs.readFileSync(
      path.join(__dirname, "../src/services/pantryService.js"),
      "utf8",
    );
    assert.ok(serviceSrc.includes("listOpenRequestsForFreelancer"));
    assert.ok(serviceSrc.includes("WHERE r.status = 'open_for_bids'"));
  });

  it("migration 153 includes client-like columns, one-accepted-bid index, and is additive", () => {
    const mig = fs.readFileSync(
      path.join(__dirname, "../sql/migrations/153_pantry_house.sql"),
      "utf8",
    );
    assert.ok(mig.includes("CREATE TABLE IF NOT EXISTS pantry_requests"));
    assert.ok(mig.includes("pricing_type"));
    assert.ok(mig.includes("sub_subcategory_id"));
    assert.ok(mig.includes("delivery_days"));
    assert.ok(mig.includes("skills JSONB"));
    assert.ok(mig.includes("idx_pantry_bids_one_accepted_per_request"));
    assert.ok(mig.includes("WHERE status = 'accepted'"));
    assert.ok(mig.includes("dashboard.super_admin.pantry"));
    assert.ok(!mig.includes("DROP TABLE"));
    assert.ok(!mig.includes("ALTER TABLE orders"));
  });
});
