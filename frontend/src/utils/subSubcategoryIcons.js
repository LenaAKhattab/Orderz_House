import {
  BarChart3,
  Bot,
  Briefcase,
  Brush,
  Camera,
  Code2,
  Database,
  FileText,
  Globe,
  Image,
  Languages,
  Layers,
  Layout,
  Megaphone,
  Mic,
  Monitor,
  Palette,
  PenLine,
  PenTool,
  Presentation,
  Search,
  Settings,
  ShoppingCart,
  Smartphone,
  Video,
  Wand2,
  Zap,
} from "lucide-react";

const ICON_RULES = [
  { test: (t) => /wordpress|ووردبريس|elementor|ويب\s*سايت/i.test(t), Icon: Layout },
  { test: (t) => /shopify|woocommerce|متجر|e-?commerce|تجارة/i.test(t), Icon: ShoppingCart },
  { test: (t) => /mobile|android|ios|تطبيق|موبايل|flutter|react\s*native/i.test(t), Icon: Smartphone },
  { test: (t) => /chatbot|bot|روبوت|ذكاء\s*اصطناع|ai\b|gpt/i.test(t), Icon: Bot },
  { test: (t) => /database|sql|قاعدة\s*بيانات|backend|خلفي/i.test(t), Icon: Database },
  { test: (t) => /web|موقع|website|frontend|واجهة|برمج|programming|code|كود/i.test(t), Icon: Code2 },
  { test: (t) => /logo|شعار|brand|هوية/i.test(t), Icon: PenTool },
  { test: (t) => /ui|ux|واجهة\s*مستخدم|تجربة\s*مستخدم/i.test(t), Icon: Monitor },
  { test: (t) => /illustrat|رسم|vector|فيكتور/i.test(t), Icon: Brush },
  { test: (t) => /photo|صور|image|تصوير/i.test(t), Icon: Camera },
  { test: (t) => /video|فيديو|مونتاج|animation|موشن/i.test(t), Icon: Video },
  { test: (t) => /present|عرض|powerpoint|بوربوينت|slides/i.test(t), Icon: Presentation },
  { test: (t) => /design|تصميم|graphic|جرافيك/i.test(t), Icon: Palette },
  { test: (t) => /banner|بوستر|poster|إعلان\s*مرئي/i.test(t), Icon: Image },
  { test: (t) => /seo|تحسين\s*محرك|search\s*engine/i.test(t), Icon: Search },
  { test: (t) => /marketing|تسويق|ads|إعلان|social|سوشيال/i.test(t), Icon: Megaphone },
  { test: (t) => /analytics|تحليل|data|إحصاء/i.test(t), Icon: BarChart3 },
  { test: (t) => /translat|ترجمة|language|لغة/i.test(t), Icon: Languages },
  { test: (t) => /voice|صوت|audio|تعليق\s*صوتي|podcast/i.test(t), Icon: Mic },
  { test: (t) => /article|مقال|blog|مدونة|copy|copywriting/i.test(t), Icon: PenLine },
  { test: (t) => /content|محتوى|writing|كتابة|text|نص/i.test(t), Icon: FileText },
  { test: (t) => /automation|أتمتة|script|سكربت|tool|أداة/i.test(t), Icon: Zap },
  { test: (t) => /config|setup|إعداد|settings|تكوين/i.test(t), Icon: Settings },
  { test: (t) => /creative|إبداع|magic|سحر/i.test(t), Icon: Wand2 },
  { test: (t) => /business|أعمال|freelance|مستقل/i.test(t), Icon: Briefcase },
  { test: (t) => /global|عالمي|international/i.test(t), Icon: Globe },
];

const CATEGORY_ICON_FALLBACK = {
  programming: Code2,
  design: Palette,
  "content-writing": FileText,
};

const DEFAULT_ICON = Layers;

function buildSearchText(item = {}) {
  return [
    item.slug,
    item.name,
    item.nameEn,
    item.subcategorySlug,
    item.subcategoryName,
    item.categorySlug,
    item.categoryName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function resolveSubSubcategoryIcon(item = {}) {
  const text = buildSearchText(item);
  const matched = ICON_RULES.find((rule) => rule.test(text));
  if (matched) return matched.Icon;
  const categorySlug = String(item.categorySlug || "").toLowerCase();
  return CATEGORY_ICON_FALLBACK[categorySlug] || DEFAULT_ICON;
}

export function getSubSubcategoryOrdersHref(subSubcategoryId) {
  const id = String(subSubcategoryId || "").trim();
  if (!id) return "/orders";
  return `/orders?filters=${encodeURIComponent(id)}`;
}
