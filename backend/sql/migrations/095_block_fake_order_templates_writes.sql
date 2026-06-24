-- 095_block_fake_order_templates_writes
-- Block new fake_order_templates rows at DB level; pool uses fake_orders only.
-- Set session: SET LOCAL app.allow_fake_order_templates_write = 'true' for legacy maintenance scripts only.

BEGIN;

CREATE OR REPLACE FUNCTION block_fake_order_templates_write()
RETURNS trigger
LANGUAGE plpgsql
AS '
BEGIN
  IF COALESCE(current_setting(''app.allow_fake_order_templates_write'', true), '''') = ''true'' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION ''fake_order_templates is deprecated; insert into fake_orders instead.'';
END;
';

DROP TRIGGER IF EXISTS trg_block_fake_order_templates_insert ON fake_order_templates;
CREATE TRIGGER trg_block_fake_order_templates_insert
  BEFORE INSERT ON fake_order_templates
  FOR EACH ROW
  EXECUTE FUNCTION block_fake_order_templates_write();

DROP TRIGGER IF EXISTS trg_block_fake_order_templates_update ON fake_order_templates;
CREATE TRIGGER trg_block_fake_order_templates_update
  BEFORE UPDATE ON fake_order_templates
  FOR EACH ROW
  EXECUTE FUNCTION block_fake_order_templates_write();

INSERT INTO schema_migrations (version)
SELECT '095_block_fake_order_templates_writes'
WHERE NOT EXISTS (
  SELECT 1 FROM schema_migrations WHERE version = '095_block_fake_order_templates_writes'
);

COMMIT;
