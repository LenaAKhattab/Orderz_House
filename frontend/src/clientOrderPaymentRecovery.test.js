import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientCreationKey, newCreationInstanceId } from "./lib/orders/clientOrderCreationKey.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

const form = { title: "تصميم شعار", description: "شعار لمقهى", categoryId: "3", projectType: "fixed", budget: "15", durationValue: "3", durationUnit: "days", preferredSkills: [] };
const files = [{ name: "brief.pdf", size: 1200, lastModified: 1 }];

describe("client order creation key (one attempt = one order)", () => {
  it("same form instance + same content → same key (double click / Back + resubmit resume the same order)", () => {
    const id = newCreationInstanceId();
    assert.equal(clientCreationKey(id, form, files), clientCreationKey(id, { ...form }, [...files]));
  });

  it("any edit, or a different form instance (another tab), → a different attempt", () => {
    const id = newCreationInstanceId();
    const base = clientCreationKey(id, form, files);
    assert.notEqual(base, clientCreationKey(id, { ...form, budget: "20" }, files));
    assert.notEqual(base, clientCreationKey(id, form, [...files, { name: "x.png", size: 5, lastModified: 2 }]));
    assert.notEqual(base, clientCreationKey(newCreationInstanceId(), form, files));
  });

  it("key matches the server format", () => {
    const key = clientCreationKey(newCreationInstanceId(), form, files);
    assert.ok(/^[A-Za-z0-9:_-]{8,120}$/.test(key), key);
  });

  it("the wizard sends the key for client orders and rotates it only for a new order", () => {
    const wiz = read("components/orders/AdminInternalOrderWizard.jsx");
    assert.ok(wiz.includes('fd.append("creationKey", clientCreationKey(creationInstanceRef.current, form, files));'));
    assert.ok(wiz.includes("creationInstanceRef.current = newCreationInstanceId();"));
  });
});

describe("abandoned checkout never forces recreating the order", () => {
  it("Stripe returns never discard the order automatically", () => {
    const page = read("pages/dashboard/ClientMyOrdersPage.jsx");
    assert.ok(!page.includes("cancelClientFixedOrderPaymentRequest"));
    assert.ok(page.includes("paymentNotCompletedMessage"));
    assert.ok(page.includes("paymentConfirmingMessage"));
    assert.ok(page.includes("usePageRestore("));
  });

  it("order card: «Continue payment» + explicit «Cancel order»; button resets after BFCache restore", () => {
    const card = read("components/orders/ClientOrderCardCompact.jsx");
    assert.ok(card.includes("<ClientFixedOrderPayNowButton order={order} onChanged={onOrdersChange} />"));
    assert.ok(card.includes("<ClientFixedOrderCancelButton order={order} onChanged={onOrdersChange} />"));
    const btn = read("components/orders/ClientFixedOrderPayNowButton.jsx");
    assert.ok(btn.includes("t(`${p}.continueLabel`)"));
    assert.ok(btn.includes("usePageRestore("));
    assert.ok(btn.includes("data.alreadyPaid"));
    const cancel = read("components/orders/ClientFixedOrderCancelButton.jsx");
    assert.ok(cancel.includes("<ConfirmDialog"));
  });

  it("Create Order shows the existing unpaid order with «Continue payment»", () => {
    const modal = read("components/orders/ClientCreateOrderModal.jsx");
    assert.ok(modal.includes("<ClientPendingPaymentNotice />"));
    const notice = read("components/orders/ClientPendingPaymentNotice.jsx");
    assert.ok(notice.includes("isClientFixedOrderAwaitingStripeCheckout(o)"));
    assert.ok(notice.includes("usePageRestore("));
  });

  it("AR/EN copy", () => {
    const ar = json("locales/ar/clientArea.json");
    const en = json("locales/en/clientArea.json");
    assert.equal(ar.payNow.continueLabel, "متابعة الدفع");
    assert.equal(en.payNow.continueLabel, "Continue payment");
    assert.equal(ar.payNow.cancelLabel, "إلغاء الطلب");
    for (const l of [ar, en]) {
      assert.ok(l.payNow.processing && l.payNow.statusUnavailable && l.payNow.cancelConfirmBody);
      assert.ok(l.myOrders.paymentNotCompletedMessage && l.myOrders.paymentConfirmingMessage);
      assert.ok(l.pendingPaymentNotice.title && l.pendingPaymentNotice.text);
    }
  });
});
