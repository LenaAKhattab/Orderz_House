-- 103_update_community_about_content
-- Replace "مجتمع أوردرز" public page copy with Al-Rajol Al-Watwat Technology company intro.

BEGIN;

UPDATE public_site_pages
SET
  title = 'شركة الرجل الوطواط للتكنولوجيا',
  menu_label = 'شركة الرجل الوطواط للتكنولوجيا',
  content = $content$شركة الرجل الوطواط للتكنولوجيا هي شركة أردنية تدير حلولًا رقمية متخصصة في تنظيم الموارد البشرية، وإدارة العمليات، وتطوير الأنظمة الذكية للشركات والمؤسسات.

نركز على بناء منصات عملية تساعد فرق العمل على إدارة الموظفين، المتابعة، التدريب، المهام، والبيانات بطريقة أكثر وضوحًا وسهولة. هدفنا هو تحويل الإجراءات اليومية داخل المؤسسات إلى تجربة رقمية منظمة، آمنة، وقابلة للتطوير.

نؤمن أن التكنولوجيا يجب أن تخدم الإنسان أولًا، لذلك نطوّر حلولًا تساعد الإدارات على اتخاذ قرارات أفضل، وتحسين التواصل الداخلي، ورفع كفاءة العمل.$content$,
  meta_title = 'شركة الرجل الوطواط للتكنولوجيا',
  meta_description = 'شركة الرجل الوطواط للتكنولوجيا — حلول رقمية لإدارة الموارد البشرية والعمليات داخل الشركات والمؤسسات.',
  updated_at = NOW()
WHERE slug = 'community';

INSERT INTO schema_migrations (version)
VALUES ('103_update_community_about_content')
ON CONFLICT (version) DO NOTHING;

COMMIT;
