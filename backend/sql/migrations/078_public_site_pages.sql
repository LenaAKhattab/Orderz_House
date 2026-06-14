-- 078_public_site_pages
-- Editable public content pages (footer / mobile menu links).

BEGIN;

CREATE TABLE IF NOT EXISTS public_site_pages (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  menu_label TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  meta_title TEXT NULL,
  meta_description TEXT NULL,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_mobile_menu BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_footer BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_site_pages_published_sort
  ON public_site_pages (is_published, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_public_site_pages_mobile
  ON public_site_pages (is_published, show_in_mobile_menu, sort_order)
  WHERE is_published = TRUE AND show_in_mobile_menu = TRUE;

CREATE INDEX IF NOT EXISTS idx_public_site_pages_footer
  ON public_site_pages (is_published, show_in_footer, sort_order)
  WHERE is_published = TRUE AND show_in_footer = TRUE;

INSERT INTO public_site_pages (
  slug, title, menu_label, content, meta_description,
  is_published, show_in_mobile_menu, show_in_footer, sort_order, is_system
)
VALUES
  (
    'guarantee',
    'ضمان حقوقك',
    'ضمان حقوقك',
    'في أوردرز هاوس نلتزم بحماية حقوق العملاء والمستقلين من خلال إجراءات واضحة للطلبات والمدفayments والتسليم.

نوفر آليات متابعة للطلب من النشر حتى الإغلاق، مع إمكانية التواصل والمراجعة عند الحاجة.

للمزيد من التفاصيل، راجع شروط الاستخدام وسياسة الخصوصية.',
    'تعرف على ضمان حقوقك في منصة أوردرز هاوس.',
    TRUE, TRUE, TRUE, 10, TRUE
  ),
  (
    'terms-conditions',
    'شروط الاستخدام',
    'شروط الاستخدام',
    'مرحباً بك في أوردرز هاوس. باستخدامك للمنصة فإنك توافق على الشروط التالية.

## استخدام المنصة
يُستخدم الموقع لربط العملاء بالمستقلين وفق القوانين المعمول بها.

## الحسابات
يجب تقديم معلومات صحيحة والحفاظ على سرية بيانات الدخول.

## الطلبات والمدفوعات
تخضع الطلبات لسياسات الدفع والتسليم المعتمدة في المنصة.

## التحديثات
قد نحدّث هذه الشروط، وسيتم نشر أي تغيير على هذه الصفحة.',
    'شروط وأحكام استخدام منصة أوردرز هاوس.',
    TRUE, TRUE, TRUE, 20, TRUE
  ),
  (
    'privacy-policy',
    'بيان الخصوصية',
    'بيان الخصوصية',
    'توضح هذه السياسة كيفية جمع البيانات واستخدامها وحمايتها داخل منصة أوردرز هاوس.

## جمع المعلومات
نجمع الحد الأدنى من البيانات اللازمة لتشغيل المنصة وتحسين جودة الخدمة.

## استخدام المعلومات
تُستخدم المعلومات لأغراض تشغيلية دون مشاركة غير مصرح بها.

## حماية البيانات
نلتزم بإجراءات أمان مناسبة لحماية بياناتك.

## التحديثات
قد يتم تحديث هذه السياسة دورياً على هذه الصفحة.',
    'سياسة الخصوصية في منصة أوردرز هاوس.',
    TRUE, TRUE, TRUE, 30, TRUE
  ),
  (
    'help-center',
    'مركز المساعدة',
    'مركز المساعدة',
    'مرحباً بك في مركز المساعدة.

## للعملاء
تعرف على كيفية نشر طلبك ومتابعة التسليم والدفع.

## للمستقلين
تعرف على الباقات، أخذ الطلبات، وتسليم الأعمال.

## الدعم
للاستفسارات، تواصل معنا عبر قنوات الدعم المتاحة في الموقع.',
    'مركز المساعدة — أوردرز هاوس.',
    TRUE, TRUE, TRUE, 40, TRUE
  ),
  (
    'enterprise',
    'أوردز للمؤسسات',
    'أوردز للمؤسسات',
    'حلول أوردرز هاوس للمؤسسات والشركات.

## لماذا أوردز للمؤسسات؟
إدارة مركزية للطلبات، فرق عمل، ومتابعة الجودة.

## الخدمات
نشر مشاريع، اختيار مستقلين، وتقارير متابعة.

## تواصل معنا
لطلب عرض مخصص، تواصل مع فريق المؤسسات.',
    'حلول أوردرز هاوس للمؤسسات والشركات.',
    TRUE, TRUE, TRUE, 50, TRUE
  ),
  (
    'find-work',
    'ابحث عن عمل',
    'ابحث عن عمل',
    'ابدأ رحلتك كمستقل في أوردرز هاوس.

## الخطوات
1. أنشئ حساب مستقل.
2. اختر الباقة المناسبة.
3. تصفّح الطلبات المتاحة.
4. قدّم عروضك أو خذ الطلبات المناسبة.

## نصائح
أكمل ملفك الشخصي وتابع الدورات التدريبية المتاحة.',
    'ابحث عن عمل كمستقل في أوردرز هاوس.',
    TRUE, TRUE, TRUE, 60, TRUE
  ),
  (
    'community',
    'مجتمع أوردز',
    'مجتمع أوردز',
    'مجتمع أوردز يجمع المستقلين والعملاء لتبادل الخبرات.

## الهدف
بناء بيئة مهنية تدعم التعاون والنمو.

## المحتوى
قريباً: نصائح، قصص نجاح، وفعاليات للمجتمع.',
    'مجتمع أوردز هاوس.',
    TRUE, TRUE, TRUE, 70, TRUE
  ),
  (
    'blog',
    'مدونة أوردز',
    'مدونة أوردز',
    'مدونة أوردز — مقالات ونصائح حول العمل الحر والتعامل مع العملاء.

## قريباً
سننشر مقالات دورية حول:
- إدارة المشاريع
- التسويق للمستقلين
- أفضل ممارسات التسليم',
    'مدونة أوردرز هاوس.',
    TRUE, TRUE, TRUE, 80, TRUE
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('078_public_site_pages')
ON CONFLICT (version) DO NOTHING;

COMMIT;
