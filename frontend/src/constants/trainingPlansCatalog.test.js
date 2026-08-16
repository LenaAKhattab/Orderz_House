/**
 * Public Training + Membership plans catalog wiring.
 * Run: node --test src/constants/trainingPlansCatalog.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PLANS_CATEGORY,
  PLANS_CATEGORY,
  TRAINING_PACKAGES,
  TRAINING_WHATSAPP_E164,
  buildTrainingWhatsAppUrl,
  resolvePlansCategory,
} from "./trainingPlansCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("trainingPlansCatalog", () => {
  it("defaults to TRAINING and exposes three approved packages", () => {
    assert.strictEqual(DEFAULT_PLANS_CATEGORY, PLANS_CATEGORY.TRAINING);
    assert.strictEqual(resolvePlansCategory(null), "training");
    assert.strictEqual(resolvePlansCategory("membership"), "membership");
    assert.strictEqual(TRAINING_PACKAGES.length, 3);
    assert.deepStrictEqual(
      TRAINING_PACKAGES.map((p) => p.priceJod),
      [49, 249, 349],
    );
    assert.deepStrictEqual(
      TRAINING_PACKAGES.map((p) => p.id),
      ["basic", "professional", "premium"],
    );
    assert.strictEqual(TRAINING_PACKAGES[1].featured, true);
  });

  it("builds WhatsApp URLs with Jordan number and package-specific Arabic text", () => {
    assert.strictEqual(TRAINING_WHATSAPP_E164, "962791433341");
    for (const pkg of TRAINING_PACKAGES) {
      const url = buildTrainingWhatsAppUrl(pkg);
      assert.match(url, /^https:\/\/wa\.me\/962791433341\?text=/);
      const text = decodeURIComponent(url.split("text=")[1]);
      assert.match(text, /مرحبًا/);
      assert.ok(text.includes(pkg.nameAr.replace("الباقة ", "الباقة ")));
      assert.ok(text.includes(String(pkg.priceJod)));
      assert.doesNotMatch(url.toLowerCase(), /work.?token|token/);
    }
  });

  it("Plans page defaults to training category and keeps membership intact", () => {
    const plansPage = fs.readFileSync(path.join(__dirname, "../pages/Plans.jsx"), "utf8");
    assert.match(plansPage, /DEFAULT_PLANS_CATEGORY/);
    assert.match(plansPage, /PLANS_CATEGORY\.TRAINING/);
    assert.match(plansPage, /TrainingPlansSection/);
    assert.match(plansPage, /PlansCategoryToggle/);
    assert.match(plansPage, /PricingSection/);
    const section = fs.readFileSync(path.join(__dirname, "../components/plans/TrainingPlansSection.jsx"), "utf8");
    assert.match(section, /usePublicTrainingPackages/);
    assert.doesNotMatch(plansPage, /Work Token|workToken/);
  });

  it("PlanCard imports membership title/body so /plans?type=membership cannot crash", () => {
    const planCard = fs.readFileSync(
      path.join(__dirname, "../components/plans/PlanCard.jsx"),
      "utf8",
    );
    assert.match(
      planCard,
      /import MembershipPlanCardBody, \{ MembershipPlanTitle \} from "\.\/MembershipPlanCardBody"/,
    );
    assert.match(planCard, /<MembershipPlanTitle[\s\S]*plan=\{plan\}/);
    assert.match(planCard, /<MembershipPlanCardBody[\s\S]*plan=\{plan\}/);
    const body = fs.readFileSync(
      path.join(__dirname, "../components/plans/MembershipPlanCardBody.jsx"),
      "utf8",
    );
    assert.match(body, /export function MembershipPlanTitle/);
    assert.match(body, /export default function MembershipPlanCardBody/);
    const plansPage = fs.readFileSync(path.join(__dirname, "../pages/Plans.jsx"), "utf8");
    assert.match(plansPage, /PLANS_CATEGORY\.MEMBERSHIP/);
    assert.match(plansPage, /PricingSection/);
    assert.match(plansPage, /TrainingPlansSection/);
  });
});
