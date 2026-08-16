/**
 * Training packages admin + public wiring.
 * Run: node --test src/admin/trainingPackages/trainingPackagesAdmin.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildTrainingReorderCodes,
  canSubmitTrainingPackage,
  normalizeTrainingPackagePayload,
  textToFeatures,
} from "./trainingPackageFormUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function read(rel) {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

describe("training package form utils", () => {
  it("normalizes features, JOD price, and hide/show", () => {
    const payload = normalizeTrainingPackagePayload({
      code: "Basic",
      nameAr: "الباقة الأساسية",
      priceJod: "49",
      durationMonths: "",
      featuresAr: "ميزة واحدة\nميزة ثانية",
      isVisible: false,
      featured: true,
    });
    assert.equal(payload.code, "basic");
    assert.equal(payload.priceJod, 49);
    assert.equal(payload.durationMonths, null);
    assert.deepEqual(payload.featuresAr, ["ميزة واحدة", "ميزة ثانية"]);
    assert.equal(payload.isVisible, false);
    assert.equal(canSubmitTrainingPackage({ code: "basic", nameAr: "س", priceJod: 10 }), true);
    assert.equal(textToFeatures("a\n\nb").length, 2);
  });

  it("reorders package codes", () => {
    const next = buildTrainingReorderCodes([{ code: "a" }, { code: "b" }, { code: "c" }], "b", "up");
    assert.deepEqual(next, ["b", "a", "c"]);
  });
});

describe("training packages admin tab", () => {
  it("adds باقات التدريب beside existing plan catalog tabs", () => {
    const nav = read("../plans/planCatalogNav.js");
    const page = read("../../pages/dashboard/SuperAdminTrainingPackagesPage.jsx");
    const app = read("../../App.jsx");
    const section = read("../../components/plans/TrainingPlansSection.jsx");
    const card = read("../../components/plans/TrainingPlanCard.jsx");
    assert.match(nav, /باقات التدريب/);
    assert.match(nav, /training-packages/);
    assert.match(page, /إدارة باقات التدريب|SECTION_COPY\.training/);
    assert.match(page, /تتحكم هذه الباقات|sectionCopy\.hintAr/);
    assert.match(page, /TrainingPackageFormModal/);
    assert.match(app, /SuperAdminTrainingPackagesPage/);
    assert.match(app, /training-packages/);
    assert.match(section, /usePublicTrainingPackages/);
    assert.match(card, /ApproximateCurrencyLine/);
    assert.doesNotMatch(page, /stripe|ordersService/i);
  });
});
