import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLocalizedOrderDescription,
  getLocalizedOrderTitle,
  resolveUserContentDir,
} from "./getLocalizedMarketplaceOrderText.js";
import { getLocaleField, getLocalizedField } from "./getLocalizedField.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../..");

const arabicOrder = {
  title: "تصميم شعار جديد",
  description: "تطوير خدمة جدولة مهام دورية لمكتب خدمات مهنية",
  title_en: "",
  description_en: "",
  sourceType: "client",
};

const englishOrder = {
  title: "Build a company website",
  description: "Build the public company website and contact form.",
  sourceType: "client",
};

const fakeOrder = {
  title: "تطوير خدمة جدولة مهام دورية لمكتب خدمات مهنية",
  description: "تطوير خدمة جدولة مهام دورية لمكتب خدمات مهنية مع تذكير أسبوعي.",
  title_en: "Schedule recurring tasks",
  description_en: "Build a recurring task scheduler.",
  sourceType: "fake",
};

describe("original order content across locales", () => {
  it("shows an Arabic real title in Arabic and English UI", () => {
    assert.equal(getLocalizedOrderTitle(arabicOrder, "ar"), "تصميم شعار جديد");
    assert.equal(getLocalizedOrderTitle(arabicOrder, "en"), "تصميم شعار جديد");
  });

  it("shows an English real title in Arabic and English UI", () => {
    assert.equal(getLocalizedOrderTitle(englishOrder, "ar"), "Build a company website");
    assert.equal(getLocalizedOrderTitle(englishOrder, "en"), "Build a company website");
  });

  it("shows an Arabic real description in English UI", () => {
    assert.equal(getLocalizedOrderDescription(arabicOrder, "en"), arabicOrder.description);
  });

  it("uses the localized empty description only when description is absent", () => {
    const empty = { title: "تصميم شعار جديد", description: "   " };
    assert.equal(getLocalizedOrderDescription(empty, "en"), "");
    assert.equal(getLocalizedOrderDescription(empty, "ar"), "");
    const en = JSON.parse(fs.readFileSync(path.join(root, "src/locales/en/orders.json"), "utf8"));
    const ar = JSON.parse(fs.readFileSync(path.join(root, "src/locales/ar/orders.json"), "utf8"));
    assert.equal(en.marketplace.card.noDescription, "No description.");
    assert.equal(ar.marketplace.card.noDescription, "لا يوجد وصف");
    const row = fs.readFileSync(
      path.join(root, "src/components/open-orders/MarketplaceOrderListRow.jsx"),
      "utf8",
    );
    assert.match(row, /shortDescription\(description, 120, \{ emptyLabel: t\("orders\.marketplace\.card\.noDescription"\) \}\)/);
  });

  it("shows the same Arabic fake-order content in both locales and ignores English columns", () => {
    assert.equal(getLocalizedOrderTitle(fakeOrder, "ar"), fakeOrder.title);
    assert.equal(getLocalizedOrderTitle(fakeOrder, "en"), fakeOrder.title);
    assert.equal(getLocalizedOrderDescription(fakeOrder, "en"), fakeOrder.description);
    assert.notEqual(getLocalizedOrderTitle(fakeOrder, "en"), fakeOrder.title_en);
  });

  it("still localizes platform taxonomy labels", () => {
    const category = { name: "خدمات البرمجة", name_en: "Programming Services" };
    assert.equal(getLocalizedField(category, "name", "ar"), "خدمات البرمجة");
    assert.equal(getLocaleField(category, "name", "en"), "Programming Services");
    const formatters = fs.readFileSync(
      path.join(root, "src/components/open-orders/openOrdersFormatters.js"),
      "utf8",
    );
    assert.match(formatters, /function getCategoryName\(item, locale = "ar"\)/);
    assert.match(formatters, /locale === "en"[\s\S]*getLocaleField\(item, "name", "en"\)/);
    assert.match(formatters, /export function categoryChips\(order, locale = "ar"\)/);
  });

  it("uses dir=auto for user-authored order text", () => {
    assert.equal(resolveUserContentDir("تصميم شعار جديد", "ltr"), "auto");
    assert.equal(resolveUserContentDir("Build a company website", "rtl"), "auto");
    const row = fs.readFileSync(
      path.join(root, "src/components/open-orders/MarketplaceOrderListRow.jsx"),
      "utf8",
    );
    assert.match(row, /oh-order-row__title text-start" dir="auto"/);
    assert.match(row, /oh-order-row__summary text-start" dir="auto"/);
    assert.doesNotMatch(row, /locale === "en" \? "ltr" : "auto"/);
  });

  it("does not translate or mutate order rows", () => {
    const src = fs.readFileSync(path.join(__dirname, "getLocalizedMarketplaceOrderText.js"), "utf8");
    assert.doesNotMatch(src, /title_en|description_en|lookupMarketplaceEnglishSeed|MARKETPLACE_ORDER_TITLE_EN/);
    assert.doesNotMatch(src, /UPDATE|INSERT|order\.title\s*=/);
    const snapshot = JSON.stringify(arabicOrder);
    getLocalizedOrderTitle(arabicOrder, "en");
    getLocalizedOrderDescription(arabicOrder, "en");
    assert.equal(JSON.stringify(arabicOrder), snapshot);
  });
});
