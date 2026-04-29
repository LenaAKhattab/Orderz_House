BEGIN;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'تجربة تطوير لوحة تحكم React',
  'إنشاء صفحة لوحة تحكم تفاعلية مع بطاقات إحصائية وفلاتر أساسية، مع تحسين قابلية القراءة في الواجهة العربية.',
  cat.id, NULL, NULL,
  '["React","لوحات التحكم","UI","تحسين الأداء"]'::jsonb,
  25, 80, 'JOD', 1, 3, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'فرصة تدريب: كتابة محتوى تقني عربي',
  'صياغة محتوى تقني واضح لمقال تعليمي يشرح مفاهيم الذكاء الاصطناعي بطريقة مبسطة ومهنية.',
  cat.id, NULL, NULL,
  '["كتابة محتوى","تحرير","SEO","لغة عربية"]'::jsonb,
  15, 45, 'JOD', 2, 5, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'تحسين تصميم واجهة متجر إلكتروني',
  'إعادة ترتيب مكونات صفحة المنتج وتوحيد الألوان والمسافات بما يتماشى مع نظام التصميم الحالي.',
  cat.id, NULL, NULL,
  '["UI/UX","Figma","تصميم واجهات","تحسين تجربة المستخدم"]'::jsonb,
  30, 95, 'JOD', 1, 4, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'إعداد خطة محتوى لسوشال ميديا',
  'بناء خطة محتوى أسبوعية تشمل أفكار منشورات وأوقات النشر وصياغات دعائية مناسبة للجمهور المستهدف.',
  cat.id, NULL, NULL,
  '["Social Media","كتابة إعلانية","تخطيط محتوى"]'::jsonb,
  20, 60, 'JOD', 2, 6, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'تحليل بيانات مبيعات شهرية',
  'تنظيف ملف بيانات المبيعات وتجهيز ملخص تحليلي يوضح أعلى المنتجات مبيعًا واتجاهات النمو.',
  cat.id, NULL, NULL,
  '["Excel","تحليل بيانات","تقارير","Data Cleaning"]'::jsonb,
  35, 110, 'JOD', 4, 10, 'hours',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'إعداد سكربت دعم فني آلي',
  'تجهيز ردود جاهزة لأسئلة العملاء المتكررة وربطها بتدفق عمل واضح لفريق خدمة العملاء.',
  cat.id, NULL, NULL,
  '["خدمة العملاء","كتابة سيناريو","تشغيل العمليات"]'::jsonb,
  18, 55, 'JOD', 3, 8, 'hours',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'بناء Landing Page تعريفية',
  'تصميم وتطوير صفحة تعريفية سريعة التحميل تتضمن أقسام الميزات، آراء العملاء، ونموذج تواصل.',
  cat.id, NULL, NULL,
  '["HTML","CSS","Landing Page","كتابة محتوى"]'::jsonb,
  40, 120, 'JOD', 1, 3, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'مراجعة وتدقيق لغوي لمحتوى موقع',
  'تدقيق الصفحات الرئيسية للموقع وتحسين الصياغة والأسلوب اللغوي بما يضمن احترافية الرسالة.',
  cat.id, NULL, NULL,
  '["تدقيق لغوي","تحرير نصوص","لغة عربية"]'::jsonb,
  12, 38, 'JOD', 2, 6, 'hours',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'إعداد حملة إعلانات ممولة تجريبية',
  'ضبط حملة إعلانية تجريبية مع تحديد الجمهور والميزانية ونسخ إعلانية لاختبار الأداء.',
  cat.id, NULL, NULL,
  '["إعلانات ممولة","Meta Ads","تحليل حملات"]'::jsonb,
  28, 90, 'JOD', 1, 2, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

WITH cat AS (
  SELECT id
  FROM categories
  ORDER BY random()
  LIMIT 1
)
INSERT INTO fake_order_templates (
  title, description, category_id, subcategory_id, sub_subcategory_id,
  skills, min_budget, max_budget, currency, min_duration, max_duration, duration_unit,
  is_active, created_by, created_at, updated_at
)
SELECT
  'تهيئة API وربطها مع الواجهة',
  'توصيل الواجهة الأمامية مع نقاط API جاهزة، ومعالجة حالات التحميل والأخطاء وإظهار الرسائل المناسبة.',
  cat.id, NULL, NULL,
  '["API Integration","JavaScript","REST","Error Handling"]'::jsonb,
  45, 140, 'JOD', 1, 4, 'days',
  TRUE, NULL, NOW(), NOW()
FROM cat;

COMMIT;
