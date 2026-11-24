/**
 * Smart Orders S2 — service catalog (DB layer).
 *
 * The server/database is the only source of service definitions. Every definition change creates a new
 * immutable version; orders store a full snapshot of the version they were created with, so catalog edits
 * never change historical orders.
 */
const crypto = require("crypto");
const { pool } = require("../config/db");
const { createPublicApiError } = require("../utils/publicApiError");
const schemaLib = require("./serviceCatalogSchema");

function catalogError(status, code, messageAr, fieldErrors) {
  const err = createPublicApiError(messageAr, status, code);
  if (fieldErrors) err.fieldErrors = fieldErrors;
  return err;
}

/** Key-order independent JSON (JSONB does not preserve key order). */
function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Price modifiers / pricing are internal (Admin quote suggestions). Never sent to customers or
 * freelancers: strip them from field definitions (incl. options and S7 sub-fields).
 */
function stripPricingFromFields(fields) {
  return (fields || []).map((f) => {
    const { priceModifier, ...rest } = f || {};
    void priceModifier;
    if (Array.isArray(rest.options)) {
      rest.options = rest.options.map((o) => {
        const { priceModifier: pm, ...ro } = o || {};
        void pm;
        return ro;
      });
    }
    if (Array.isArray(rest.fields)) rest.fields = stripPricingFromFields(rest.fields);
    return rest;
  });
}

function mapServiceRow(r, { includeAdmin = false } = {}) {
  const schema = r.schema || {};
  return {
    id: String(r.id),
    serviceCode: r.service_code,
    categoryId: String(r.category_id),
    subSubcategoryId: r.sub_subcategory_id != null ? String(r.sub_subcategory_id) : null,
    visibility: r.visibility,
    priceMode: r.price_mode,
    sortOrder: r.sort_order,
    version: r.current_version,
    name: schema.name || {},
    description: schema.description || {},
    quantity: schema.quantity || null,
    fields: includeAdmin ? schema.fields || [] : stripPricingFromFields(schema.fields),
    ...(includeAdmin
      ? {
          // S5: the editor must load existing pricing, or a save would silently drop it.
          pricing: schema.pricing || null,
          isActive: r.is_active,
          updatedAt: r.updated_at,
          versionCount: r.version_count != null ? Number(r.version_count) : undefined,
          snapshotCount: r.snapshot_count != null ? Number(r.snapshot_count) : undefined,
        }
      : {}),
  };
}

const SERVICE_WITH_SCHEMA_SQL = `
  SELECT s.*, v.schema
    FROM catalog_services s
    JOIN catalog_service_versions v ON v.service_id = s.id AND v.version = s.current_version`;

/**
 * Catalog for order creation. audience 'client' → active + public services in active categories.
 * `fieldTypes` (optional allowlist from a client app) hides services it cannot render completely.
 */
async function listCatalog({ audience = "client", fieldTypes = null } = {}) {
  const adminAudience = audience === "admin";
  const { rows } = await pool.query(
    `${SERVICE_WITH_SCHEMA_SQL}
      JOIN categories c ON c.id = s.category_id
     WHERE s.is_active = TRUE AND c.is_active = TRUE
       ${adminAudience ? "" : "AND s.visibility = 'public'"}
     ORDER BY s.sort_order, s.id`,
  );
  const allowed = Array.isArray(fieldTypes) ? fieldTypes.filter((t) => schemaLib.FIELD_TYPES.includes(t)) : null;
  const services = rows.filter((r) => schemaLib.schemaUsesOnly(r.schema, allowed)).map((r) => mapServiceRow(r));
  const { rows: cats } = await pool.query(
    `SELECT id, slug, name, name_en, sort_order FROM categories
      WHERE is_active = TRUE AND id = ANY($1::bigint[])
      ORDER BY sort_order, id`,
    [Array.from(new Set(services.map((s) => Number(s.categoryId))))],
  );
  const categories = cats.map((c) => ({ id: String(c.id), slug: c.slug, name: c.name, nameEn: c.name_en || null }));
  // Content hash = cache key / ETag; changes whenever any visible definition or ordering changes.
  const catalogVersion = crypto
    .createHash("sha256")
    .update(JSON.stringify({ categories, services: services.map((s) => [s.serviceCode, s.version, s.categoryId, s.sortOrder]) }))
    .digest("hex")
    .slice(0, 16);
  return { catalogVersion, categories, services };
}

/** Resolve the service to snapshot for a new order (inside the order transaction). */
async function resolveServiceForOrder(client, { serviceForm, audience, categoryId }) {
  const { rows } = await client.query(
    `${SERVICE_WITH_SCHEMA_SQL}
      JOIN categories c ON c.id = s.category_id
     WHERE s.service_code = $1
     LIMIT 1`,
    [serviceForm.serviceCode],
  );
  const svc = rows[0];
  if (!svc || svc.is_active !== true || (audience !== "admin" && svc.visibility !== "public")) {
    throw catalogError(400, "SMART_ORDER_SERVICE_UNAVAILABLE", "الخدمة المختارة غير متاحة.", { serviceCode: "unavailable" });
  }
  if (serviceForm.version !== null && serviceForm.version !== svc.current_version) {
    throw catalogError(409, "SMART_ORDER_FORM_STALE", "تم تحديث نموذج الخدمة. حدّث الصفحة وأعد المحاولة.", { version: "stale" });
  }
  if (Number(categoryId) !== Number(svc.category_id)) {
    throw catalogError(400, "SMART_ORDER_FORM_INVALID", "تصنيف الطلب لا يطابق الخدمة.", { categoryId: "mismatch" });
  }
  return svc;
}

/**
 * Validate the dynamic values and write the immutable snapshot for `orderId`.
 * Must run in the same transaction that created the order.
 */
async function createSnapshotInTransaction(client, { orderId, svc, serviceForm, uploadedFileNames, actorUserId }) {
  const validated = schemaLib.validateOrderForm(svc.schema, serviceForm, { uploadedFileNames });
  await client.query(
    `INSERT INTO order_form_snapshots
       (order_id, service_id, service_code, service_version, category_id, definition, field_values,
        quantity, quantity_unit, quantity_unspecified, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)`,
    [
      Number(orderId),
      Number(svc.id),
      svc.service_code,
      svc.current_version,
      Number(svc.category_id),
      JSON.stringify({ ...svc.schema, priceMode: svc.price_mode }),
      JSON.stringify(validated.values),
      validated.quantity,
      svc.schema.quantity.unit,
      validated.quantityUnspecified,
      actorUserId != null ? Number(actorUserId) : null,
    ],
  );
  return validated;
}

/** Validate before the order row exists (fail fast without side effects). */
function prevalidate(svc, serviceForm, uploadedFileNames) {
  return schemaLib.validateOrderForm(svc.schema, serviceForm, { uploadedFileNames });
}

function mapSnapshotRow(r) {
  if (!r) return null;
  const def = r.definition || {};
  return {
    serviceCode: r.service_code,
    version: r.service_version,
    name: def.name || {},
    priceMode: def.priceMode || null,
    quantity: {
      unit: r.quantity_unit,
      value: r.quantity != null ? String(r.quantity) : null,
      unspecified: Boolean(r.quantity_unspecified),
    },
    fields: stripPricingFromFields(def.fields),
    values: r.field_values || {},
    createdAt: r.created_at,
  };
}

async function getOrderFormSnapshot(orderId, clientMaybe) {
  const { rows } = await (clientMaybe || pool).query(
    `SELECT service_code, service_version, definition, field_values, quantity, quantity_unit, quantity_unspecified, created_at
       FROM order_form_snapshots WHERE order_id = $1 LIMIT 1`,
    [Number(orderId)],
  );
  return mapSnapshotRow(rows[0]);
}

/** Batched snapshots for list endpoints (one query per page). */
async function getOrderFormSnapshotsMap(orderIds) {
  const ids = (orderIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return new Map();
  const { rows } = await pool.query(
    `SELECT order_id, service_code, service_version, definition, field_values, quantity, quantity_unit, quantity_unspecified, created_at
       FROM order_form_snapshots WHERE order_id = ANY($1::bigint[])`,
    [ids],
  );
  return new Map(rows.map((r) => [String(r.order_id), mapSnapshotRow(r)]));
}

// ---------------------------------------------------------------------------
// Admin management
// ---------------------------------------------------------------------------

async function assertCategoryChain(client, { categoryId, subSubcategoryId }) {
  const { rows } = await client.query(`SELECT id FROM categories WHERE id = $1`, [categoryId]);
  if (!rows[0]) throw catalogError(400, "SERVICE_CATALOG_INVALID", "التصنيف غير موجود.", { categoryId: "not_found" });
  if (subSubcategoryId) {
    const { rows: ss } = await client.query(
      `SELECT 1 FROM sub_subcategories ss JOIN subcategories s ON s.id = ss.subcategory_id
        WHERE ss.id = $1 AND s.category_id = $2`,
      [subSubcategoryId, categoryId],
    );
    if (!ss[0]) throw catalogError(400, "SERVICE_CATALOG_INVALID", "التصنيف الفرعي لا يتبع التصنيف.", { subSubcategoryId: "mismatch" });
  }
}

async function listAdminServices() {
  const { rows } = await pool.query(
    `${SERVICE_WITH_SCHEMA_SQL.replace("SELECT s.*, v.schema", `SELECT s.*, v.schema,
            (SELECT COUNT(*) FROM catalog_service_versions x WHERE x.service_id = s.id) AS version_count,
            (SELECT COUNT(*) FROM order_form_snapshots o WHERE o.service_id = s.id) AS snapshot_count`)}
     ORDER BY s.category_id, s.sort_order, s.id`,
  );
  const { rows: cats } = await pool.query(
    `SELECT id, slug, name, name_en, is_active, sort_order FROM categories ORDER BY sort_order, id`,
  );
  return {
    categories: cats.map((c) => ({ id: String(c.id), slug: c.slug, name: c.name, nameEn: c.name_en || null, isActive: c.is_active })),
    services: rows.map((r) => mapServiceRow(r, { includeAdmin: true })),
  };
}

async function getAdminService(id) {
  const { rows } = await pool.query(`${SERVICE_WITH_SCHEMA_SQL} WHERE s.id = $1`, [Number(id)]);
  if (!rows[0]) throw catalogError(404, "SERVICE_CATALOG_NOT_FOUND", "الخدمة غير موجودة.");
  const { rows: versions } = await pool.query(
    `SELECT v.version, v.change_note, v.created_at, u.first_name, u.family_name
       FROM catalog_service_versions v LEFT JOIN users u ON u.id = v.created_by_user_id
      WHERE v.service_id = $1 ORDER BY v.version DESC LIMIT 50`,
    [Number(id)],
  );
  return {
    service: mapServiceRow(rows[0], { includeAdmin: true }),
    versions: versions.map((v) => ({
      version: v.version,
      changeNote: v.change_note || null,
      createdAt: v.created_at,
      createdBy: [v.first_name, v.family_name].filter(Boolean).join(" ") || null,
    })),
  };
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function createService({ definition, actorUserId }) {
  const { meta, schema } = schemaLib.normalizeServiceDefinition(definition);
  const id = await withTx(async (client) => {
    await assertCategoryChain(client, meta);
    const { rows: dup } = await client.query(`SELECT 1 FROM catalog_services WHERE service_code = $1`, [meta.serviceCode]);
    if (dup[0]) throw catalogError(409, "SERVICE_CATALOG_CODE_TAKEN", "رمز الخدمة مستخدم.", { serviceCode: "taken" });
    const { rows } = await client.query(
      `INSERT INTO catalog_services
         (service_code, category_id, sub_subcategory_id, visibility, price_mode, sort_order, current_version,
          created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7) RETURNING id`,
      [meta.serviceCode, meta.categoryId, meta.subSubcategoryId, meta.visibility, meta.priceMode, meta.sortOrder, Number(actorUserId)],
    );
    await client.query(
      `INSERT INTO catalog_service_versions (service_id, version, schema, change_note, created_by_user_id)
       VALUES ($1, 1, $2::jsonb, $3, $4)`,
      [rows[0].id, JSON.stringify(schema), "created", Number(actorUserId)],
    );
    return rows[0].id;
  });
  return getAdminService(id);
}

/**
 * Update a service. Metadata (category, visibility, order, price mode) updates in place; any change to the
 * versioned definition (names, quantity, fields) appends version N+1. The service code is immutable.
 */
async function updateService({ id, definition, changeNote, actorUserId }) {
  const svcId = Number(id);
  await withTx(async (client) => {
    const { rows } = await client.query(
      `SELECT s.*, v.schema FROM catalog_services s
         JOIN catalog_service_versions v ON v.service_id = s.id AND v.version = s.current_version
        WHERE s.id = $1 FOR UPDATE OF s`,
      [svcId],
    );
    const cur = rows[0];
    if (!cur) throw catalogError(404, "SERVICE_CATALOG_NOT_FOUND", "الخدمة غير موجودة.");
    const { meta, schema } = schemaLib.normalizeServiceDefinition({ ...definition, serviceCode: cur.service_code });
    await assertCategoryChain(client, meta);
    let version = cur.current_version;
    if (stableStringify(schema) !== stableStringify(cur.schema)) {
      version += 1;
      await client.query(
        `INSERT INTO catalog_service_versions (service_id, version, schema, change_note, created_by_user_id)
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [svcId, version, JSON.stringify(schema), String(changeNote || "").slice(0, 300) || null, Number(actorUserId)],
      );
    }
    await client.query(
      `UPDATE catalog_services
          SET category_id = $2, sub_subcategory_id = $3, visibility = $4, price_mode = $5, sort_order = $6,
              current_version = $7, updated_by_user_id = $8, updated_at = NOW()
        WHERE id = $1`,
      [svcId, meta.categoryId, meta.subSubcategoryId, meta.visibility, meta.priceMode, meta.sortOrder, version, Number(actorUserId)],
    );
  });
  return getAdminService(svcId);
}

async function setServiceActive({ id, active, actorUserId }) {
  const { rowCount } = await pool.query(
    `UPDATE catalog_services SET is_active = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1`,
    [Number(id), Boolean(active), Number(actorUserId)],
  );
  if (!rowCount) throw catalogError(404, "SERVICE_CATALOG_NOT_FOUND", "الخدمة غير موجودة.");
  return getAdminService(id);
}

module.exports = {
  listCatalog,
  resolveServiceForOrder,
  prevalidate,
  createSnapshotInTransaction,
  getOrderFormSnapshot,
  getOrderFormSnapshotsMap,
  mapSnapshotRow,
  mapServiceRow,
  stripPricingFromFields,
  listAdminServices,
  getAdminService,
  createService,
  updateService,
  setServiceActive,
};
