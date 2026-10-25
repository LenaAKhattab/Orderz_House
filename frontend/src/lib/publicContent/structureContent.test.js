import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { structureContent, hasStructuredContent } from "./structureContent.js";

describe("structureContent (public content readability)", () => {
  it("turns •<TAB> lines into one list and keeps the intro sentence as a paragraph", () => {
    const nodes = structureContent("البيانات التي نجمعها\nقد نجمع البيانات، وتشمل:\n•\tالاسم.\n•\tرقم الهاتف.\n\nفقرة بعد القائمة.");
    assert.deepEqual(nodes, [
      { type: "heading", text: "البيانات التي نجمعها" },
      { type: "paragraph", text: "قد نجمع البيانات، وتشمل:" },
      { type: "ul", items: ["الاسم.", "رقم الهاتف."] },
      { type: "paragraph", text: "فقرة بعد القائمة." },
    ]);
  });

  it("numbered section titles become headings; N.<TAB> items become an ordered list", () => {
    const nodes = structureContent("1. ترتيب الحماية والمسؤوليات\n\nتهدف هذه الشروط إلى ما يلي:\n1.\tحماية المنصة.\n2.\tحماية الشركة.");
    assert.equal(nodes[0].type, "heading");
    assert.equal(nodes[0].text, "1. ترتيب الحماية والمسؤوليات");
    assert.deepEqual(nodes[2], { type: "ol", items: ["حماية المنصة.", "حماية الشركة."], start: 1 });
  });

  it("supports ## headings, the last-updated meta line and English text", () => {
    const nodes = structureContent("Last updated: 20-7-2026\n\n## For clients\nLearn how to post your order.");
    assert.deepEqual(nodes, [
      { type: "meta", text: "Last updated: 20-7-2026" },
      { type: "heading", text: "For clients" },
      { type: "paragraph", text: "Learn how to post your order." },
    ]);
  });

  it("never turns punctuated or long sentences into headings and never drops text", () => {
    const long = "هذه جملة طويلة جدًا تشرح تفاصيل كثيرة حول آلية عمل المنصة وحقوق الأطراف المختلفة فيها دون علامة ترقيم";
    const src = `${long}\nالمنصة: موقع أوردرز هاوس.\nسطر أخير`;
    const nodes = structureContent(src);
    assert.equal(nodes[0].type, "paragraph");
    assert.equal(nodes[1].type, "paragraph");
    assert.equal(nodes[2].type, "paragraph", "last line has no following text → not a heading");
    const flat = nodes.flatMap((n) => n.items || [n.text]).join("\n");
    assert.equal(flat, src);
  });

  it("detects when a lede needs rich rendering", () => {
    assert.equal(hasStructuredContent("خطوات واضحة لنشر طلبك."), false);
    assert.equal(hasStructuredContent("كيف تعمل؟\n1. إنشاء الحساب\n\nأنشئ حسابًا."), true);
  });
});
