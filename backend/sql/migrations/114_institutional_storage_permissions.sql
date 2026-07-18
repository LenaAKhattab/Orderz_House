-- Migration 114: Institutional order storage + institutions permissions

BEGIN;

INSERT INTO permissions (key, module, display_name, description)
VALUES
  (
    'dashboard.super_admin.institutions',
    'dashboard',
    'المدير الأعلى — إدارة المؤسسات',
    'عرض وإدارة المؤسسات وأعضائها.'
  ),
  (
    'dashboard.super_admin.institutional_order_storage',
    'dashboard',
    'المدير الأعلى — مخزون الطلبات المؤسسية',
    'إدارة مخزون الطلبات المؤسسية والجدولة والموافقات.'
  ),
  (
    'institutional_order_storage.view',
    'institutional_order_storage',
    'مخزون مؤسسي — عرض',
    'عرض المخازن والطلبات والجدول.'
  ),
  (
    'institutional_order_storage.create',
    'institutional_order_storage',
    'مخزون مؤسسي — إنشاء مخزن',
    'إنشاء مخزن طلبات مؤسسية.'
  ),
  (
    'institutional_order_storage.update',
    'institutional_order_storage',
    'مخزون مؤسسي — تحديث مخزن',
    'تعديل إعدادات المخزن والحد المالي.'
  ),
  (
    'institutional_order_storage.manage_orders',
    'institutional_order_storage',
    'مخزون مؤسسي — إدارة الطلبات',
    'إنشاء وتعديل طلبات المخزن.'
  ),
  (
    'institutional_order_storage.submit_for_approval',
    'institutional_order_storage',
    'مخزون مؤسسي — إرسال للموافقة',
    'إرسال الطلب لموافقة المدير الأعلى.'
  ),
  (
    'institutional_order_storage.approve',
    'institutional_order_storage',
    'مخزون مؤسسي — موافقة',
    'موافقة أو رفض الطلبات (المدير الأعلى).'
  ),
  (
    'institutional_order_storage.transfer_to_training',
    'institutional_order_storage',
    'مخزون مؤسسي — نقل للتدريب',
    'نقل الطلب إلى مخزون الطلبات التجريبية.'
  ),
  (
    'institutional_order_storage.archive',
    'institutional_order_storage',
    'مخزون مؤسسي — أرشفة',
    'أرشفة طلبات المخزن.'
  ),
  (
    'institutional_order_storage.delete',
    'institutional_order_storage',
    'مخزون مؤسسي — حذف',
    'حذف طلبات المسودة/المعلقة الآمنة.'
  ),
  (
    'institutional_order_storage.manage_schedule',
    'institutional_order_storage',
    'مخزون مؤسسي — إدارة الجدول',
    'توليد وتعديل جدول التوزيع والدفعات.'
  ),
  (
    'institutional_order_storage.retry_release',
    'institutional_order_storage',
    'مخزون مؤسسي — إعادة محاولة الإطلاق',
    'إعادة محاولة دفعات الإطلاق الفاشلة.'
  )
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  updated_at = NOW();

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
  AND p.key IN (
    'dashboard.super_admin.institutions',
    'dashboard.super_admin.institutional_order_storage',
    'institutional_order_storage.view',
    'institutional_order_storage.create',
    'institutional_order_storage.update',
    'institutional_order_storage.manage_orders',
    'institutional_order_storage.submit_for_approval',
    'institutional_order_storage.approve',
    'institutional_order_storage.transfer_to_training',
    'institutional_order_storage.archive',
    'institutional_order_storage.delete',
    'institutional_order_storage.manage_schedule',
    'institutional_order_storage.retry_release'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

INSERT INTO schema_migrations (version) VALUES ('114_institutional_storage_permissions')
ON CONFLICT (version) DO NOTHING;
