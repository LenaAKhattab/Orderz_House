-- Phase 1 RBAC: create tables + seed + migrate existing users.role -> user_roles
-- Safe to run multiple times (idempotent inserts, IF NOT EXISTS where possible).
-- Run: (from backend/) npm run db:run -- sql/rbac_phase1.sql

BEGIN;

-- Core RBAC tables
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

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_roles_is_system ON roles(is_system);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

-- Seed default system roles
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

-- Seed permissions catalog (extend freely later)
INSERT INTO permissions (key, module, display_name, description)
VALUES
  -- dashboard
  ('dashboard.view_admin', 'dashboard', 'عرض لوحة الأدمن', NULL),
  ('dashboard.view_client', 'dashboard', 'عرض لوحة العميل', NULL),
  ('dashboard.view_freelancer', 'dashboard', 'عرض لوحة المستقل', NULL),

  -- users
  ('users.view', 'users', 'عرض المستخدمين', NULL),
  ('users.create', 'users', 'إنشاء مستخدم', NULL),
  ('users.update', 'users', 'تعديل مستخدم', NULL),
  ('users.delete', 'users', 'حذف مستخدم', NULL),

  -- roles / permissions management
  ('roles.view', 'roles', 'عرض الأدوار', NULL),
  ('roles.create', 'roles', 'إنشاء دور', NULL),
  ('roles.update', 'roles', 'تعديل دور', NULL),
  ('roles.delete', 'roles', 'حذف دور', NULL),
  ('permissions.view', 'permissions', 'عرض الصلاحيات', NULL),
  ('permissions.assign', 'permissions', 'تعيين صلاحيات للأدوار', NULL),

  -- profile
  ('profile.view_own', 'profile', 'عرض الملف الشخصي', NULL),
  ('profile.update_own', 'profile', 'تعديل الملف الشخصي', NULL),

  -- orders
  ('orders.view_all', 'orders', 'عرض كل الطلبات', NULL),
  ('orders.view_own', 'orders', 'عرض طلباتي', NULL),
  ('orders.create', 'orders', 'إنشاء طلب', NULL),
  ('orders.update', 'orders', 'تعديل طلب', NULL),
  ('orders.assign_freelancer', 'orders', 'تعيين مستقل للطلب', NULL),
  ('orders.change_status', 'orders', 'تغيير حالة الطلب', NULL),

  -- claims
  ('claims.view_all', 'claims', 'عرض كل المطالبات', NULL),
  ('claims.view_own', 'claims', 'عرض مطالباتي', NULL),
  ('claims.create', 'claims', 'إنشاء مطالبة', NULL),
  ('claims.approve', 'claims', 'اعتماد مطالبة', NULL),
  ('claims.pay', 'claims', 'دفع مطالبة', NULL),

  -- forms / reports / settings (starter)
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

-- Map permissions to roles (matrix)
-- super_admin: map all permissions (still keep code override too)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON TRUE
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- admin
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

-- client
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

-- freelancer
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

-- Migrate existing users.role -> user_roles
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.name = u.role
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMIT;

