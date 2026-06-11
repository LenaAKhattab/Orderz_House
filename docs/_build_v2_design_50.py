# -*- coding: utf-8 -*-
"""Build validation-v2-design-50.txt — 50 unique v2-compliant design orders."""

import re
import json
from pathlib import Path

OUT = Path(__file__).parent / "validation-v2-design-50.txt"

SUB_FIXES = {
    "تصميم اللوحات الإrشادية واللافتات": "تصميم اللوحات الإرشادية واللافتات",
    "تصميم الإnfoجرafik والبيانات المرئية": "تصميم الإنفوجرافيك والبيانات المرئية",
}

PERSONAL_SUBS = {
    "تصميم الدعوات وبطاقات التهاني", "تحسين وتنسيق الصور الشخصية", "تصميم Mockups",
    "تصميم سيرة ذاتية بشكل إنفوجرافيك", "تصميم المجلات والمطبوعات الشخصية",
    "تصميم مجلة شخصية رقمية", "تصميم شعار شخصي", "قوالب اجتماعية شخصية",
    "بناء العلامة الشخصية", "دليل العلامة الشخصية", "تصميم عروض تقديم شخصية",
    "تصميم الخريطة الزمنية الشخصية", "تصميم الموقع الشخصي أو المدونة",
}

TIER_MIN = {"micro": 80, "small": 80, "medium": 150, "large": 250}
TIER_MAX = {"micro": 150, "small": 150, "medium": 280, "large": 380}

# Load raw orders from companion JSON
DATA = Path(__file__).parent / "_v2_design_orders.json"


def fix_sub(s):
    return SUB_FIXES.get(s, s)


def arabic_word_count(text):
    return len(re.findall(r"[\u0600-\u06FF]+", text))


def format_order(o):
    return f"""نوع الطلب:
{o['type']}
عنوان المشروع:
{o['title']}
وصف المشروع:
{o['desc']}
التصنيف:
خدمات التصميم
التفصيلي:
{o['sub']}
الميزانية:
{o['budget']}
مدة التسليم:
{o['days']}
المرفقات:
{o['attach']}"""


def check_sentence_clones(descriptions):
    sentence_map = {}
    clones = []
    for i, desc in enumerate(descriptions, 1):
        for s in re.split(r"[.!?؟]\s+", desc):
            s = re.sub(r"\s+", " ", s.strip())
            if len(s) < 35:
                continue
            if s in sentence_map and sentence_map[s] != i:
                clones.append({"sentence": s[:90], "orders": [sentence_map[s], i]})
            else:
                sentence_map[s] = i
    return clones


def main():
    orders = json.loads(DATA.read_text(encoding="utf-8"))
    assert len(orders) == 50, len(orders)

    subs = [fix_sub(o["sub"]) for o in orders]
    assert len(set(subs)) >= 45
    personal = sum(1 for s in subs if s in PERSONAL_SUBS)
    assert personal >= 8

    uae = sum(1 for o in orders if o["region"] == "uae")
    gcc = sum(1 for o in orders if o["region"].startswith("gcc"))
    assert uae == 40 and gcc == 10

    descs = [o["desc"] for o in orders]
    clones = check_sentence_clones(descs)

    text = "\n\n".join(format_order({**o, "sub": fix_sub(o["sub"])}) for o in orders) + "\n"
    OUT.write_text(text, encoding="utf-8")

    stats = {
        "orders": len(orders),
        "unique_subs": len(set(subs)),
        "personal_subs": personal,
        "uae": uae,
        "gcc": gcc,
        "clone_sentences": len(clones),
        "word_counts": {},
    }
    for o in orders:
        t = o["tier"]
        wc = arabic_word_count(o["desc"])
        stats["word_counts"].setdefault(t, []).append(wc)

    print(json.dumps(stats, ensure_ascii=False, indent=2))
    if clones:
        print("CLONE WARNINGS:", clones[:5])
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
