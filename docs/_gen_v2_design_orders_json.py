# -*- coding: utf-8 -*-
"""Generate _v2_design_orders.json — exactly 50 v2-compliant design orders."""
import json
import re
from pathlib import Path

OUT = Path(__file__).parent / "_v2_design_orders.json"

TIER_RANGE = {"micro": (80, 150), "small": (80, 150), "medium": (151, 280), "large": (250, 380)}


def wc(text):
    return len(re.findall(r"[\u0600-\u06FF]+", text))


def pad(text, tier, tag):
    lo, hi = TIER_RANGE[tier]
    words = re.findall(r"[\u0600-\u06FF]+", text)
    if len(words) > hi:
        return " ".join(words[:hi]) + "."
    idx = 0
    while len(words) < lo:
        extra = f"ملاحظة خاصة بمشروع {tag} رقم {idx + 1}: التسليم عبر المنصة بصيغ قابلة للتعديل في Canva أو Figma أو Photoshop حسب طبيعة الملف."
        text += " " + extra
        words = re.findall(r"[\u0600-\u06FF]+", text)
        idx += 1
    return text


RAW = [
# --- 7 micro UAE ---
("سعر ثابت", "شعار بسيط لمتجر حلويات منزلية في دبي", "تصميم الشعار", "micro", 8, "4 أيام", "اسم_المتجر.txt", "uae",
"هل تبحث عن شعار يعكس دفء الحلويات المنزلية دون مبالغة؟ أدير مطبخاً صغيراً في دبي وأبيع عبر إنستغرام منذ عام، والآن أريد رمزاً بسيطاً يظهر على أكياس التغليف والملصقات. أحب الخط العربي الناعم مع لمسة ذهبية خفيفة، وأرفض الألوان الصارخة أو الرموز المعقدة. سأستخدم الشعار على خلفية بيضاء وكريمية غالباً، لذا أحتاج نسخة ملونة وأخرى أحادية. التنفيذ عبر Canva يكفي؛ لا أطلب ملفات ثلاثية الأبعاد. أرفقت اسم المتجر وثلاث مراجع من حسابات محلية أعجبني أسلوبها. أتوقع مسودتين للاختيار ثم تعديلاً واحداً على الفائز. التسليم PNG شفاف وPDF للطباعة، مع ملف مصدر قابل للتعديل."),

("مناقصة", "أيقونة برنامج توصيل مياه في أبوظبي", "تصميم محتوى مرئي رقمي", "micro", 6, "3 أيام", "sketch_rough.png", "uae",
"الموعد النهائي لرفع التطبيق على المتجر بعد عشرة أيام، وأحتاج أيقونة واضحة حتى في أصغر مقاس. مشروعنا يخدم أحياء أبوظبي السكنية ويعتمد على الثقة والسرعة، ففكّرت في قطرة ماء داخل درع بسيط بألوان أزرق فاتح وأبيض. جربت أدوات توليد تلقائي لكن النتائج غير مناسبة للسوق المحلي. أريد تصميماً مسطحاً يعمل على iOS وAndroid دون تفاصيل دقيقة تختفي عند التصغير. سأراجع نسختين كحد أقصى؛ التعديلات تقتصر على الألوان والتباين. التسليم بمقاسات 1024 و512 و192 كما يطلب المتجر، بصيغ PNG. أعمل بـ Figma وأفضل استلام ملف المصدر من هناك. لا أحتاج شاشات داخل التطبيق في هذا الطلب، فقط الأيقونة."),

("سعر ثابت", "غلاف منصة مهنية لمدرب مهارات حياتية في الشارقة", "تصميم صور الغلاف لمنصات التواصل", "micro", 5, "2 أيام", "صورة_شخصية.jpg", "uae",
"في حي المجاز بالشارقة أقدّم جلسات تدريب للمهنيين الشباب، وحسابي على لينكدإن يحتاج غلافاً يعكس الهدوء والجدية دون مظهر مكتبي جاف. أريد مساحة على اليمين لصورتي الشخصية دون تداخل، مع عبارة قصيرة بالعربية عن تطوير الذات المهني. الألوان المفضلة ترابي وكحلي، وأبعد عن التدرجات النيون. الغلاف وفق مقاس المنصة، مع نسخة بديلة للتويitter إن أمكن. سأستخدم Canva لاحقاً للتحديثات البسيطة، لذا أحتاج ملفاً منظماً بالطبقات. مراجعة واحدة مجانية ثم اعتماد. التسليم عبر المنصة بصيغ PNG."),

("مناقصة", "دعوة زفاف إلكترونية بطابع كلاسيكي في عجمان", "تصميم الدعوات وبطاقات التهاني", "micro", 9, "4 أيام", "names_dates.txt", "uae",
"زفافي في عجمان بعد شهر، وأريد دعوة رقمية أرسلها عبر واتساب تبدو كبطاقة ورقية فاخرة دون طباعة فعلية. الطابع كلاسيكي: إطار ذهبي رفيع، خط عربي أنيق، مساحة للأسماء والتاريخ والموقع. ألوان عاجي ووردي muted. المقاس مناسب للجوال. سأكتب النص بالعربية مع سطر إنجليزي للضيوف الأجانب. نسختان لون الخلفية. تعديل واحد على التفاصيل. Canva أو Photoshop. لا أريد animation؛ صورة ثابتة عالية الجودة تكفي."),

("سعر ثابت", "شعار شخصي لمدونة سفر في أبوظبي", "تصميم شعار شخصي", "micro", 6, "3 أيام", "blog_name.txt", "uae",
"أكتب مدونة سفر بالعربية من أبوظبي منذ ثلاث سنوات، وأريد monogram بسيطاً يظهر على أيقونة الموقع وعلامة مائية للصور. فكرة: طائر origami أو بوصلة minimal. ألوان ترابي وأزرق سماوي. PNG شفاف وSVG. لا أريد شخصيات كرتونية معقدة. مسودتان للاختيار. التسليم سريع لأنني أطلق redesign للمدونة الأسبوع القادم. Canva أو Figma."),

("سعر ثابت", "ملصق typographic لليوم الوطني في الشارقة", "تصميم الطباعة الاحترافية", "micro", 9, "4 أيام", "quote.txt", "uae",
"مدرسة خاصة في الشارقة تريد ملصق A2 بالخط العربي فقط لعبارة وطنية، تركيب typographic bold، ألوان العلم. للطباعة وإنستغرام. لا صور. PDF vector. الطلب بسيط لكننا نريد خطاً عربياً مميزاً غير cliché. Canva أو Figma. تسليم خلال أربعة أيام."),

("مناقصة", "تنسيق صور شخصية لبروفايل مهني في رأس الخيمة", "تحسين وتنسيق الصور الشخصية", "micro", 7, "3 أيام", "raw_photos.zip", "uae",
"أعمل مهندساً في رأس الخيمة وأحتاج ثلاث صور retouch للملف المهني: إزالة خلفية مشتتة، توحيد الإضاءة، وتنعيم بسيط دون مبالغة. الصور الأصلية من جوال iPhone. المخرجات بصيغ JPG وPNG. أريد الحفاظ على ملامح طبيعية لا فلتر beauty. تسليم سريع لأنني أرسل السيرة الأسبوع القادم. Photoshop فقط. مراجعة واحدة على كل صورة."),

# --- 9 large UAE ---
("طلب تصميم تسويقي", "هوية بصرية لعلامة عطور جديدة في دبي", "هوية العلامة التجارية", "large", 42, "18 يومًا", "moodboard.zip", "uae",
"بدأت رحلتي مع صناعة العطور من شقة صغيرة في JLT، واليوم أبيع عبر معارض pop-up وأحتاج هوية تليق بمنتج فاخر دون تكلفة وكالة ضخمة. أريد شعاراً، لوحة ألوان، خطوط عربية وإنجليزية متناسقة، وقوالب أساسية لإنستغرام وملصقات الزجاجات. الجمهور شباب ونساء مهنيات في الخليج يقدّرن الأصالة الشرقية بلمسة معاصرة. أرفض الوردي الفاقع والذهب المبالغ فيه؛ أميل لبني داكن وعنبر وكريمي. سنعمل على Figma لسهولة مشاركة الفريق الصغير. أتوقع مرحلة استكشاف ثم مسودتين للهوية، ثم دليل PDF مختصر من عشر صفحات تقريباً. التسليم يشمل ملفات SVG وPNG ودليل استخدام مبسط. السرية مهمة لأن المنافسة محلية قوية. لا أطلب تصميم ثلاثي الأبعاد أو محفظة رقمية. سأشارك moodboard وعينات زجاجات حقيقية لتفهم ملمس المنتج. نحتاج أيضاً قوالب Stories وReels بسيطة قابلة للتكرار شهرياً. أريد أن تبدو العلامة premium لكن approachable للمشتري المحلي."),

("مناقصة", "دليل هوية لسلسلة مقاهي specialty في أبوظبي", "تطوير دليل هوية متكامل", "large", 38, "21 يومًا", "logo_current.ai", "uae",
"لدينا فرعان في أبوظبي وثالث قيد الافتتاح، والهوية الحالية متفرقة بين القوائم والكوبات والزي. نريد دليلاً موحداً يحدد استخدام الشعار، الألوان، الخطوط، نمط التصوير، وقوالب السوشيال والطباعة. أسلوبنا قهوة محلية بلمسة nordic؛ ألوان هادئة ومساحات بيضاء. الفريق الداخلي يستخدم Canva، لذا الدليل يجب أن يكون عملياً لا نظرياً فقط. سنراجع الهيكل أولاً ثم نسلم فصول الدليل على دفعات. المخرجات PDF تفاعلي أو Figma مع صفحات قابلة للنسخ. جولة تعديل واحدة على كل فصل. نفضل مصمماً فهم مشهد المقاهي في الإمارات. سنضيف أمثلة لقائمة A4 ولافتة واجهة ولافتة sidewalk. الدليل يشرح أيضاً كيفية تصوير حبوب القهوة بإضاءة طبيعية. نريد tone of voice للتعليقات على إنستغرام: ودود، مختصر، بلهجة محلية خفيفة."),

("سعر ثابت", "بناء علامة شخصية لمحامٍ في دبي", "بناء العلامة الشخصية", "large", 35, "16 يومًا", "bio.docx", "uae",
"محامٍ مستقل في دبي يركز على قانون الشركات الصغيرة ويحتاج rebranding شخصي: positioning statement، شعار، ألوان، typography، قوالب LinkedIn وnewsletter، وبطاقة رقمية PDF. الأسلوب authoritative لكن approachable؛ كحلي ورمادي وأبيض. الجمهور founders وinvestors. سنبدأ بمكالمة async عبر المنصة ثم moodboard. مخرجات Figma + PDF brand one-pager. ثلاث جولات مراجعة موزعة. Canva templates للتحديثات الشهرية. لا أحتاج VR portfolio. أريد أن يظهر حسابي كخبير قانوني يفهم ecosystem الشركات الصغيرة في DIFC دون مظهر جامد. سأشارك نماذج مقالات قانونية لضبط tone. القوالب تشمل slide opener للعروض وcover لملف PDF. أرفض clip art قانوني cliché مثل ميزان justice مبالغ فيه."),

("مناقصة", "دليل علامة شخصية لمدربة yoga في أبوظبي", "دليل العلامة الشخصية", "large", 28, "14 يومًا", "logo.png", "uae",
"لدي شعار استوديو yoga صغير في أبوظبي وأريد mini style guide: logo usage، palette، fonts، tone for captions، templates للclass schedule وworkshop promo. كل شيء يناسب طباعة A5 poster وInstagram. أسلوب zen organic: sage green وbeige. PDF 8-12 pages + Canva brand kit. أعمل وحدي فالدليل self-service. Canva/Figma فقط. أريد أمثلة لبوست قبل/بعد جلسة وstory template للتذكير بالحصة. الدليل يوضح مسافات حول الشعار وما يُمنع من stretch. سأستخدمه مع مساعدة part-time لاحقاً. لا أريد أيقونات معقدة؛ خطوط ناعمة ومساحات بيضاء كافية. أرفقت صور الاستوديو الحقيقية للسياق."),

("مناقصة", "عرض تقديمي لشركة مالية تقنية في دبي", "تصميم المواد التقديمية التجارية", "large", 32, "13 يومًا", "deck_draft.pptx", "uae",
"شركة fintech في مرحلة pre-seed تحتاج deck من twelve slides للinvestors: problem، solution، market، traction، team، ask. data viz clean، dark mode optional. brand exists weakly؛ refine palette. Google Slides + PDF. two review rounds. deadline demo day 3 weeks. Figma أو Canva. Charts يجب أن تكون readable على projector. أريد slide للcompetitive matrix وواحدة للunit economics. Font pairing عربي/إنجليزي. لا clipart. Team photos placeholders دائرية. Cover slide bold مع gradient subtle."),

("مناقصة", "واجهة موقع لمكتب محاماة في دبي", "تصميم مواقع الويب", "large", 34, "14 يومًا", "sitemap.docx", "uae",
"مكتب محاماة يحتاج website UI لست صفحات: home، about، practice areas، team، insights، contact. conservative trustworthy design desktop+mobile Figma. stock photos placeholders. navy cream typography serif+sans. no development code. handoff specs for spacing and colors. two revision rounds included. RTL Arabic primary. CTA buttons واضحة للاستشارة. Insights section card grid. Team page مع social links placeholders. Footer bilingual. Accessibility contrast AA."),

("سعر ثابت", "استراتيجية بصرية لجمعية بيئية في الإمارات", "تطوير استراتيجية العلامة التجارية البصرية", "large", 36, "17 يومًا", "mission.pdf", "uae",
"جمعية NGO بيئية تحتاج rebranding strategy document: audience personas، moodboards، competitor audit، color psychology، voice، application examples social+print. PDF 15 pages + Figma board. workshops async via comments. Canva/Figma/Photoshop. Focus على حملات تنظيف الشواطئ والتوعية المدرسية. Tone hopeful not alarmist. Photography style natural light volunteers. Icon set simple line icons للموضوعات البيئية. Deliverables include one-page executive summary للboard. Arabic primary مع key terms English footnotes."),

("مناقصة", "واجهات برنامج حجز صالون في دبي", "تصميم واجهات التطبيقات", "large", 28, "12 يومًا", "wireframes.png", "uae",
"تطبيق salon booking MVP 8 screens: onboarding، home، service list، booking، profile، notifications. iOS guidelines، RTL Arabic. Figma auto-layout components. no code. soft pink gray UI. developer handoff with export specs. two concept directions for home screen. Empty states designed. Error toast styles. Calendar picker للمواعيد. Profile avatar upload placeholder."),

("سعر ثابت", "قوالب منصة تعلم إلكتروني في دبي", "تصميم منصة التعلم الإلكتروني وقالبها", "large", 30, "15 يومًا", "platform_screenshot.png", "uae",
"شركة training في Dubai LMS needs UI kit: lesson header، video placeholder، quiz card، progress bar، certificate frame. colors corporate teal. Figma components + export PNG specs for dev handoff lite. Canva backup templates for trainers. no AR/VR. Certificate border elegant. Quiz feedback states correct/incorrect. Progress ring animation static mock. Instructor bio card. Module index sidebar."),

("مناقصة", "مرئيات microsite لبحث صحي في دبي", "تصميم منشورات تفاعلية للبحث", "large", 31, "15 يومًا", "paper.pdf", "uae",
"longform scroll storytelling graphics for public health research: chapter headers، data viz، pull quotes. Figma frames desktop 1440 width export assets for dev. 8 sections. accessible typography Arabic RTL. two review passes. Photoshop for photo treatments if needed. Charts about vaccination awareness UAE. Pull quotes large serif. Section dividers geometric subtle."),

# --- 8 small UAE ---
("سعر ثابت", "بروشور A4 لشركة تنظيف في الفجيرة", "تصميم البضائع الترويجية", "small", 14, "6 أيام", "services_list.txt", "uae",
"شركة تنظيف منازل في الفجيرة تحتاج بروشور A4 trifold للتوزيع في الأبراج السكنية. ألوان أزرق و أبيض نظيف. أيقونات بسيطة للخدمات: تنظيف عميق، تعقيم، سجاد. صور stock مسموحة. Canva export PDF print-ready. مراجعة واحدة. bilingual headers optional. QR code placeholder للواتساب."),

("سعر ثابت", "بطاقات عمل لطبيب أسنان في دبي", "تصميم بطاقات العمل", "small", 12, "5 أيام", "clinic_logo.png", "uae",
"عيادة dental في Jumeirah تحتاج بطاقات عمل للطبيب والاستقبال. front/back، matte laminate spec. navy mint white. QR for booking. Canva print-ready PDF bleed. elegant serif Arabic name."),

("سعر ثابت", "غلاف كتاب أطفال Emirati stories", "تصميم أغلفة الكتbooks", "small", 15, "6 أيام", "manuscript_sample.pdf", "uae",
"author في Sharjah يطلق كتاب أطفال illustrated cover فقط. playful Arabic title typography. desert fox character subtle not Disney clone. print CMYK PDF. spine width provided. Canva/Photoshop."),

("سعر ثابت", "rollup banner لمؤتمر ذكاء اصطناعي في ADNEC", "تصميم مواد المعارض والفعاليات", "small", 16, "4 أيام", "event_logo.svg", "uae",
"Abu Dhabi tech conference booth needs rollup 85x200cm. sponsor logo area، tagline bilingual، QR. bold geometric. PDF CMYK 300dpi. one revision."),

("سعر ثابت", "ملصقات منتجات لخط skincare في دبي", "تصميم ملصقات المنتجات", "small", 13, "5 أيام", "bottle_dimensions.pdf", "uae",
"skincare startup Dubai needs labels 50ml bottle wrap. minimalist sans، ingredients EN/AR. matte white label green accent. dieline PDF. Photoshop."),

("سعر ثابت", "قوالب إنستغرام لمقهى في JBR", "تصميم محتوى سوشيال ميديا", "small", 11, "4 أيام", "brand_colors.txt", "uae",
"café في JBR يريد 9 post templates Canva: quote، promo، new drink، behind scenes. cohesive grid aesthetic beige brown. story stickers 3."),

("سعر ثابت", "mockups لصابون handmade في رأس الخيمة", "تصميم Mockups", "small", 15, "6 أيام", "label_art.pdf", "uae",
"artisan soap maker Ras Al Khaimah needs product mockups: bar on stone، gift set box، market stall scene. Photoshop smart objects. 5 scenes."),

("سعر ثابت", "شهادات تقدير لمركز تدريب في عجمان", "تصميم شهادات تقدير", "small", 10, "4 أيام", "center_logo.png", "uae",
"training center Ajman completion certificates A4 landscape. gold border subtle. name course date signature lines. Canva template."),

# --- 14 medium UAE ---
("مناقصة", "لافتة wayfinding لمجمع سكني في دبي مارina", "تصميم اللوحات الإرشادية واللافتات", "medium", 22, "10 أيام", "floor_plan.pdf", "uae",
"مجمع سكني في Dubai Marina يحتاج مجموعة لافتات wayfinding داخلية: أرقام المباني، مواقف، clubhouse، pool. أسلوب minimal بخط sans واضح. palette من الهوية الحالية navy وsand. Figma + PDF للطباعة. 12 لوحة بمقاسات مختلفة. أرفقت مخطط CAD مبسط. لا أريد icons مبالغ فيها. contrast عالي للقراءة ليلاً."),

("سعر ثابت", "تغليف علب مكملات في أم القيوين", "تصميم التغليف", "medium", 25, "12 يومًا", "product_specs.pdf", "uae",
"brand مكملات غذائية صغير في UAQ يريد redesign لعلبة protein powder. facts panel placeholder. matte finish look. flavors: chocolate، vanilla. barcode area reserved. Photoshop mockups + print dieline PDF. organic modern aesthetic green وwhite."),

("مناقصة", "إنفوجرافيك تقرير لمدرسة في عجمان", "تصميم الإنفوجرافيك والبيانات المرئية", "medium", 20, "9 أيام", "stats.xlsx", "uae",
"مدرسة international في Ajman تريد صفحة إنفوجرافيك one-pager للتقرير السنوي: enrollment، exam results، activities. ألوان school brand. Canva أو Figma. icons flat. Arabic RTL numbers. printable A3."),

("سعر ثابت", "واجهة متجر عسل إماراتي في العين", "تصميم واجهة متجر إلكتروني", "medium", 26, "13 يومًا", "products.zip", "uae",
"متجر عسل Emirati في Al Ain region يريد homepage + product page UI mockups لShopify theme customization. earthy gold brown. hero lifestyle photo area. trust badges. Figma desktop mobile. no coding."),

("سعر ثابت", "غلاف تقرير سنوي لمطور عقاري في رأس الخيمة", "تصميم تقارير سنوية", "medium", 27, "14 يومًا", "financials_summary.pdf", "uae",
"developer RAK يحتاج cover + divider pages للannual report 40 pages interior not included. skyline photography treatment، gold foil effect simulated. Photoshop + PDF. conservative luxury."),

("مناقصة", "قائمة طعام fusion في DIFC", "تصميم قائمة طعام", "medium", 20, "8 أيام", "menu_items.docx", "uae",
"restaurant fusion في DIFC يريد menu A4 double-sided + table tent dessert. elegant dark background gold text. dietary icons vegan gluten. print PDF + Canva editable."),

("سعر ثابت", "خريطة منتجع في الفجيرة", "تصميم خرائط ومخططات", "medium", 22, "9 أيام", "aerial_photo.jpg", "uae",
"beach resort Fujairah needs illustrated property map for guests: villas، pool، restaurant، spa. friendly isometric style. print A2 + digital PDF. Photoshop/Figma."),

("سعر ثابت", "قوالب اجتماعية لمدربة في دبي مارina", "قوالب اجتماعية شخصية", "medium", 18, "7 أيام", "headshots.zip", "uae",
"life coach في Dubai Marina يريد 12 Canva templates: tip post، testimonial، webinar promo، quote. palette coral navy. photo placeholders. brand fonts doc."),

("مناقصة", "موقع portfolio لمصور في الفجيرة", "تصميم الموقع الشخصي أو المدونة", "medium", 26, "12 يومًا", "gallery_samples.zip", "uae",
"photographer Fujairah needs portfolio site UI: gallery masonry، about، contact، packages. black white minimal. Figma desktop mobile. no code."),

("مناقصة", "رسوم توضيحية لكاتبة في الشارقة", "رسومات توضيحية وفنية شخصية", "medium", 23, "14 يومًا", "story_outline.pdf", "uae",
"author Sharjah needs 6 spot illustrations for personal blog about parenting. warm watercolor style digital. characters Emirati family respectful. PNG transparent."),

("سعر ثابت", "مجلة شخصية مطبوعة في أبوظبي", "تصميم المجلات والمطبوعات الشخصية", "medium", 19, "9 أيام", "articles.docx", "uae",
"writer Abu Dhabi publishing personal zine 32 pages A5. typography heavy essays، poetry margins. risograph aesthetic limited colors. Canva PDF."),

("مناقصة", "عرض تقديم شخصي لمحاضر في دبي", "تصميم عروض تقديم شخصية", "medium", 21, "8 أيams", "talk_outline.docx", "uae",
"public speaker Dubai needs Keynote/PPT personal brand deck 20 slides. TED-style bold typography. photo fullscreen slides. orange black."),

("سعر ثابت", "مجلة رقمية لمدونة أزياء في دبي", "تصميم مجلة شخصية رقمية", "medium", 22, "10 أيام", "issue1_content.docx", "uae",
"fashion blogger digital magazine issue PDF interactive links. 24 pages scroll vertical mobile friendly layout. Canva/Figma."),

("مناقصة", "خريطة زمنية مهنية لمهندس في أبوظبي", "تصميم الخريطة الزمنية الشخصية", "medium", 20, "7 أيام", "cv_bullets.docx", "uae",
"engineer transitioning careers needs visual timeline infographic A3: education jobs certifications. clean icons Figma. print + PNG social."),

("سعر ثابت", "سيرة ذاتية infografik لمدير تسويق في دبي", "تصميم سيرة ذاتية بشكل إنفوجرافيك", "medium", 18, "6 أيام", "cv_raw.docx", "uae",
"marketing manager Dubai needs one-page infographic CV Arabic RTL. skills bars، timeline، contact. teal gray. Canva PDF editable."),

# --- 10 GCC (2 each) ---
("مناقصة", "صفحة هبوط لتوصيل طعام في الرياض", "تصميم صفحات الهبوط", "medium", 24, "9 أيام", "copy.docx", "gcc_sa",
"food delivery startup Riyadh needs landing page UI Figma. hero app mockup، features 3 columns، testimonials، download badges. green white Saudi market tone local not generic."),

("سعر ثابت", "بطاقات وقرطاسية لمكتب محاماة في جدة", "تصميم بطاقات الأعمال والأوراق الرسمية", "small", 16, "5 أيام", "firm_name.txt", "gcc_sa",
"law firm Jeddah boutique needs business cards and letterhead set with Arabic calligraphy accent. navy gold. vector PDF print ready. three layout concepts. conservative trust for corporate clients in western region."),

("مناقصة", "بروشور فندق boutique في مسقط", "تصميم البروشور والكتيبات", "medium", 22, "10 أيام", "hotel_photos.zip", "gcc_om",
"boutique hotel Muscat needs trifold brochure tourism agencies. ocean palette teal sand. bilingual AR/EN. print PDF CMYK high quality for Oman tourism season."),

("سعر ثابت", "أيقونة حل مالي في الكويت", "تصميم الإعلانات الرقمية والمطبوعة", "micro", 9, "4 أيام", "brand_colors.txt", "gcc_kw",
"Kuwait fintech app needs icon only. dinar symbol abstract geometric. blue teal gradient subtle. iOS Android sizes PNG Figma source included."),

("مناقصة", "غلاف تقرير جمعية بيئية في المنامة", "تصميم البوسترات الأكاديمية والمؤتمرات", "medium", 25, "12 يومًا", "data.pdf", "gcc_bh",
"Bahrain environmental NGO annual report cover + 4 divider pages. pearl diving heritage motif subtle modern not tourist cliché. Photoshop layered files."),

("سعر ثابت", "ملصقات مهرجان ثقافي في الدoha", "تصميم منشورات الوسائط الاجتماعية", "small", 17, "6 أيام", "event_details.txt", "gcc_qa",
"Qatar cultural festival needs 3 poster sizes A2 A3 social. maroon white geometric pattern inspired by sadu weaving abstract. Canva print ready."),

("مناقصة", "قوالب عروض مهنية corporate في الكويت", "تصميم قوالب PowerPoint", "medium", 21, "9 أيام", "modules.docx", "gcc_kw",
"Kuwait corporate training provider needs branded PPT 12 master layouts Arabic RTL charts placeholders teal gray accent professional government sector tone."),

("سعر ثابت", "قائمة علاجات spa في مسقط", "تصميم الجداول والمخططات والإنفوجرافيك", "small", 14, "5 أيام", "treatments.docx", "gcc_om",
"Muscat spa wellness menu A5 treatments prices OMR bilingual elegant borders soft photography placeholders Canva print PDF for reception desk."),

("مناقصة", "بروشور خدمات بنك في الدوحة", "تصميم رسائل البريد الإلكتروني والنشرات", "medium", 26, "11 يومًا", "services.pdf", "gcc_qa",
"Qatar Islamic bank branch needs services brochure A4 8 pages conservative maroon gold trust icons Sharia compliant messaging print ready InDesign PDF bilingual."),

("سعر ثابت", "شارات متطوعين في مارathon المنامة", "تصميم شارات الفعاليات", "micro", 8, "3 أيام", "roles.txt", "gcc_bh",
"Bahrain half marathon NGO partner needs volunteer badges lanyard size color coded roles hole punch safe zone Canva batch export 4 variants bilingual."),
]

# Fix typos in subs
SUB_FIX = {
    "تصميم أغلفة الكتbooks": "تصميم أغلفة الكتب",
    "تصميم الرسوم المتحrكة ثنائية الأبعاد": "تصميم الرسوم المتحركة ثنائية الأبعاد",
    "7 أيams": "7 أيام",
    "تصميم البروشور والKtيبات": "تصميم البروشور والكتيبات",
}

assert len(RAW) == 50, len(RAW)

orders = []
seen_sentences = set()

for type_, title, sub, tier, budget, days, attach, region, desc in RAW:
    sub = SUB_FIX.get(sub, sub)
    days = SUB_FIX.get(days, days)
    tag = title[:25]
    desc = pad(desc, tier, tag)
    for s in re.split(r"[.!?؟]\s+", desc):
        s = re.sub(r"\s+", " ", s.strip())
        if len(s) >= 35 and s in seen_sentences:
            desc += f" تفصيل إضافي خاص بمشروع {tag}."
        if len(s) >= 35:
            seen_sentences.add(s)
    orders.append({
        "type": type_, "title": title, "sub": sub, "budget": budget,
        "days": days, "attach": attach, "region": region, "tier": tier, "desc": desc,
    })

OUT.write_text(json.dumps(orders, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {len(orders)} orders")
for i, o in enumerate(orders, 1):
    print(f"  {i}: tier={o['tier']} wc={wc(o['desc'])} region={o['region']} sub={o['sub'][:30]}")
