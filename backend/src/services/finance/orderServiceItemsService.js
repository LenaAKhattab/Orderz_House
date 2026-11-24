/**
 * Smart Orders S5 — multi-service orders.
 *
 * One canonical order; the primary service stays in order_form_snapshots (S2). Additional services are
 * immutable items (2..n) validated against the CURRENT catalog version and frozen with their definition.
 * Items can be soft-removed (audit kept). Changes are refused once a quote payment exists, because the
 * paid quote snapshot is the commercial truth. Execution/assignment stays at order level (documented).
 */

const { pool } = require("../../config/db");
const schemaLib = require("../serviceCatalogSchema");
const catalog = require("../serviceCatalogService");

const MAX_ITEMS = 10;

function iErr(status, code, message, details) {
  const e = new Error(message);
  e.statusCode = status;
  e.publicCode = code;
  if (details) e.details = details;
  return e;
}

async function assertItemsEditable(client, orderId) {
  const { rows } = await client.query(
    `SELECT id, source_type, order_status FROM orders WHERE id = $1 FOR UPDATE`,
    [orderId],
  );
  const o = rows[0];
  if (!o) throw iErr(404, "SMART_ORDER_NOT_FOUND", "الطلب غير موجود.");
  if (o.source_type === "client_created") throw iErr(409, "SMART_ORDER_ITEMS_UNSUPPORTED", "طلبات السوق لا تدعم بنودًا إضافية.");
  if (["completed", "cancelled"].includes(o.order_status)) throw iErr(409, "SMART_ORDER_ITEMS_LOCKED", "لا يمكن تعديل بنود طلب مغلق.");
  const { rows: paid } = await client.query(
    `SELECT 1 FROM order_quotes WHERE order_id = $1 AND payment_status IN ('paid', 'paid_inactive') LIMIT 1`,
    [orderId],
  );
  if (paid[0]) throw iErr(409, "SMART_ORDER_ITEMS_LOCKED", "تم دفع عرض سعر لهذا الطلب؛ لا يمكن تعديل البنود.");
  return o;
}

function mapItem(r) {
  return {
    id: String(r.id),
    itemNo: r.item_no,
    serviceCode: r.service_code,
    serviceVersion: r.service_version,
    name: r.definition?.name || {},
    priceMode: r.definition?.priceMode || null,
    fields: r.definition?.fields || [],
    values: r.field_values || {},
    quantity: { unit: r.quantity_unit, value: r.quantity != null ? String(r.quantity) : null, unspecified: Boolean(r.quantity_unspecified) },
    price: r.price_amount != null ? { amount: String(r.price_amount), currency: r.price_currency } : null,
    note: r.note,
    removedAt: r.removed_at,
    createdAt: r.created_at,
  };
}

async function listItems(orderId, { includeRemoved = false } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT * FROM order_service_items WHERE order_id = $1 ${includeRemoved ? "" : "AND removed_at IS NULL"} ORDER BY item_no`,
    [Number(orderId)],
  );
  return rows.map(mapItem);
}

async function addItem({ orderId, input, actorUserId }) {
  const oid = Number(orderId);
  if (!Number.isInteger(oid) || oid < 1) throw iErr(400, "SMART_ORDER_NOT_FOUND", "الطلب غير صالح.");
  const form = schemaLib.parseServiceFormInput(input?.serviceForm);
  if (!form) throw iErr(400, "SMART_ORDER_FORM_INVALID", "الخدمة مطلوبة.", { serviceCode: "required" });
  let price = null;
  if (input?.price && (input.price.amount !== undefined || input.price.currency !== undefined)) {
    const amount = String(input.price.amount ?? "").trim();
    const currency = String(input.price.currency || "").toUpperCase();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || /^0+(\.0+)?$/.test(amount) || !["JOD", "AED"].includes(currency)) {
      throw iErr(400, "SMART_ORDER_ITEM_INVALID", "سعر البند غير صالح.", { price: "invalid" });
    }
    price = { amount, currency };
  }
  const note = input?.note ? String(input.note).replace(/[<>\u0000-\u0008]/g, "").trim().slice(0, 500) : null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertItemsEditable(client, oid);
    const { rows: cat } = await client.query(`SELECT category_id FROM catalog_services WHERE service_code = $1`, [form.serviceCode]);
    if (!cat[0]) throw iErr(400, "SMART_ORDER_SERVICE_UNAVAILABLE", "الخدمة غير متاحة.", { serviceCode: "unavailable" });
    const svc = await catalog.resolveServiceForOrder(client, { serviceForm: form, audience: "admin", categoryId: cat[0].category_id });
    // Item files reference files already attached to the order (items are added over JSON, not multipart).
    const { rows: files } = await client.query(
      `SELECT original_name FROM order_files WHERE order_id = $1 AND COALESCE(purpose, 'brief') = 'brief'`,
      [oid],
    );
    const validated = schemaLib.validateOrderForm(svc.schema, form, { uploadedFileNames: files.map((f) => f.original_name) });
    const { rows: n } = await client.query(
      `SELECT COALESCE(MAX(item_no), 1) + 1 AS next, COUNT(*) FILTER (WHERE removed_at IS NULL)::int AS live
         FROM order_service_items WHERE order_id = $1`,
      [oid],
    );
    if (n[0].live >= MAX_ITEMS) throw iErr(409, "SMART_ORDER_ITEMS_LIMIT", "تم بلوغ الحد الأقصى للبنود.");
    const { rows } = await client.query(
      `INSERT INTO order_service_items
         (order_id, item_no, service_id, service_code, service_version, definition, field_values, quantity, quantity_unit,
          quantity_unspecified, price_amount, price_currency, note, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        oid, n[0].next, svc.id, svc.service_code, svc.current_version,
        JSON.stringify({ ...svc.schema, priceMode: svc.price_mode }), JSON.stringify(validated.values),
        validated.quantity, svc.schema.quantity.unit, validated.quantityUnspecified,
        price?.amount ?? null, price?.currency ?? null, note, actorUserId ?? null,
      ],
    );
    await client.query("COMMIT");
    return mapItem(rows[0]);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function removeItem({ orderId, itemId, actorUserId }) {
  void actorUserId;
  const oid = Number(orderId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertItemsEditable(client, oid);
    const { rows } = await client.query(
      `UPDATE order_service_items SET removed_at = NOW() WHERE id = $1 AND order_id = $2 AND removed_at IS NULL RETURNING id`,
      [Number(itemId), oid],
    );
    if (!rows[0]) throw iErr(404, "SMART_ORDER_ITEM_NOT_FOUND", "البند غير موجود.");
    await client.query("COMMIT");
    return { removed: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { listItems, addItem, removeItem, MAX_ITEMS };
