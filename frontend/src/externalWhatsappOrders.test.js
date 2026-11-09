/**
 * External (WhatsApp) order intake — frontend contracts: sidebar entries, guarded routes,
 * role map parity, five-language completeness, single-field freelancer form, a11y hooks.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanExternalOrderIdInput,
  isPlausibleExternalOrderId,
  isValidApprovalPriceInput,
  externalIntakeStatusTone,
} from "./constants/externalOrderIntakes.js";
import { canRoleAccessPath } from "./constants/authRoutes.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const LOCALES = ["ar", "en", "de", "nl", "ro"];

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

describe("WhatsApp orders — navigation & routes", () => {
  it("freelancer sidebar has the entry right after My orders", () => {
    const nav = read("constants/freelancerNav.js");
    assert.match(
      nav,
      /"\/dashboard\/freelancer\/my-orders"[^\n]*\n\s*\{ to: "\/dashboard\/freelancer\/whatsapp-orders", labelKey: "dashboard\.whatsappOrders\.navLabel", icon: "whatsapp" \}/,
    );
    assert.match(read("components/layout/FreelancerNavIcon.jsx"), /whatsapp: MessageCircle/);
  });

  it("admin + super-admin sidebars place the queue in Orders/Operations with a pending badge", () => {
    const admin = read("constants/adminNav.js");
    assert.match(admin, /itemKeys: \["internalRequests", "whatsappOrders", "createOrder", "trainingRequests"\]/);
    assert.match(admin, /to: "\/dashboard\/admin\/whatsapp-orders"[\s\S]*?permission: ADMIN_PAGE_PERMISSIONS\.orders,\s*badgeKey: "externalIntakesPending"/);
    const sa = read("constants/superAdminNav.js");
    assert.match(sa, /to: "\/dashboard\/super-admin\/whatsapp-orders"[\s\S]*?permission: ADMIN_PAGE_PERMISSIONS\.orders,\s*badgeKey: "externalIntakesPending"/);
    assert.match(read("components/dashboard/AdminGroupedNavList.jsx"), /oh-sa-navlink__badge/);
    for (const layout of ["layouts/AdminLayout.jsx", "layouts/SuperAdminLayout.jsx"]) {
      assert.match(read(layout), /useExternalIntakePendingCount\(canSeeWhatsappQueue\)/);
      assert.match(read(layout), /badges=\{navBadges\}/);
    }
  });

  it("badge refresh is gentle (≥ 2 min, visible tab only, event-driven after actions)", () => {
    const hook = read("hooks/useExternalIntakePendingCount.js");
    assert.match(hook, /REFRESH_MS = 120_000/);
    assert.match(hook, /visibilityState === "hidden"/);
    assert.match(hook, /EXTERNAL_INTAKES_CHANGED_EVENT/);
  });

  it("routes are role-guarded and mirrored in authRoutes", () => {
    const app = read("App.jsx");
    assert.match(app, /path="\/dashboard\/freelancer\/whatsapp-orders"\s*element=\{\s*<RequireRole allowedRoles=\{\[ROLE\.FREELANCER\]\}>\s*<FreelancerWhatsappOrdersPage \/>/);
    assert.match(app, /path="\/dashboard\/admin\/whatsapp-orders"[\s\S]*?<RequirePermission permission=\{ADMIN_PAGE_PERMISSIONS\.orders\}>\s*<AdminWhatsappOrdersPage \/>/);
    assert.match(app, /path="\/dashboard\/super-admin\/whatsapp-orders"\s*element=\{\s*<RequireStaffPage permission=\{ADMIN_PAGE_PERMISSIONS\.orders\}>\s*<AdminWhatsappOrdersPage \/>/);
    assert.strictEqual(canRoleAccessPath("/dashboard/freelancer/whatsapp-orders", "freelancer"), true);
    assert.strictEqual(canRoleAccessPath("/dashboard/freelancer/whatsapp-orders", "client"), false);
    assert.strictEqual(canRoleAccessPath("/dashboard/admin/whatsapp-orders", "admin"), true);
    assert.strictEqual(canRoleAccessPath("/dashboard/admin/whatsapp-orders", "freelancer"), false);
    assert.strictEqual(canRoleAccessPath("/dashboard/super-admin/whatsapp-orders", "super_admin"), true);
    assert.strictEqual(canRoleAccessPath("/dashboard/super-admin/whatsapp-orders", "client"), false);
  });
});

describe("WhatsApp orders — freelancer page", () => {
  const page = read("pages/dashboard/FreelancerWhatsappOrdersPage.jsx");

  it("has exactly one input: the external Order ID (no price / description / files / category)", () => {
    assert.strictEqual((page.match(/<input\b/g) || []).length, 1);
    assert.doesNotMatch(page, /<textarea|<select|type="file"/);
    assert.match(page, /name="externalOrderId"/);
  });

  it("is accessible: label, describedby, invalid state, live success region", () => {
    assert.match(page, /htmlFor=\{inputId\}/);
    assert.match(page, /aria-invalid=/);
    assert.match(page, /aria-describedby=/);
    assert.match(page, /role="alert"/);
    assert.match(page, /role="status" aria-live="polite"/);
    assert.match(page, /dir="ltr"/);
  });

  it("price only after approval, Open order links to the canonical assigned-order page", () => {
    assert.match(page, /row\.status === "approved" && row\.price != null/);
    assert.match(page, /freelancerOrderPath\(row\.orderId\)/);
  });
});

describe("WhatsApp orders — admin page", () => {
  const page = read("pages/dashboard/AdminWhatsappOrdersPage.jsx");
  it("server-paginated queue with filters; individual approval with explicit price (no bulk)", () => {
    assert.match(page, /listAdminExternalOrderIntakesRequest\(params/);
    assert.match(page, /<Pagination/);
    assert.match(page, /status, setStatus\] = useState\("pending_review"\)/);
    assert.doesNotMatch(page, /bulk/i);
    assert.match(page, /isValidApprovalPriceInput\(p\)/);
    assert.match(page, /approveAdminExternalOrderIntakeRequest\(intakeId, payload\)/);
  });
  it("rejection uses fixed reason codes; internal note labelled as private", () => {
    assert.match(page, /EXTERNAL_INTAKE_REJECTION_REASONS\.map/);
    assert.match(page, /review\.internalNote/);
  });
});

describe("WhatsApp orders — helpers", () => {
  it("cleans pasted IDs like the backend", () => {
    const rlm = String.fromCharCode(0x200f);
    assert.strictEqual(cleanExternalOrderIdInput(`  ${rlm}#WA-1001 `), "WA-1001");
    assert.strictEqual(cleanExternalOrderIdInput(`A${String.fromCharCode(0x0661)}`), "A1");
    assert.strictEqual(isPlausibleExternalOrderId("WA-1001"), true);
    assert.strictEqual(isPlausibleExternalOrderId("12 34"), false);
    assert.strictEqual(isPlausibleExternalOrderId("<b>"), false);
  });
  it("validates prices without floats", () => {
    for (const ok of ["1", "0.5", "37.50", "999999.99"]) assert.strictEqual(isValidApprovalPriceInput(ok), true, ok);
    for (const bad of ["0", "0.00", "-1", "1.234", "abc", "", "1e3", "1000000"]) assert.strictEqual(isValidApprovalPriceInput(bad), false, bad);
  });
  it("status tones", () => {
    assert.strictEqual(externalIntakeStatusTone("pending_review"), "pending");
    assert.strictEqual(externalIntakeStatusTone("approved"), "success");
    assert.strictEqual(externalIntakeStatusTone("rejected"), "danger");
  });
});

describe("WhatsApp orders — five-language completeness", () => {
  it("every locale has identical key sets for the pages, error codes and notification", () => {
    const en = json("locales/en/dashboard.json");
    const enKeys = Object.keys(flatten({ a: en.whatsappOrders, b: en.whatsappOrdersAdmin })).sort();
    assert.ok(enKeys.length > 100);
    for (const loc of LOCALES) {
      const d = json(`locales/${loc}/dashboard.json`);
      const flat = flatten({ a: d.whatsappOrders, b: d.whatsappOrdersAdmin });
      assert.deepStrictEqual(Object.keys(flat).sort(), enKeys, loc);
      for (const [k, v] of Object.entries(flat)) assert.ok(String(v).trim(), `${loc} ${k} empty`);
      const codes = json(`locales/${loc}/apiErrors.json`).codes;
      for (const c of [
        "EXTERNAL_ORDER_ID_INVALID",
        "EXTERNAL_ORDER_ALREADY_REGISTERED",
        "EXTERNAL_ORDER_ALREADY_PROCESSED",
        "EXTERNAL_ORDER_PRICE_INVALID",
        "EXTERNAL_ORDER_NOT_FOUND",
        "EXTERNAL_ORDER_REJECTION_REASON_INVALID",
        "EXTERNAL_ORDER_FREELANCER_NOT_ELIGIBLE",
        "EXTERNAL_ORDER_DETAILS_INVALID",
      ]) {
        assert.ok(codes[c], `${loc} ${c}`);
      }
      assert.ok(json(`locales/${loc}/notificationTypes.json`).types.external_order_intake_rejected.title, loc);
    }
    const ar = json("locales/ar/dashboard.json");
    assert.strictEqual(ar.whatsappOrders.navLabel, "طلبات واتساب");
    assert.strictEqual(ar.whatsappOrders.status.pending_review, "بانتظار الاعتماد والتسعير");
    assert.strictEqual(ar.whatsappOrders.status.approved, "تم الاعتماد");
    assert.strictEqual(ar.whatsappOrders.status.rejected, "لم يتم الاعتماد");
    assert.strictEqual(ar.whatsappOrders.form.idLabel, "رقم الطلب (ID)");
    assert.strictEqual(ar.whatsappOrders.form.submit, "إضافة الطلب");
    assert.strictEqual(ar.whatsappOrders.success.title, "تم إرسال الطلب للمراجعة");
    assert.strictEqual(ar.whatsappOrders.actions.openOrder, "فتح الطلب");
  });
});
