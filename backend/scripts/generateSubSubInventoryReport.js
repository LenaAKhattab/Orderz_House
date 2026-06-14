const fs = require("fs");
const path = require("path");

const ICON_RULES = [
  { name: "Layout", test: (t) => /wordpress|ووردبريس|elementor|ويب\s*سايت/i.test(t) },
  { name: "ShoppingCart", test: (t) => /shopify|woocommerce|متجر|e-?commerce|تجارة/i.test(t) },
  { name: "Smartphone", test: (t) => /mobile|android|ios|تطبيق|موبايل|flutter|react\s*native/i.test(t) },
  { name: "Bot", test: (t) => /chatbot|bot|روبوت|ذكاء\s*اصطناع|ai\b|gpt/i.test(t) },
  { name: "Database", test: (t) => /database|sql|قاعدة\s*بيانات|backend|خلفي/i.test(t) },
  { name: "Code2", test: (t) => /web|موقع|website|frontend|واجهة|برمج|programming|code|كود/i.test(t) },
  { name: "PenTool", test: (t) => /logo|شعار|brand|هوية/i.test(t) },
  { name: "Monitor", test: (t) => /ui|ux|واجهة\s*مستخدم|تجربة\s*مستخدم/i.test(t) },
  { name: "Brush", test: (t) => /illustrat|رسم|vector|فيكتور/i.test(t) },
  { name: "Camera", test: (t) => /photo|صور|image|تصوير/i.test(t) },
  { name: "Video", test: (t) => /video|فيديو|مونتاج|animation|موشن/i.test(t) },
  { name: "Presentation", test: (t) => /present|عرض|powerpoint|بوربوينت|slides/i.test(t) },
  { name: "Palette", test: (t) => /design|تصميم|graphic|جرافيك/i.test(t) },
  { name: "Image", test: (t) => /banner|بوستر|poster|إعلان\s*مرئي/i.test(t) },
  { name: "Search", test: (t) => /seo|تحسين\s*محرك|search\s*engine/i.test(t) },
  { name: "Megaphone", test: (t) => /marketing|تسويق|ads|إعلان|social|سوشيال/i.test(t) },
  { name: "BarChart3", test: (t) => /analytics|تحليل|data|إحصاء/i.test(t) },
  { name: "Languages", test: (t) => /translat|ترجمة|language|لغة/i.test(t) },
  { name: "Mic", test: (t) => /voice|صوت|audio|تعليق\s*صوتي|podcast/i.test(t) },
  { name: "PenLine", test: (t) => /article|مقال|blog|مدونة|copy|copywriting/i.test(t) },
  { name: "FileText", test: (t) => /content|محتوى|writing|كتابة|text|نص/i.test(t) },
  { name: "Zap", test: (t) => /automation|أتمتة|script|سكربت|tool|أداة/i.test(t) },
  { name: "Settings", test: (t) => /config|setup|إعداد|settings|تكوين/i.test(t) },
  { name: "Wand2", test: (t) => /creative|إبداع|magic|سحر/i.test(t) },
  { name: "Briefcase", test: (t) => /business|أعمال|freelance|مستقل/i.test(t) },
  { name: "Globe", test: (t) => /global|عالمي|international/i.test(t) },
];

const CATEGORY_ICON_FALLBACK = {
  programming: "Code2",
  design: "Palette",
  "content-writing": "FileText",
};

function resolveIcon(row) {
  const text = [
    row.slug,
    row.name,
    row.name_en,
    row.subcategory_slug,
    row.subcategory_name,
    row.category_slug,
    row.category_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const matched = ICON_RULES.find((r) => r.test(text));
  if (matched) return { icon: matched.name, source: "rule" };
  const fb = CATEGORY_ICON_FALLBACK[row.category_slug];
  if (fb) return { icon: fb, source: "category-fallback" };
  return { icon: "Layers", source: "default" };
}

function fmtDate(v) {
  if (!v) return "—";
  return new Date(v).toISOString().replace("T", " ").slice(0, 19);
}

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, "subsub-inventory.json"), "utf8"),
);
const { counts, rows } = data;

const activeRows = rows.filter((r) => r.is_active && r.subcategory_is_active && r.category_is_active);
const inactiveRows = rows.filter((r) => !(r.is_active && r.subcategory_is_active && r.category_is_active));

const withIcons = rows.map((r) => ({ ...r, iconInfo: resolveIcon(r) }));
const defaultOnly = withIcons.filter((r) => r.iconInfo.source === "default");
const nameCounts = {};
rows.forEach((r) => {
  const key = String(r.name || "").trim();
  nameCounts[key] = (nameCounts[key] || 0) + 1;
});
const duplicateNames = Object.entries(nameCounts)
  .filter(([, c]) => c > 1)
  .map(([name, count]) => ({ name, count }));

// Group hierarchy
const grouped = new Map();
for (const r of rows) {
  const cKey = `${r.category_id}|${r.category_name}`;
  if (!grouped.has(cKey)) {
    grouped.set(cKey, {
      category_id: r.category_id,
      category_name: r.category_name,
      category_slug: r.category_slug,
      subs: new Map(),
    });
  }
  const cat = grouped.get(cKey);
  const sKey = `${r.subcategory_id}|${r.subcategory_name}`;
  if (!cat.subs.has(sKey)) {
    cat.subs.set(sKey, {
      subcategory_id: r.subcategory_id,
      subcategory_name: r.subcategory_name,
      subcategory_slug: r.subcategory_slug,
      items: [],
    });
  }
  cat.subs.get(sKey).items.push(withIcons.find((x) => x.id === r.id));
}

const PAGE_SIZE = 16;
const pages = [];
for (let i = 0; i < activeRows.length; i += PAGE_SIZE) {
  pages.push(activeRows.slice(i, i + PAGE_SIZE));
}

const lines = [];
lines.push("# Sub-Sub Category Full Inventory Report");
lines.push("");
lines.push("## Data Sources");
lines.push("- **Database**: PostgreSQL `sub_subcategories` joined with `subcategories`, `categories`");
lines.push("- **Order counts**: `orders.sub_subcategory_id` (real), `fake_orders.sub_subcategory_id` (training)");
lines.push("- **Public API**: `GET /api/public/sub-subcategories?page=&limit=` (same ordering as homepage)");
lines.push("- **Export script**: `backend/scripts/exportSubSubcategoryInventory.js`");
lines.push("- **Soft deletes**: None — deactivation uses `is_active = FALSE` only");
lines.push("");
lines.push("## Summary Totals");
lines.push(`| Metric | Count |`);
lines.push(`|--------|------:|`);
lines.push(`| Total Main Categories | ${counts.main_categories} |`);
lines.push(`| Total Sub Categories | ${counts.sub_categories} |`);
lines.push(`| Total Sub-Sub Categories | ${counts.sub_sub_categories} |`);
lines.push(`| Active Sub-Sub Categories | ${counts.active_sub_sub} |`);
lines.push(`| Inactive Sub-Sub Categories | ${counts.inactive_sub_sub} |`);
lines.push(`| Homepage-eligible (active chain) | ${counts.homepage_eligible} |`);
lines.push("");

lines.push("## Section 11 — Full Inventory (Grouped)");
lines.push("");

for (const cat of [...grouped.values()].sort((a, b) => Number(a.category_id) - Number(b.category_id))) {
  lines.push(`### ${cat.category_name} (\`${cat.category_slug}\`, ID ${cat.category_id})`);
  lines.push("");
  for (const sub of [...cat.subs.values()].sort((a, b) => Number(a.subcategory_id) - Number(b.subcategory_id))) {
    lines.push(`#### → ${sub.subcategory_name} (\`${sub.subcategory_slug}\`, ID ${sub.subcategory_id})`);
    lines.push("");
    lines.push("| ID | Name (AR) | Name (EN) | Slug | Status | Icon | Sort | Created | Updated | Real Orders | Training Orders |");
    lines.push("|---:|---|---|---|:---:|:---:|---:|---|---|---:|---:|");
    for (const item of sub.items) {
      const status = item.is_active ? "active" : "inactive";
      lines.push(
        `| ${item.id} | ${item.name} | ${item.name_en || "—"} | \`${item.slug}\` | ${status} | ${item.iconInfo.icon} | ${item.sort_order} | ${fmtDate(item.created_at)} | ${fmtDate(item.updated_at)} | ${item.real_orders} | ${item.training_orders} |`,
      );
    }
    lines.push("");
  }
}

if (inactiveRows.length > 0) {
  lines.push("## Inactive / Hidden Sub-Sub Categories");
  lines.push("");
  lines.push("| ID | Name (AR) | Slug | Parent Sub | Parent Main | Reason |");
  lines.push("|---:|---|---|---|---|---|");
  for (const r of inactiveRows) {
    const reasons = [];
    if (!r.is_active) reasons.push("sub-sub inactive");
    if (!r.subcategory_is_active) reasons.push("sub inactive");
    if (!r.category_is_active) reasons.push("main inactive");
    lines.push(`| ${r.id} | ${r.name} | \`${r.slug}\` | ${r.subcategory_name} | ${r.category_name} | ${reasons.join(", ")} |`);
  }
  lines.push("");
} else {
  lines.push("## Inactive / Hidden Sub-Sub Categories");
  lines.push("");
  lines.push("None — all 216 sub-subcategories are active, and all parent sub/main categories are active.");
  lines.push("");
}

lines.push("## Section 12 — Homepage Migration Readiness");
lines.push("");
lines.push(`- **Total active sub-sub categories (homepage-eligible)**: ${activeRows.length}`);
lines.push(`- **Pages required at 16/page**: ${Math.ceil(activeRows.length / PAGE_SIZE)}`);
lines.push(`- **Recommended ordering**: \`categories.sort_order → subcategories.sort_order → sub_subcategories.sort_order → id\` (matches \`subSubcategoriesService.listActivePaginated\`)`);
lines.push(`- **Icon mapping**: lucide-react via keyword rules in \`frontend/src/utils/subSubcategoryIcons.js\`; fallback by main category slug; default \`Layers\``);
lines.push(`- **Categories using default icon only (no rule/fallback match)**: ${defaultOnly.length}`);
lines.push(`- **Duplicate Arabic names**: ${duplicateNames.length} name(s) appearing more than once`);
lines.push("");

if (duplicateNames.length) {
  lines.push("### Duplicate Names");
  lines.push("");
  for (const d of duplicateNames) {
    const ids = rows.filter((r) => r.name === d.name).map((r) => r.id);
    lines.push(`- **${d.name}** (${d.count}×) — IDs: ${ids.join(", ")}`);
  }
  lines.push("");
}

if (defaultOnly.length) {
  lines.push("### Default-Icon Items (Layers)");
  lines.push("");
  for (const r of defaultOnly) {
    lines.push(`- ID ${r.id}: ${r.name} (\`${r.slug}\`) — ${r.category_name} → ${r.subcategory_name}`);
  }
  lines.push("");
}

lines.push("### Pagination Breakdown (actual data, 16/page)");
lines.push("");
pages.forEach((pageRows, idx) => {
  lines.push(`**Page ${idx + 1}**`);
  pageRows.forEach((r, i) => {
    const icon = resolveIcon(r).icon;
    lines.push(`${i + 1}. [${r.id}] ${r.name} — \`${r.slug}\` — ${r.category_name} → ${r.subcategory_name} — icon: ${icon}`);
  });
  lines.push("");
});

const out = path.join(__dirname, "subsub-inventory-report.md");
fs.writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Report written: ${out}`);
console.log(`Rows: ${rows.length}, Pages: ${pages.length}, Default icons: ${defaultOnly.length}, Duplicate names: ${duplicateNames.length}`);
