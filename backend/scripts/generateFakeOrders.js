const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { pool } = require("../src/config/db");

const PREVIEW_PATH = path.join(__dirname, "..", "sql", "audit", "fake-orders-preview.json");
const MARKER_PREFIX = "__seed_marker:bulk_generated_fake_orders_v3";
const SOURCE_TYPE_MARKER = "__source_type:bulk_generated_fake_orders";
const BAD_BUDGET_VALUES = new Set([29, 37, 54, 66, 83, 118, 247]);
const EXISTING_SIMILARITY_SAMPLE_LIMIT = 6000;
const MAX_ATTEMPTS_PER_RECORD = 250;

const STOPWORDS = new Set(["في", "من", "على", "الى", "إلى", "عن", "مع", "او", "أو", "ثم", "هذا", "هذه", "ذلك", "تلك", "عند", "بعد", "قبل", "ضمن", "حول", "بين", "لدى"]);
const STYLE_NAMES = ["short_direct", "messy_client", "technical_detailed", "vague_request", "urgent_request", "semi_formal", "dialect_light"];

const PHRASE_BANKS = [
  {
    openers: ["السلام عليكم", "مرحبا", "أبحث عن مستقل", "مطلوب تنفيذ", "لدي مشروع"],
    notes: ["الميزانية مرنة حسب الجودة.", "مهم الالتزام بالوقت.", "يفضل خبرة سابقة مشابهة.", "التفاصيل بعد الاتفاق."],
    contexts: ["لإطلاق نسخة جديدة", "ضمن خطة تطوير", "مع تسليم مرحلي", "لتحسين تجربة المستخدم"],
    suffixes: ["لمتجر إلكتروني", "لشركة ناشئة", "لمشروع قائم", "لمنصة خدمات", "لتطبيق داخلي"],
  },
  {
    openers: ["عندي شغل", "نحتاج شخص فاهم", "عندنا منصة", "محتاجين تنفيذ سريع", "لو سمحت"],
    notes: ["نحتاج تواصل سريع.", "الجودة أهم من السرعة لكن الوقت مهم.", "المشروع قابل للتوسعة لاحقا.", "أرسل خطة تنفيذ مختصرة."],
    contexts: ["بنسخة محسنة", "بشكل عملي", "بدون تعقيد", "مع توثيق واضح"],
    suffixes: ["لفريق صغير", "لبراند جديد", "لمكتب عقاري", "لعيادة خاصة", "لمؤسسة تعليمية"],
  },
];
const TITLE_MODIFIERS = ["بأسلوب عملي", "بجودة عالية", "بتسليم واضح", "بنتيجة احترافية", "بتحسينات ملموسة", "بتنفيذ مرتب", "بصياغة دقيقة", "بمخرجات منظمة"];
const TITLE_AUDIENCES = ["لفريق ناشئ", "لشركة صغيرة", "لعميل مباشر", "لمشروع خدمة", "لنشاط تجاري", "لفكرة جديدة", "لاطلاق قريب", "لتطوير قائم"];
const TITLE_NONCE_A = ["حزمة", "نسخة", "مرحلة", "دفعة", "خطة", "نموذج", "تجهيز", "تنفيذ", "صياغة", "مراجعة", "ترتيب", "تحسين"];
const TITLE_NONCE_B = ["أساسية", "متقدمة", "عملية", "مركزة", "متوازنة", "سريعة", "منظمة", "احترافية", "واضحة", "مرنة", "مباشرة", "مناسبة"];

const DOMAIN_SPECS = [
  { key: "web-dev", label: "تطوير ويب", lookup: ["full-stack-web", "backend-dev", "frontend-dev"], keywords: ["موقع", "ويب", "لوحة", "تحكم", "api"], skills: ["JavaScript", "API", "ويب"], ranges: [[200, 500], [300, 500]], durations: [[5, 10, "days"], [7, 14, "days"]], titles: ["تطوير موقع خدمات مع لوحة تحكم", "برمجة منصة حجز مواعيد", "تنفيذ موقع تعريفي تفاعلي", "بناء لوحة تحكم لمتابعة الطلبات"], deliverables: ["ربط الواجهات مع API", "صلاحيات مستخدمين", "تقارير أساسية", "تحسين الأداء على الموبايل"] },
  { key: "wordpress", label: "ووردبريس", lookup: ["cms", "website-design"], keywords: ["ووردبريس", "wordpress", "woocommerce", "elementor"], skills: ["WordPress", "Elementor", "WooCommerce"], ranges: [[100, 200], [150, 200]], durations: [[3, 7, "days"], [5, 10, "days"]], titles: ["تعديل متجر ووردبريس وحل المشاكل", "تطوير موقع WordPress لشركة خدمات", "تحسين سرعة موقع ووردبريس", "ضبط إضافات الدفع والشحن في WooCommerce"], deliverables: ["تهيئة القوالب", "تحسين السرعة", "ضبط الإضافات", "توافق كامل مع الجوال"] },
  { key: "laravel-php", label: "Laravel / PHP", lookup: ["backend-dev", "api-dev"], keywords: ["لارافيل", "php", "api", "mysql"], skills: ["Laravel", "PHP", "MySQL"], ranges: [[200, 500], [100, 300]], durations: [[4, 9, "days"], [7, 12, "days"]], titles: ["حل أخطاء في مشروع Laravel", "تطوير API بنظام Laravel", "تعديل نظام صلاحيات في تطبيق PHP", "تحسين استعلامات قاعدة البيانات في Laravel"], deliverables: ["معالجة الأخطاء", "توثيق endpoints", "اختبار السيناريوهات الأساسية", "رفع الكود بشكل منظم"] },
  { key: "node-react", label: "Node/React/Vue", lookup: ["frontend-dev", "backend-dev", "full-stack-web"], keywords: ["react", "vue", "node", "mern"], skills: ["Node.js", "React", "Vue"], ranges: [[200, 500], [300, 500]], durations: [[5, 10, "days"], [7, 14, "days"]], titles: ["تطوير لوحة تحكم React وربطها بـ Node", "تنفيذ واجهات Vue مع API جاهز", "تحسين مشروع MERN قائم", "إضافة خصائص جديدة في تطبيق Node.js"], deliverables: ["شاشات كاملة", "حالة تحميل وأخطاء", "تحسين الأداء", "تنظيف الكود"] },
  { key: "mobile", label: "تطبيقات الجوال", lookup: ["custom-mobile-apps", "cross-platform-apps"], keywords: ["تطبيق", "موبايل", "flutter", "android", "ios"], skills: ["Flutter", "React Native", "Mobile App"], ranges: [[300, 700], [300, 1000]], durations: [[10, 20, "days"], [14, 25, "days"]], titles: ["تطوير تطبيق حجوزات بسيط للجوال", "تنفيذ تطبيق متابعة طلبات", "تطبيق توصيل مع إشعارات", "ربط تطبيق Flutter مع API جاهز"], deliverables: ["شاشات أساسية", "تسجيل دخول", "إشعارات", "تجهيز نسخة تجريبية"] },
  { key: "uiux", label: "UI/UX", lookup: ["app-ui-design", "website-design", "landing-page-design"], keywords: ["تصميم", "واجهة", "ux", "ui", "figma"], skills: ["UI", "UX", "Figma"], ranges: [[70, 150], [100, 200]], durations: [[3, 6, "days"], [5, 8, "days"]], titles: ["تصميم واجهة تطبيق إدارة مهام", "إعادة تصميم تجربة مستخدم لموقع خدمات", "تصميم Landing Page احترافية", "تحسين تدفق المستخدم داخل لوحة تحكم"], deliverables: ["ملفات Figma منظمة", "تصميم responsive", "نظام ألوان وخطوط", "تسليم assets"] },
  { key: "graphic-brand", label: "تصميم جرافيك وهوية", lookup: ["logo-design", "brand-identity", "personal-logo-design"], keywords: ["شعار", "هوية", "براند"], skills: ["Logo", "Branding", "Illustrator"], ranges: [[50, 100], [70, 150]], durations: [[2, 5, "days"], [3, 7, "days"]], titles: ["تصميم شعار وهوية بصرية لمتجر جديد", "تصميم هوية بسيطة لمشروع ناشئ", "تحديث شعار قائم مع دليل استخدام", "تصميم باقة سوشيال بهوية متناسقة"], deliverables: ["نسخ الشعار", "دليل ألوان", "ملفات مفتوحة", "تطبيقات الهوية"] },
  { key: "social-motion-video", label: "سوشيال/موشن/فيديو", lookup: ["personal-social-media-templates", "digital-print-advertising-design", "marketing-campaign"], keywords: ["سوشيال", "موشن", "فيديو", "ريلز", "مونتاج"], skills: ["Social Media", "Motion", "Video Editing"], ranges: [[70, 150], [100, 150]], durations: [[3, 6, "days"], [5, 10, "days"]], titles: ["تصميم بوستات سوشيال لمدة شهر", "مونتاج فيديوهات قصيرة للحملات", "إعداد قوالب Reels موحدة", "تنفيذ موشن جرافيك تعريفي بسيط"], deliverables: ["قوالب قابلة للتعديل", "مقاسات المنصات", "تسليم منظم", "نسخ متعددة"] },
  { key: "marketing-seo", label: "تسويق وSEO", lookup: ["market-analysis-writing", "ad-copywriting", "social-media-content-writing"], keywords: ["seo", "تسويق", "حملة", "اعلان", "محتوى"], skills: ["SEO", "Marketing", "Meta Ads"], ranges: [[150, 300], [200, 500]], durations: [[7, 14, "days"], [10, 20, "days"]], titles: ["إدارة حملة تسويق رقمي لمتجر", "تحسين SEO لموقع خدمات", "خطة محتوى وإعلانات شهرية", "تحليل منافسين واقتراح خطة تحسين"], deliverables: ["خطة كلمات مفتاحية", "تحسين صفحات رئيسية", "تقارير دورية", "توصيات قابلة للتنفيذ"] },
  { key: "writing-translation-data", label: "كتابة/ترجمة/إدخال بيانات", lookup: ["website-content-writing", "blogs-articles-writing", "technical-writing", "proofreading"], keywords: ["كتابة", "ترجمة", "محتوى", "تدقيق", "ادخال", "بيانات"], skills: ["Writing", "Translation", "Data Entry"], ranges: [[20, 50], [30, 70]], durations: [[2, 5, "days"], [3, 7, "days"]], titles: ["كتابة محتوى عربي لموقع شركة", "ترجمة صفحات موقع من الإنجليزية للعربية", "إدخال بيانات منتجات لمتجر إلكتروني", "صياغة نصوص إعلانية قصيرة"], deliverables: ["محتوى خال من النسخ", "تنسيق واضح", "تسليم على دفعات", "مراجعة لغوية"] },
  { key: "business-systems", label: "ERP/POS/CRM وأتمتة", lookup: ["enterprise-software", "integration-services", "api-dev", "ai"], keywords: ["erp", "crm", "pos", "أتمتة", "تكامل", "نظام"], skills: ["ERP", "CRM", "POS", "Automation"], ranges: [[300, 700], [500, 1000]], durations: [[10, 20, "days"], [14, 30, "days"]], titles: ["تطوير نظام CRM بسيط لإدارة العملاء", "ربط نظام POS مع متجر إلكتروني", "بناء لوحة ERP مصغرة للمخزون", "أتمتة مهام دعم العملاء باستخدام أدوات AI"], deliverables: ["تحليل متطلبات", "تنفيذ المرحلة الأولى", "تكاملات API", "توثيق التشغيل"] },
];

function parseArgs(argv) {
  const out = { count: 100, batchSize: 1000, dryRun: false, insert: false, rollback: false, batchId: null, resume: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") out.dryRun = true;
    else if (raw === "--insert") out.insert = true;
    else if (raw === "--rollback") out.rollback = true;
    else if (raw === "--resume") out.resume = true;
    else if (raw.startsWith("--count=")) out.count = Math.max(1, Number(raw.slice(8)) || 100);
    else if (raw.startsWith("--batch-size=")) out.batchSize = Math.max(100, Math.min(5000, Number(raw.slice(13)) || 1000));
    else if (raw.startsWith("--batch-id=")) out.batchId = raw.slice(11).trim();
  }
  if (!out.dryRun && !out.insert && !out.rollback) out.dryRun = true;
  return out;
}

function assertArgs(args) {
  if (args.rollback && !args.batchId) throw new Error("Rollback requires --batch-id=<id>.");
  if (args.insert && args.rollback) throw new Error("Choose either --insert or --rollback.");
  if (args.dryRun && (args.insert || args.rollback)) throw new Error("--dry-run cannot be combined with --insert/--rollback.");
}

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function shuffle(arr, seed) {
  const a = arr.slice();
  let s = seed + 13;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function randomRecentDate(seed) {
  const now = Date.now();
  const backDays = (seed % 21) + 1;
  const backHours = (seed % 10) + 2;
  return new Date(now - backDays * 24 * 60 * 60 * 1000 - backHours * 60 * 60 * 1000).toISOString();
}

function normalizeArabic(text) {
  return String(text || "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenizeArabic(text) {
  return normalizeArabic(text)
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
}

function hashText(v) {
  return crypto.createHash("sha1").update(normalizeArabic(v)).digest("hex");
}

function jaccardSimilarity(aTokens, bTokens) {
  const sa = new Set(aTokens);
  const sb = new Set(bTokens);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter += 1;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

function charSimilarity(a, b) {
  const x = normalizeArabic(a);
  const y = normalizeArabic(b);
  if (!x.length || !y.length) return 0;
  const len = Math.max(x.length, y.length);
  const n = Math.min(x.length, y.length);
  let samePos = 0;
  for (let i = 0; i < n; i += 1) if (x[i] === y[i]) samePos += 1;
  return samePos / len;
}

function combinedSimilarity(a, b) {
  const jt = jaccardSimilarity(tokenizeArabic(a), tokenizeArabic(b));
  const cs = charSimilarity(a, b);
  return 0.6 * jt + 0.4 * cs;
}

function structureFingerprint(text) {
  return tokenizeArabic(text)
    .slice(0, 14)
    .map((w) => `${w}:${w.length}`)
    .join("|");
}

async function loadSchemaMap() {
  const tables = ["fake_orders", "fake_order_templates", "fake_order_rounds", "categories", "subcategories", "sub_subcategories"];
  const out = {};
  for (const t of tables) {
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [t],
    );
    out[t] = rows.map((r) => r.column_name);
  }
  return out;
}

async function loadHierarchy() {
  const [catRes, subRes, subSubRes] = await Promise.all([
    pool.query(`SELECT id, name, slug FROM categories WHERE is_active = TRUE ORDER BY id`),
    pool.query(`SELECT id, category_id, name, slug FROM subcategories WHERE is_active = TRUE ORDER BY id`),
    pool.query(`SELECT id, subcategory_id, name, slug FROM sub_subcategories WHERE is_active = TRUE ORDER BY id`),
  ]);
  return {
    categories: catRes.rows.map((r) => ({ id: Number(r.id), name: r.name, slug: r.slug })),
    subcategories: subRes.rows.map((r) => ({ id: Number(r.id), category_id: Number(r.category_id), name: r.name, slug: r.slug })),
    subSubcategories: subSubRes.rows.map((r) => ({ id: Number(r.id), subcategory_id: Number(r.subcategory_id), name: r.name, slug: r.slug })),
  };
}

async function loadExistingFingerprintSets() {
  const [tpl, fake] = await Promise.all([pool.query(`SELECT title, description FROM fake_order_templates`), pool.query(`SELECT title, description FROM fake_orders`)]);
  const titleHashSet = new Set();
  const descHashSet = new Set();
  const titleSamples = [];
  const descSamples = [];
  const structureSet = new Set();
  for (const row of [...tpl.rows, ...fake.rows]) {
    const title = String(row.title || "").trim();
    const desc = String(row.description || "").trim();
    if (title) {
      titleHashSet.add(hashText(title));
      structureSet.add(structureFingerprint(title));
      if (titleSamples.length < EXISTING_SIMILARITY_SAMPLE_LIMIT) titleSamples.push(title);
    }
    if (desc) {
      descHashSet.add(hashText(desc));
      structureSet.add(structureFingerprint(desc));
      if (descSamples.length < EXISTING_SIMILARITY_SAMPLE_LIMIT) descSamples.push(desc);
    }
  }
  return { titleHashSet, descHashSet, titleSamples, descSamples, structureSet };
}

function buildStrictDomainMapping(hierarchy) {
  const subById = new Map(hierarchy.subcategories.map((s) => [s.id, s]));
  const catById = new Map(hierarchy.categories.map((c) => [c.id, c]));
  const out = {};
  for (const spec of DOMAIN_SPECS) {
    const allowed = hierarchy.subSubcategories.filter((s3) => spec.lookup.some((needle) => s3.slug === needle || s3.slug.includes(needle)));
    if (!allowed.length) throw new Error(`Strict mapping failed for domain=${spec.key}.`);
    out[spec.key] = allowed.map((s3) => {
      const sub = subById.get(s3.subcategory_id);
      const cat = sub ? catById.get(sub.category_id) : null;
      if (!sub || !cat) throw new Error(`Hierarchy broken around sub_subcategory_id=${s3.id}.`);
      return { category_id: cat.id, subcategory_id: sub.id, sub_subcategory_id: s3.id, reason: `(${cat.name} > ${sub.name} > ${s3.name})` };
    });
  }
  return out;
}

function pickStyle(idx, styleWeights) {
  const total = styleWeights.reduce((s, w) => s + w.weight, 0);
  let x = (idx * 37) % total;
  for (const w of styleWeights) {
    if (x < w.weight) return w.style;
    x -= w.weight;
  }
  return "semi_formal";
}

function styleWeightsForBatch(batchNo) {
  const base = [
    { style: "short_direct", weight: 18 },
    { style: "messy_client", weight: 14 },
    { style: "technical_detailed", weight: 16 },
    { style: "vague_request", weight: 10 },
    { style: "urgent_request", weight: 12 },
    { style: "semi_formal", weight: 16 },
    { style: "dialect_light", weight: 14 },
  ];
  return shuffle(
    base.map((x, i) => ({ ...x, weight: Math.max(8, x.weight + ((batchNo + i) % 5) - 2) })),
    batchNo,
  );
}

function domainWeightsForBatch(batchNo) {
  const out = {};
  for (let i = 0; i < DOMAIN_SPECS.length; i += 1) out[DOMAIN_SPECS[i].key] = 8 + ((batchNo + i * 2) % 9);
  return out;
}

function pickDomainByWeight(weights, idx) {
  const keys = Object.keys(weights);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let x = (idx * 131) % total;
  for (const k of keys) {
    if (x < weights[k]) return k;
    x -= weights[k];
  }
  return keys[0];
}

function avgDescriptionLengthTarget(batchNo) {
  return 220 + ((batchNo % 5) - 2) * 18;
}

function rotateDriftState(driftState, generatedCount) {
  if (generatedCount > 0 && generatedCount % 5000 === 0) {
    driftState.bankIndex = (driftState.bankIndex + 1) % PHRASE_BANKS.length;
    driftState.titleShift += 2;
    driftState.suffixShift += 3;
    driftState.contextShift += 1;
    driftState.dropHotPatterns = true;
  } else {
    driftState.dropHotPatterns = false;
  }
}

function buildDescription(spec, idx, title, style, bank) {
  const opener = pick(bank.openers, idx);
  const deliverableA = pick(spec.deliverables, idx + 1);
  const deliverableB = pick(spec.deliverables, idx + 2);
  const note = pick(bank.notes, idx + 3);
  const projectType = pick(["ويب", "متجر", "تطبيق", "لوحة تحكم", "خدمة رقمية", "نظام داخلي"], idx + 4);
  const scopeUnits = 3 + (idx % 10);
  const deadlineDays = 4 + (idx % 12);
  if (style === "short_direct") return `${opener}، ${title}.\nالمطلوب ${deliverableA} و${deliverableB} خلال ${deadlineDays} أيام.\n${note}`;
  if (style === "messy_client") return `${opener}، عندي ${title} ومحتاج شغل مرتب.\nفي كم نقطة مهمة ${deliverableA} وبعدها ${deliverableB}، وما أبغى تعقيد.\nالوقت تقريبًا ${deadlineDays} أيام.\n${note}`;
  if (style === "technical_detailed") return `${opener}، ${title}.\nالنطاق الفني يتضمن ${scopeUnits} عناصر، مع تركيز على ${deliverableA} و${deliverableB}.\nالمطلوب تنفيذ ${projectType} مع تسليم واضح ومراجعة مرحلية خلال ${deadlineDays} أيام.\n${note}`;
  if (style === "vague_request") return `${opener}، عندي شغل ${title}.\nأحتاج شخص فاهم المجال ويرتب كل شيء، التفاصيل الدقيقة بعد الاتفاق.\nمبدئيا نبدأ بـ ${deliverableA} وبعدها نشوف ${deliverableB}.\n${note}`;
  if (style === "urgent_request") return `${opener}، ${title} بشكل عاجل.\nلازم نخلص ${deliverableA} بسرعة وبعدها ${deliverableB} بدون تأخير.\nالمهلة القصوى ${Math.max(2, Math.floor(deadlineDays / 2))} أيام.\n${note}`;
  if (style === "dialect_light") return `${opener}، ${title}.\nمحتاج شخص شاطر يضبط ${deliverableA} وبعدين ${deliverableB}، والشغل يكون نظيف.\nلو في ملاحظات قولها من البداية عشان نمشي صح.\n${note}`;
  return `${opener}، ${title}.\nالمطلوب تنفيذ ${projectType} مع تركيز على ${deliverableA} و${deliverableB}.\nيفضل خبرة مشابهة، والتسليم المتوقع خلال ${deadlineDays} أيام.\n${note}`;
}

function buildTitle(spec, idx, bank, driftState) {
  const core = pick(spec.titles, idx + driftState.titleShift);
  const suffix = pick(bank.suffixes, idx + driftState.suffixShift);
  const context = pick(bank.contexts, idx + driftState.contextShift);
  const modifier = pick(TITLE_MODIFIERS, idx + driftState.contextShift + 3);
  const audience = pick(TITLE_AUDIENCES, idx + driftState.titleShift + 5);
  const nonce = `${pick(TITLE_NONCE_A, idx + driftState.suffixShift + 7)} ${pick(TITLE_NONCE_B, idx + driftState.contextShift + 11)}`;
  return `${core} ${suffix} ${context} ${modifier} ${audience} ${nonce}`;
}

function makeOrderCandidate(spec, mappingRows, indexWithinSpec, globalIndex, batchId, serial, style, driftState) {
  const mapRow = mappingRows[(indexWithinSpec + globalIndex) % mappingRows.length];
  const range = pick(spec.ranges, indexWithinSpec + driftState.rangeShift);
  const duration = pick(spec.durations, indexWithinSpec + 1 + driftState.durationShift);
  const bank = PHRASE_BANKS[driftState.bankIndex];
  const title = buildTitle(spec, indexWithinSpec + globalIndex, bank, driftState);
  const description = buildDescription(spec, globalIndex, title, style, bank);
  const budget = Math.floor((range[0] + range[1]) / 2);
  return {
    title,
    description,
    style,
    domain: spec.key,
    category_id: mapRow.category_id,
    subcategory_id: mapRow.subcategory_id,
    sub_subcategory_id: mapRow.sub_subcategory_id,
    skills: [...spec.skills, MARKER_PREFIX, SOURCE_TYPE_MARKER, `__batch_id:${batchId}`, `__serial:${serial}`, `__style:${style}`],
    min_budget: range[0],
    max_budget: range[1],
    currency: "JOD",
    min_duration: duration[0],
    max_duration: duration[1],
    duration_unit: duration[2],
    budget_preview: budget,
    is_active: true,
    category_reason: mapRow.reason,
    created_at: randomRecentDate(globalIndex),
    updated_at: randomRecentDate(globalIndex + 7),
  };
}

function keywordsMatchDomain(candidate, spec) {
  const text = normalizeArabic(`${candidate.title} ${candidate.description}`);
  const titleWords = spec.titles.flatMap((t) => tokenizeArabic(t)).slice(0, 20);
  const pool = [...spec.keywords, ...titleWords];
  return pool.some((k) => text.includes(normalizeArabic(k)));
}

function looksMinorWordSwap(candidate, state) {
  const fpTitle = structureFingerprint(candidate.title);
  const fpDesc = structureFingerprint(candidate.description);
  return state.structureSet.has(`${fpTitle}||${fpDesc}`);
}

function validateSingleCandidate(candidate, hierarchy, state) {
  const failures = [];
  const categoryById = new Map(hierarchy.categories.map((x) => [x.id, x]));
  const subcategoryById = new Map(hierarchy.subcategories.map((x) => [x.id, x]));
  const subSubById = new Map(hierarchy.subSubcategories.map((x) => [x.id, x]));
  const spec = DOMAIN_SPECS.find((d) => d.key === candidate.domain);

  const titleHash = hashText(candidate.title);
  const descHash = hashText(candidate.description);
  if (state.titleHashSet.has(titleHash)) failures.push("duplicate_title");
  if (state.descHashSet.has(descHash)) failures.push("duplicate_description");
  if (state.existing.titleHashSet.has(titleHash)) failures.push("existing_title_collision");
  if (state.existing.descHashSet.has(descHash)) failures.push("existing_description_collision");

  if (!categoryById.has(candidate.category_id)) failures.push("invalid_category");
  if (!subcategoryById.has(candidate.subcategory_id)) failures.push("invalid_subcategory");
  if (candidate.sub_subcategory_id != null && !subSubById.has(candidate.sub_subcategory_id)) failures.push("invalid_sub_subcategory");
  const sub = subcategoryById.get(candidate.subcategory_id);
  if (sub && sub.category_id !== candidate.category_id) failures.push("subcategory_category_mismatch");
  const s3 = candidate.sub_subcategory_id != null ? subSubById.get(candidate.sub_subcategory_id) : null;
  if (s3 && s3.subcategory_id !== candidate.subcategory_id) failures.push("sub_sub_subcategory_mismatch");

  if (!(candidate.min_budget < candidate.max_budget)) failures.push("invalid_budget_range");
  if (BAD_BUDGET_VALUES.has(candidate.min_budget) || BAD_BUDGET_VALUES.has(candidate.max_budget)) failures.push("forbidden_budget_value");
  if (!Number.isInteger(candidate.min_budget) || !Number.isInteger(candidate.max_budget)) failures.push("non_integer_budget");

  if (state.existing.titleSamples.some((t) => combinedSimilarity(t, candidate.title) > 0.7)) failures.push("title_similarity_high");
  if (state.existing.descSamples.some((d) => combinedSimilarity(d, candidate.description) > 0.6)) failures.push("description_similarity_high");
  if (looksMinorWordSwap(candidate, state)) failures.push("minor_word_swap_pattern");
  if (spec && !keywordsMatchDomain(candidate, spec)) failures.push("title_keywords_domain_mismatch");

  return failures;
}

function buildGenerationState(existing) {
  return {
    existing,
    titleHashSet: new Set(),
    descHashSet: new Set(),
    structureSet: new Set(),
    rejected: 0,
    regenerated: 0,
    nextSerial: 1,
    styleCounts: Object.fromEntries(STYLE_NAMES.map((s) => [s, 0])),
    domainCounts: Object.fromEntries(DOMAIN_SPECS.map((d) => [d.key, 0])),
    drift: { bankIndex: 0, titleShift: 0, suffixShift: 0, contextShift: 0, rangeShift: 0, durationShift: 0, dropHotPatterns: false },
    totalDescLen: 0,
  };
}

function appendPreview(preview, batchRows) {
  const remaining = Math.max(0, 200 - preview.samples.length);
  if (remaining > 0) preview.samples.push(...batchRows.slice(0, remaining));
}

async function generateBatch({ batchSize, startIndex, strictMapping, hierarchy, state, batchId, batchNo }) {
  const rows = [];
  const rejectStats = {};
  const styleWeights = styleWeightsForBatch(batchNo);
  const domainWeights = domainWeightsForBatch(batchNo);
  const targetAvgLen = avgDescriptionLengthTarget(batchNo);

  while (rows.length < batchSize) {
    const globalIndex = startIndex + rows.length;
    rotateDriftState(state.drift, globalIndex);
    const domainKey = pickDomainByWeight(domainWeights, globalIndex + batchNo * 17);
    const spec = DOMAIN_SPECS.find((d) => d.key === domainKey) || DOMAIN_SPECS[0];
    const mappingRows = strictMapping[spec.key];
    let accepted = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_RECORD; attempt += 1) {
      const serial = state.nextSerial;
      state.nextSerial += 1;
      const style = pickStyle(globalIndex + attempt, styleWeights);
      const candidate = makeOrderCandidate(spec, mappingRows, state.domainCounts[spec.key] + attempt, globalIndex + attempt, batchId, serial, style, state.drift);
      const failures = validateSingleCandidate(candidate, hierarchy, state);
      if (Math.abs(candidate.description.length - targetAvgLen) > 170) failures.push("description_length_outlier");
      if (state.drift.dropHotPatterns && state.styleCounts[style] > Math.max(80, rows.length * 0.4)) failures.push("hot_style_dropped");

      if (!failures.length) {
        accepted = candidate;
        break;
      }
      state.rejected += 1;
      state.regenerated += 1;
      for (const f of failures) rejectStats[f] = (rejectStats[f] || 0) + 1;
    }

    if (!accepted) {
      throw new Error(`Failed to generate valid candidate after ${MAX_ATTEMPTS_PER_RECORD} attempts (global index ${globalIndex}). reject_stats=${JSON.stringify(rejectStats)}`);
    }

    state.titleHashSet.add(hashText(accepted.title));
    state.descHashSet.add(hashText(accepted.description));
    state.structureSet.add(`${structureFingerprint(accepted.title)}||${structureFingerprint(accepted.description)}`);
    state.styleCounts[accepted.style] += 1;
    state.domainCounts[accepted.domain] += 1;
    state.totalDescLen += accepted.description.length;
    rows.push(accepted);
  }

  return { rows, rejectStats, styleWeights, domainWeights };
}

async function getActorId() {
  const { rows } = await pool.query(`SELECT id FROM users WHERE is_active = TRUE AND role IN ('super_admin','admin') ORDER BY id ASC LIMIT 1`);
  return rows[0] ? Number(rows[0].id) : null;
}

async function getResumeInsertedCount(batchId) {
  const marker = `__batch_id:${batchId}`;
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates WHERE skills @> $1::jsonb`, [JSON.stringify([marker])]);
  return Number(rows[0]?.c || 0);
}

async function insertBatchTransactional(client, rows, actorId) {
  await client.query("BEGIN");
  try {
    for (const o of rows) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO fake_order_templates (
          title, description, category_id, subcategory_id, sub_subcategory_id,
          skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
          is_active, created_by, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz,$16::timestamptz
        )`,
        [o.title, o.description, o.category_id, o.subcategory_id, o.sub_subcategory_id, JSON.stringify(o.skills), o.min_budget, o.max_budget, o.currency, o.min_duration, o.max_duration, o.duration_unit, o.is_active, actorId, o.created_at, o.updated_at],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

function nextBatchId() {
  return `bulk_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.floor(Math.random() * 10000)}`;
}

async function runGenerator(args) {
  const [schemaMap, hierarchy, existing] = await Promise.all([loadSchemaMap(), loadHierarchy(), loadExistingFingerprintSets()]);
  const batchId = args.batchId || nextBatchId();
  const actorId = await getActorId();
  const strictMapping = buildStrictDomainMapping(hierarchy);
  const state = buildGenerationState(existing);
  const preview = { mode: args.dryRun ? "dry-run" : "insert", batch_id: batchId, requested_count: args.count, batch_size: args.batchSize, generated_at: new Date().toISOString(), schema_map: schemaMap, samples: [] };

  let alreadyInserted = 0;
  if (args.insert && args.resume) alreadyInserted = await getResumeInsertedCount(batchId);
  let generatedTotal = 0;
  let insertedTotal = alreadyInserted;
  const targetRemaining = Math.max(0, args.count - alreadyInserted);
  if (alreadyInserted > 0) console.log(`Resume mode: found ${alreadyInserted} already inserted for batch_id=${batchId}`);

  const client = args.insert ? await pool.connect() : null;
  try {
    let batchNo = 0;
    while (generatedTotal < targetRemaining) {
      const currentBatchSize = Math.min(args.batchSize, targetRemaining - generatedTotal);
      const { rows, rejectStats, styleWeights, domainWeights } = await generateBatch({
        batchSize: currentBatchSize,
        startIndex: generatedTotal + alreadyInserted,
        strictMapping,
        hierarchy,
        state,
        batchId,
        batchNo,
      });
      appendPreview(preview, rows);
      if (args.insert) {
        // eslint-disable-next-line no-await-in-loop
        await insertBatchTransactional(client, rows, actorId);
        insertedTotal += rows.length;
      }
      generatedTotal += rows.length;
      console.log(`Generated ${generatedTotal + alreadyInserted} / ${args.count} (batch ${rows.length})`);
      console.log(`Batch profile: styles=${JSON.stringify(styleWeights)} domains=${JSON.stringify(domainWeights)}`);
      const rejectedThisBatch = Object.values(rejectStats).reduce((s, x) => s + Number(x), 0);
      if (rejectedThisBatch > 0) console.log(`Rejected/regenerated in batch: ${rejectedThisBatch}`);
      batchNo += 1;
    }
  } finally {
    if (client) client.release();
  }

  fs.mkdirSync(path.dirname(PREVIEW_PATH), { recursive: true });
  fs.writeFileSync(PREVIEW_PATH, JSON.stringify(preview, null, 2), "utf8");

  console.log("---- Summary ----");
  console.log(`batch_id: ${batchId}`);
  console.log(`requested: ${args.count}`);
  console.log(`generated_this_run: ${generatedTotal}`);
  console.log(`inserted_total_for_batch: ${insertedTotal}`);
  console.log(`rejected_total: ${state.rejected}`);
  console.log(`regenerated_total: ${state.regenerated}`);
  const avgLen = generatedTotal ? Math.round(state.totalDescLen / generatedTotal) : 0;
  console.log(`avg_description_length: ${avgLen}`);
  console.log(`preview: ${PREVIEW_PATH}`);
}

async function runRollback(batchId) {
  const marker = `__batch_id:${batchId}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(
      `DELETE FROM fake_order_templates
       WHERE skills @> $1::jsonb
         AND skills @> $2::jsonb`,
      [JSON.stringify([marker]), JSON.stringify([SOURCE_TYPE_MARKER])],
    );
    await client.query("COMMIT");
    console.log(`Rollback complete. Deleted ${rowCount} rows for batch_id=${batchId}.`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  assertArgs(args);
  if (args.rollback) await runRollback(args.batchId);
  else await runGenerator(args);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
