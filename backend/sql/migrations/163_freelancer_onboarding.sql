-- 163: Freelancer onboarding content + progress (ADDITIVE ONLY).
-- Display/guidance only. Does not change payments, wallets, orders, or Stripe.
-- Numbered 163 because 158_account_role_conversion.sql already exists.

BEGIN;

CREATE TABLE IF NOT EXISTS onboarding_items (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(80) NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  cta_label VARCHAR(120) NULL,
  cta_url VARCHAR(500) NULL,
  target_role VARCHAR(32) NOT NULL DEFAULT 'freelancer',
  target_plan_key VARCHAR(80) NULL,
  target_category_key VARCHAR(80) NULL,
  condition_key VARCHAR(80) NOT NULL,
  item_type VARCHAR(24) NOT NULL DEFAULT 'informational'
    CHECK (item_type IN ('informational', 'required')),
  placement VARCHAR(32) NOT NULL DEFAULT 'dashboard_banner'
    CHECK (placement IN ('dashboard_banner', 'getting_started', 'modal', 'inline_help')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_dismissible BOOLEAN NOT NULL DEFAULT TRUE,
  max_views INTEGER NULL,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_by_admin_id BIGINT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_items_enabled_placement
  ON onboarding_items (is_enabled, placement, sort_order);

CREATE TABLE IF NOT EXISTS user_onboarding_events (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  onboarding_item_id BIGINT NULL REFERENCES onboarding_items (id) ON DELETE SET NULL,
  event_type VARCHAR(32) NOT NULL
    CHECK (event_type IN ('viewed', 'dismissed', 'clicked_cta', 'completed', 'skipped')),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_events_user
  ON user_onboarding_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_events_item
  ON user_onboarding_events (onboarding_item_id, event_type);

CREATE TABLE IF NOT EXISTS user_onboarding_progress (
  user_id BIGINT NOT NULL,
  onboarding_item_id BIGINT NOT NULL REFERENCES onboarding_items (id) ON DELETE CASCADE,
  views_count INTEGER NOT NULL DEFAULT 0,
  dismissed_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NULL,
  PRIMARY KEY (user_id, onboarding_item_id)
);

INSERT INTO onboarding_items (key, title, body, cta_label, cta_url, target_role, condition_key, item_type, placement, sort_order, is_enabled, is_dismissible)
VALUES
  ('welcome', 'مرحبًا بك في Orderz House', 'سنرشدك خطوة بخطوة حتى يصبح حسابك جاهزًا لاستقبال فرص العمل.', 'ابدأ الآن', '/dashboard/freelancer/getting-started', 'freelancer', 'freelancer_new', 'informational', 'dashboard_banner', 10, TRUE, TRUE),
  ('profile', 'وثّق حسابك', 'قبل البدء باستقبال فرص العمل، يجب استكمال بياناتك والتحقق من الحساب.', 'استكمل التوثيق', '/dashboard/freelancer/settings', 'freelancer', 'profile_incomplete', 'required', 'dashboard_banner', 20, TRUE, FALSE),
  ('verification', 'أكّد بريدك الإلكتروني', 'تأكيد البريد يساعد على حماية حسابك واستكمال التوثيق قبل طلب التفعيل.', 'استكمل التوثيق', '/dashboard/freelancer/settings', 'freelancer', 'verification_incomplete', 'required', 'dashboard_banner', 30, TRUE, FALSE),
  ('training', 'أكمل التدريب', 'قبل استقبال فرص العمل، يجب إكمال التدريب حتى تتعرف على آلية استخدام المنصة، المناقصات، التسليم، الجودة، والمستحقات.', 'أكمل التدريب الآن', '/dashboard/freelancer/courses', 'freelancer', 'training_incomplete', 'required', 'dashboard_banner', 40, TRUE, FALSE),
  ('request_activation', 'حسابك جاهز لطلب التفعيل', 'بعد إكمال المتطلبات، يمكنك الآن طلب مراجعة وتفعيل حساب العمل.', 'اطلب التفعيل', '/dashboard/freelancer/activate-account', 'freelancer', 'activation_not_requested', 'required', 'dashboard_banner', 50, TRUE, FALSE),
  ('pending_review', 'حسابك قيد المراجعة', 'طلب التفعيل وصل إلى الفريق وسيتم مراجعته. سنخبرك عند الموافقة.', 'عرض حالة الحساب', '/dashboard/freelancer/activate-account', 'freelancer', 'activation_pending_review', 'informational', 'dashboard_banner', 60, TRUE, FALSE),
  ('activation_rejected', 'يلزم إعادة طلب التفعيل', 'لم يُعتمد طلب التفعيل بعد. راجع ملاحظات الحساب ثم أعد الطلب عند الجاهزية.', 'عرض حالة الحساب', '/dashboard/freelancer/activate-account', 'freelancer', 'activation_rejected', 'required', 'dashboard_banner', 70, TRUE, FALSE),
  ('gs_how_to_start', 'كيف تبدأ؟', 'ابدأ باستكمال بياناتك، ثم التدريب، ثم طلب تفعيل الحساب. بعد الموافقة يمكنك التقديم على الفرص المتاحة ضمن اشتراكك.', NULL, '/dashboard/freelancer/getting-started', 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 100, TRUE, TRUE),
  ('gs_what_is_tender', 'ما هي المناقصة؟', 'المناقصة هي تقديم عرض للمشاركة في فرصة عمل. تستخدم إحدى المناقصات المتاحة في اشتراكك، ثم يُقيَّم المتقدمون قبل الإسناد.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 110, TRUE, TRUE),
  ('gs_mini_bid', 'ما هو Mini Bid؟', 'Mini Bid هي فرصة عمل صغيرة أو محددة تستطيع التقديم عليها باستخدام إحدى المناقصات المتاحة ضمن اشتراكك. بعد التقديم يتم تقييم المتقدمين، وإذا تم اختيارك ينتقل الطلب إلى حسابك للتنفيذ والتسليم.', NULL, '/dashboard/freelancer/orders', 'freelancer', 'mini_bid_intro', 'informational', 'inline_help', 120, TRUE, TRUE),
  ('gs_mini_bid_article', 'ما هو Mini Bid Article؟', 'Mini Bid Article هي فرصة لكتابة مقال وفق عنوان وشروط وعدد كلمات ومتطلبات محددة. تستخدم مناقصة للتقديم، وإذا تم اختيارك تقوم بكتابة المقال وتسليمه من خلال المنصة، ثم يخضع للتدقيق والمراجعة قبل اعتماده وإضافة مستحقاته إلى حسابك.', NULL, '/dashboard/freelancer/articles', 'freelancer', 'article_mini_bid_intro', 'informational', 'inline_help', 130, TRUE, TRUE),
  ('gs_how_selected', 'كيف يتم اختيار الفريلانسر؟', 'يُقيَّم المتقدمون وفق جاهزية الحساب، العرض، والالتزام بمتطلبات الفرصة. الاختيار ليس ضمانًا لكل تقديم.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 140, TRUE, TRUE),
  ('gs_after_assign', 'ماذا يحدث بعد استلام الطلب؟', 'بعد الإسناد يظهر الطلب في «طلباتي» مع الموعد والمتطلبات. نفّذ العمل داخل المنصة ولا تعتمد على قنوات خارجية للتسليم.', NULL, '/dashboard/freelancer/my-orders', 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 150, TRUE, TRUE),
  ('gs_how_deliver', 'كيف يتم التسليم؟', 'ارفع الملفات أو النص المطلوب من صفحة الطلب قبل الموعد. التسليم عبر المنصة هو المرجع المعتمد للمراجعة.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 160, TRUE, TRUE),
  ('gs_revision', 'ماذا يعني مطلوب تعديل؟', 'يعني أن المراجعة طلبت تحسينًا محددًا. نفّذ التعديل وأعد التسليم من نفس الطلب حتى يُعتمد العمل.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 170, TRUE, TRUE),
  ('gs_approved', 'متى يصبح العمل معتمدًا؟', 'يُعتمد العمل بعد قبول التسليم من جهة المراجعة وفق شروط الطلب. الاعتماد هو أساس احتساب المستحقات.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 180, TRUE, TRUE),
  ('gs_payout', 'متى تصرف المستحقات؟', 'بعد اعتماد العمل تظهر المستحقات في مسار المطالبات حسب سياسة المنصة. المبالغ الرسمية بالدينار الأردني.', NULL, '/dashboard/freelancer/financial-claims', 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 190, TRUE, TRUE),
  ('gs_not_assigned', 'ماذا يحدث إذا لم يتم إسناد المناقصة؟', 'إذا لم تُختر لا يُسند الطلب لحسابك. المناقصة المستخدمة لا تُسترجع تلقائيًا إلا وفق قواعد الاشتراك المعتمدة.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 200, TRUE, TRUE),
  ('gs_remaining_bids', 'كيف أعرف عدد المناقصات المتبقية؟', 'يظهر رصيد المناقصات أو العروض المتاحة ضمن لوحة الاشتراك/باقة العمل. راجع الباقة قبل التقديم على فرص جديدة.', NULL, '/dashboard/freelancer/plans', 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 210, TRUE, TRUE),
  ('gs_ai_helper', 'كيف أستخدم مساعد OrderzHouse AI؟', 'المساعد أداة إرشادية لشرح آلية المنصة. لا يغيّر حالة الطلب أو المستحقات، ولا يُعد التزامًا ماليًا.', NULL, NULL, 'freelancer', 'mini_bid_intro', 'informational', 'getting_started', 220, TRUE, TRUE)
ON CONFLICT (key) DO NOTHING;

COMMIT;
