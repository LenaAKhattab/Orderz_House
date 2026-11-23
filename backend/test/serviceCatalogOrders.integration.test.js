/**
 * Postgres integration — Smart Orders S2: catalog services, dynamic forms, immutable order snapshots,
 * across every S1 customer mode and the client path.
 *
 * Run: node --test test/serviceCatalogOrders.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (non-Production), JWT_SECRET, migrations 216 + 217.
 */
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const ok = isIntegrationEnvConfigured();
const TAG = `[IT-SMART-S2] ${crypto.randomBytes(3).toString("hex")}`;

describe("Smart Orders S2 — catalog + dynamic forms (Postgres)", { skip: !ok }, () => {
  let pool;
  let ordersService;
  let catalog;
  let customers;
  let schemaLib;
  const userIds = [];
  const createdServiceIds = [];
  let adminId;
  let clientId;
  let cats;

  async function makeUser(role) {
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, first_name, father_name, family_name, email, password_hash, role, country, phone, whatsapp, gender, terms_accepted, email_verified, is_active)
       VALUES ($1,'تجربة','كتالوج','اختبار',$2,'x',$3,'JO','+962790000888','+962790000888','ذكر',true,true,true) RETURNING id`,
      [crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10), `it-s2-${crypto.randomBytes(5).toString("hex")}@example.test`, role],
    );
    userIds.push(Number(rows[0].id));
    return Number(rows[0].id);
  }

  async function svcByCode(code) {
    const { services } = await catalog.listCatalog({ audience: "admin" });
    return services.find((s) => s.serviceCode === code);
  }

  async function adminOrder({ serviceCode, values, quantity, quantityUnspecified, customer = null, version = null, files = [] }) {
    const svc = await svcByCode(serviceCode);
    const order = await ordersService.createInternalOrder({
      actorUserId: adminId,
      actorRole: "admin",
      payload: {
        title: `${TAG} ${serviceCode}`,
        description: "Smart orders S2 integration order description.",
        categoryId: svc ? Number(svc.categoryId) : cats.design,
        projectType: "fixed",
        budget: "20",
        durationValue: 2,
        durationUnit: "days",
        preferredSkills: [],
        archive: true,
        customer: customer ? customers.parseCustomerInput(customer) : null,
        serviceForm: schemaLib.parseServiceFormInput({ serviceCode, version, values, quantity, quantityUnspecified }),
      },
      uploadedFiles: files,
      options: { returnCustomerLink: true },
    });
    return order;
  }

  before(async () => {
    ({ pool } = require("../src/config/db"));
    ordersService = require("../src/services/ordersService");
    catalog = require("../src/services/serviceCatalogService");
    customers = require("../src/services/orderCustomerService");
    schemaLib = require("../src/services/serviceCatalogSchema");
    const { rows } = await pool.query(`SELECT to_regclass('public.order_form_snapshots') AS t`);
    assert.ok(rows[0].t, "migration 217 must be applied");
    const { rows: c } = await pool.query(`SELECT id, slug FROM categories`);
    cats = Object.fromEntries(c.map((r) => [r.slug === "content-writing" ? "writing" : r.slug, Number(r.id)]));
    adminId = await makeUser("admin");
    clientId = await makeUser("client");
  });

  after(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '300s'");
      const { rows } = await client.query(`SELECT id, guest_contact_id FROM orders WHERE title LIKE $1`, [`${TAG}%`]);
      const ids = rows.map((r) => Number(r.id));
      await client.query(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::bigint[]) OR actor_user_id = ANY($1::bigint[])`, [userIds]);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM guest_contacts WHERE created_by_admin_id = ANY($1::bigint[])`, [userIds]);
      if (createdServiceIds.length) {
        await client.query(`ALTER TABLE catalog_service_versions DISABLE TRIGGER catalog_service_versions_no_update`);
        await client.query(`DELETE FROM catalog_service_versions WHERE service_id = ANY($1::bigint[])`, [createdServiceIds]);
        await client.query(`ALTER TABLE catalog_service_versions ENABLE TRIGGER catalog_service_versions_no_update`);
        await client.query(`DELETE FROM catalog_services WHERE id = ANY($1::bigint[])`, [createdServiceIds]);
      }
      await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      // eslint-disable-next-line no-console
      console.error("[serviceCatalogOrders.integration] cleanup failed:", e.message);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("A. PowerPoint → slides + slide-specific fields (internal order, L)", async () => {
    const order = await adminOrder({
      serviceCode: "presentation_design",
      values: { content_readiness: "ready", presentation_type: "academic", language: "ar", output_formats: ["pptx", "pdf"], charts: true },
      quantity: "15",
    });
    assert.equal(order.serviceForm.quantity.unit, "slides");
    assert.equal(order.serviceForm.quantity.value, "15.00");
    assert.ok(order.serviceForm.fields.some((f) => f.key === "content_readiness"));
    assert.deepEqual(order.serviceForm.values.output_formats, ["pptx", "pdf"]);
  });

  it("B. Excel → worksheets; C. Logo → concepts; D. Website fields", async () => {
    const xl = await adminOrder({ serviceCode: "excel_data", values: { features: ["formulas", "dashboard"] }, quantity: "3" });
    assert.equal(xl.serviceForm.quantity.unit, "worksheets");
    const logo = await adminOrder({ serviceCode: "logo_design", values: { brand_name: "Nour", formats: ["png", "svg"] }, quantity: "3" });
    assert.equal(logo.serviceForm.quantity.unit, "concepts");
    const web = await adminOrder({
      serviceCode: "website_development",
      values: { admin_panel: "yes", site_languages: ["ar", "en"], payments: "no", reference_site: "https://example.com/x" },
      quantityUnspecified: true,
    });
    assert.equal(web.serviceForm.quantity.unit, "pages");
    assert.equal(web.serviceForm.quantity.unspecified, true);
    assert.equal(web.serviceForm.values.reference_site, "https://example.com/x");
  });

  it("E. missing required field and F. tampered option are rejected server-side (no order created)", async () => {
    const before = (await pool.query(`SELECT COUNT(*)::int n FROM orders WHERE title LIKE $1`, [`${TAG}%`])).rows[0].n;
    await assert.rejects(
      () => adminOrder({ serviceCode: "logo_design", values: { formats: ["png"] }, quantity: "2" }),
      (e) => e.publicCode === "SMART_ORDER_FORM_INVALID" && e.fieldErrors.brand_name === "required",
    );
    await assert.rejects(
      () => adminOrder({ serviceCode: "logo_design", values: { brand_name: "x", formats: ["exe"] }, quantity: "2" }),
      (e) => e.publicCode === "SMART_ORDER_FORM_INVALID" && e.fieldErrors.formats === "invalid_option",
    );
    await assert.rejects(
      () => adminOrder({ serviceCode: "logo_design", values: { brand_name: "x", formats: ["png"], injected: "1" }, quantity: "2" }),
      (e) => e.fieldErrors?.injected === "unknown_field",
    );
    const after = (await pool.query(`SELECT COUNT(*)::int n FROM orders WHERE title LIKE $1`, [`${TAG}%`])).rows[0].n;
    assert.equal(after, before);
  });

  it("G. v1 order keeps its snapshot after the service changes to v2; stale version rejected", async () => {
    const created = await catalog.createService({
      actorUserId: adminId,
      definition: {
        serviceCode: `it_s2_${crypto.randomBytes(3).toString("hex")}`,
        categoryId: cats.design,
        name: { ar: "خدمة اختبار", en: "QA service v1" },
        quantity: { unit: "designs", required: true, min: 1, max: 5 },
        fields: [
          { key: "tone", type: "select", label: { ar: "النبرة", en: "Tone v1" }, required: false, options: [{ value: "calm", label: { ar: "هادئ", en: "Calm" } }] },
        ],
      },
    });
    createdServiceIds.push(Number(created.service.id));
    const code = created.service.serviceCode;
    const v1Order = await adminOrder({ serviceCode: code, values: { tone: "calm" }, quantity: "2", version: 1 });

    const v2 = await catalog.updateService({
      id: created.service.id,
      actorUserId: adminId,
      changeNote: "rename + required + unit + options",
      definition: {
        categoryId: cats.design,
        name: { ar: "خدمة معدلة", en: "QA service v2" },
        quantity: { unit: "concepts", required: true, min: 1, max: 9 },
        fields: [
          { key: "tone", type: "select", label: { ar: "الأسلوب", en: "Style v2" }, required: true, options: [{ value: "bold", label: { ar: "جريء", en: "Bold" } }] },
        ],
      },
    });
    assert.equal(v2.service.version, 2);
    // Re-saving an identical definition does not create a new version.
    const same = await catalog.updateService({ id: created.service.id, actorUserId: adminId, definition: { ...v2.service, categoryId: cats.design } });
    assert.equal(same.service.version, 2);

    const reread = await ordersService.getOrderById(v1Order.id);
    assert.equal(reread.serviceForm.version, 1);
    assert.equal(reread.serviceForm.name.en, "QA service v1");
    assert.equal(reread.serviceForm.quantity.unit, "designs");
    assert.equal(reread.serviceForm.fields[0].label.en, "Tone v1");
    assert.equal(reread.serviceForm.fields[0].required, false);
    assert.equal(reread.serviceForm.values.tone, "calm");

    await assert.rejects(() => adminOrder({ serviceCode: code, values: { tone: "bold" }, quantity: "2", version: 1 }), (e) => e.publicCode === "SMART_ORDER_FORM_STALE");
    await assert.rejects(() => adminOrder({ serviceCode: code, values: { tone: "calm" }, quantity: "2" }), (e) => e.fieldErrors?.tone === "invalid_option");
    const v2Order = await adminOrder({ serviceCode: code, values: { tone: "bold" }, quantity: "4", version: 2 });
    assert.equal(v2Order.serviceForm.version, 2);
    assert.equal(v2Order.serviceForm.quantity.unit, "concepts");

    // Snapshots and versions are append-only at the database level.
    await assert.rejects(() => pool.query(`UPDATE order_form_snapshots SET service_version = 9 WHERE order_id = $1`, [v1Order.id]));
    await assert.rejects(() => pool.query(`UPDATE catalog_service_versions SET version = 9 WHERE service_id = $1`, [created.service.id]));

    // H. deactivated service: old order still readable, new orders refused.
    await catalog.setServiceActive({ id: created.service.id, active: false, actorUserId: adminId });
    const still = await ordersService.getOrderById(v1Order.id);
    assert.equal(still.serviceForm.name.en, "QA service v1");
    await assert.rejects(() => adminOrder({ serviceCode: code, values: { tone: "bold" }, quantity: "1" }), (e) => e.publicCode === "SMART_ORDER_SERVICE_UNAVAILABLE");
    const { services } = await catalog.listCatalog({ audience: "admin" });
    assert.equal(services.some((s) => s.serviceCode === code), false);
  });

  it("I. guest + dynamic service; J. new-account claim keeps the snapshot; K. existing account", async () => {
    const guest = await adminOrder({
      serviceCode: "translation",
      values: { source_language: "ar", target_language: "en", domain: "legal" },
      quantity: "1200",
      customer: { mode: "guest", contactChannel: "email", referenceName: "QA" },
    });
    assert.equal(guest.serviceForm.quantity.unit, "words");
    const { rows: g } = await pool.query(`SELECT customer_mode, customer_user_id FROM orders WHERE id = $1`, [guest.id]);
    assert.deepEqual(g[0], { customer_mode: "guest", customer_user_id: null });

    const na = await adminOrder({
      serviceCode: "video_editing",
      values: { raw_material: "provided", captions: true, caption_language: "en" },
      quantity: "2.5",
      customer: { mode: "new_account", phone: "+962791110000" },
    });
    assert.equal(na.serviceForm.quantity.value, "2.50");
    const token = na.customerLink.claimUrl.split("#t=")[1];
    const claimed = await customers.claimOrder({ token, userId: clientId, notify: false });
    assert.equal(claimed.orderId, String(na.id));
    const mine = await ordersService.getClientOrderByIdForOwner({ clientUserId: clientId, orderId: na.id });
    assert.equal(mine.serviceForm.serviceCode, "video_editing");
    assert.equal(mine.serviceForm.values.caption_language, "en");

    const ex = await adminOrder({
      serviceCode: "excel_data",
      values: { features: ["vba"] },
      quantity: "1",
      customer: { mode: "existing", customerUserId: clientId },
    });
    assert.equal(ex.serviceForm.quantity.unit, "worksheets");
  });

  it("client path: only public services; admin-only service refused; snapshot written", async () => {
    const { services } = await catalog.listCatalog({ audience: "client" });
    assert.equal(services.some((s) => s.visibility === "admin_only"), false);
    const mobile = await catalog.listCatalog({ audience: "client", fieldTypes: ["text", "textarea", "select", "radio", "checkbox", "number", "multiselect"] });
    assert.ok(mobile.services.every((s) => s.fields.every((f) => !["file", "url", "date", "datetime", "decimal"].includes(f.type))));
    const payload = (serviceCode, values, quantity) => ({
      title: `${TAG} client ${serviceCode}`,
      description: "Smart orders S2 client order description text.",
      categoryId: cats.writing,
      projectType: "bidding",
      bidBudgetMin: "10",
      bidBudgetMax: "20",
      durationValue: 3,
      durationUnit: "days",
      preferredSkills: [],
      serviceForm: schemaLib.parseServiceFormInput({ serviceCode, values, quantity }),
    });
    const order = await ordersService.createClientOrder({
      clientUserId: clientId,
      payload: payload("research_writing", { topic: "AI ethics", language: "en", citation_style: "apa", reference_count: "10" }, "12"),
    });
    assert.equal(order.serviceForm.quantity.unit, "pages");
    await assert.rejects(
      () => ordersService.createClientOrder({ clientUserId: clientId, payload: { ...payload("custom_service", { scope: "x" }), categoryId: cats["special-requests"] } }),
      (e) => e.publicCode === "SMART_ORDER_SERVICE_UNAVAILABLE",
    );
  });

  it("legacy orders without a service keep serviceForm = null", async () => {
    const { rows } = await pool.query(
      `SELECT o.id FROM orders o LEFT JOIN order_form_snapshots s ON s.order_id = o.id WHERE s.id IS NULL ORDER BY o.id LIMIT 1`,
    );
    const legacy = await ordersService.getOrderById(rows[0].id);
    assert.equal(legacy.serviceForm, null);
  });
});
