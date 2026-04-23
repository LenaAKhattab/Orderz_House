-- Migration 005: seed services hierarchy from DOCX source
-- Source: c:\Users\Batman\Downloads\خدمات كتابة المحتوى والتصميم والبرمجة (2).docx
-- Structure:
--   categories (level 1) -> subcategories (level 2) -> sub_subcategories (level 3)
-- Idempotent inserts using slugs + ON CONFLICT.

BEGIN;

-- Optional bilingual support (future-proof, does not affect existing reads)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS name_en VARCHAR(160) NULL;
ALTER TABLE subcategories ADD COLUMN IF NOT EXISTS name_en VARCHAR(160) NULL;
ALTER TABLE sub_subcategories ADD COLUMN IF NOT EXISTS name_en VARCHAR(160) NULL;

-- Canonical category display names (keep slugs stable)
UPDATE categories
SET name = 'خدمات كتابة المحتوى',
    name_en = 'Content Writing Services',
    description = 'خدمات كتابة احترافية للأعمال، والأبحاث الأكاديمية، والاحتياجات الشخصية.',
    updated_at = NOW()
WHERE slug = 'content-writing';

UPDATE categories
SET name = 'خدمات التصميم',
    name_en = 'Design Services',
    description = 'خدمات تصميم احترافية للأعمال، والمجال الأكاديمي، والاحتياجات الشخصية.',
    updated_at = NOW()
WHERE slug = 'design';

UPDATE categories
SET name = 'خدمات البرمجة',
    name_en = 'Programming Services',
    description = 'خدمات برمجية احترافية للأعمال، والأبحاث الأكاديمية، والمشاريع الشخصية.',
    updated_at = NOW()
WHERE slug = 'programming';

-- Ensure the 3 main categories exist (in case DB was customized)
INSERT INTO categories (slug, name, name_en, description, image_url, sort_order, is_active)
VALUES
  ('content-writing', 'خدمات كتابة المحتوى', 'Content Writing Services', 'خدمات كتابة احترافية للأعمال، والأبحاث الأكاديمية، والاحتياجات الشخصية.', '/images/categories/contentwriting.jpg', 30, TRUE),
  ('design', 'خدمات التصميم', 'Design Services', 'خدمات تصميم احترافية للأعمال، والمجال الأكاديمي، والاحتياجات الشخصية.', '/images/categories/design.jpg', 20, TRUE),
  ('programming', 'خدمات البرمجة', 'Programming Services', 'خدمات برمجية احترافية للأعمال، والأبحاث الأكاديمية، والمشاريع الشخصية.', '/images/categories/programming.jpg', 10, TRUE)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = NOW();

-- Level 2: subcategories (writing/design/programming)
WITH cats AS (
  SELECT id, slug FROM categories WHERE slug IN ('content-writing','design','programming')
)
INSERT INTO subcategories (category_id, slug, name, name_en, sort_order, is_active)
SELECT c.id, v.slug, v.name, v.name_en, v.sort_order, TRUE
FROM cats c
JOIN (
  VALUES
    -- Writing (content-writing)
    ('content-writing', 'business-writing', 'خدمات كتابة الأعمال', 'Business Writing Services', 10),
    ('content-writing', 'academic-writing', 'خدمات الكتابة الأكاديمية', 'Academic Writing Services', 20),
    ('content-writing', 'personal-writing', 'خدمات الكتابة الشخصية', 'Personal Writing Services', 30),
    -- Design (design)
    ('design', 'business-design', 'خدمات التصميم في مجال الأعمال', 'Business Design Services', 10),
    ('design', 'academic-design', 'خدمات التصميم في المجال الأكاديمي', 'Academic Design Services', 20),
    ('design', 'personal-design', 'خدمات التصميم الشخصية', 'Personal Design Services', 30),
    -- Programming (programming) - keep in sync with migration 003 slugs
    ('programming', 'business-programming', 'خدمات برمجة الأعمال', 'Business Programming Services', 10),
    ('programming', 'academic-programming', 'خدمات البرمجة الأكاديمية', 'Academic Programming Services', 20),
    ('programming', 'personal-programming', 'خدمات البرمجة الشخصية', 'Personal Programming Services', 30)
) AS v(category_slug, slug, name, name_en, sort_order)
  ON v.category_slug = c.slug
ON CONFLICT (category_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- Helper CTE to resolve subcategory ids by (category_slug, subcategory_slug)
WITH sc AS (
  SELECT s.id, c.slug AS category_slug, s.slug AS sub_slug
  FROM subcategories s
  JOIN categories c ON c.id = s.category_id
  WHERE (c.slug, s.slug) IN (
    ('content-writing','business-writing'),
    ('content-writing','academic-writing'),
    ('content-writing','personal-writing'),
    ('design','business-design'),
    ('design','academic-design'),
    ('design','personal-design'),
    ('programming','business-programming'),
    ('programming','academic-programming'),
    ('programming','personal-programming')
  )
),
items AS (
  SELECT sc.id AS subcategory_id, v.slug, v.name, v.name_en, v.sort_order
  FROM sc
  JOIN (
    VALUES
      -- =========================
      -- Writing -> Business Writing Services
      -- =========================
      ('content-writing','business-writing','company-profile-writing','كتابة بروفايل الشركات','Company Profile Writing',10),
      ('content-writing','business-writing','job-description-writing','كتابة الوصف الوظيفي','Job Description Writing',20),
      ('content-writing','business-writing','policies-procedures-writing','كتابة السياسات والإجراءات','Policies and Procedures Writing',30),
      ('content-writing','business-writing','employee-handbooks-writing','كتابة أدلة الموظفين','Employee Handbooks Writing',40),
      ('content-writing','business-writing','official-correspondence-writing','كتابة المراسلات الرسمية','Official Correspondence Writing',50),
      ('content-writing','business-writing','ad-copywriting','كتابة الإعلانات','Ad Copywriting',60),
      ('content-writing','business-writing','website-content-writing','كتابة محتوى المواقع الإلكترونية','Website Content Writing',70),
      ('content-writing','business-writing','blogs-articles-writing','كتابة المدونات والمقالات','Blogs and Articles Writing',80),
      ('content-writing','business-writing','social-media-content-writing','كتابة محتوى وسائل التواصل الاجتماعي','Social Media Content Writing',90),
      ('content-writing','business-writing','newsletters-writing','كتابة النشرات الإخبارية','Newsletters Writing',100),
      ('content-writing','business-writing','business-reports-writing','كتابة تقارير الأعمال','Business Reports Writing',110),
      ('content-writing','business-writing','business-plans-writing','كتابة خطط العمل','Business Plans Writing',120),
      ('content-writing','business-writing','feasibility-studies-writing','كتابة دراسات الجدوى','Feasibility Studies Writing',130),
      ('content-writing','business-writing','market-analysis-writing','كتابة التحليلات السوقية','Market Analysis Writing',140),
      ('content-writing','business-writing','presentations-writing','كتابة العروض التقديمية','Presentations Writing',150),
      ('content-writing','business-writing','project-proposals-writing','كتابة مقترحات المشاريع','Project Proposals Writing',160),
      ('content-writing','business-writing','rfps-writing','كتابة طلبات العروض (RFPs)','Requests for Proposals (RFPs) Writing',170),
      ('content-writing','business-writing','user-manuals-writing','كتابة أدلة الاستخدام','User Manuals Writing',180),
      ('content-writing','business-writing','training-materials-writing','كتابة المواد التدريبية','Training Materials Writing',190),
      ('content-writing','business-writing','faqs-writing','كتابة الأسئلة الشائعة','FAQs Writing',200),
      ('content-writing','business-writing','press-releases-writing','كتابة البيانات الصحفية','Press Releases Writing',210),
      ('content-writing','business-writing','press-articles-writing','كتابة المقالات الصحفية','Press Articles Writing',220),
      ('content-writing','business-writing','official-speeches-writing','كتابة الخطابات الرسمية','Official Speeches Writing',230),
      ('content-writing','business-writing','corporate-bios-writing','كتابة السير الذاتية للشركات','Corporate Bios Writing',240),

      -- =========================
      -- Writing -> Academic Writing Services
      -- =========================
      ('content-writing','academic-writing','research-papers-writing','كتابة الأبحاث العلمية','Research Papers Writing',10),
      ('content-writing','academic-writing','academic-articles-writing','كتابة المقالات الأكاديمية','Academic Articles Writing',20),
      ('content-writing','academic-writing','university-essays-writing','كتابة الأبحاث الجامعية','University Essays Writing',30),
      ('content-writing','academic-writing','thesis-dissertation-assistance','المساعدة في رسائل الماجستير والدكتوراه','Thesis and Dissertation Assistance/Writing',40),
      ('content-writing','academic-writing','lab-reports-writing','كتابة تقارير المختبر','Lab Reports Writing',50),
      ('content-writing','academic-writing','business-technical-reports-writing','كتابة تقارير الأعمال الأكاديمية','Business/Technical Reports Writing',60),
      ('content-writing','academic-writing','literature-reviews-writing','كتابة مراجعات الأدبيات','Literature Reviews Writing',70),
      ('content-writing','academic-writing','book-film-reviews-writing','كتابة المراجعات النقدية','Book/Film Reviews Writing',80),
      ('content-writing','academic-writing','academic-editing','التحرير الأكاديمي','Academic Editing',90),
      ('content-writing','academic-writing','proofreading','التدقيق اللغوي','Proofreading',100),
      ('content-writing','academic-writing','citation-management','إعداد وإدارة قائمة المصادر','Citation Management',110),
      ('content-writing','academic-writing','publication-support','دعم النشر','Publication Support',120),
      ('content-writing','academic-writing','figure-preparation','توضيح الأشكال والرسومات','Figure Preparation',130),
      ('content-writing','academic-writing','research-proposals-writing','كتابة مقترحات البحث','Research Proposals Writing',140),
      ('content-writing','academic-writing','abstracts-writing','كتابة الملخصات العلمية','Abstracts Writing',150),
      ('content-writing','academic-writing','personal-reflection-essays-writing','كتابة المقالات الشخصية الأكاديمية','Personal Reflection Essays Writing',160),
      ('content-writing','academic-writing','technical-writing','الكتابة التقنية','Technical Writing',170),
      ('content-writing','academic-writing','medical-writing','الكتابة الطبية','Medical Writing',180),
      ('content-writing','academic-writing','ghostwriting','خدمات الكتابة بالنيابة (Ghostwriting)','Ghostwriting',190),
      ('content-writing','academic-writing','peer-reviewed-article-writing','كتابة مقالات متميزة للنشر في مجلات محكّمة','Peer-Reviewed Article Writing',200),
      ('content-writing','academic-writing','conference-paper-writing','كتابة «أوراق المؤتمرات»','Conference Paper Writing',210),
      ('content-writing','academic-writing','open-educational-resources-writing','كتابة المحتوى التعليمي المفتوح','Open Educational Resources Writing',220),
      ('content-writing','academic-writing','case-study-papers-writing','كتابة أوراق تدوين الحالات الدراسية','Case Study Papers Writing',230),
      ('content-writing','academic-writing','elearning-course-content-writing','كتابة محتوى المساقات الإلكترونية','e-Learning Course Content Writing',240),

      -- =========================
      -- Writing -> Personal Writing Services
      -- =========================
      ('content-writing','personal-writing','cv-resume-writing','كتابة السيرة الذاتية','CV/Resume Writing',10),
      ('content-writing','personal-writing','cover-letters-writing','كتابة رسائل التغطية','Cover Letters Writing',20),
      ('content-writing','personal-writing','recommendation-letters-writing','كتابة رسائل التوصية','Recommendation Letters Writing',30),
      ('content-writing','personal-writing','acceptance-apology-letters-writing','كتابة خطابات القبول والاعتذار','Acceptance and Apology Letters Writing',40),
      ('content-writing','personal-writing','love-apology-thankyou-letters-writing','كتابة رسائل الحب والاعتذار والشكر','Love, Apology, and Thank You Letters Writing',50),
      ('content-writing','personal-writing','congratulations-condolence-letters-writing','كتابة رسائل التهنئة والتعزية','Congratulations and Condolence Letters Writing',60),
      ('content-writing','personal-writing','invitations-writing','كتابة رسائل الدعوة','Invitations Writing',70),
      ('content-writing','personal-writing','short-stories-writing','كتابة القصص القصيرة','Short Stories Writing',80),
      ('content-writing','personal-writing','personal-essays-thoughts-writing','كتابة الخواطر والمقالات الشخصية','Personal Essays and Thoughts Writing',90),
      ('content-writing','personal-writing','memoirs-diaries-writing','كتابة المذكرات واليوميات','Memoirs and Diaries Writing',100),
      ('content-writing','personal-writing','personal-blog-content-writing','كتابة محتوى المدونات الشخصية','Personal Blog Content Writing',110),
      ('content-writing','personal-writing','personal-social-media-content-writing','كتابة محتوى وسائل التواصل الاجتماعي','Social Media Content Writing',120),
      ('content-writing','personal-writing','card-gift-texts-writing','كتابة نصوص البطاقات والهدايا','Card and Gift Texts Writing',130),
      ('content-writing','personal-writing','event-speeches-writing','كتابة كلمات المناسبات والفعاليات','Event Speeches Writing',140),
      ('content-writing','personal-writing','sms-short-messages-writing','كتابة الرسائل النصية القصيرة (SMS)','SMS and Short Messages Writing',150),
      ('content-writing','personal-writing','travel-blog-writing','كتابة مدوّنات السفر / الرحلات','Travel Blog Writing',160),
      ('content-writing','personal-writing','podcast-script-notes-writing','كتابة محتوى البودكاست الشخصي','Podcast Script / Episode Notes Writing',170),
      ('content-writing','personal-writing','interactive-cv-content-writing','كتابة محتوى السير الذاتية التفاعلية','Interactive CV Content Writing',180),
      ('content-writing','personal-writing','personal-brand-content-writing','كتابة محتوى الحملات الشخصية على وسائل التواصل','Personal Brand Content Writing',190),
      ('content-writing','personal-writing','narrative-memoirs-writing','كتابة يوميات أو سرد قصصي بشكل كتابي','Narrative Memoirs Writing',200),
      ('content-writing','personal-writing','youtube-channel-script-writing','كتابة رسالة الفيديو أو خطاب اليوتيوب','YouTube Channel Script Writing',210),
      ('content-writing','personal-writing','campaign-content-writing','كتابة محتوى الانتخابات أو الترشح أو الحملات الشخصية','Campaign Content Writing',220),
      ('content-writing','personal-writing','photo-blog-content-writing','كتابة محتوى مدونة الصور/فوتوغرافي','Photo-Blog Content Writing',230),
      ('content-writing','personal-writing','micro-content-quotes-writing','كتابة اقتباسات وخاطِر قصيرة مميّزة','Micro-Content / Quotes Writing',240),

      -- =========================
      -- Design -> Business Design Services
      -- =========================
      ('design','business-design','brand-identity','هوية العلامة التجارية','Brand Identity',10),
      ('design','business-design','logo-design','تصميم الشعار','Logo Design',20),
      ('design','business-design','comprehensive-brand-style-guide','تطوير دليل هوية متكامل','Comprehensive Brand Style Guide',30),
      ('design','business-design','visual-brand-strategy','تطوير استراتيجية العلامة التجارية البصرية','Visual Brand Strategy',40),
      ('design','business-design','website-design','تصميم مواقع الويب','Website Design',50),
      ('design','business-design','landing-page-design','تصميم صفحات الهبوط','Landing Page Design',60),
      ('design','business-design','app-ui-design','تصميم واجهات التطبيقات','App UI Design',70),
      ('design','business-design','digital-print-advertising-design','تصميم الإعلانات الرقمية والمطبوعة','Digital and Print Advertising Design',80),
      ('design','business-design','marketing-campaign-materials-design','تصميم مواد حملة التسويق','Marketing Campaign Materials Design',90),
      ('design','business-design','email-marketing-graphics-newsletters','تصميم رسائل البريد الإلكتروني والنشرات','Email Marketing Graphics and Newsletters',100),
      ('design','business-design','social-media-posts-design','تصميم منشورات الوسائط الاجتماعية','Social Media Posts Design',110),
      ('design','business-design','social-media-cover-ad-images','تصميم صور الغلاف لمنصات التواصل','Social Media Cover and Ad Images',120),
      ('design','business-design','packaging-product-design','تصميم التعبئة والتغليف والمنتجات','Packaging and Product Design',130),
      ('design','business-design','promotional-merchandise-design','تصميم البضائع الترويجية','Promotional Merchandise Design',140),
      ('design','business-design','business-cards-stationery-design','تصميم بطاقات الأعمال والأوراق الرسمية','Business Cards and Stationery Design',150),
      ('design','business-design','signage-banners-design','تصميم اللوحات الإرشادية واللافتات','Signage and Large Format Banners Design',160),
      ('design','business-design','infographics-data-visualization','تصميم الإنفوجرافيك والبيانات المرئية','Infographics and Data Visualization',170),
      ('design','business-design','motion-graphics-design','تصميم الرسوم المتحركة','Motion Graphics Design',180),
      ('design','business-design','promotional-video-design','تصميم الفيديوهات الترويجية','Promotional Video Design',190),
      ('design','business-design','environmental-wayfinding-design','التصميم البيئي واللوحات Wayfinding','Environmental and Wayfinding Design',200),
      ('design','business-design','illustration-design','تصميم الرسوم التوضيحية','Illustration Design',210),
      ('design','business-design','typography-design','تصميم الطباعة الاحترافية','Typography Design',220),
      ('design','business-design','corporate-presentation-design','تصميم المواد التقديمية التجارية','Corporate Presentation Design',230),
      ('design','business-design','visual-content-blogs-websites','تصميم محتوى مرئي رقمي','Visual Content for Blogs and Websites',240),

      -- =========================
      -- Design -> Academic Design Services
      -- =========================
      ('design','academic-design','academic-conference-poster-design','تصميم البوسترات الأكاديمية والمؤتمرات','Academic and Conference Poster Design',10),
      ('design','academic-design','print-ready-electronic-prep','إعداد ملفات جاهزة للطباعة أو العرض الإلكتروني','Print-Ready and Electronic File Preparation',20),
      ('design','academic-design','illustrations-infographics-posters','تصميم الرسوم والإنفوجرافيك التوضيحية','Illustrations and Infographics for Posters',30),
      ('design','academic-design','poster-review-standards','مراجعة البوسترات وفق معايير المؤتمرات','Poster Review per Conference Standards',40),
      ('design','academic-design','academic-presentation-design','تصميم العروض التقديمية الأكاديمية','Academic Presentation Design',50),
      ('design','academic-design','tables-charts-infographics-design','تصميم الجداول والمخططات والإنفوجرافيك','Table, Chart, and Infographic Design',60),
      ('design','academic-design','multimedia-integration-presentations','دمج وسائط متعددة في العروض','Multimedia Integration in Presentations',70),
      ('design','academic-design','educational-summaries-infographics','تصميم الملخصات والإنفوجرافيك التعليمية','Educational Summaries and Infographics',80),
      ('design','academic-design','editable-infographic-templates','توفير قوالب إنفوجرافيك قابلة للتعديل','Editable Infographic Templates',90),
      ('design','academic-design','thesis-dissertation-formatting','إعداد وتنسيق الرسائل والأطروحات','Thesis and Dissertation Formatting',100),
      ('design','academic-design','academic-template-design','تصميم القوالب الأكاديمية','Academic Template Design',110),
      ('design','academic-design','mind-maps-illustrations-design','تصميم الرسوم التوضيحية والخرائط العقلية','Illustrations and Mind Maps Design',120),
      ('design','academic-design','scientific-communication-support','دعم التواصل العلمي','Scientific Communication Support',130),
      ('design','academic-design','graphical-abstracts-design','تصميم الملخصات الرسومية للمقالات العلمية','Graphical Abstracts Design',140),
      ('design','academic-design','fast-collaborative-design-services','خدمات التنفيذ السريع والتعاوني','Fast and Collaborative Design Services',150),
      ('design','academic-design','academic-journal-layout','تصميم المجلات والكتب الأكاديمية','Academic Journal Layout Design',160),
      ('design','academic-design','elearning-platform-interface','تصميم منصة التعلم الإلكتروني وقالبها','e-Learning Platform Interface Design',170),
      ('design','academic-design','scientific-visualization-design','تصميم نماذج التصوير العلمي والبياني','Scientific Visualization Design',180),
      ('design','academic-design','ar-educational-experience','تصميم الواقع المعزّز للتعليم','AR Educational Experience Design',190),
      ('design','academic-design','interactive-research-publication','تصميم منشورات تفاعلية للبحث','Interactive Research Publication Design',200),
      ('design','academic-design','exhibit-poster-booth-design','تصميم اللوحات المعروضة في المعارض الأكاديمية','Exhibit/Poster Booth Design',210),
      ('design','academic-design','dynamic-mind-map-design','تصميم الخرائط الفكرية الديناميكية','Dynamic Mind-Map Design',220),
      ('design','academic-design','vr-lab-simulation-design','تصميم الواقع الافتراضي لمحاكاة مختبرية','VR Lab Simulation Design',230),
      ('design','academic-design','ar-lecture-content-design','تصميم محتوى الواقع المعزّز للمحاضرات','AR Lecture Content Design',240),

      -- =========================
      -- Design -> Personal Design Services
      -- =========================
      ('design','personal-design','personal-branding-design','بناء العلامة الشخصية','Personal Branding Design',10),
      ('design','personal-design','personal-logo-design','تصميم شعار شخصي','Personal Logo Design',20),
      ('design','personal-design','personal-brand-style-guide','دليل العلامة الشخصية','Personal Brand Style Guide',30),
      ('design','personal-design','personal-social-media-templates','قوالب اجتماعية شخصية','Personal Social Media Templates',40),
      ('design','personal-design','personal-website-portfolio-design','تصميم الموقع الشخصي أو المدونة','Personal Website / Portfolio Design',50),
      ('design','personal-design','invitation-greeting-card-design','تصميم الدعوات وبطاقات التهاني','Invitation and Greeting Card Design',60),
      ('design','personal-design','photo-editing-retouching','تحسين وتنسيق الصور الشخصية','Personal Photo Editing and Retouching',70),
      ('design','personal-design','mockups-design','تصميم Mockups','Mockups Design',80),
      ('design','personal-design','personal-illustrations-artwork','رسومات توضيحية وفنية شخصية','Personal Illustrations and Artwork',90),
      ('design','personal-design','personal-magazines-print-materials','تصميم المجلات والمطبوعات الشخصية','Personal Magazines and Print Materials',100),
      ('design','personal-design','personal-presentation-design','تصميم عروض تقديم شخصية','Personal Presentation Design',110),
      ('design','personal-design','digital-template-design','تصميم القوالب الرقمية','Digital Template Design',120),
      ('design','personal-design','personal-design-coaching','جلسات تدريب وتصميم شخصي','Personal Design Coaching and Workshops',130),
      ('design','personal-design','on-demand-rapid-design','خدمات تنفيذ سريع حسب الطلب','On-Demand Rapid Design Services',140),
      ('design','personal-design','3d-personal-brand-identity','تصميم الهوية الشخصية ثلاثية الأبعاد','3D Personal Brand Identity',150),
      ('design','personal-design','ar-personal-social-posts','تصميم صالحات الواقع المعزّز للمنشورات الشخصية','AR Personal Social Posts',160),
      ('design','personal-design','personal-timeline-graphic','تصميم الخريطة الزمنية الشخصية','Personal Timeline Graphic Design',170),
      ('design','personal-design','personal-promo-video','تصميم فيديو شخصي احترافي','Personal Promo Video Design',180),
      ('design','personal-design','digital-personal-magazine','تصميم مجلة شخصية رقمية','Digital Personal Magazine Design',190),
      ('design','personal-design','personal-digital-identity-wallet','تصميم تطبيق محفظة هوية شخصي','Personal Digital Identity Wallet Design',200),
      ('design','personal-design','personal-website-uiux','تصميم قسم المدونة أو البورتفوليو الشخصي بتجربة UI/UX','Personal Website UI/UX Design',210),
      ('design','personal-design','vr-resume-portfolio','تصميم الواقع الافتراضي أو محاكاة للسيرة الذاتية','VR Resume/Portfolio Design',220),
      ('design','personal-design','animated-life-event-graphics','تصميم شريط الحياة أو الرسائل الاحتفالية المتحركة','Animated Life-Event Graphics',230),
      ('design','personal-design','infographic-cv-design','تصميم سيرة ذاتية بشكل إنفوجرافيك','Infographic CV Design',240),

      -- =========================
      -- Programming -> Business Programming Services
      -- NOTE: English labels are inserted exactly as in the source document (even when phrasing seems inconsistent).
      -- =========================
      ('programming','business-programming','frontend-dev','تطوير الواجهة الأمامية (Frontend)','Backend Development',10),
      ('programming','business-programming','backend-dev','تطوير الواجهة الخلفية (Backend)','Full Stack Development',20),
      ('programming','business-programming','full-stack-web','تطوير ويب متكامل (Full Stack)','Content Management Systems (CMS)',30),
      ('programming','business-programming','cms','أنظمة إدارة المحتوى (CMS)','Custom Mobile App Development (iOS/Android)',40),
      ('programming','business-programming','custom-mobile-apps','تطبيقات الجوال المخصصة (iOS/Android)','Cross-Platform App Development',50),
      ('programming','business-programming','cross-platform-apps','تطبيقات عبر الأنظمة (Cross Platform)','Game Development (2D/3D)',60),
      ('programming','business-programming','game-dev','تطوير الألعاب (2D/3D)','Custom Software Development',70),
      ('programming','business-programming','custom-software','برمجيات مخصصة (Custom Software)','Enterprise Software Development (ERP/CRM)',80),
      ('programming','business-programming','enterprise-software','برمجيات مؤسسية (Enterprise Software – ERP/CRM)','API Development',90),
      ('programming','business-programming','api-dev','تطوير واجهات برمجة التطبيقات (APIs)','System Integration Services',100),
      ('programming','business-programming','integration-services','دمج الأنظمة (Integration Services)','Cloud-Native Applications',110),
      ('programming','business-programming','cloud-native','تطبيقات سحابية (Cloud Native)','Serverless / BaaS Services',120),
      ('programming','business-programming','serverless-baas','Serverless/BaaS','DevOps Services',130),
      ('programming','business-programming','devops','خدمات DevOps','Artificial Intelligence (AI)',140),
      ('programming','business-programming','ai','الذكاء الاصطناعي','Machine Learning (ML)',150),
      ('programming','business-programming','ml','تعلم الآلة','Natural Language Processing (NLP)',160),
      ('programming','business-programming','nlp','معالجة اللغة الطبيعية (NLP)','Computer Vision',170),
      ('programming','business-programming','computer-vision','الرؤية الحاسوبية (Computer Vision)','Cybersecurity Solutions',180),
      ('programming','business-programming','cybersecurity','الأمن السيبراني','Penetration Testing',190),
      ('programming','business-programming','penetration-testing','اختبارات الاختراق','Encryption Services',200),
      ('programming','business-programming','encryption','التشفير','E-commerce Development',210),
      ('programming','business-programming','ecommerce-dev','تطوير متاجر إلكترونية','Online Payment Integration',220),
      ('programming','business-programming','payment-integration','أنظمة الدفع الإلكتروني','Database Programming',230),
      ('programming','business-programming','db-programming','برمجة قواعد البيانات','Data Migration',240),

      -- =========================
      -- Programming -> Academic Programming Services
      -- =========================
      ('programming','academic-programming','programming-assignment-help','حل واجبات البرمجة','Programming Assignment Help',10),
      ('programming','academic-programming','academic-project-development','تنفيذ المشاريع الأكاديمية','Academic Project Development',20),
      ('programming','academic-programming','bug-fixing','تصحيح الأخطاء البرمجية','Bug Fixing',30),
      ('programming','academic-programming','code-optimization','تحسين الكود','Code Optimization',40),
      ('programming','academic-programming','algorithm-design','تصميم الخوارزميات','Algorithm Design',50),
      ('programming','academic-programming','data-structures','هياكل البيانات','Data Structures',60),
      ('programming','academic-programming','academic-db-programming','برمجة قواعد البيانات','Database Programming',70),
      ('programming','academic-programming','frontend-development','تطوير الواجهة الأمامية','Frontend Development',80),
      ('programming','academic-programming','backend-development','تطوير الواجهة الخلفية','Backend Development',90),
      ('programming','academic-programming','desktop-application-development','تطوير تطبيقات سطح المكتب','Desktop Application Development',100),
      ('programming','academic-programming','gui-programming','برمجة واجهات رسومية (GUI)','Graphical User Interface (GUI) Programming',110),
      ('programming','academic-programming','technical-documentation','كتابة الوثائق التقنية','Technical Documentation',120),
      ('programming','academic-programming','research-paper-programming-support','دعم كتابة الأبحاث التقنية','Research Paper Programming Support',130),
      ('programming','academic-programming','case-study-development','إعداد دراسات حالة','Case Study Development',140),
      ('programming','academic-programming','code-review-sessions','جلسات تعليمية برمجية','Code Review Sessions',150),
      ('programming','academic-programming','code-tutoring','مراجعة الكود','Code Tutoring',160),
      ('programming','academic-programming','university-specific-support','دعم متكامل حسب الجامعة','University-Specific Project Support',170),
      ('programming','academic-programming','academic-code-maintenance','التحديثات والصيانة الأكاديمية','Academic Code Maintenance',180),
      ('programming','academic-programming','ai-research-project-development','مساعدة في مشاريع بحث الذكاء الاصطناعي','AI Research Project Development',190),
      ('programming','academic-programming','educational-simulation-development','تطوير محاكاة تعليمية','Educational Simulation Development',200),
      ('programming','academic-programming','advanced-algorithm-model-writing','كتابة خوارزميات متقدمة ونماذج بحثية','Advanced Algorithm & Model Writing',210),
      ('programming','academic-programming','gui-research-tools-development','تطوير واجهات رسومية تعليمية','GUI For Research Tools Development',220),
      ('programming','academic-programming','statistical-analysis-tools','برمجة أدوات التحليل الإحصائي','Statistical Analysis Tool Development',230),
      ('programming','academic-programming','academic-testing-frameworks','تطوير أطر اختبار البرمجيات الأكاديمية','Academic Software Testing Frameworks',240),

      -- =========================
      -- Programming -> Personal Programming Services
      -- =========================
      ('programming','personal-programming','browser-automation-scripts','سكريبتات أتمتة المتصفح','Browser Automation Scripts',10),
      ('programming','personal-programming','data-collection-scripts','سكريبتات حجز البيانات','Data Collection Scripts',20),
      ('programming','personal-programming','chat-bots','بوتات محادثة','Chat Bots',30),
      ('programming','personal-programming','custom-api-integration','تكامل واجهات API','Custom API Integration',40),
      ('programming','personal-programming','data-scraping-parsing-scripts','سكريبتات سحب وتحليل البيانات','Data Scraping and Parsing Scripts',50),
      ('programming','personal-programming','price-tracking-tools','أدوات تتبع الأسعار','Price Tracking Tools',60),
      ('programming','personal-programming','office-task-automation','سكريبتات العمل المكتبي','Office Task Automation Scripts',70),
      ('programming','personal-programming','excel-google-sheets-macros','Macros للـExcel وGoogle Sheets','Excel/Google Sheets Macros',80),
      ('programming','personal-programming','custom-gui-tools','أدوات GUI مخصصة','Custom GUI Tools',90),
      ('programming','personal-programming','desktop-utility-apps','أدوات سطح المكتب','Desktop Utility Applications',100),
      ('programming','personal-programming','browser-extensions','امتدادات المتصفح','Browser Extensions',110),
      ('programming','personal-programming','personal-websites','مواقع شخصية','Personal Websites',120),
      ('programming','personal-programming','personal-assistant-tools','أدوات مساعدة شخصية','Personal Assistant Tools',130),
      ('programming','personal-programming','resume-portfolio-generators','مولدات سيرة ذاتية ومحافظ أعمال','Resume and Portfolio Generators',140),
      ('programming','personal-programming','educational-projects','مشاريع تعليمية','Educational Projects',150),
      ('programming','personal-programming','mini-games','ألعاب شخصية','Mini Games',160),
      ('programming','personal-programming','discord-telegram-bots','بوتات Discord/Telegram','Discord/Telegram Bots',170),
      ('programming','personal-programming','ai-integration-tools','أدوات تعليم الذكاء الاصطناعي','AI Integration Tools',180),
      ('programming','personal-programming','custom-code-requests','سكريبتات مخصصة حسب الطلب','Custom Code Requests',190),
      ('programming','personal-programming','hobby-beginner-projects','برمجة للهواة والمبتدئين','Hobby and Beginner Projects',200),
      ('programming','personal-programming','personal-mobile-app-development','برمجة تطبيقات الهواتف الشخصية','Personal Mobile App Development',210),
      ('programming','personal-programming','personal-productivity-automation','تطوير أدوات الإنتاجية الشخصية','Personal Productivity Automation Scripts',220),
      ('programming','personal-programming','personal-website-dev','بناء مواقع الويب الشخصية أو المدونات','Personal Website Dev',230),
      ('programming','personal-programming','personal-chatbot-dev','تطوير روبوتات الدردشة لخدمة شخصية','Personal Chatbot Dev',240)
  ) AS v(category_slug, sub_slug, slug, name, name_en, sort_order)
    ON v.category_slug = sc.category_slug AND v.sub_slug = sc.sub_slug
)
INSERT INTO sub_subcategories (subcategory_id, slug, name, name_en, sort_order, is_active)
SELECT subcategory_id, slug, name, name_en, sort_order, TRUE
FROM items
ON CONFLICT (subcategory_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    name_en = EXCLUDED.name_en,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- Track migration
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version)
VALUES ('005_seed_services_from_doc')
ON CONFLICT (version) DO NOTHING;

COMMIT;

