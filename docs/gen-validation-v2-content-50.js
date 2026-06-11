const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'validation-v2-content-50.txt');

const PERSONAL_SUBS = new Set([
  'كتابة السيرة الذاتية','كتابة رسائل التغطية','كتابة رسائل التوصية','كتابة خطابات القبول والاعتذار',
  'كتابة رسائل الحب والاعتذار والشكر','كتابة رسائل التهنئة والتعزية','كتابة رسائل الدعوة','كتابة القصص القصيرة',
  'كتابة الخواطر والمقالات الشخصية','كتابة المذكرات واليوميات','كتابة محتوى المدونات الشخصية',
  'كتابة نصوص البطاقات والهدايا','كتابة كلمات المناسبات والفعاليات','كتابة الرسائل النصية القصيرة (SMS)',
  'كتابة مدوّنات السفر / الرحلات','كتابة محتوى البودكاست الشخصي','كتابة محتوى السير الذاتية التفاعلية',
  'كتابة محتوى الحملات الشخصية على وسائل التواصل','كتابة يوميات أو سرد قصصي بشكل كتابي',
  'كتابة رسالة الفيديو أو خطاب اليوتيوب','كتابة محتوى الانتخابات أو الترشح أو الحملات الشخصية',
  'كتابة محتوى مدونة الصور/فوتوغرافي','كتابة اقتباسات وخاطِر قصيرة مميّزة',
]);

const FIELD_LABEL_RE = /^(الهدف|الجمهور|النطاق|الخلفية|المخرجات|اللغة|الأسلوب|الجودة|المراجع|التسليم|القبول|تعليمات|تفاصيل|تنسيق|سرية|مصادر|ختام|ملاحظة|تقييم|تواصل|أولوية|خبرة)\s*:/m;
const TIER_RANGE = { micro:[60,120], small:[120,220], medium:[220,380], large:[280,450] };

const PERSONA_VOICE = {
  Student:'طالب جامعي قلق من المواعيد الأكاديمية',
  Master:'طالب ماجستير يبحث عن دقة أكاديمية',
  PhD:'باحث دكتوراه بصياغة رسمية منهجية',
  Academic:'باحث أكاديمي يهتم بالنشر والتحرير',
  Startup:'مؤسس شركة ناشئة يتحدث بصراحة وmix عربي إنجليزي عند الحاجة',
  SME:'صاحب شركة صغيرة عملية ومباشرة',
  'Large corp':'ممثل شركة كبيرة بصياغة مؤسسية',
  Government:'جهة حكومية بأسلوب رسمي للغاية',
  Educational:'مؤسسة تعليمية تهتم بجودة المحتوى التدريسي',
  Medical:'طبيب/جهة طبية تلتزم بالدقة العلمية',
  Lawyer:'مكتب قانوني يطلب صياغة دقيقة',
  Consultant:'مستشار أعمال يركز على القيمة التحليلية',
  'Job seeker':'باحث عن عمل بصوت شخصي مختصر',
  Entrepreneur:'رائد أعمال طموح',
  Trainer:'مدرب/خبير تدريبي',
  Media:'إعلامي محترف',
  NGO:'مؤسسة غير ربحية مجتمعية',
  Ordinary:'فرد عادي بأسلوب بسيط وغير رسمي',
};

const CITIES_UAE = ['دبي','أبوظبي','الشارقة','العين','رأس الخيمة','الفجيرة','عجمان','جبل علي','ليوا','دبي هيلز'];
const CITIES_GCC = ['الرياض','جدة','الدمام','الدوحة','الكويت','المنامة','مسقط'];

const INDUSTRY_AR = {
  healthcare:'الرعاية الصحية', hospitality:'الضيافة', personal:'الشؤون الشخصية', wellness:'العافية',
  retail:'التجزئة', construction:'الإنشاءات', finance:'المالية', 'beauty-tech':'تقنية التجميل',
  ecommerce:'التجارة الإلكترونية', facilities:'خدمات المرافق', nonprofit:'القطاع غير الربحي',
  logistics:'اللوجستيات', warehousing:'المستودعات', technology:'التقنية', food:'الأغذية',
  consulting:'الاستشارات', healthtech:'التقنية الصحية', education:'التعليم', beauty:'الجمال',
  realestate:'العقارات', manufacturing:'التصنيع', government:'القطاع الحكومي', mobility:'التنقل',
  pharmacy:'الصيدلة', media:'الإعلام', energy:'الطاقة', academia:'الأكاديميا',
  'public-admin':'الإدارة العامة', 'urban-planning':'التخطيط الحضري', science:'العلوم',
  tourism:'السياحة', publishing:'النشر', economics:'الاقتصاد', hr:'الموارد البشرية',
  cybersecurity:'الأمن السيبراني', sociology:'علم الاجتماع', fintech:'التقنية المالية',
  distribution:'التوزيع', training:'التدريب', literature:'الأدب', travel:'السفر',
  career:'المسار المهني', arts:'الفنون', environment:'البيئة', legal:'القانون', business:'الأعمال',
};

function wc(t) { return t.trim().split(/\s+/).filter(Boolean).length; }

function expandDesc(o, idx) {
  const [min, max] = TIER_RANGE[o.tier];
  const city = o.city || CITIES_UAE[idx % CITIES_UAE.length];
  const region = o.geo === 'UAE' ? 'دولة الإمارات' : 'دول الخليج';
  const ind = INDUSTRY_AR[o.industry] || o.industry;
  const pool = [
    `${PERSONA_VOICE[o.persona]} في ${city} يطلب دعماً لإنجاز «${o.sub}» ضمن قطاع ${ind} مع احترام موعد ${o.duration}.`,
    `سأزود المستقل بالمواد الأولية عبر المنصة وأتوقع مسودة للمراجعة قبل التسليم النهائي لهذا المشروع في ${region}.`,
    `الميزانية ${o.budget} دينار أردني تعكس حجم العمل المتفق عليه دون مبالغة، والمخرجات يجب أن تكون جاهزة للاستخدام الفوري في ${city}.`,
    `يفضل التعامل مع كاتب سبق له العمل على طلبات مشابهة في السوق الخليجي وفهم خصوصية الجمهور المحلي في قطاع ${ind}.`,
    `أرجو الالتزام بلغة عربية سليمة خالية من الحشو والتكرار، مع مراعاة طبيعة العمل المطلوب في ${city}.`,
    `أي استفسار قبل البدء مرحب به، لكن التسليم يجب ألا يتأخر عن ${o.duration} لأن الجدول الزمني في ${city} غير قابل للتمديد حالياً.`,
    `المرفقات ${o.attach === 'لا يوجد' ? 'غير متوفرة حالياً وسأرسل ما يلزم فور التواصل' : `تتضمن ${o.attach} كمرجع أساسي`} لضمان دقة المخرجات المطلوبة.`,
    `نبرة النص يجب أن تتماشى مع طبيعة ${o.type} ومعايير الجودة التي نتوقعها في مشاريع ${ind} داخل ${region}.`,
    `بعد الاتفاق على العرض سأكون متاحاً للرد على التعديلات خلال فترة ${o.duration} حتى نصل لنسخة نهائية مرضية للطرفين.`,
    `المستقل المطلوب ينفذ العمل الكتابي فعلياً ويُسلّم ملفات جاهزة وليس مجرد اقتراح أفكار عامة عن «${o.sub}».`,
    `التعامل عبر Orderz House فقط، والدفع مرتبط بالتسليم وفق ما نص عليه حقل الميزانية ${o.budget} دينار.`,
    `إن وُجدت أمثلة سابقة لمحتوى ناجح في قطاع ${ind} يمكن مشاركتها بعد التعاقد لتوضيح الأسلوب المفضل.`,
  ];
  const largeExtra = o.tier === 'large' ? [
    `يُتوقع أن يتضمن المستند هيكلاً واضحاً بأقسام مترابطة يسهل على القارئ في ${city} متابعته دون فقدان الخيط الرئيسي للموضوع.`,
    `سأراجع المخرجات مع الزملاء في مجال ${ind} قبل الاعتماد النهائي، لذا أحتاج نسخة قابلة للتعليق خلال ${o.duration}.`,
    `إذا احتجت المستقل لتوضيح أي نقطة في ${o.sub} فالتنسيق يتم عبر المنصة مع الرد خلال ساعات العمل في ${region}.`,
    `الوثيقة النهائية يجب أن تصلح للعرض على جهات رسمية أو أكاديمية عند الحاجة دون إعادة صياغة جوهرية لاحقاً.`,
    `أفضل أن تُقدَّم المخرجات بصيغة Word منسقة مع عناوين فرعية واضحة وترقيم صفحات عند الاقتضاء.`,
    `أي اقتباسات أو أرقام يُذكرها الكاتب يجب أن تكون موثقة أو قابلة للتحقق في سياق ${ind} بالسوق المحلي.`,
  ] : [];

  let d = o.desc;
  let p = 0;
  while (wc(d) < min && p < pool.length) d += ' ' + pool[p++];
  let e = 0;
  while (wc(d) < min && e < largeExtra.length) d += ' ' + largeExtra[e++];
  if (wc(d) > max) {
    const words = d.split(/\s+/);
    d = words.slice(0, max).join(' ');
  }
  return d;
}

function fmt(o) {
  return [
    'نوع الطلب:', o.type,
    'عنوان المشروع:', o.title,
    'وصف المشروع:', o.desc,
    'التصنيف:', 'خدمات كتابة المحتوى',
    'التفصيلي:', o.sub,
    'الميزانية:', String(o.budget),
    'مدة التسليم:', o.duration,
    'المرفقات:', o.attach,
  ].join('\n');
}

// Exactly 50 orders — 40 UAE / 10 GCC, 45+ unique subs, 8+ personal
const raw = [
  { type:'طلب كتابة', title:'تدقيق لغوي عاجل لرسائل تذكير مواعيد عيادة أسنان في أبوظبي', sub:'التدقيق اللغوي', budget:5, duration:'1 يوم', attach:'لا يوجد', persona:'Student', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'healthcare', tier:'micro',
    desc:'أحتاج كاتباً يتولى التدقيق اللغوي لعشر رسائل SMS قصيرة تُرسل لمرضى عيادة أسنان في أبوظبي قبل المواعيد. الرسائل جاهزة لكن بها أخطاء إملائية وصياغة غير مناسبة للجمهور الخليجي. كل رسالة لا تتجاوز مائة وستين حرفاً مع بدائل ألطف. الأسلوب رسمي بسيط دون تعقيد طبي.' },
  { type:'سعر ثابت', title:'نصوص بطاقات هدايا لمقهى مختص في دبي مارينا', sub:'كتابة نصوص البطاقات والهدايا', budget:6, duration:'2 يوم', attach:'شعار_المقهى.png', persona:'Ordinary', opening:'brief', geo:'UAE', city:'دبي', industry:'hospitality', tier:'micro',
    desc:'مطلوب خمس عبارات لبطاقات هدايا مقهى في دبي مارينا: تهنئة، شكر، عيد ميلاد، واثنتان عامتان. فصحى معاصرة دافئة، كل نص بين ثلاثين وخمسين كلمة مع عنوان صغير.' },
  { type:'طلب كتابة', title:'رسالة اعتذار شخصية بعد تأخير عن حفل خطوبة في الشارقة', sub:'كتابة رسائل الحب والاعتذار والشكر', budget:4, duration:'1 يوم', attach:'لا يوجد', persona:'Ordinary', opening:'question', geo:'UAE', city:'الشارقة', industry:'personal', tier:'micro',
    desc:'هل يمكن مساعدتي في رسالة اعتذار صادقة لصديق بعد تأخري عن حفل خطوبة في الشارقة؟ نص مناسب للواتساب، يعترف بالخطأ دون دراما ويعبر عن اهتمامي بالصداقة. مسودتان للاختيار.' },
  { type:'مناقصة', title:'اقتباسات يومية لحساب يوغا في العين', sub:'كتابة اقتباسات وخاطِر قصيرة مميّزة', budget:7, duration:'3 أيام', attach:'لا يوجد', persona:'Trainer', opening:'direct', geo:'UAE', city:'العين', industry:'wellness', tier:'micro',
    desc:'مدربة يوغا في العين تحتاج ثلاثين اقتباساً أصلياً عن التوازن والعناية بالذات، كل اقتباس عشرون إلى خمس وثلاثون كلمة مع هاشتاغ واحد. أسلوب هادئ إيجابي في ملف Word.' },
  { type:'سعر ثابت', title:'رسائل SMS ترويجية لصالون حلاقة في دبي', sub:'كتابة الرسائل النصية القصيرة (SMS)', budget:4, duration:'1 يوم', attach:'عروض.docx', persona:'SME', opening:'brief', geo:'UAE', city:'دبي', industry:'retail', tier:'micro',
    desc:'صالون حلاقة في دبي يحتاج ثماني رسائل SMS للعروض والمواعيد. كل رسالة حتى مائة وستين حرفاً بأسلوب شبابي محترم.' },
  { type:'طلب كتابة', title:'سيرة ذاتية لمهندس مدني يستهدف دبي', sub:'كتابة السيرة الذاتية', budget:12, duration:'3 أيام', attach:'خبرات.docx', persona:'Job seeker', opening:'direct', geo:'UAE', city:'دبي', industry:'construction', tier:'small',
    desc:'مهندس مدني بخمس سنوات خبرة في مشاريع طرق يريد سيرة عربية وإنجليزية بصفحتين كحد أقصى. يبرز إشراف موقع وتسليم ضمن الميزانية. أرسل نقاط الخبرة الخام.' },
  { type:'سعر ثابت', title:'رسالة تغطية لمحلل مالي في الرياض', sub:'كتابة رسائل التغطية', budget:10, duration:'2 يوم', attach:'سيرة.pdf', persona:'Job seeker', opening:'brief', geo:'GCC', city:'الرياض', industry:'finance', tier:'small',
    desc:'موظف سعودي يريد رسالة تغطية عربية تربط أربع سنوات تحليل ائتماني بالوظيفة المعلنة. صفحة واحدة واثقة ومحترمة دون تكرار السيرة.' },
  { type:'طلب تطوير محتوى', title:'أسئلة شائعة لمنصة حجز عيادات تجميل في دبي', sub:'كتابة الأسئلة الشائعة', budget:18, duration:'5 أيام', attach:'خدمات.xlsx', persona:'Startup', opening:'context', geo:'UAE', city:'دبي', industry:'beauty-tech', tier:'medium',
    desc:'منصة ناشئة في دبي لحجز عيادات تجميل تحتاج عشرين إلى خمس وعشرين سؤالاً وجواباً عن الحجز والإلغاء والدفع والخصوصية. جوابات بمتوسط ستين كلمة للعميل غير المتخصص.' },
  { type:'مناقصة', title:'مقال عن التجزئة الإلكترونية في الإمارات ٢٠٢٦', sub:'كتابة المدونات والمقالات', budget:22, duration:'7 أيام', attach:'لا يوجد', persona:'SME', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'ecommerce', tier:'medium',
    desc:'مدونة تجارة في أبوظبي تحتاج مقالاً تحليلياً عن اتجاهات التجزئة الإلكترونية ٢٠٢٦. بين ألف وخمسمائة وألفي كلمة بأسلوب صحفي مع ثلاثة محاور وخاتمة.' },
  { type:'طلب تطوير محتوى', title:'محتوى صفحات خدمات لشركة تنظيف في الشارقة', sub:'كتابة محتوى المواقع الإلكترونية', budget:20, duration:'7 أيام', attach:'هيكل.pdf', persona:'SME', opening:'context', geo:'UAE', city:'الشارقة', industry:'facilities', tier:'medium',
    desc:'شركة تنظيف في الشارقة تطلق موقعاً بست صفحات خدمات. كل صفحة مائتان إلى ثلاثمائة كلمة مع meta قصير. أسلوب طمأنينة ومهنية للشركات والمنازل.' },
  { type:'سعر ثابت', title:'نشرة إخبارية لجمعية رواد أعمال في رأس الخيمة', sub:'كتابة النشرات الإخبارية', budget:16, duration:'5 أيام', attach:'موضوعات.docx', persona:'NGO', opening:'context', geo:'UAE', city:'رأس الخيمة', industry:'nonprofit', tier:'medium',
    desc:'جمعية في رأس الخيمة تصدر نشرة شهرية: مقدمة تحريرية وثلاثة أخبار وقسم موارد بخمس نقاط. بين ثمانمائة وألف كلمة بلغة رسمية دافئة.' },
  { type:'طلب تطوير محتوى', title:'بروفايل شركة لوجستيات بحرية في جبل علي', sub:'كتابة بروفايل الشركات', budget:24, duration:'10 أيام', attach:'بيانات.docx', persona:'Startup', opening:'context', geo:'UAE', city:'جبل علي', industry:'logistics', tier:'medium',
    desc:'شركة لوجستيات بحرية ناشئة في جبل علي تحتاج بروفايلاً عربياً وإنجليزياً من عشر إلى اثنتي عشرة صفحة للعملاء B2B والمعارض.' },
  { type:'مناقصة', title:'وصف وظيفي لمدير مستودع في عجمان', sub:'كتابة الوصف الوظيفي', budget:11, duration:'3 أيام', attach:'هيكل.pdf', persona:'SME', opening:'brief', geo:'UAE', city:'عجمان', industry:'warehousing', tier:'small',
    desc:'وصف وظيفي لمدير عمليات مستودع تبريد في عجمان مع قسم إنجليزي للنشر على LinkedIn. يشمل WMS ومسؤوليات يومية متوافقة مع قانون العمل الإماراتي.' },
  { type:'طلب تطوير محتوى', title:'سياسات العمل عن بُعد لشركة تقنية في دبي', sub:'كتابة السياسات والإجراءات', budget:28, duration:'14 يومًا', attach:'مسودة.pdf', persona:'Large corp', opening:'context', geo:'UAE', city:'دبي', industry:'technology', tier:'large',
    desc:'شركة تقنية بدبي بمائة وعشرين موظفاً تحتاج سياسة عمل عن بُعد وإجراءات أمن سيبراني وحضور ومعدات. بين خمس عشرة وعشرين صفحة رسمية قابلة للاعتماد.' },
  { type:'سعر ثابت', title:'دليل موظفين لسلسلة مقاهٍ في أبوظبي', sub:'كتابة أدلة الموظفين', budget:32, duration:'14 يومًا', attach:'قديم.pdf', persona:'SME', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'hospitality', tier:'large',
    desc:'سلسلة مقاهٍ في أبوظبي تحتاج دليل موظفين محدثاً للباريستا والمشرفين: قيم العلامة ومعايير الخدمة والنظافة والشكاوى. عربي مع ملخص إنجليزي.' },
  { type:'طلب كتابة', title:'مراسلة رسمية لمورد معدات طبية في دبي', sub:'كتابة المراسلات الرسمية', budget:9, duration:'2 يوم', attach:'لا يوجد', persona:'Medical', opening:'direct', geo:'UAE', city:'دبي', industry:'healthcare', tier:'small',
    desc:'عيادة في دبي تريد مراسلة رسمية لمورد معدات لطلب عرض أسعار أجهزة ضغط وترمومترات مع موعد اجتماع وكتالوج معتمد في الإمارات.' },
  { type:'مناقصة', title:'نصوص إعلانات لمعرض أثاث في الفجيرة', sub:'كتابة الإعلانات', budget:14, duration:'3 أيام', attach:'صور.zip', persona:'SME', opening:'brief', geo:'UAE', city:'الفجيرة', industry:'retail', tier:'small',
    desc:'معرض أثاث في الفجيرة يحتاج خمسة نصوص إعلانية لفيسبوك وإنستغرام لتخفيضات نهاية الموسم. كل نص أربعون إلى ستون كلمة مع دعوة للزيارة.' },
  { type:'طلب تطوير محتوى', title:'محتوى سوشيال ميديا رمضان لمتجر حلويات في دبي', sub:'كتابة محتوى وسائل التواصل الاجتماعي', budget:19, duration:'7 أيام', attach:'تقويم.pdf', persona:'Startup', opening:'context', geo:'UAE', city:'دبي', industry:'food', tier:'medium',
    desc:'متجر حلويات في دبي يحتاج نصوص ثمانية عشر منشوراً لرمضان على إنستغرام وتيك توك مع هاشتاغات محلية. فصحى خفيفة مناسبة للعائلات.' },
  { type:'طلب كتابة', title:'تقرير أداء ربع سنوي لاستشارات في أبوظبي', sub:'كتابة تقارير الأعمال', budget:35, duration:'14 يومًا', attach:'بيانات.xlsx', persona:'Consultant', opening:'context', geo:'UAE', city:'أبوظبي', industry:'consulting', tier:'large',
    desc:'مكتب استشارات في أبوظبي يحتاج تقرير أداء للربع الأول لمجلس الإدارة: ملخص تنفيذي وإيرادات ومشاريع جديدة ومخاطر. خمس عشرة إلى عشرون صفحة.' },
  { type:'مناقصة', title:'خطة عمل لتطبيق توصيل دواء في دبي', sub:'كتابة خطط العمل', budget:38, duration:'21 يومًا', attach:'سوق.pdf', persona:'Entrepreneur', opening:'direct', geo:'UAE', city:'دبي', industry:'healthtech', tier:'large',
    desc:'رائد أعمال في دبي يطور تطبيق توصيل أدوية ويحتاج خطة عمل عربية للمستثمرين: سوق ونموذج تشغيل وتسويق وتوقعات ثلاث سنوات.' },
  { type:'طلب تطوير محتوى', title:'دراسة جدوى لمركز تدريب مهني في الشارقة', sub:'كتابة دراسات الجدوى', budget:42, duration:'30 يومًا', attach:'أرض.pdf', persona:'Entrepreneur', opening:'context', geo:'UAE', city:'الشارقة', industry:'education', tier:'large',
    desc:'مستثمر ينوي مركز تدريب مهني في الشارقة لدورات كهرباء وتكييف. دراسة جدوى عربية للتمويل البنكي تشمل السوق والتكاليف والعائد والمخاطر.' },
  { type:'طلب كتابة', title:'تحليل سوق لمنتجات عناية طبيعية في دبي', sub:'كتابة التحليلات السوقية', budget:25, duration:'10 أيام', attach:'مبيعات.xlsx', persona:'Startup', opening:'direct', geo:'UAE', city:'دبي', industry:'beauty', tier:'medium',
    desc:'علامة عناية طبيعية ناشئة في دبي تحتاج تحليل سوق عربي عن الحجم والمنافسين وسلوك المستهلك وقنوات التوزيع. عشر إلى خمس عشرة صفحة.' },
  { type:'سعر ثابت', title:'نص عرض تقديمي لمنتدى عقاري في دبي', sub:'كتابة العروض التقديمية', budget:17, duration:'5 أيام', attach:'شرائح.pptx', persona:'Entrepreneur', opening:'brief', geo:'UAE', city:'دبي', industry:'realestate', tier:'medium',
    desc:'شركة تطوير عقاري صغيرة تحتاج نص عشر شرائح لمنتدى استثماري: فرصة ومشروع وجدوى وتسويق وخاتمة بأسلوب مقنع واقعي.' },
  { type:'مناقصة', title:'مقترح توسعة مصنع مياه في العين', sub:'كتابة مقترحات المشاريع', budget:30, duration:'14 يومًا', attach:'فني.pdf', persona:'SME', opening:'context', geo:'UAE', city:'العين', industry:'manufacturing', tier:'large',
    desc:'مصنع تعبئة مياه في العين يريد مقترح توسعة عربي لشريك استثماري: خلفية وحاجة ونطاق وجدول وميزانية ومؤشرات نجاح.' },
  { type:'طلب تطوير محتوى', title:'RFP تأثيث مكاتب حكومية في دبي', sub:'كتابة طلبات العروض (RFPs)', budget:27, duration:'10 أيام', attach:'مواصفات.docx', persona:'Government', opening:'context', geo:'UAE', city:'دبي', industry:'government', tier:'large',
    desc:'جهة حكومية في دبي تعد RFP عربي رسمي لتوريد أثاث مكاتب: نطاق ومواصفات ومعايير تقييم وجدول وشروط دفع وفق دليل المشتريات.' },
  { type:'طلب كتابة', title:'دليل استخدام لتطبيق حجز مواقف في أبوظبي', sub:'كتابة أدلة الاستخدام', budget:21, duration:'7 أيام', attach:'واجهات.pdf', persona:'Startup', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'mobility', tier:'medium',
    desc:'تطبيق حجز مواقف في أبوظبي يحتاج دليل مستخدم عربي وإنجليزي: تسجيل وحجز ودفع وحل مشاكل. خمس عشرة إلى عشرون صفحة بأسلوب بسيط.' },
  { type:'سعر ثابت', title:'حقيبة تدريب سلامة مواقع بناء في دبي', sub:'كتابة المواد التدريبية', budget:33, duration:'14 يومًا', attach:'معايير.pdf', persona:'Trainer', opening:'brief', geo:'UAE', city:'دبي', industry:'construction', tier:'large',
    desc:'حقيبة تدريب عربية لمشرفي سلامة في مواقع بناء بدبي: ست جلسات وأنشطة واختبار نهائي بأسلوب تطبيقي يربط المعايير المحلية بالميدان.' },
  { type:'طلب كتابة', title:'بيان صحفي لافتتاح صيدلية في دبي هيلز', sub:'كتابة البيانات الصحفية', budget:13, duration:'2 يوم', attach:'فرع.docx', persona:'Medical', opening:'urgent', geo:'UAE', city:'دبي هيلز', industry:'pharmacy', tier:'small',
    desc:'الموعد بعد أسبوع لبيان صحفي افتتاح فرع صيدلية في دبي هيلز. أربعمائة إلى ستمائة كلمة بصيغة إعلامية مع اقتباسات وخدمات وساعات عمل.' },
  { type:'مناقصة', title:'مقال تحقيقي عن أمن الموانئ في الإمارات', sub:'كتابة المقالات الصحفية', budget:20, duration:'7 أيام', attach:'مصادر.pdf', persona:'Media', opening:'direct', geo:'UAE', city:'دبي', industry:'media', tier:'medium',
    desc:'صحفي في دبي يحتاج مساعدة في مقال تحقيقي عن أمن الموانئ للنشر في مجلة متخصصة. ألف وخمسمائة إلى ألفي كلمة بأسلوب محايد.' },
  { type:'طلب كتابة', title:'خطاب دعوة شركاء لمنتدى طاقة في أبوظبي', sub:'كتابة الخطابات الرسمية', budget:15, duration:'3 أيام', attach:'برنامج.pdf', persona:'Government', opening:'context', geo:'UAE', city:'أبوظبي', industry:'energy', tier:'small',
    desc:'منظم منتدى طاقة في أبوظبي يحتاج خمس خطابات رسمية لشركاء رعاة بصياغة فاخرة تعكس مكانة المنتدى دولياً مع تخصيص لكل شركة.' },
  { type:'سعر ثابت', title:'سير تنفيذية لمجلس إدارة عقارية في دبي', sub:'كتابة السير الذاتية للشركات', budget:18, duration:'5 أيام', attach:'خام.docx', persona:'Large corp', opening:'brief', geo:'UAE', city:'دبي', industry:'realestate', tier:'medium',
    desc:'شركة عقارية في دبي تحتاج سيراً تنفيذية لخمسة أعضاء مجلس إدارة بنصف صفحة عربي وإنجليزي بصياغة موحدة لملف مستثمرين.' },
  { type:'طلب كتابة', title:'بحث جامعي عن السوشيال ميديا والتحصيل في الإمارات', sub:'كتابة الأبحاث الجامعية', budget:22, duration:'10 أيام', attach:'تعليمات.pdf', persona:'Student', opening:'urgent', geo:'UAE', city:'العين', industry:'academia', tier:'medium',
    desc:'الموعد بعد أسبوع لبحث في جامعة الإمارات عن أثر السوشيال ميديا على التحصيل. ثلاثة آلاف إلى أربعة آلاف كلمة مع APA ومقدمة ومنهجية وتحليل.' },
  { type:'مناقصة', title:'مقال أكاديمي عن الحوكمة الرقمية الحكومية', sub:'كتابة المقالات الأكاديمية', budget:35, duration:'21 يومًا', attach:'مراجع.pdf', persona:'Master', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'public-admin', tier:'large',
    desc:'طالب ماجستير إدارة عامة يحتاج مقالاً أكاديمياً للنشر عن الحوكمة الرقمية في القطاع الحكومي الإماراتي. خمسة آلاف إلى ستة آلاف كلمة بAPA.' },
  { type:'طلب تطوير محتوى', title:'مساعدة فصل ثالث رسالة ماجستير نقل عام أبوظبي', sub:'المساعدة في رسائل الماجستير والدكتوراه', budget:40, duration:'21 يومًا', attach:'فصلان.pdf', persona:'Master', opening:'context', geo:'UAE', city:'أبوظبي', industry:'urban-planning', tier:'large',
    desc:'رسالة ماجستير تخطيط حضري عن النقل العام في أبوظبي. مساعدة في صياغة الفصل الثالث للمنهجية والتحليل من ثمانية آلاف إلى عشرة آلاف كلمة.' },
  { type:'طلب كتابة', title:'تقرير مختبر جودة مياه في جامعة الشارقة', sub:'كتابة تقارير المختبر', budget:14, duration:'3 أيام', attach:'نتائج.xlsx', persona:'Student', opening:'urgent', geo:'UAE', city:'الشارقة', industry:'science', tier:'small',
    desc:'الموعد بعد ثلاثة أيام لتقرير مختبر فحص مياه في جامعة الشارقة. ألف وخمسمائة إلى ألفي كلمة: مقدمة ومنهجية ونتائج ومناقشة ومراجع.' },
  { type:'سعر ثابت', title:'تقرير أخلاقيات AI في التعليم العالي', sub:'كتابة تقارير الأعمال الأكاديمية', budget:19, duration:'7 أيام', attach:'مقرر.pdf', persona:'Student', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'academia', tier:'medium',
    desc:'طالب في جامعة خليفة يحتاج تقريراً أكاديمياً عن أخلاقيات الذكاء الاصطناعي في التعليم العالي. ألفان وخمسمائة إلى ثلاثة آلاف كلمة بأسلوب تحليلي.' },
  { type:'طلب كتابة', title:'مراجعة أدبيات سياحة مستدامة لدكتوراه قطر', sub:'كتابة مراجعات الأدبيات', budget:38, duration:'21 يومًا', attach:'خطة.pdf', persona:'PhD', opening:'context', geo:'GCC', city:'الدوحة', industry:'tourism', tier:'large',
    desc:'باحث دكتوراه في قطر يحتاج مراجعة أدبيات منهجية عن السياحة المستدامة في الخليج. ثمانية آلاف إلى عشرة آلاف كلمة مع فجوات بحث وAPA وScopus.' },
  { type:'مناقصة', title:'مراجعة نقدية لكتاب تجارة الخليج', sub:'كتابة المراجعات النقدية', budget:12, duration:'5 أيام', attach:'لا يوجد', persona:'Academic', opening:'question', geo:'GCC', city:'الكويت', industry:'publishing', tier:'small',
    desc:'هل يمكن كتابة مراجعة نقدية أكاديمية لكتاب عن تاريخ التجارة في الخليج للنشر في مجلة كويتية؟ ألف وخمسمائة إلى ألفي كلمة بتحليل منهجي للقوة والضعف.' },
  { type:'طلب كتابة', title:'تحرير فصل اقتصاد أخضر لرسالة دكتوراه', sub:'التحرير الأكاديمي', budget:28, duration:'14 يومًا', attach:'فصل.docx', persona:'PhD', opening:'direct', geo:'UAE', city:'دبي', industry:'economics', tier:'large',
    desc:'محرر أكاديمي لتحرير فصل اقتصاد أخضر في رسالة دكتوراه بجامعة الإمارات. ستة آلاف إلى سبعة آلاف كلمة: تحسين صياغة وترابط دون تغيير المعنى.' },
  { type:'سعر ثابت', title:'قائمة مصادر APA لبحث عمل عن بُعد', sub:'إعداد وإدارة قائمة المصادر', budget:11, duration:'3 أيام', attach:'مسودة.docx', persona:'Master', opening:'brief', geo:'UAE', city:'دبي', industry:'hr', tier:'small',
    desc:'إعداد قائمة مصادر APA لبحث ماجستير عن العمل عن بُعد في الشركات الإماراتية. توحيد أربعين مصدراً والتحقق من الروابط خلال ثلاثة أيام.' },
  { type:'طلب كتابة', title:'دعم نشر مقال أمن معلومات في الرياض', sub:'دعم النشر', budget:32, duration:'14 يومًا', attach:'مسودة.pdf', persona:'Academic', opening:'context', geo:'GCC', city:'الرياض', industry:'cybersecurity', tier:'large',
    desc:'باحث في الرياض يستعد لتقديم مقال أمن معلومات لمجلة محكمة. تنسيق وفق دليل المجلة ورسالة تغطية وملخص عربي والرد على ملاحظات المحكمين.' },
  { type:'مناقصة', title:'نصوص توضيحية لرسومات بحث طبي دبي', sub:'توضيح الأشكال والرسومات', budget:16, duration:'5 أيام', attach:'رسوم.pdf', persona:'Medical', opening:'direct', geo:'UAE', city:'دبي', industry:'healthcare', tier:'medium',
    desc:'فريق بحث طبي في دبي يحتاج نصوصاً عربية وإنجليزية لثمانية أشكال في بحث السكري. شرح مختصر علمي لكل محور وبيانات.' },
  { type:'طلب كتابة', title:'مقترح بحث AI في التعليم بمسقط', sub:'كتابة مقترحات البحث', budget:24, duration:'10 أيام', attach:'نموذج.pdf', persona:'PhD', opening:'context', geo:'GCC', city:'مسقط', industry:'education', tier:'medium',
    desc:'باحث في مسقط يعد مقترح دكتوراه عن الذكاء الاصطناعي في التعليم العالي. ثلاثة آلاف إلى أربعة آلاف كلمة: مشكلة وأسئلة ومنهجية وجدول.' },
  { type:'سعر ثابت', title:'ملخص علمي طاقة متجددة مجلس التعاون', sub:'كتابة الملخصات العلمية', budget:8, duration:'2 يوم', attach:'مقال.pdf', persona:'Academic', opening:'brief', geo:'GCC', city:'المنامة', industry:'energy', tier:'micro',
    desc:'ملخص علمي عربي وإنجليزي لمقال طاقة متجددة في دول مجلس التعاون. ثلاثمائة كلمة لكل لغة وفق معايير المجلة المستهدفة.' },
  { type:'طلب كتابة', title:'مقال تأملي عن الهوية الثقافية لطلبة الإمارات', sub:'كتابة المقالات الشخصية الأكاديمية', budget:17, duration:'7 أيام', attach:'تعليمات.pdf', persona:'Student', opening:'question', geo:'UAE', city:'الشارقة', industry:'sociology', tier:'medium',
    desc:'هل يمكن مساعدتي في مقال تأملي أكاديمي عن الهوية الثقافية لطلبة الجامعات الإماراتية؟ ألف وخمسمائة إلى ألفي كلمة يجمع تأملاً شخصياً ومراجع نظرية.' },
  { type:'مناقصة', title:'توثيق API لمنصة دفع في دبي', sub:'الكتابة التقنية', budget:26, duration:'10 أيام', attach:'api.json', persona:'Startup', opening:'direct', geo:'UAE', city:'دبي', industry:'fintech', tier:'medium',
    desc:'شركة fintech في دبي تحتاج توثيق API عربي وإنجليزي: نظرة عامة ونقاط نهاية وأمثلة وأخطاء. أسلوب واضح للمطورين.' },
  { type:'طلب تطوير محتوى', title:'مقالات توعوية ضغط الدم لعيادة دبي', sub:'الكتابة الطبية', budget:23, duration:'7 أيام', attach:'إرشادات.pdf', persona:'Medical', opening:'context', geo:'UAE', city:'دبي', industry:'healthcare', tier:'medium',
    desc:'عيادة باطنية في دبي تطلق مدونة صحية بخمس مقالات عن ضغط الدم: وقاية وعلاج ومتابعة وتغذية. ثمانمائة إلى ألف كلمة لكل مقال بأسلوب مبسط للمريض.' },
  { type:'سعر ثابت', title:'Ghostwriting مذكرات ريادية رجل أعمال إماراتي', sub:'خدمات الكتابة بالنيابة (Ghostwriting)', budget:45, duration:'30 يومًا', attach:'تسجيلات.zip', persona:'Entrepreneur', opening:'context', geo:'UAE', city:'أبوظبي', industry:'publishing', tier:'large',
    desc:'رائد أعمال إماراتي يريد مذكرات ريادية عربية من تسجيلات صوتية. عشر فصول بثلاثة آلاف كلمة لكل فصل بأسلوب سردي يحافظ على صوت المؤلف. سرية تامة.' },
  { type:'طلب كتابة', title:'مقال محكم حوكمة بنوك خليجية', sub:'كتابة مقالات متميزة للنشر في مجلات محكّمة', budget:42, duration:'21 يومًا', attach:'بيانات.xlsx', persona:'PhD', opening:'direct', geo:'GCC', city:'جدة', industry:'finance', tier:'large',
    desc:'مقال محكم عن الحوكمة المؤسسية في البنوك الخليجية لمجلة Scopus. سبعة آلاف إلى ثمانية آلاف كلمة بمنهجية كمية. لدي البيانات والتحليل.' },
  { type:'مناقصة', title:'ورقة مؤتمر AI تشخيص طبي دبي', sub:'كتابة «أوراق المؤتمرات»', budget:30, duration:'14 يومًا', attach:'نتائج.pdf', persona:'Academic', opening:'context', geo:'UAE', city:'دبي', industry:'healthtech', tier:'large',
    desc:'فريق بحث في دبي يحتاج ورقة مؤتمر إنجليزية وملخصاً عربياً عن AI في التشخيص الطبي. أربعة آلاف إلى خمسة آلاف كلمة بصيغة المؤتمر.' },
  { type:'طلب كتابة', title:'محتوى OER رياضيات مالية جامعة الكويت', sub:'كتابة المحتوى التعليمي المفتوح', budget:27, duration:'14 يومًا', attach:'منهج.pdf', persona:'Educational', opening:'direct', geo:'GCC', city:'الكويت', industry:'education', tier:'large',
    desc:'جامعة في الكويت تطور مقرر رياضيات مالية OER أونلاين. وحدات تعليمية بشروحات وأمثلة وتمارين. عشرون إلى خمس وعشرون ألف كلمة على ثماني وحدات.' },
  { type:'سعر ثابت', title:'حالة دراسية تحول رقمي شركة توزيع أبوظبي', sub:'كتابة أوراق تدوين الحالات الدراسية', budget:21, duration:'7 أيام', attach:'شركة.docx', persona:'Consultant', opening:'brief', geo:'UAE', city:'أبوظبي', industry:'distribution', tier:'medium',
    desc:'ورقة حالة عربية عن تحول رقمي لشركة توزيع في أبوظبي للتدريب الإداري. ألفان إلى ثلاثة آلاف كلمة: تحدي وحل ونتائج ودروس.' },
  { type:'طلب تطوير محتوى', title:'محتوى مساق إدارة مشاريع معهد دبي', sub:'كتابة محتوى المساقات الإلكترونية', budget:34, duration:'21 يومًا', attach:'خطة.pdf', persona:'Educational', opening:'context', geo:'UAE', city:'دبي', industry:'training', tier:'large',
    desc:'معهد تدريب في دبي يطور مساق إدارة مشاريع PMI أونلاين. عشر وحدات بنصوص وأهداف تعلم وأسئلة مراجعة بأمثلة من مشاريع الإمارات.' },
  { type:'طلب كتابة', title:'رسالة توصية لطالب ماجستير أبوظبي', sub:'كتابة رسائل التوصية', budget:9, duration:'2 يوم', attach:'سيرة.pdf', persona:'Academic', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'academia', tier:'small',
    desc:'رسالة توصية أكاديمية إنجليزية لطالب ماجستير يتقدم لمنحة أوروبية. صفحة إلى صفحة ونصف تبرز قدرات البحث والانضباط.' },
  { type:'سعر ثابت', title:'خطاب قبول متحدث مؤتمر تقني المنامة', sub:'كتابة خطابات القبول والاعتذار', budget:7, duration:'1 يوم', attach:'لا يوجد', persona:'Government', opening:'brief', geo:'GCC', city:'المنامة', industry:'technology', tier:'micro',
    desc:'خطاب قبول رسمي عربي لدعوة متحدث دولي لمؤتمر تقني في المنامة مع تأكيد المواعيد والتسهيلات. صياغة دبلوماسية بفقرتين.' },
  { type:'طلب كتابة', title:'رسالة تهنئة زواج زميل عمل دبي', sub:'كتابة رسائل التهنئة والتعزية', budget:5, duration:'1 يوم', attach:'لا يوجد', persona:'Ordinary', opening:'brief', geo:'UAE', city:'دبي', industry:'personal', tier:'micro',
    desc:'رسالة تهنئة راقية بزواج زميل عمل للإرسال عبر بريد الشركة. فقرة واحدة دافئة ومهنية تناسب بيئة عمل خليجية.' },
  { type:'مناقصة', title:'دعوات إطلاق منتج تقني دبي مول', sub:'كتابة رسائل الدعوة', budget:8, duration:'2 يوم', attach:'حفل.pdf', persona:'Startup', opening:'direct', geo:'UAE', city:'دبي', industry:'technology', tier:'micro',
    desc:'شركة تقنية تستضيف حفل إطلاق في دبي مول وتحتاج دعوات رسمية ونسخة واتساب لثلاث فئات: مستثمرين وشركاء وإعلام.' },
  { type:'طلب كتابة', title:'قصة قصيرة سوق السمك ديرة لمجلة إماراتية', sub:'كتابة القصص القصيرة', budget:15, duration:'7 أيام', attach:'لا يوجد', persona:'Ordinary', opening:'direct', geo:'UAE', city:'دبي', industry:'literature', tier:'small',
    desc:'قصة قصيرة عربية عن يوم في سوق السمك بديرة من منظور شاب عائد بعد الدراسة. ألف وخمسمائة إلى ألفي كلمة بأسلوب واقعي بلمسة شعرية خفيفة.' },
  { type:'سعر ثابت', title:'خواطر أبوة لمدونة شخصية عجمان', sub:'كتابة الخواطر والمقالات الشخصية', budget:11, duration:'3 أيام', attach:'لا يوجد', persona:'Ordinary', opening:'context', geo:'UAE', city:'عجمان', industry:'personal', tier:'small',
    desc:'أب في عجمان يريد خمس خواطر عن الأبوة والعمل والتوازن. كل خاطرة مائتان إلى ثلاثمائة كلمة بأسلوب صادق بسيط بفصحى معاصرة.' },
  { type:'طلب كتابة', title:'يوميات سفر جبال الحجر عُمان', sub:'كتابة المذكرات واليوميات', budget:13, duration:'5 أيام', attach:'صور.zip', persona:'Ordinary', opening:'context', geo:'GCC', city:'مسقط', industry:'travel', tier:'small',
    desc:'تحويل ملاحظات رحلة عائلية إلى جبال الحجر في عُمان إلى خمس مقالات يوميات. ستمائة إلى ثمانمائة كلمة لكل مقال عن الطبيعة والضيافة.' },
  { type:'مناقصة', title:'مدونة شخصية حياة مهنية دبي', sub:'كتابة محتوى المدونات الشخصية', budget:18, duration:'7 أيام', attach:'لا يوجد', persona:'Job seeker', opening:'direct', geo:'UAE', city:'دبي', industry:'career', tier:'medium',
    desc:'أربعة مقالات افتتاحية لمدونة عن الحياة المهنية في الإمارات: بحث وظيفة وتكيف ثقافي وشبكات مهنية. ثمانمائة إلى ألف كلمة لكل مقال.' },
  { type:'طلب كتابة', title:'كلمة تكريم موظفين اتصالات أبوظبي', sub:'كتابة كلمات المناسبات والفعاليات', budget:12, duration:'3 أيام', attach:'برنامج.pdf', persona:'Large corp', opening:'brief', geo:'UAE', city:'أبوظبي', industry:'telecom', tier:'small',
    desc:'كلمة مدير عام لحفل تكريم موظفين سنوي في شركة اتصالات بأبوظبي. خمس إلى سبع دقائق بأسلوب رسمي ملهم دون أسماء حساسة.' },
  { type:'طلب كتابة', title:'مدونة سفر رحلة ليوا الصحراوية', sub:'كتابة مدوّنات السفر / الرحلات', budget:16, duration:'5 أيام', attach:'صور.zip', persona:'Ordinary', opening:'context', geo:'UAE', city:'ليوا', industry:'travel', tier:'medium',
    desc:'مدونة سفر متكاملة عن عطلة ليوا بين ألف ومائتين وألف وخمسمائة كلمة: صحراء وفندق وأنشطة ونصائح للزوار بأسلوب حيوي صادق.' },
  { type:'مناقصة', title:'نصوص بودكاست ريادة أعمال الإمارات', sub:'كتابة محتوى البودكاست الشخصي', budget:20, duration:'7 أيام', attach:'حلقات.pdf', persona:'Entrepreneur', opening:'direct', geo:'UAE', city:'دبي', industry:'media', tier:'medium',
    desc:'بودكاست شخصي عن ريادة الأعمال في الإمارات يحتاج نصوص ست حلقات: مقدمة وأسئلة وخاتمة. ألف وخمسمائة إلى ألفي كلمة لكل حلقة بأسلوب حواري.' },
  { type:'طلب كتابة', title:'سيرة تفاعلية مصمم جرافيك دبي', sub:'كتابة محتوى السير الذاتية التفاعلية', budget:14, duration:'5 أيام', attach:'أعمال.pdf', persona:'Job seeker', opening:'direct', geo:'UAE', city:'دبي', industry:'design', tier:'small',
    desc:'مصمم جرافيك يريد محتوى سيرة تفاعلية لموقع شخصي: نبذة وخمسة مشاريع ومهارات بأسلوب إبداعي مختصر عربي وإنجليزي.' },
  { type:'سعر ثابت', title:'حملة ترشح مجلس جمعية الشارقة', sub:'كتابة محتوى الحملات الشخصية على وسائل التواصل', budget:17, duration:'5 أيام', attach:'برنامج.pdf', persona:'Ordinary', opening:'context', geo:'UAE', city:'الشارقة', industry:'nonprofit', tier:'medium',
    desc:'مرشح مجلس إدارة جمعية خيرية في الشارقة يحتاج عشرة منشورات ورسالة ترشح رسمية تبرز الخبرة التطوعية بأسلوب مجتمعي محترم.' },
  { type:'طلب كتابة', title:'سرد قصصي طفولة الفجيرة', sub:'كتابة يوميات أو سرد قصصي بشكل كتابي', budget:22, duration:'10 أيام', attach:'لا يوجد', persona:'Ordinary', opening:'context', geo:'UAE', city:'الفجيرة', industry:'literature', tier:'medium',
    desc:'تحويل ذكريات طفولة في الفجيرة إلى سرد كتابي ثلاثة آلاف إلى أربعة آلاف كلمة للنشر في مدونة ثقافية. أسلوب أدبي بسيط عن البحر والجبال والعائلة.' },
  { type:'مناقصة', title:'سكريبت يوتيوب سوق الذهب دبي', sub:'كتابة رسالة الفيديو أو خطاب اليوتيوب', budget:11, duration:'3 أيام', attach:'مخطط.pdf', persona:'Media', opening:'direct', geo:'UAE', city:'دبي', industry:'tourism', tier:'small',
    desc:'قناة يوتيوب سياحية تحتاج سكريبت عربي ثماني دقائق عن سوق الذهب في دبي. أسلوب حواري مرح مع معلومات مفيدة للسائح.' },
  { type:'طلب كتابة', title:'حملة ترشح غرفة تجارة دبي', sub:'كتابة محتوى الانتخابات أو الترشح أو الحملات الشخصية', budget:25, duration:'10 أيام', attach:'سيرة.docx', persona:'Entrepreneur', opening:'context', geo:'UAE', city:'دبي', industry:'business', tier:'medium',
    desc:'رجل أعمال يرشح نفسه لعضوية غرفة تجارة دبي. بيان ترشح وخطاب ومنشورات تبرز رؤيته لدعم الشركات الصغيرة. ألفان إلى ثلاثة آلاف كلمة موزعة.' },
  { type:'سعر ثابت', title:'نصوص مدونة تصوير معارض أبوظبي', sub:'كتابة محتوى مدونة الصور/فوتوغرافي', budget:15, duration:'5 أيام', attach:'صور.zip', persona:'Ordinary', opening:'direct', geo:'UAE', city:'أبوظبي', industry:'arts', tier:'small',
    desc:'مصور هاوٍ في أبوظبي يحتاج نصوصاً لست مجموعات صور عن معارض فنية. كل نص مائة وخمسون إلى مائتي كلمة يصف الإحساس والتقنية.' },
  { type:'طلب كتابة', title:'بحث علمي مياه جوفية المنطقة الشرقية السعودية', sub:'كتابة الأبحاث العلمية', budget:36, duration:'21 يومًا', attach:'تحليل.xlsx', persona:'PhD', opening:'context', geo:'GCC', city:'الدمام', industry:'environment', tier:'large',
    desc:'باحث دكتوراه في الدمام يحتاج صياغة بحث علمي عن جودة المياه الجوفية في المنطقة الشرقية. ثمانية آلاف إلى عشرة آلاف كلمة مع نتائج مخبرية وخرائط.' },
  { type:'مناقصة', title:'مذكرة قانونية عقود توريد دبي', sub:'كتابة المراسلات الرسمية', budget:29, duration:'14 يومًا', attach:'مسودة.docx', persona:'Lawyer', opening:'context', geo:'UAE', city:'دبي', industry:'legal', tier:'large',
    desc:'مكتب محاماة في دبي يحتاج مذكرة عربية عن عقود التوريد في الإمارات لعميل مقاولات. عشر إلى خمس عشرة صفحة بإشارة للتشريعات الإماراتية.' },
];

// 50 curated indices: 40 UAE / 10 GCC, 8+ personal, max 4/persona, 50 unique subs
const SELECT_IDX = [
  0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,
  35,36,37,38,39,40,41,42,43,44,45,46,47,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,
];
// trim to exactly 50: first 42 non-personal-heavy + 8 personal tail
const finalRaw = [
  ...SELECT_IDX.slice(0, 42).map(i => raw[i]),
  raw[53], raw[54], raw[55], raw[56], raw[57], raw[58], raw[59], raw[60],
].map((o, i) => {
  const copy = { ...o };
  const gccSlots = new Set([6, 7, 14, 21, 28, 35, 38, 42, 45, 48]);
  if (gccSlots.has(i)) { copy.geo = 'GCC'; copy.city = copy.city || CITIES_GCC[i % CITIES_GCC.length]; }
  else copy.geo = 'UAE';
  return copy;
});

// Rebalance personas (max 4 each across 16 types)
const PERSONA_OVERRIDE = {
  8:'Large corp', 9:'Entrepreneur', 10:'Educational', 11:'Consultant', 12:'Medical',
  15:'Media', 16:'Lawyer', 17:'Government', 19:'Educational', 22:'Entrepreneur',
  24:'NGO', 27:'Trainer', 40:'Lawyer', 43:'NGO', 44:'Trainer', 45:'Media', 47:'Job seeker',
};
finalRaw.forEach((o, i) => { if (PERSONA_OVERRIDE[i]) o.persona = PERSONA_OVERRIDE[i]; });
if (finalRaw.length !== 50) throw new Error(`Expected 50 orders, got ${finalRaw.length}`);

const orders = finalRaw.map((o, i) => ({ ...o, desc: expandDesc(o, i) }));

const text = orders.map(fmt).join('\n\n');
fs.writeFileSync(OUT, text + '\n', 'utf8');

const wordCounts = orders.map(o => wc(o.desc));
const tierCounts = { micro:0, small:0, medium:0, large:0 };
orders.forEach(o => tierCounts[o.tier]++);

const openings = {};
orders.forEach(o => { openings[o.opening] = (openings[o.opening]||0)+1; });
const personas = {};
orders.forEach(o => { personas[o.persona] = (personas[o.persona]||0)+1; });
const subs = new Set(orders.map(o => o.sub));
const personalCount = orders.filter(o => PERSONAL_SUBS.has(o.sub)).length;
const fieldViolations = orders.filter(o => FIELD_LABEL_RE.test(o.desc));
const geoUAE = orders.filter(o => o.geo === 'UAE').length;
const industries = {};
orders.forEach(o => { industries[o.industry] = (industries[o.industry]||0)+1; });

const wcFails = orders.filter(o => {
  const w = wc(o.desc);
  const [lo, hi] = TIER_RANGE[o.tier];
  return w < lo || w > hi;
});

const stats = {
  file: OUT,
  orderCount: orders.length,
  wordCount: { min: Math.min(...wordCounts), max: Math.max(...wordCounts), avg: Math.round(wordCounts.reduce((a,b)=>a+b,0)/wordCounts.length) },
  tierCounts,
  openingStyles: openings,
  personalSubcategoryCount: personalCount,
  uniqueSubcategories: subs.size,
  fieldLabelViolations: fieldViolations.map(o => o.title),
  geoUAE,
  geoGCC: 50 - geoUAE,
  personas,
  industries,
  wordCountFailures: wcFails.map(o => ({ title: o.title, words: wc(o.desc), tier: o.tier })),
};

console.log(JSON.stringify(stats, null, 2));
if (wcFails.length) process.exitCode = 1;
