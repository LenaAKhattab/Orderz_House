-- 056: ORDERZHOUSE freelance subscription catalog (upsert; legacy demo plans hidden from public).

BEGIN;

-- Hide legacy seed plans from public pricing (subscriptions referencing them stay valid).
UPDATE plans
SET is_visible = FALSE, updated_at = NOW()
WHERE name IN ('freelancer_starter', 'freelancer_enterprise')
  AND deleted_at IS NULL;

INSERT INTO plans (
  name,
  title,
  description,
  duration_days,
  price_jod,
  stripe_checkout_amount_jod,
  requires_company_visit,
  self_subscribe_allowed,
  is_active,
  is_visible,
  sort_order,
  features,
  trainings,
  payment_notes,
  installment_plan,
  offer_expires_at,
  offer_label,
  order_value_min_jod,
  order_value_max_jod,
  activation_requirements,
  refund_policy,
  admin_notes,
  is_popular,
  is_featured
)
VALUES
  (
    'orderzhouse_free',
    'الاشتراك المجاني',
    'مدة الاشتراك: سنة كاملة بمنصة العمل الحر',
    365,
    0,
    NULL,
    FALSE,
    FALSE,
    TRUE,
    TRUE,
    10,
    '[
      "تدريب مجاني على كتابة المحتوى – المستوى الأول",
      "دون توقيع عقد",
      "دون زيارة مقر الشركة",
      "دون متابعة مباشرة"
    ]'::jsonb,
    '["تدريب مجاني على كتابة المحتوى – المستوى الأول"]'::jsonb,
    NULL,
    NULL,
    NULL,
    NULL,
    3,
    7,
    'بعد الانتهاء من التدريبات والاختبارات، يتم إرسال النتائج عبر منصة STUDYZHOUSE، وعند ظهور النتيجة «ناجح» يتم تفعيل الحساب على المنصة.',
    NULL,
    'تفعيل تلقائي عبر STUDYZHOUSE — لا شراء ذاتي.',
    FALSE,
    FALSE
  ),
  (
    'orderzhouse_50_jod',
    'اشتراك 50 دينار',
    'مدة الاشتراك: سنة كاملة بمنصة العمل الحر',
    365,
    50,
    NULL,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    20,
    '[
      "تدريب مجاني كتابة المحتوى – المستوى الأول",
      "تدريب مجاني كتابة المحتوى – المستوى الثاني",
      "تدريبات مجانية في التصميم",
      "توقيع العقد داخل مقر الشركة",
      "متابعة بعد إنهاء المستوى الأول والبدء بالمستوى الثاني"
    ]'::jsonb,
    '[
      "تدريب كتابة المحتوى – المستوى الأول",
      "تدريب كتابة المحتوى – المستوى الثاني",
      "تدريبات مجانية في التصميم"
    ]'::jsonb,
    'دفعة واحدة 50 دينار أردني عند الاشتراك.',
    NULL,
    '2026-09-30'::date,
    'يتم استرداد قيمة الاشتراك عند استلام أول طلب (العرض ساري حتى 30-09-2026)',
    7,
    20,
    'يتم التفعيل بعد إتمام الدفع وتفعيل الشركة، ثم يبدأ العدّ عند أول طلب مقبول.',
    'يتم استرداد قيمة الاشتراك عند استلام أول طلب (ضمن فترة العرض).',
    'استرداد العرض مرتبط بإكمال أول طلب — راجع سياسة الاسترداد العامة.',
    TRUE,
    FALSE
  ),
  (
    'orderzhouse_platinum',
    'الاشتراك البلاتيني',
    'دبلوم التشغيل الرقمي بالعمل الحر — سنة كاملة على المنصة',
    365,
    900,
    300,
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    30,
    '[
      "دبلوم التشغيل الرقمي بالعمل الحر",
      "تدريب كتابة المحتوى – المستوى الأول والثاني",
      "تدريب الجرافيك ديزاين",
      "تدريب البرمجة باستخدام الذكاء الاصطناعي",
      "توقيع العقد داخل مقر الشركة"
    ]'::jsonb,
    '[
      "كتابة المحتوى – المستوى الأول والثاني",
      "الجرافيك ديزاين",
      "البرمجة باستخدام الذكاء الاصطناعي"
    ]'::jsonb,
    '300 دينار عند الاشتراك + 50 دينار شهرياً لمدة 12 شهر (إجمالي 600 دينار إضافية). المبلغ الإجمالي للبرنامج 900 دينار.',
    '{"upfrontJod":300,"monthlyJod":50,"months":12,"notes":"الأقساط الشهرية بعد التسجيل — خارج دفع Stripe الأولي."}'::jsonb,
    NULL,
    NULL,
    10,
    NULL,
    'يتم التفعيل بعد دفع مبلغ التسجيل (300 د.أ) وتفعيل الشركة؛ الأقساط الشهرية تُتابع خارج المنصة حالياً.',
    'أي مبالغ مالية مدفوعة لا تُسترد إلا بعد بدء العمل في الاشتراك الثاني (50 دينار).',
    'Stripe يحصّل 300 د.أ فقط عند الشراء الذاتي؛ الأقساط الشهرية إدارية.',
    FALSE,
    TRUE
  )
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  duration_days = EXCLUDED.duration_days,
  price_jod = EXCLUDED.price_jod,
  stripe_checkout_amount_jod = EXCLUDED.stripe_checkout_amount_jod,
  requires_company_visit = EXCLUDED.requires_company_visit,
  self_subscribe_allowed = EXCLUDED.self_subscribe_allowed,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  features = EXCLUDED.features,
  trainings = EXCLUDED.trainings,
  payment_notes = EXCLUDED.payment_notes,
  installment_plan = EXCLUDED.installment_plan,
  offer_expires_at = EXCLUDED.offer_expires_at,
  offer_label = EXCLUDED.offer_label,
  order_value_min_jod = EXCLUDED.order_value_min_jod,
  order_value_max_jod = EXCLUDED.order_value_max_jod,
  activation_requirements = EXCLUDED.activation_requirements,
  refund_policy = EXCLUDED.refund_policy,
  admin_notes = EXCLUDED.admin_notes,
  is_popular = EXCLUDED.is_popular,
  is_featured = EXCLUDED.is_featured,
  updated_at = NOW();

INSERT INTO schema_migrations (version) VALUES ('056_seed_orderzhouse_freelance_plans')
ON CONFLICT (version) DO NOTHING;

COMMIT;
