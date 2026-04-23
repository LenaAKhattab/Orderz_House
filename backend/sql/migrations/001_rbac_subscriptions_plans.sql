-- Migration 001: RBAC (roles/permissions/user_roles) + plans + freelancer_subscriptions + example plan seed
-- Prerequisites: public.users must exist (run sql/init.sql on empty DB first).
-- Idempotent: safe to re-run.
-- Apply: npm run db:migrate

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(128) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

BEGIN;

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  id BIGSERIAL PRIMARY KEY,
  key VARCHAR(120) NOT NULL UNIQUE,
  module VARCHAR(64) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_roles_is_system ON roles(is_system);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

INSERT INTO roles (name, display_name, description, is_system)
VALUES
  ('super_admin', 'سوبر أدمن', 'صلاحيات كاملة على النظام.', TRUE),
  ('admin', 'أدمن', 'صلاحيات تشغيلية حسب الصلاحيات الممنوحة.', TRUE),
  ('client', 'عميل', 'مستخدم عميل بقدرات محدودة.', TRUE),
  ('freelancer', 'مستقل', 'مستخدم مستقل بقدرات محدودة.', TRUE)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  updated_at = NOW();

INSERT INTO permissions (key, module, display_name, description)
VALUES
  ('dashboard.view_admin', 'dashboard', 'عرض لوحة الأدمن', NULL),
  ('dashboard.view_client', 'dashboard', 'عرض لوحة العميل', NULL),
  ('dashboard.view_freelancer', 'dashboard', 'عرض لوحة المستقل', NULL),
  ('users.view', 'users', 'عرض المستخدمين', NULL),
  ('users.create', 'users', 'إنشاء مستخدم', NULL),
  ('users.update', 'users', 'تعديل مستخدم', NULL),
  ('users.delete', 'users', 'حذف مستخدم', NULL),
  ('roles.view', 'roles', 'عرض الأدوار', NULL),
  ('roles.create', 'roles', 'إنشاء دور', NULL),
  ('roles.update', 'roles', 'تعديل دور', NULL),
  ('roles.delete', 'roles', 'حذف دور', NULL),
  ('permissions.view', 'permissions', 'عرض الصلاحيات', NULL),
  ('permissions.assign', 'permissions', 'تعيين صلاحيات للأدوار', NULL),
  ('profile.view_own', 'profile', 'عرض الملف الشخصي', NULL),
  ('profile.update_own', 'profile', 'تعديل الملف الشخصي', NULL),
  ('orders.view_all', 'orders', 'عرض كل الطلبات', NULL),
  ('orders.view_own', 'orders', 'عرض طلباتي', NULL),
  ('orders.create', 'orders', 'إنشاء طلب', NULL),
  ('orders.update', 'orders', 'تعديل طلب', NULL),
  ('orders.assign_freelancer', 'orders', 'تعيين مستقل للطلب', NULL),
  ('orders.change_status', 'orders', 'تغيير حالة الطلب', NULL),
  ('claims.view_all', 'claims', 'عرض كل المطالبات', NULL),
  ('claims.view_own', 'claims', 'عرض مطالباتي', NULL),
  ('claims.create', 'claims', 'إنشاء مطالبة', NULL),
  ('claims.approve', 'claims', 'اعتماد مطالبة', NULL),
  ('claims.pay', 'claims', 'دفع مطالبة', NULL),
  ('forms.view', 'forms', 'عرض النماذج', NULL),
  ('forms.create', 'forms', 'إنشاء نموذج', NULL),
  ('forms.update', 'forms', 'تعديل نموذج', NULL),
  ('reports.view', 'reports', 'عرض التقارير', NULL),
  ('settings.manage', 'settings', 'إدارة الإعدادات', NULL)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON TRUE
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN (
  'dashboard.view_admin',
  'users.view', 'users.create', 'users.update',
  'orders.view_all', 'orders.update', 'orders.change_status',
  'claims.view_all', 'claims.approve',
  'forms.view', 'forms.create', 'forms.update',
  'reports.view'
)
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN (
  'dashboard.view_client',
  'orders.create', 'orders.view_own',
  'profile.view_own', 'profile.update_own',
  'claims.view_own'
)
WHERE r.name = 'client'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key IN (
  'dashboard.view_freelancer',
  'orders.view_own',
  'profile.view_own', 'profile.update_own',
  'claims.view_own', 'claims.create'
)
WHERE r.name = 'freelancer'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = u.role
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS plans (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  title VARCHAR(140) NOT NULL,
  description TEXT NULL,
  duration_days INT NOT NULL CHECK (duration_days > 0 AND duration_days <= 3650),
  price_cents INT NULL CHECK (price_cents IS NULL OR price_cents >= 0),
  requires_company_visit BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_visible_active ON plans(is_visible, is_active);
CREATE INDEX IF NOT EXISTS idx_plans_sort_order ON plans(sort_order);
CREATE INDEX IF NOT EXISTS idx_plans_deleted_at ON plans(deleted_at);

CREATE TABLE IF NOT EXISTS freelancer_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  freelancer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  assigned_by_user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  has_first_order BOOLEAN NOT NULL DEFAULT FALSE,
  first_order_date TIMESTAMPTZ NULL,
  actual_start_date TIMESTAMPTZ NULL,
  expiry_date TIMESTAMPTZ NULL,
  status VARCHAR(40) NOT NULL CHECK (status IN (
    'assigned_not_started',
    'active',
    'expired',
    'inactive',
    'cancelled'
  )),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NULL,
  cancelled_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (has_first_order = FALSE AND first_order_date IS NULL AND actual_start_date IS NULL AND expiry_date IS NULL)
    OR
    (has_first_order = TRUE AND first_order_date IS NOT NULL AND actual_start_date IS NOT NULL AND expiry_date IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_fsub_freelancer_user_id ON freelancer_subscriptions(freelancer_user_id);
CREATE INDEX IF NOT EXISTS idx_fsub_plan_id ON freelancer_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_fsub_status ON freelancer_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_fsub_is_current ON freelancer_subscriptions(is_current);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fsub_current_per_freelancer
  ON freelancer_subscriptions(freelancer_user_id)
  WHERE is_current = TRUE;

COMMIT;

BEGIN;

INSERT INTO plans (
  name,
  title,
  description,
  duration_days,
  price_cents,
  requires_company_visit,
  is_active,
  is_visible,
  sort_order
)
VALUES
  (
    'freelancer_starter',
    'باقة البداية',
    'مناسبة للمستقلين الجدد. مدة 30 يوم. بدون زيارة الشركة.',
    30,
    0,
    FALSE,
    TRUE,
    TRUE,
    10
  ),
  (
    'freelancer_pro_visit',
    'باقة برو (زيارة الشركة)',
    'باقة احترافية لمدة 90 يوم مع شرط زيارة الشركة لتفعيلها حسب سياسة الشركة.',
    90,
    29900,
    TRUE,
    TRUE,
    TRUE,
    20
  ),
  (
    'freelancer_enterprise',
    'باقة المؤسسات',
    'باقة طويلة لمدة 365 يوم للمشاريع الكبيرة. قابلة للإخفاء من العرض العام عند الحاجة.',
    365,
    99900,
    FALSE,
    TRUE,
    TRUE,
    30
  )
ON CONFLICT (name) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  duration_days = EXCLUDED.duration_days,
  price_cents = EXCLUDED.price_cents,
  requires_company_visit = EXCLUDED.requires_company_visit,
  is_active = EXCLUDED.is_active,
  is_visible = EXCLUDED.is_visible,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('001_rbac_subscriptions_plans')
ON CONFLICT (version) DO NOTHING;
