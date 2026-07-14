-- 106_popup_ads_every_login
-- Every-login frequency + freelancer course-completion default popup.

BEGIN;

ALTER TABLE popup_ads DROP CONSTRAINT IF EXISTS popup_ads_frequency_chk;

ALTER TABLE popup_ads ADD CONSTRAINT popup_ads_frequency_chk CHECK (
  frequency IN ('every_visit', 'session', 'day', 'first_login_only', 'every_login')
);

ALTER TABLE popup_ads ADD COLUMN IF NOT EXISTS internal_key VARCHAR(64) NULL;
ALTER TABLE popup_ads ADD COLUMN IF NOT EXISTS cta_text_en VARCHAR(120) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_popup_ads_internal_key
  ON popup_ads (internal_key)
  WHERE internal_key IS NOT NULL;

INSERT INTO popup_ads (
  enabled,
  title_ar,
  title_en,
  body_ar,
  body_en,
  cta_text,
  cta_text_en,
  cta_url,
  audience,
  page_scope,
  frequency,
  internal_key,
  sort_order
)
SELECT
  TRUE,
  'إكمال الدورات شرط للعمل على المنصة',
  'Course completion is required to work on the platform',
  $$عزيزي المستقل، حتى تتمكن من البدء بالعمل واستلام الطلبات داخل منصة أوردرز هاوس، يجب عليك أولاً إكمال الدورات المطلوبة بنجاح.

بعد الانتهاء من الدورات، يرجى الانتظار حتى يقوم فريق الإدارة بمراجعة حسابك وتفعيله. عند تفعيل الحساب ستتمكن من الوصول إلى الطلبات والعمل على المنصة.$$,
  $$Dear freelancer, to start working and receiving orders on Orderz House, you must first complete the required courses successfully.

After completing the courses, please wait for the admin team to review and activate your account. Once your account is activated, you will be able to access orders and work on the platform.$$,
  'فهمت',
  'Got it',
  NULL,
  'freelancer',
  'dashboard',
  'every_login',
  'freelancer_course_completion_required',
  0
WHERE NOT EXISTS (
  SELECT 1 FROM popup_ads WHERE internal_key = 'freelancer_course_completion_required'
);

INSERT INTO schema_migrations (version)
VALUES ('106_popup_ads_every_login')
ON CONFLICT (version) DO NOTHING;

COMMIT;
