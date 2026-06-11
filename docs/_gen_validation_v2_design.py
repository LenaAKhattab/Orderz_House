# -*- coding: utf-8 -*-
"""Generate validation-v2-design-50.txt — Prompt Specification v2.0."""

import re
from collections import Counter
from pathlib import Path

OUT = Path(__file__).parent / "validation-v2-design-50.txt"

PERSONAL_SUBS = {
    "تصميم الدعوات وبطاقات التهاني",
    "تحسين وتنسيق الصور الشخصية",
    "تصميم Mockups",
    "تصميم سيرة ذاتية بشكل إنفوجرافيك",
    "تصميم المجلات والمطبوعات الشخصية",
    "تصميم مجلة شخصية رقمية",
    "تصميم شعار شخصي",
    "قوالب اجتماعية شخصية",
    "بناء العلامة الشخصية",
    "دليل العلامة الشخصية",
    "تصميم عروض تقديم شخصية",
    "تصميم الخريطة الزمنية الشخصية",
    "تصميم الموقع الشخصي أو المدونة",
    "رسومات توضيحية وفنية شخصية",
    "تصميم فيديو شخصي احترافي",
}

EXCLUDED = {
    "تصميم الواقع الافتراضي لمحاكاة مختبرية",
    "تصميم محتوى الواقع المعزّز للمحاضرات",
    "تصميم الهوية الشخصية ثلاثية الأبعاد",
    "تصميم تطبيق محفظة هوية شخصي",
    "تصميم صالحات الواقع المعزّز للمنشورات الشخصية",
}

# Each order: type, title, sub, budget, days, attach, persona, region (uae|gcc), tier, industry, desc
ORDERS = []

def O(type_, title, sub, budget, days, attach, persona, region, tier, industry, desc):
    ORDERS.append({
        "type": type_, "title": title, "sub": sub, "budget": budget,
        "days": days, "attach": attach, "persona": persona, "region": region,
        "tier": tier, "industry": industry, "desc": desc.strip(),
    })

# --- 1 Micro UAE ---
O("سعر ثابت", "شعار بسيط لمتجر حلويات منزلية في دبي", "تصميم الشعار", 8, "4 أيام",
  "اسم_المتجر.txt", "restaurant", "uae", "micro", "food",
  """هل تبحث عن شعار يعكس دفء الحلويات المنزلية دون مبالغة؟ أدير مطبخاً صغيراً في دبي وأبيع عبر إنستغرام منذ عام، والآن أريد رمزاً بسيطاً يظهر على أكياس التغليف والملصقات. أحب الخط العربي الناعم مع لمسة ذهبية خفيفة، وأرفض الألوان الصارخة أو الرموز المعقدة. سأستخدم الشعار على خلفية بيضاء وكريمية غالباً، لذا أحتاج نسخة ملونة وأخرى أحادية. التنفيذ عبر Canva أو Illustrator خفيف يكفي؛ لا أطلب ملفات ثلاثية الأبعاد. أرفقت اسم المتجر وثلاث مراجع من حسابات محلية أعجبني أسلوبها. أتوقع مسودتين للاختيار ثم تعديلاً واحداً على الفائز. التسليم PNG شفاف وPDF للطباعة، مع ملف مصدر قابل للتعديل. الميزانية محدودة لأنني في بداية التوسع، لكنني أقدّر الاحترافية في التواصل عبر المنصة.""")

O("مناقصة", "أيقونة تطبيق توصيل مياه في أبوظبي", "تصميم واجهات التطبيقات", 6, "3 أيام",
  "sketch_rough.png", "startup", "uae", "micro", "utilities",
  """الموعد النهائي لرفع التطبيق على المتجر بعد عشرة أيام، وأحتاج أيقونة واضحة حتى في أصغر مقاس. مشروعنا يخدم أحياء أبوظبي السكنية ويعتمد على الثقة والسرعة، ففكّرت في قطرة ماء داخل درع بسيط بألوان أزرق فاتح وأبيض. جربت أدوات توليد تلقائي لكن النتائج غير مناسبة للسوق المحلي. أريد تصميماً مسطحاً يعمل على iOS وAndroid دون تفاصيل دقيقة تختفي عند التصغير. سأراجع نسختين كحد أقصى؛ التعديلات تقتصر على الألوان والتباين. التسليم بمقاسات 1024 و512 و192 كما يطلب المتجر، بصيغ PNG. أعمل بـ Figma وأفضل استلام ملف المصدر من هناك. لا أحتاج شاشات داخل التطبيق في هذا الطلب، فقط الأيقونة.""")

O("سعر ثابت", "غلاف لينكدإن لمدرب مهارات حياتية في الشارقة", "تصميم صور الغلاف لمنصات التواصل", 5, "2 أيام",
  "صورة_شخصية.jpg", "trainer", "uae", "micro", "coaching",
  """في حي المجاز بالشارقة أقدّم جلسات تدريب للمهنيين الشباب، وحسابي على لينكدإن يحتاج غلافاً يعكس الهدوء والجدية دون مظهر مكتبي جاف. أريد مساحة على اليمين لصورتي الشخصية دون تداخل، مع عبارة قصيرة بالعربية عن تطوير الذات المهني. الألوان المفضلة ترابي وكحلي، وأبعد عن التدرجات النيون. الغلاف 1584×396 وفق مقاس المنصة، مع نسخة بديلة للتويitter إن أمكن. سأستخدم Canva لاحقاً للتحديثات البسيطة، لذا أحتاج ملفاً منظماً بالطبقات. مراجعة واحدة مجانية ثم اعتماد. التسليم عبر المنصة بصيغ PNG وPSD أو Canva link.""")

O("مناقصة", "دعوة زفاف إلكترونية بطابع كلاسيكي في عجمان", "تصميم الدعوات وبطاقات التهاني", 9, "4 أيام",
  "names_dates.txt", "family", "uae", "micro", "events",
  """زفافي في عجمان بعد شهر، وأريد دعوة رقمية أرسلها عبر واتساب تبدو كبطاقة ورقية فاخرة دون طباعة فعلية. الطابع كلاسيكي: إطار ذهبي رفيع، خط عربي أنيق، مساحة للأسماء والتاريخ والموقع. ألوان عاجي ووردي muted. المقاس 1080×1920 للجوال. سأكتب النص بالعربية مع سطر إنجليزي للضيوف الأجانب. نسختان لون الخلفية. تعديل واحد على التفاصيل. Canva أو Photoshop. لا أريد animation؛ صورة ثابتة عالية الجودة تكفي.""")

O("سعر ثابت", "شعار شخصي لمدونة سفر في أبوظبي", "تصميم شعار شخصي", 6, "3 أيام",
  "blog_name.txt", "influencer", "uae", "micro", "travel",
  """أكتب مدونة سفر بالعربية من أبوظبي منذ ثلاث سنوات، وأريد monogram بسيطاً يظهر على أيقونة الموقع وعلامة مائية للصور. فكرة: طائر origami أو بوصلة minimal. ألوان ترابي وأزرق سماوي. PNG شفاف وSVG. لا أريد شخصيات كرتونية معقدة. مسودتان للاختيار. التسليم سريع لأنني أطلق redesign للمدونة الأسبوع القادم. Canva أو Illustrator.""")

O("سعر ثابت", "ملصق typographic لليوم الوطني في الشارقة", "تصميم الطباعة الاحترافية", 9, "4 أيام",
  "quote.txt", "event", "uae", "micro", "culture",
  """مدرسة خاصة في الشارقة تريد ملصق A2 بالخط العربي فقط لعبارة وطنية، تركيب typographic bold، ألوان العلم. للطباعة وإنستغرام. لا صور. PDF vector. الطلب بسيط لكننا نريد خطاً عربياً مميزاً غير cliché. Canva أو Illustrator. تسليم خلال أربعة أيام.""")

O("مناقصة", "تنسيق صور شخصية لبروفايل LinkedIn في رأس الخيمة", "تحسين وتنسيق الصور الشخصية", 7, "3 أيام",
  "raw_photos.zip", "consultant", "uae", "micro", "professional",
  """أعمل مهندساً في رأس الخيمة وأحتاج ثلاث صور retouch للملف المهني: إزالة خلفية مشتتة، توحيد الإضاءة، وتنعيم بسيط دون مبالغة. الصور الأصلية من جوال iPhone. المخرجات 1200×1200 و800×800 بصيغ JPG وPNG. أريد الحفاظ على ملامح طبيعية لا فلتر beauty. تسليم سريع لأنني أرسل السيرة الأسبوع القادم. Photoshop فقط. مراجعة واحدة على كل صورة.""")

# --- Large UAE ---
O("طلب تصميم تسويقي", "هوية بصرية لعلامة عطور ناشئة في دبي", "هوية العلامة التجارية", 42, "18 يومًا",
  "moodboard.zip", "startup", "uae", "large", "retail",
  """بدأت رحلتي مع صناعة العطور من شقة صغيرة في JLT، واليوم أبيع عبر معارض pop-up وأحتاج هوية تليق بمنتج فاخر دون تكلفة وكالة ضخمة. أريد شعاراً، لوحة ألوان، خطوط عربية وإنجليزية متناسقة، وقوالب أساسية لإنستغرام وملصقات الزجاجات. الجمهور شباب ونساء مهنيات في الخليج يقدّرن الأصالة الشرقية بلمسة معاصرة. أرفض الوردي الفاقع والذهب المبالغ فيه؛ أميل لبني داكن وعنبر وكريمي. سنعمل على Figma لسهولة مشاركة الفريق الصغير. أتوقع مرحلة استكشاف ثم مسودتين للهوية، ثم دليل PDF مختصر من عشر صفحات تقريباً. التسليم يشمل ملفات SVG وPNG ودليل استخدام مبسط. السرية مهمة لأن المنافسة محلية قوية. لا أطلب تصميم ثلاثي الأبعاد أو محفظة رقمية.""")

O("مناقصة", "دليل هوية لسلسلة مقاهي specialty في أبوظبي", "تطوير دليل هوية متكامل", 38, "21 يومًا",
  "logo_current.ai", "restaurant", "uae", "large", "hospitality",
  """لدينا فرعان في أبوظبي وثالث قيد الافتتاح، والهوية الحالية متفرقة بين القوائم والكوبات والزي. نريد دليلاً موحداً يحدد استخدام الشعار، الألوان، الخطوط، نمط التصوير، وقوالب السوشيال والطباعة. أسلوبنا قهوة محلية بلمسة nordic؛ ألوان هادئة ومساحات بيضاء. الفريق الداخلي يستخدم Canva، لذا الدليل يجب أن يكون عملياً لا نظرياً فقط. سنراجع الهيكل أولاً ثم نسلم فصول الدليل على دفعات. المخرجات PDF تفاعلي أو Figma مع صفحات قابلة للنسخ. جولة تعديل واحدة على كل فصل. نفضل مصمماً فهم مشهد المقاهي في الإمارات. الميزانية تعكس حجم العمل المتوسط للمستقل.""")

O("سعر ثابت", "بناء علامة شخصية لمحامٍ في دبي", "بناء العلامة الشخصية", 35, "16 يومًا",
  "bio.docx", "consultant", "uae", "large", "legal",
  """محامٍ مستقل في دبي يركز على قانون الشركات الناشئة ويحتاج rebranding شخصي: positioning statement، شعار، ألوان، typography، قوالب LinkedIn وnewsletter، وبطاقة رقمية PDF. الأسلوب authoritative لكن approachable؛ كحلي ورمادي وأبيض. الجمهور founders وinvestors. سنبدأ بمكالمة async عبر المنصة ثم moodboard. مخرجات Figma + PDF brand one-pager. ثلاث جولات مراجعة موزعة. Canva templates للتحديثات الشهرية. لا أحتاج VR portfolio.""")

O("مناقصة", "دليل علامة شخصية لمدربة yoga في أبوظبي", "دليل العلامة الشخصية", 28, "14 يومًا",
  "logo.png", "trainer", "uae", "large", "wellness",
  """لدي شعار استوديو yoga صغير في أبوظبي وأريد mini style guide: logo usage، palette، fonts، tone for captions، templates للclass schedule وworkshop promo. كل شيء يناسب طباعة A5 poster وInstagram. أسلوب zen organic: sage green وbeige. PDF 8-12 pages + Canva brand kit. أعمل وحدي فالدليل self-service. Canva/Figma فقط.""")

O("مناقصة", "pitch deck design لstartup fintech Dubai", "تصميم المواد التقديمية التجارية", 32, "13 يومًا",
  "deck_draft.pptx", "startup", "uae", "large", "fintech",
  """pre-seed fintech 12 slides للinvestors: problem، solution، market، traction، team، ask. data viz clean، dark mode optional. brand exists weakly؛ refine palette. Google Slides + PDF. two review rounds. deadline demo day 3 weeks. Figma أو PowerPoint. Canva acceptable for charts.""")

O("مناقصة", "website homepage UI لlaw firm Dubai", "تصميم مواقع الويب", 34, "14 يومًا",
  "sitemap.docx", "consultant", "uae", "large", "legal",
  """law firm 6-page website UI only: home، about، practice areas، team، insights، contact. conservative trustworthy design desktop+mobile Figma. stock photos placeholders. navy cream typography serif+sans. no development code. handoff specs for spacing and colors. two revision rounds included.""")

O("سعر ثابت", "visual brand strategy لnonprofit environmental UAE", "تطوير استراتيجية العلامة التجارية البصرية", 36, "17 يومًا",
  "mission.pdf", "ngo", "uae", "large", "environment",
  """environment NGO rebranding strategy document: audience personas، moodboards، competitor audit، color psychology، voice، application examples social+print. PDF 15 pages + Figma board. workshops async via comments. Canva/Figma/Photoshop. freelance scope only.""")

O("مناقصة", "UI screens لsalon booking app Dubai", "تصميم واجهات التطبيقات", 28, "12 يومًا",
  "wireframes.png", "startup", "uae", "large", "beauty",
  """salon app MVP 8 screens: onboarding، home، service list، booking، profile، notifications. iOS guidelines، RTL Arabic. Figma auto-layout components. no code. soft pink gray UI. developer handoff with export specs. two concept directions for home screen.""")

O("سعر ثابت", "e-learning module slides template UAE", "تصميم منصة التعلم الإلكتروني وقالبها", 30, "15 يومًا",
  "platform_screenshot.png", "trainer", "uae", "large", "education",
  """training company Dubai LMS needs UI kit: lesson header، video placeholder، quiz card، progress bar، certificate frame. colors corporate teal. Figma components + export PNG specs for dev handoff lite. Canva backup templates for trainers. no AR/VR.""")

O("مناقصة", "interactive research microsite visuals Dubai", "تصميم منشورات تفاعلية للبحث", 31, "15 يومًا",
  "paper.pdf", "student", "uae", "large", "academic",
  """longform scroll storytelling graphics for public health research: chapter headers، data viz، pull quotes. Figma frames desktop 1440 width export assets for dev. 8 sections. accessible typography Arabic RTL. two review passes. Photoshop for photo treatments if needed.""")

# Continue with medium and more orders... I need to complete to 50 with proper Arabic

# I'll write the complete file using a different approach - write the full txt file directly
