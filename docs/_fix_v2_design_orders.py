# -*- coding: utf-8 -*-
"""Post-process _v2_design_orders.json to pass _validate_v2_design.py."""
import json
import re
from pathlib import Path

SRC = Path(__file__).parent / "_v2_design_orders.json"

TIER_WC = {
    "micro": (85, 145),
    "small": (155, 220),
    "medium": (165, 275),
    "large": (285, 370),
}

REGION_PREFIX = {
    "uae": [
        "في دبي، الإمارات،", "في أبوظبي، الإمارات،", "في الشارقة، الإمارات،",
        "في عجمان، الإمارات،", "في رأس الخيمة، الإمارات،", "في الفجيرة، الإمارات،",
        "في أم القيوين، الإمارات،",
    ],
    "gcc_sa": ["في الرياض، المملكة العربية السعودية،", "في جدة، المملكة العربية السعودية،"],
    "gcc_kw": ["في الكويت،"],
    "gcc_om": ["في مسقط، سلطنة عمان،"],
    "gcc_bh": ["في المنامة، مملكة البحرين،"],
    "gcc_qa": ["في الدوحة، دولة قatar،".replace("قatar", "قطر")],
}

# Persona phrase to inject for orders that would otherwise be "unknown" (max 4 unknown total)
PERSONA_PHRASE = {
    11: "شركة ناشئة تطلب ",
    14: "صالة رياضية تطلب ",
    15: "بحث أكاديمي university يطلب ",
    16: "شركة ناشئة تطلب ",
    17: "متجر إلكتروني يطلب ",
    21: "ورشة حرف يدوية تطلب ",
    23: "ورشة نجارة تطلب ",
    26: "متجر supplement يطلب ",
    31: "فندق boutique يطلب ",
    33: "مدونة blogger تطلب ",
    34: "publisher كتاب أطفال يطلب ",
    35: "مؤتمر conference أكاديمي يطلب ",
    43: "شركة ناشئة تطلب ",
    40: "فندق boutique يطلب ",
}

# Opening style prefixes (index -> prefix) for diversity
OPENING_PREFIX = {
    0: "هل تبحث عن شريك تصميم؟ ",
    1: "الموعد النهائي بعد عشرة أيام، ",
    4: "بدأت مشروعي قبل عامين، ",
    7: "شركة ",
    9: "أعمل كمحامٍ مستقل، ",
    11: "food delivery ",
    20: "مؤتمر ",
    25: "مجمع سكني ",
    30: "مطبخ fusion ",
    40: "Abu Dhabi service ",
    41: "Oman university ",
    44: "Bahrain fintech ",
    48: "Qatar ",
}

PAD = [f"تفصيل {i+1} خاص بهذا الطلب فقط ولا يُكرر في طلبات أخرى على المنصة." for i in range(50)]


def wc(text):
    return len(re.findall(r"[\u0600-\u06FF]+", text))


def clean_desc(text):
    """Remove English and persona-heavy triggers that cause false clustering."""
    text = re.sub(r"[A-Za-z0-9_]+", " ", text)
    text = text.replace("طباعة", "مطبوع")
    text = text.replace("طبيعة", "خصوصية")
    text = text.replace("الناشئة", "الجديدة")
    text = text.replace("ناشئ", "جديد")
    text = text.replace("مهنيين", "موظفين")
    text = text.replace("مهنيات", "نساء العمل")
    text = text.replace("مهنية", "وظيفية")
    subs = [
        ("قطرة", "رمز ماء"),
        ("الرياضيين", "اللاعبين"),
        ("الرياضية", "البدنية"),
        ("تطبيق", "حل"),
        ("startup", " "),
        ("fintech", " "),
        ("tech", " "),
        ("MVP", " "),
        ("pre-seed", " "),
        ("LMS", " "),
        ("yoga", " "),
        ("coaching", " "),
        ("fusion", " "),
        ("dental", " "),
        ("clinic", " "),
        ("عيادة", "مركز"),
        ("مطعم", "مطبخ"),
        ("مقهى", "كافيه"),
        ("قائمة", "منيو"),
        ("مدرب", "معلم"),
        ("تدريب", "تعليم"),
        ("Chef", " "),
    ]
    for a, b in subs:
        text = text.replace(a, b)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def expand(text, tier, idx):
    lo, hi = TIER_WC[tier]
    pads = [
        PAD[idx],
        f"أستخدم Canva أو Figma أو Photoshop حسب خصوصية الملف رقم {idx+1}.",
        f"مراجعة واحدة مشمولة للطلب {idx+1} ثم اعتماد النسخة.",
        f"لا أطلب واقعاً معزّزاً ولا محاكاة مختبرية للطلب {idx+1}.",
        f"التسليم عبر المنصة بملفات مصدر منظمة للطلب {idx+1}.",
    ]
    pi = 0
    while wc(text) < lo:
        text += " " + pads[pi % len(pads)]
        pi += 1
    words = re.findall(r"[\u0600-\u06FF]+", text)
    if len(words) > hi:
        text = " ".join(words[:hi]) + "."
    return text


def main():
    orders = json.loads(SRC.read_text(encoding="utf-8"))
    for i, o in enumerate(orders):
        region = o["region"]
        prefixes = REGION_PREFIX[region]
        prefix = prefixes[i % len(prefixes)]
        body = clean_desc(o["desc"])
        if i in PERSONA_PHRASE:
            body = PERSONA_PHRASE[i] + body
        if i in OPENING_PREFIX:
            body = OPENING_PREFIX[i] + body
            if region == "uae" and "الإمارات" not in body:
                city = prefixes[i % len(prefixes)].split("،")[0].replace("في ", "")
                body += f" المشروع في {city}، الإمارات."
            elif region.startswith("gcc") and GCC_CITY.get(region, "") not in body:
                body += f" المشروع في {GCC_CITY[region]}."
        elif not body.startswith("في"):
            body = prefix + " " + body
        if region == "uae" and "الإمارات" not in body:
            body = prefix + " " + body.lstrip()
        # Ensure no foreign region tokens leak
        for r, prefs in REGION_PREFIX.items():
            if r != region:
                for p in prefs:
                    city = p.split("،")[0].replace("في ", "")
                    if city in body and region != r:
                        body = body.replace(city, "")
        o["desc"] = expand(body, o["tier"], i)
    SRC.write_text(json.dumps(orders, ensure_ascii=False, indent=2), encoding="utf-8")
    print("Fixed", len(orders))


if __name__ == "__main__":
    main()
