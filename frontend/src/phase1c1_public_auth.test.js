/**
 * Phase 1C.1 — public/auth/role-routing contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROLE, canRoleAccessPath, getAccountSettingsPath } from "./constants/authRoutes.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Phase 1C.1 public/auth routing", () => {
  it("public register exposes only client and freelancer", () => {
    const src = read("pages/Register.jsx");
    assert.match(src, /REGISTER_DEFAULT_ROLES = new Set\(\["client", "freelancer"\]\)/);
    assert.match(src, /value: "freelancer"/);
    assert.match(src, /value: "client"/);
    assert.doesNotMatch(src, /merchant|program_admin|super_admin|"admin"/);
    assert.match(src, /isFreelancer && categories\.length === 0/);
    assert.match(src, /if \(isFreelancer\) \{/);
    assert.match(src, /body\.categories = categories\.filter/);
  });

  it("training packages use WhatsApp and do not start checkout", () => {
    const card = read("components/plans/TrainingPlanCard.jsx");
    const plans = read("pages/Plans.jsx");
    const hook = read("hooks/usePublicTrainingPackages.js");
    assert.match(card, /buildTrainingWhatsAppUrl/);
    assert.doesNotMatch(card, /startCheckout/);
    assert.match(plans, /showTraining \? <TrainingPlansSection/);
    assert.match(plans, /if \(!user \|\| !isFreelancer\) return/);
    assert.match(hook, /TRAINING_PACKAGES/);
    assert.match(hook, /isVisible !== false/);
    assert.doesNotMatch(hook, /default_plan_catalog|startCheckout/);
  });

  it("public plans aliases still redirect", () => {
    const src = read("pages/Plans.jsx");
    assert.match(src, /slug === "freelancers"/);
    assert.match(src, /Navigate to="\/plans"/);
    assert.match(src, /slug === "client-offer"/);
  });

  it("GuestOnly wraps login/register and Unauthorized is eagerly imported", () => {
    const app = read("App.jsx");
    const lazy = read("routes/lazyPages.js");
    assert.match(app, /path="\/login"/);
    assert.match(app, /<GuestOnly>/);
    assert.match(app, /path="\/register"/);
    assert.match(app, /path="\/unauthorized"/);
    assert.match(app, /import Unauthorized from "\.\/pages\/Unauthorized"/);
    assert.doesNotMatch(lazy, /export const Unauthorized/);
  });

  it("guest public order details post-login to a real dashboard pool path", () => {
    const src = read("components/open-orders/OpenOrdersMarketplace.jsx");
    assert.match(src, /layout !== "dashboard"\) return `\/dashboard\/freelancer\/orders\/\$\{orderId\}`/);
    assert.doesNotMatch(src, /return `\/orders\/\$\{orderId\}`/);
  });

  it("admin settings path is unchanged and guest-only home helper is wired", () => {
    assert.equal(getAccountSettingsPath(ROLE.ADMIN), "/dashboard/admin/settings");
    assert.equal(getAccountSettingsPath(ROLE.SUPER_ADMIN), "/dashboard/super-admin/settings");
    assert.equal(canRoleAccessPath("/login", ROLE.CLIENT), true);
    const guards = read("components/auth/AuthGuards.jsx");
    const perms = read("constants/dashboardPermissions.js");
    assert.match(perms, /export function getPostAuthHomePath/);
    assert.match(guards, /getPostAuthHomePath\(user\)/);
    assert.match(read("pages/Login.jsx"), /getPostAuthHomePath\(user\)/);
  });
});
