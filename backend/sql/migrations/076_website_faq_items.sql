-- 076_website_faq_items
-- Editable FAQ items for the public homepage.

BEGIN;

CREATE TABLE IF NOT EXISTS website_faq_items (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_faq_items_active_sort
  ON website_faq_items (is_active, sort_order, id);

INSERT INTO website_faq_items (question, answer, sort_order, is_active)
SELECT v.question, v.answer, v.sort_order, v.is_active
FROM (
  VALUES
    (
      'هل أوردرز هاوس منصة موثوقة، وهل يُعتراف بالخدمات المقدَّمة؟',
      'نعمل وفق سياسات واضحة للطلبات والتقييم، ويمكنك متابعة حالة طلبك من لوحة التحكم. للاعتماد الرسمي يعتمد أصحاب العمل على سياساتهم؛ نوصي بالاحتفاظ بإثبات التسليم والمراسلات داخل المنصة.',
      1,
      TRUE
    ),
    (
      'هل تستحق خدمات المنصة المدفوعة الاستثمار؟',
      'يعتمد ذلك على احتياجك: يمكنك مقارنة عروض المستقلين، مراجعة التقييمات، وتحديد نطاق العمل قبل الالتزام. ابدأ بطلب صغير لتقييم الجودة ثم وسّع النطاق عند الرضا.',
      2,
      TRUE
    ),
    (
      'ما هي ميزات الباقات أو الخيارات المتقدمة، وهل تناسبني؟',
      'إن وُجدت باقات أو ميزات إضافية، ستجدها موضحة في صفحة التسعير أو الإعدادات. راجع ما يشمله كل مستوى واختر ما يطابق حجم فريقك أو عدد طلباتك.',
      3,
      TRUE
    ),
    (
      'هل تتوفر موارد أو إرشادات مجانية للمستخدمين؟',
      'نوفر محتوى مساعد وأسئلة شائعة وصفحات توضيحية على الموقع. تابع قسم المساعدة أو المدونة عند توفرها للتحديثات.',
      4,
      TRUE
    ),
    (
      'ما هي أكثر أنواع الطلبات شعبية على المنصة؟',
      'يتغيّر ذلك مع الوقت؛ غالباً الطلبات ضمن البرمجة والتصميم وكتابة المحتوى الأكثر نشاطاً. تصفح التصنيفات لمعرفة العروض الحالية.',
      5,
      TRUE
    ),
    (
      'كيف تساعدني المنصة في إيجاد مستقل مناسب أو إتمام مشروعي؟',
      'تحدد التصنيف والتفاصيل والموعد المطلوب، ثم يطلع المستقلون المناسبون على طلبك. يمكنك مقارنة العروض والمحادثة الآمنة ضمن الطلب قبل الاختيار.',
      6,
      TRUE
    ),
    (
      'ما هي خدمات المنصة للفرق أو الأعمال، وكيف يتم التسعير؟',
      'إن كانت لديكم احتياجات متكررة أو حجم أكبر، راجعوا صفحة التواصل أو الخدمات للأعمال إن وُجدت، أو تواصلوا مع الدعم لعرض مناسب لفريقكم.',
      7,
      TRUE
    )
) AS v(question, answer, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM website_faq_items LIMIT 1);

INSERT INTO schema_migrations (version)
VALUES ('076_website_faq_items')
ON CONFLICT (version) DO NOTHING;

COMMIT;
