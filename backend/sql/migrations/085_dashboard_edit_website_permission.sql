-- Migration 085: Add edit-website dashboard permission for admin assignment UI
-- Idempotent: safe to re-run.

BEGIN;

INSERT INTO permissions (key, module, display_name, description)
VALUES
  (
    'dashboard.super_admin.edit_website',
    'dashboard',
    'المدير الأعلى — تعديل الموقع',
    'إدارة محتوى الموقع العام (الأسئلة الشائعة، الصفحات، طريقة العمل).'
  )
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

-- super_admin role keeps the new permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.key = 'dashboard.super_admin.edit_website'
WHERE r.name = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('085_dashboard_edit_website_permission')
ON CONFLICT (version) DO NOTHING;
