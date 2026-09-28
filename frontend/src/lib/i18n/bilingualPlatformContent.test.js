/**
 * Bilingual platform content: English must not fall through to Arabic
 * for canonical FAQ, plans, tabs, taxonomy, and analytics labels.
 *
 * Run: node --test src/lib/i18n/bilingualPlatformContent.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import arAnalysis from "../../locales/ar/analysis.json" with { type: "json" };
import enAnalysis from "../../locales/en/analysis.json" with { type: "json" };
import { createTranslator } from "../../i18n/resolveTranslation.js";
import { mergeLocaleNamespaces, resources } from "../../i18n/resources.js";

mergeLocaleNamespaces({
  ar: { analysis: arAnalysis },
  en: { analysis: enAnalysis },
});
import { getFaqLocalizedText } from "./getFaqLocalizedText.js";
import { getLocalizedPlanCardDisplay } from "./getLocalizedPlanDisplay.js";
import {
  containsArabicScript,
  localizeAnalyticsAlertTitle,
  localizeAnalyticsMetricLabel,
  localizeCanonicalPlanTitle,
  localizeCategoryName,
  localizeCourseTitle,
} from "./platformContentLocale.js";
import { localizedSpecialOfferText } from "../../constants/specialOfferPackage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tEn = createTranslator("en", resources);
const tAr = createTranslator("ar", resources);

describe("FAQ bilingual rendering", () => {
  it("uses English columns in English and keeps Arabic columns in Arabic", () => {
    const item = {
      question: "ما هي المنصة؟",
      answer: "منصة عربية.",
      question_en: "What is the platform?",
      answer_en: "An OrderzHouse platform.",
    };
    assert.equal(getFaqLocalizedText(item, "question", "en", tEn), "What is the platform?");
    assert.equal(getFaqLocalizedText(item, "answer", "en", tEn), "An OrderzHouse platform.");
    assert.equal(getFaqLocalizedText(item, "question", "ar", tAr), "ما هي المنصة؟");
    assert.equal(getFaqLocalizedText(item, "answer", "ar", tAr), "منصة عربية.");
  });

  it("does not show Arabic FAQ copy in English when no English field exists", () => {
    const item = { question: "سؤال عربي فقط", answer: "جواب عربي فقط" };
    assert.equal(getFaqLocalizedText(item, "question", "en", tEn), "");
    assert.equal(containsArabicScript(getFaqLocalizedText(item, "answer", "en", tEn)), false);
  });
});

describe("plan localized display", () => {
  it("prefers the English card bundle over an Arabic database title", () => {
    const display = getLocalizedPlanCardDisplay(
      {
        id: 1,
        name: "orderzhouse_free",
        title: "الاشتراك المجاني",
        description: "مدة الاشتراك: سنة كاملة",
        planFeatures: [{ featureText: "تدريب مجاني", isIncluded: true, sortOrder: 1 }],
      },
      "en",
      tEn,
    );
    assert.equal(display.title, "Free package");
    assert.equal(containsArabicScript(display.description), false);
    assert.equal(containsArabicScript(display.features.join(" ")), false);
  });

  it("keeps Arabic plan copy in Arabic", () => {
    const display = getLocalizedPlanCardDisplay(
      {
        id: 1,
        name: "orderzhouse_free",
        title: "الاشتراك المجاني",
        description: "مدة الاشتراك: سنة كاملة",
      },
      "ar",
      tAr,
    );
    assert.equal(display.title, "الاشتراك المجاني");
    assert.equal(display.description, "مدة الاشتراك: سنة كاملة");
  });
});

describe("plan tabs and taxonomy", () => {
  it("uses the requested English plan tab labels", () => {
    assert.equal(tEn("plans.categories.training"), "Training Plans");
    assert.equal(tEn("plans.categories.membership"), "OrderzHouse Marketplace Membership");
    assert.equal(tAr("plans.categories.training"), "باقات التدريب");
    assert.equal(tAr("plans.categories.membership"), "عضوية سوق أوردرز هاوس");
  });

  it("maps canonical taxonomy slugs and Arabic labels to English", () => {
    assert.equal(localizeCategoryName({ slug: "content-writing", name: "خدمات كتابة المحتوى" }, "en"), "Content writing");
    assert.equal(localizeCategoryName({ name: "تصميم" }, "en"), "Design");
    assert.equal(localizeCategoryName({ name: "برمجة" }, "en"), "Programming");
    assert.equal(localizeCategoryName({ name: "تصميم" }, "ar"), "تصميم");
    assert.equal(localizeCategoryName({ name: "فئة خاصة من الإدارة", nameEn: "" }, "en"), "فئة خاصة من الإدارة");
  });
});

describe("analytics canonical labels", () => {
  it("translates metric and alert keys instead of Arabic database labels", () => {
    assert.equal(
      localizeAnalyticsMetricLabel({ key: "totalUsers", label: "إجمالي المستخدمين" }, tEn),
      "Total users",
    );
    assert.equal(
      localizeAnalyticsAlertTitle({ key: "pending_activations", title: "تفعيل اشتراكات بانتظار الموافقة" }, tEn),
      "Subscription activation awaiting approval",
    );
    assert.equal(
      localizeCanonicalPlanTitle({ planId: 1, planName: "orderzhouse_free", planTitle: "الاشتراك المجاني" }, "en"),
      "Free package",
    );
    assert.equal(
      localizeCourseTitle({ title: "تدريب مجاني على كتابة المحتوى – المستوى الأول" }, "en"),
      "Free content writing training – Level 1",
    );
  });

  it("preserves an admin-authored course title that has no English version", () => {
    assert.equal(localizeCourseTitle({ title: "دورة خاصة بالمؤسسة" }, "en"), "دورة خاصة بالمؤسسة");
  });
});

describe("special offer and legal fallback policy", () => {
  it("shows English special-offer copy for the canonical Arabic package", () => {
    const offer = {
      title: "باقة العرض",
      subtitle: "عرض ترويجي لفترة محدودة — عروض أكثر بسعر خاص.",
      badgeText: "عرض خاص",
      ribbonText: "لفترة محدودة",
      ctaLabel: "احصل على العرض الآن",
      microcopy: "بدون التزام، يمكنك الترقية في أي وقت",
    };
    assert.equal(localizedSpecialOfferText(offer, "title", "en"), "Special offer");
    assert.equal(containsArabicScript(localizedSpecialOfferText(offer, "subtitle", "en")), false);
    assert.equal(localizedSpecialOfferText(offer, "title", "ar"), "باقة العرض");
  });
});

describe("English core content file", () => {
  const contentPath = path.join(__dirname, "../../../../backend/content/bilingualPlatformContent.json");

  it("includes complete English for canonical FAQ and legal pages when the backfill file is present", () => {
    if (!fs.existsSync(contentPath)) {
      assert.fail("backend/content/bilingualPlatformContent.json is required before release");
    }
    const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
    assert.ok(content.faq.length >= 40);
    const slugs = new Set(content.pages.map((page) => page.slug));
    for (const slug of ["terms-conditions", "privacy-policy", "guarantee", "community"]) {
      assert.equal(slugs.has(slug), true, slug);
    }
    const terms = content.pages.find((page) => page.slug === "terms-conditions");
    const privacy = content.pages.find((page) => page.slug === "privacy-policy");
    assert.ok(terms.contentEn.length > 12000);
    assert.ok(privacy.contentEn.length > 4000);
    const englishFields = [
      ...content.faq.flatMap((item) => [item.questionEn, item.answerEn]),
      ...content.pages.flatMap((page) => [page.titleEn, page.menuLabelEn, page.contentEn]),
    ];
    for (const value of englishFields) {
      assert.equal(containsArabicScript(value), false);
    }
    const arabicQuestions = content.faq.map((item) => item.questionAr);
    assert.equal(new Set(arabicQuestions).size, arabicQuestions.length);
  });
});
