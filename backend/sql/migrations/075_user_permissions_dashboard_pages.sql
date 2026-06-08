-- Migration 075: Per-admin dashboard page permissions (user_permissions)
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS user_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id);

INSERT INTO permissions (key, module, display_name, description)
VALUES
  ('dashboard.admin.overview', 'dashboard', 'لوحة الإدارة — نظرة عامة', 'الوصول إلى الصفحة الرئيسية للوحة الإدارة.'),
  ('dashboard.admin.orders', 'dashboard', 'لوحة الإدارة — الطلبات الداخلية', 'عرض وإدارة الطلبات الداخلية.'),
  ('dashboard.admin.create_order', 'dashboard', 'لوحة الإدارة — إنشاء طلب', 'إنشاء طلب داخلي جديد.'),
  ('dashboard.admin.courses', 'dashboard', 'لوحة الإدارة — الدورات', 'إدارة الدورات التدريبية.'),
  ('dashboard.admin.ads', 'dashboard', 'لوحة الإدارة — الإعلانات', 'إدارة الإعلانات.'),
  ('dashboard.admin.subscription_activation', 'dashboard', 'لوحة الإدارة — تفعيل الاشتراكات', 'تفعيل اشتراكات المستقلين.'),
  ('dashboard.admin.notifications', 'dashboard', 'لوحة الإدارة — الإشعارات', 'صفحة الإشعارات في لوحة الإدارة.'),
  ('dashboard.admin.settings', 'dashboard', 'لوحة الإدارة — الإعدادات', 'إعدادات حساب الأدمن.'),
  ('dashboard.super_admin.overview', 'dashboard', 'المدير الأعلى — نظرة عامة', 'الصفحة الرئيسية للمدير الأعلى.'),
  ('dashboard.super_admin.plans', 'dashboard', 'المدير الأعلى — الباقات', 'إدارة باقات الاشتراك.'),
  ('dashboard.super_admin.subscriptions', 'dashboard', 'المدير الأعلى — الاشتراكات', 'إدارة اشتراكات المستقلين.'),
  ('dashboard.super_admin.financial_claims', 'dashboard', 'المدير الأعلى — المطالبات المالية', 'مراجعة المطالبات المالية.'),
  ('dashboard.super_admin.analytics', 'dashboard', 'المدير الأعلى — التحليلات', 'لوحة التحليلات والمؤشرات.'),
  ('dashboard.super_admin.admins_manage', 'dashboard', 'المدير الأعلى — إدارة الأدمن', 'إنشاء وإدارة حسابات الأدمن.'),
  ('dashboard.super_admin.training_orders', 'dashboard', 'المدير الأعلى — الطلبات التجريبية', 'إدارة الطلبات التجريبية.')
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- super_admin role keeps all permissions (including new keys)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key LIKE 'dashboard.%'
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Grant all admin dashboard page permissions to existing admin users (avoid breaking current access)
INSERT INTO user_permissions (user_id, permission_id)
SELECT u.id, p.id
FROM users u
JOIN permissions p ON p.key IN (
  'dashboard.admin.overview',
  'dashboard.admin.orders',
  'dashboard.admin.create_order',
  'dashboard.admin.courses',
  'dashboard.admin.ads',
  'dashboard.admin.subscription_activation',
  'dashboard.admin.notifications',
  'dashboard.admin.settings'
)
WHERE u.role = 'admin'
ON CONFLICT (user_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('075_user_permissions_dashboard_pages')
ON CONFLICT (version) DO NOTHING;
