-- 077_website_pages
-- Editable public website pages and content blocks (How it works, etc.).

BEGIN;

CREATE TABLE IF NOT EXISTS website_pages (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  page_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_pages_type_active
  ON website_pages (page_type, is_active, slug);

CREATE TABLE IF NOT EXISTS website_page_blocks (
  id SERIAL PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL,
  title TEXT,
  body TEXT,
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT website_page_blocks_type_check
    CHECK (block_type IN ('title', 'text', 'image', 'text_image'))
);

CREATE INDEX IF NOT EXISTS idx_website_page_blocks_page_sort
  ON website_page_blocks (page_id, is_active, sort_order, id);

INSERT INTO website_pages (slug, title, page_type, is_active)
SELECT v.slug, v.title, v.page_type, v.is_active
FROM (
  VALUES
    ('how-it-works-freelancer', 'طريقة العمل كمستقل', 'how_it_works', TRUE),
    ('how-it-works-client', 'طريقة الطلب للعميل', 'how_it_works', TRUE)
) AS v(slug, title, page_type, is_active)
WHERE NOT EXISTS (SELECT 1 FROM website_pages WHERE slug = v.slug);

INSERT INTO website_page_blocks (page_id, block_type, title, body, image_url, sort_order, is_active)
SELECT p.id, v.block_type, v.title, v.body, NULL, v.sort_order, TRUE
FROM website_pages p
CROSS JOIN (
  VALUES
    ('how-it-works-freelancer', 'title', 'طريقة العمل كمستقل', 'عملية بسيطة تربط بين المواهب والفرص بسلاسة.', 1),
    ('how-it-works-freelancer', 'text', 'اشتراك المستقل', 'قم بإنشاء حسابك وملفك الشخصي لعرض مهاراتك.', 2),
    ('how-it-works-freelancer', 'text', 'الحصول على عمل', 'تصفح المشاريع المناسبة لك وقدم عروضك.', 3),
    ('how-it-works-freelancer', 'text', 'تنفيذ المشروع', 'أنجز العمل بجودة عالية وفي الوقت المحدد.', 4),
    ('how-it-works-freelancer', 'text', 'استلام الأرباح', 'احصل على مستحقاتك بأمان بعد موافقة العميل.', 5),
    ('how-it-works-client', 'title', 'طريقة الطلب للعميل', 'خطوات واضحة لنشر طلبك واختيار المستقل المناسب.', 1),
    ('how-it-works-client', 'text', 'إنشاء حساب العميل', 'سجّل حسابك وأكمل بياناتك الأساسية للبدء.', 2),
    ('how-it-works-client', 'text', 'نشر الطلب', 'حدّد نوع الخدمة والتفاصيل والموعد المطلوب.', 3),
    ('how-it-works-client', 'text', 'اختيار المستقل', 'قارن العروض والتقييمات وتواصل مع المرشحين.', 4),
    ('how-it-works-client', 'text', 'استلام العمل', 'راجع التسليم واعتمد المشروع بعد الرضا عن النتيجة.', 5)
) AS v(page_slug, block_type, title, body, sort_order)
WHERE p.slug = v.page_slug
  AND NOT EXISTS (
    SELECT 1 FROM website_page_blocks b WHERE b.page_id = p.id LIMIT 1
  );

INSERT INTO schema_migrations (version)
VALUES ('077_website_pages')
ON CONFLICT (version) DO NOTHING;

COMMIT;
