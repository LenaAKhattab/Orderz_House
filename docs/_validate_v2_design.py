# -*- coding: utf-8 -*-
"""Validate validation-v2-design-50.txt for Prompt Specification v2.0."""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

FILE = Path(__file__).parent / "validation-v2-design-50.txt"

PERSONAL_SUBS = {
    "بناء العلامة الشخصية", "تصميم شعار شخصي", "دليل العلامة الشخصية",
    "قوالب اجتماعية شخصية", "تصميم الموقع الشخصي أو المدونة",
    "تصميم الدعوات وبطاقات التهاني", "تحسين وتنسيق الصور الشخصية",
    "تصميم Mockups", "رسومات توضيحية وفنية شخصية",
    "تصميم المجلات والمطبوعات الشخصية", "تصميم عروض تقديم شخصية",
    "تصميم القوالب الرقمية", "تصميم فيديو شخصي احترافي",
    "تصميم مجلة شخصية رقمية", "تصميم الخريطة الزمنية الشخصية",
    "تصميم سيرة ذاتية بشكل إنفوجرافيك",
    "تصميم قسم المدونة أو البورتفوليو الشخصي بتجربة UI/UX",
    "تصميم شريط الحياة أو الرسائل الاحتفالية المتحركة",
}

EXCLUDED_SUBS = {
    "تصميم الواقع المعزّز للتعليم",
    "تصميم الواقع الافتراضي لمحاكاة مختبرية",
    "تصميم محتوى الواقع المعزّز للمحاضرات",
    "تصميم الهوية الشخصية ثلاثية الأبعاد",
    "تصميم تطبيق محفظة هوية شخصي",
    "تصميم صالحات الواقع المعزّز للمنشورات الشخصية",
}

SUBHEADING_PATTERNS = [
    r"^\s*الهدف\s*:",
    r"^\s*الألوان\s*:",
    r"^\s*المقاس\s*:",
    r"^\s*المقاسات\s*:",
    r"^\s*المراجع\s*:",
    r"^\s*التسليم\s*:",
    r"^\s*الملفات\s*:",
    r"^\s*الأبعاد\s*:",
    r"^\s*[\u0600-\u06FF]+\s*:\s*$",
]

UAE_MARKERS = [
    "دبي", "أبوظبي", "الشارقة", "عجمان", "رأس الخيمة", "الفجيرة",
    "أم القيوين", "الإمارات", "JLT", "DIFC", "ADNEC", "Dubai", "Abu Dhabi",
    "Sharjah", "Ajman", "Fujairah", "RAK",
]
GCC_MARKERS = {
    "sa": ["الرياض", "جدة", "السعود", "Saudi"],
    "kw": ["الكويت", "Kuwait"],
    "om": ["مسقط", "Oman", "عمان"],
    "bh": ["المنامة", "Bahrain", "البحرين"],
    "qa": ["الدوحة", "Qatar", "قطر"],
}

PERSONA_RULES = [
    ("restaurant", [r"مطعم", r"مقهى", r"مطبخ", r"قائمة", r"chef", r"fusion"]),
    ("startup", [r"ناشئ", r"startup", r"fintech", r"pre-seed", r"tech", r"تطبيق", r"MVP"]),
    ("trainer", [r"مدرب", r"تدريب", r"yoga", r"LMS", r"حصص", r"coaching"]),
    ("consultant", [r"مهندس", r"consultant", r"executive", r"مهني", r"LinkedIn", r"سيرة"]),
    ("family", [r"زفاف", r"خطوبة", r"عيد ميلاد", r"طفل", r"أم في"]),
    ("influencer", [r"مدونة", r"blogger", r"zine", r"influencer", r"مدونة سفر"]),
    ("school", [r"مدرسة", r"school", r"annual report", r"تعليم"]),
    ("retailer", [r"متجر", r"e-commerce", r"Shopify", r"أزياء", r"supplement", r"GIF"]),
    ("artisan", [r"ورشة", r"نجارة", r"حرف"]),
    ("gym", [r"رياضي", r"fitness", r"salon", r"صالة"]),
    ("lawyer", [r"محام", r"law firm", r"DIFC", r"legal"]),
    ("ngo", [r"جمعية", r"NGO", r"tourism board", r"بيئ"]),
    ("student", [r"PhD", r"thesis", r"مؤتمر", r"conference", r"university", r"أكاديم"]),
    ("doctor", [r"عيادة", r"طبي", r"dental", r"clinic"]),
    ("realtor", [r"عقار", r"real estate", r"Marina", r"wayfinding", r"مجمع"]),
    ("hotel", [r"فندق", r"hotel", r"boutique"]),
    ("publisher", [r"كتاب أطفال", r"publisher", r"manuscript"]),
]

OPENING_STYLES = [
    ("question", r"^هل\s"),
    ("deadline", r"^(الموعد|الموعد النهائي|بعد\s+(?:شهر|عشرة))"),
    ("location", r"^(في حي|في\s+(?:دبي|أبوظبي|الشارقة|الرياض|مسقط|الكويت|الدوحة|المنامة))"),
    ("story", r"^(بدأت|أكتب|لدينا فرع)"),
    ("institutional", r"^(مدرسة|مكتب|جمعية|شركة|مؤتمر|مقهى specialty|training company)"),
    ("direct_need", r"^(أعمل|أم في|محامٍ|متجر|مركز|ورشة|online store|private school)"),
    ("project_launch", r"^(food delivery|Abu Dhabi service|Oman university|Bahrain fintech|Qatar)"),
]

TIER_WORD_RANGES = {
    "micro": (80, 150),
    "medium": (150, 280),
    "large": (250, 380),
}

BUDGET_RANGES = {
    "micro": (3, 10),
    "small": (10, 18),
    "medium": (18, 30),
    "large": (30, 50),
}

DIMENSION_CLONE_PATTERNS = [
    r"1920\s*بكسل.*1080.*1920",
    r"للويب نستخدم عرضاً قياسياً ١٩٢٠",
    r"1080×1920",
    r"1920×1080",
    r"1080 وستory 1080×1920",
]

FIELD_ORDER = [
    "نوع الطلب", "عنوان المشروع", "وصف المشروع", "التصنيف",
    "التفصيلي", "الميزانية", "مدة التسليم", "المرفقات",
]


def arabic_word_count(text: str) -> int:
    tokens = re.findall(r"[\u0600-\u06FF]+", text)
    return len(tokens)


def normalize_paragraph(p: str) -> str:
    return re.sub(r"\s+", " ", p.strip())


def parse_orders(text: str) -> list[dict]:
    chunks = re.split(r"\n\s*\n(?=نوع الطلب:)", text.strip())
    orders = []
    for chunk in chunks:
        if not chunk.strip():
            continue
        fields = {}
        for i, fname in enumerate(FIELD_ORDER):
            pattern = rf"{re.escape(fname)}:\s*\n"
            m = re.search(pattern, chunk)
            if not m:
                continue
            start = m.end()
            end = len(chunk)
            for nf in FIELD_ORDER[i + 1 :]:
                nm = re.search(rf"\n{re.escape(nf)}:\s*\n", chunk[start:])
                if nm:
                    end = start + nm.start()
                    break
            fields[fname] = chunk[start:end].strip()
        if fields:
            orders.append(fields)
    return orders


def infer_tier(word_count: int) -> str | None:
    if 80 <= word_count <= 150:
        return "micro"
    if 150 < word_count <= 280:
        return "medium"
    if 250 <= word_count <= 380:
        return "large"
    return None


def budget_tier(budget: int) -> str:
    if 3 <= budget <= 10:
        return "micro"
    if 10 < budget <= 18:
        return "small"
    if 18 < budget <= 30:
        return "medium"
    if 30 < budget <= 50:
        return "large"
    return "out_of_range"


def expected_budget_for_length_tier(tier: str) -> tuple[int, int]:
    if tier == "micro":
        return BUDGET_RANGES["micro"]
    if tier == "medium":
        return (10, 30)  # small or medium
    if tier == "large":
        return (18, 50)  # medium or large
    return (0, 999)


def detect_persona(desc: str, title: str) -> str:
    blob = f"{title}\n{desc}"
    for name, patterns in PERSONA_RULES:
        for pat in patterns:
            if re.search(pat, blob, re.I):
                return name
    return "unknown"


def detect_opening(desc: str) -> str:
    first = desc.strip().split("\n")[0].strip()
    for name, pat in OPENING_STYLES:
        if re.search(pat, first):
            return name
    return "other"


def detect_region(title: str, desc: str) -> str:
    blob = f"{title} {desc}"
    for code, markers in GCC_MARKERS.items():
        if any(m in blob for m in markers):
            return f"gcc_{code}"
    if any(m in blob for m in UAE_MARKERS):
        return "uae"
    return "unknown"


def check_subheadings(desc: str) -> list[str]:
    violations = []
    for line in desc.split("\n"):
        for pat in SUBHEADING_PATTERNS:
            if re.match(pat, line.strip()):
                violations.append(line.strip()[:60])
    return violations


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else FILE
    text = path.read_text(encoding="utf-8")
    orders = parse_orders(text)

    tier_words = defaultdict(list)
    subs = []
    personal_sub_count = 0
    persona_counts = Counter()
    opening_counts = Counter()
    region_counts = Counter()
    subheading_violations = []
    budget_mismatches = []
    excluded_hits = []
    paragraphs_all = []
    dimension_blocks = []
    word_issues = []

    for idx, o in enumerate(orders, 1):
        desc = o.get("وصف المشروع", "")
        title = o.get("عنوان المشروع", "")
        sub = o.get("التفصيلي", "")
        budget_s = o.get("الميزانية", "")
        subs.append(sub)

        if sub in EXCLUDED_SUBS:
            excluded_hits.append({"order": idx, "sub": sub})

        if sub in PERSONAL_SUBS:
            personal_sub_count += 1

        wc = arabic_word_count(desc)
        tier = infer_tier(wc)
        if tier:
            tier_words[tier].append(wc)
        else:
            word_issues.append({"order": idx, "words": wc, "title": title[:40]})

        try:
            budget = int(budget_s.strip())
        except ValueError:
            budget = -1
            budget_mismatches.append({"order": idx, "reason": "non_numeric_budget", "value": budget_s})

        if tier and budget >= 0:
            lo, hi = expected_budget_for_length_tier(tier)
            if not (lo <= budget <= hi):
                budget_mismatches.append({
                    "order": idx,
                    "reason": "length_budget_mismatch",
                    "tier": tier,
                    "words": wc,
                    "budget": budget,
                    "expected": [lo, hi],
                })

        persona = detect_persona(desc, title)
        persona_counts[persona] += 1
        opening_counts[detect_opening(desc)] += 1
        region_counts[detect_region(title, desc)] += 1

        subheading_violations.extend(
            {"order": idx, "line": v} for v in check_subheadings(desc)
        )

        for para in re.split(r"\n\s*\n", desc):
            p = normalize_paragraph(para)
            if len(p) > 80:
                paragraphs_all.append((idx, p))

        for pat in DIMENSION_CLONE_PATTERNS:
            if re.search(pat, desc):
                dimension_blocks.append({"order": idx, "pattern": pat})

    para_texts = [p for _, p in paragraphs_all]
    para_counter = Counter(para_texts)
    clone_paragraphs = [
        {"paragraph_preview": p[:100], "count": c, "orders": [i for i, x in paragraphs_all if x == p]}
        for p, c in para_counter.items()
        if c > 1
    ]

    dim_counter = Counter(
        re.sub(r"\d+", "N", b["pattern"]) for b in dimension_blocks
    )
    clone_dimensions = [
        {"pattern_key": k, "occurrences": v}
        for k, v in dim_counter.items()
        if v > 3
    ]

    uae_n = region_counts.get("uae", 0)
    gcc_n = sum(v for k, v in region_counts.items() if k.startswith("gcc_"))
    total = len(orders)

    tier_stats = {}
    for t, counts in tier_words.items():
        if counts:
            tier_stats[t] = {
                "count": len(counts),
                "min": min(counts),
                "max": max(counts),
                "avg": round(sum(counts) / len(counts), 1),
            }

    persona_over = {k: v for k, v in persona_counts.items() if v > 4}

    stats = {
        "file": str(path),
        "order_count": total,
        "expected_orders": 50,
        "order_count_ok": total == 50,
        "word_count_by_tier": tier_stats,
        "word_count_issues": word_issues,
        "unique_subcategories": len(set(subs)),
        "unique_subcategories_ok": len(set(subs)) >= 45,
        "subcategories_list": sorted(set(subs)),
        "personal_subcategory_count": personal_sub_count,
        "personal_subcategory_ok": personal_sub_count >= 8,
        "uae_count": uae_n,
        "gcc_count": gcc_n,
        "uae_pct": round(100 * uae_n / total, 1) if total else 0,
        "region_distribution": dict(region_counts),
        "uae_ratio_ok": uae_n == 40 and gcc_n == 10,
        "persona_distribution": dict(persona_counts),
        "persona_max_4_violations": persona_over,
        "opening_style_count": len([k for k in opening_counts if k != "other"]),
        "opening_style_distribution": dict(opening_counts),
        "opening_styles_ok": len([k for k in opening_counts if k != "other"]) >= 5,
        "clone_paragraphs": clone_paragraphs[:10],
        "clone_paragraph_count": len(clone_paragraphs),
        "dimension_clone_blocks": clone_dimensions,
        "subheading_violations": subheading_violations[:20],
        "subheading_violation_count": len(subheading_violations),
        "budget_tier_mismatches": budget_mismatches,
        "excluded_subcategory_hits": excluded_hits,
        "all_checks_passed": (
            total == 50
            and len(set(subs)) >= 45
            and personal_sub_count >= 8
            and uae_n == 40
            and gcc_n == 10
            and not persona_over
            and len([k for k in opening_counts if k != "other"]) >= 5
            and not subheading_violations
            and not excluded_hits
            and not budget_mismatches
            and not word_issues
        ),
    }

    out = json.dumps(stats, ensure_ascii=False, indent=2)
    sys.stdout.buffer.write(out.encode("utf-8"))
    sys.stdout.buffer.write(b"\n")
    return 0 if stats["all_checks_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
