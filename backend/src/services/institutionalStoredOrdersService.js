/**
 * Institutional stored-order lifecycle: create, submit, approve, transfer, archive, schedule, release.
 */
const { pool } = require("../config/db");
const ordersService = require("./ordersService");
const fakeOrdersService = require("./fakeOrdersService");
const base = require("./institutionalStorageService");
  const {
  getStorageBudgetLocked,
  writeAudit,
  writeReview,
  mapStoredOrder,
  httpError,
  resolveOrderPriceJod,
  BUDGET_CONSUMING_STATUSES,
  distributeEvenly,
  buildMonthPeriods,
  buildStaggerBatchesForMonth,
  assignOrdersToMonthBatches,
  tryAcquireReleaseLock,
  releaseReleaseLock,
  loadStorageInstitutions,
  formatPgDateOnly,
} = base;

function parseSkills(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

function buildOrderPayloadFromBody(body) {
  const projectType = body.projectType === "bidding" ? "bidding" : "fixed";
  const orderPriceJod = resolveOrderPriceJod({
    projectType,
    budget: body.budget,
    bidBudgetMin: body.bidBudgetMin,
    bidBudgetMax: body.bidBudgetMax,
  });
  return {
    orderCode: body.orderCode ? String(body.orderCode).trim() : null,
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    categoryId: Number(body.categoryId),
    subcategoryId: body.subcategoryId != null ? Number(body.subcategoryId) : null,
    subSubcategoryId: body.subSubcategoryId != null ? Number(body.subSubcategoryId) : null,
    extraCategoryIds: Array.isArray(body.extraCategoryIds)
      ? body.extraCategoryIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : typeof body.extraCategoryIds === "string"
        ? (() => {
            try {
              return JSON.parse(body.extraCategoryIds).map(Number).filter((n) => Number.isInteger(n) && n > 0);
            } catch {
              return [];
            }
          })()
        : [],
    extraCategoryDetails:
      typeof body.extraCategoryDetails === "string"
        ? (() => {
            try {
              return JSON.parse(body.extraCategoryDetails);
            } catch {
              return {};
            }
          })()
        : body.extraCategoryDetails && typeof body.extraCategoryDetails === "object"
          ? body.extraCategoryDetails
          : {},
    projectType,
    budget: projectType === "fixed" ? Number(body.budget) : null,
    bidBudgetMin: projectType === "bidding" ? Number(body.bidBudgetMin) : null,
    bidBudgetMax: projectType === "bidding" ? Number(body.bidBudgetMax) : null,
    durationValue: Number(body.durationValue),
    durationUnit: String(body.durationUnit || "days"),
    preferredSkills: parseSkills(body.preferredSkills),
    assignedFreelancerId: body.assignedFreelancerId ? Number(body.assignedFreelancerId) : null,
    orderPriceJod,
  };
}

async function createStoredOrder({ actorUserId, storageId, body, uploadedFiles = [] }) {
  const payload = buildOrderPayloadFromBody(body);
  if (payload.title.length < 2 || payload.description.length < 2) {
    throw httpError("العنوان والوصف مطلوبان.");
  }
  if (!Number.isInteger(payload.categoryId) || payload.categoryId < 1) {
    throw httpError("التصنيف مطلوب.");
  }

  const institutionsService = require("./institutionsService");
  await institutionsService.assertStorageInstitutionsNotFrozen(storageId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: sRows } = await client.query(
      `SELECT id, status FROM institutional_order_storages WHERE id = $1 FOR UPDATE`,
      [Number(storageId)],
    );
    if (!sRows[0]) throw httpError("المخزن غير موجود.", 404);
    if (sRows[0].status === "archived") {
      throw httpError("لا يمكن إضافة طلبات إلى مخزن مؤرشف أو مكتمل.", 409);
    }

    const { rows } = await client.query(
      `INSERT INTO institutional_stored_orders (
         storage_id, lifecycle_status, order_code, title, description,
         category_id, subcategory_id, sub_subcategory_id,
         extra_category_ids, extra_category_details,
         project_type, budget, bid_budget_min, bid_budget_max, currency_code,
         duration_value, duration_unit, preferred_skills, assigned_freelancer_id,
         order_price_jod, created_by
       ) VALUES (
         $1, 'draft', $2, $3, $4,
         $5, $6, $7,
         $8::bigint[], $9::jsonb,
         $10, $11, $12, $13, 'JOD',
         $14, $15, $16::jsonb, $17,
         $18, $19
       ) RETURNING *`,
      [
        Number(storageId),
        payload.orderCode,
        payload.title,
        payload.description,
        payload.categoryId,
        payload.subcategoryId,
        payload.subSubcategoryId,
        payload.extraCategoryIds,
        JSON.stringify(payload.extraCategoryDetails || {}),
        payload.projectType,
        payload.budget,
        payload.bidBudgetMin,
        payload.bidBudgetMax,
        payload.durationValue,
        payload.durationUnit,
        JSON.stringify(payload.preferredSkills),
        payload.assignedFreelancerId,
        payload.orderPriceJod,
        Number(actorUserId),
      ],
    );
    const order = rows[0];

    // Optional Cloudinary upload — skip if helper unavailable or no files
    if (uploadedFiles.length && typeof ordersService.uploadFilesToCloudinary === "function") {
      const prepared = await ordersService.uploadFilesToCloudinary({
        orderId: order.id,
        files: uploadedFiles,
        purpose: "brief",
      });
      for (const f of prepared || []) {
        await client.query(
          `INSERT INTO institutional_stored_order_files
            (stored_order_id, original_name, mime_type, byte_size, secure_url, public_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            order.id,
            f.originalname || f.originalName || "file",
            f.mimetype || f.mimeType || null,
            Number(f.size || f.byteSize || 0) || null,
            f.secureUrl || f.urlPath,
            f.publicId || null,
          ],
        );
      }
    }

    await writeAudit(client, {
      storageId,
      actorUserId,
      action: "order_created",
      entityType: "stored_order",
      entityId: order.id,
      after: mapStoredOrder(order),
    });
    await client.query("COMMIT");
    return mapStoredOrder(order);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function listStoredOrders({
  storageId,
  lifecycleStatus = null,
  page = 1,
  limit = 20,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [Number(storageId)];
  const where = [`o.storage_id = $1`, `o.deleted_at IS NULL`];
  if (lifecycleStatus) {
    params.push(String(lifecycleStatus));
    where.push(`o.lifecycle_status = $${params.length}`);
  }
  const whereSql = where.join(" AND ");
  const { rows: cRows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM institutional_stored_orders o WHERE ${whereSql}`,
    params,
  );
  const total = Number(cRows[0]?.c || 0);
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT o.*, c.name AS category_name
     FROM institutional_stored_orders o
     LEFT JOIN categories c ON c.id = o.category_id
     WHERE ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    orders: rows.map(mapStoredOrder),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function getStoredOrder(id) {
  const { rows } = await pool.query(
    `SELECT o.*, c.name AS category_name
     FROM institutional_stored_orders o
     LEFT JOIN categories c ON c.id = o.category_id
     WHERE o.id = $1 AND o.deleted_at IS NULL
     LIMIT 1`,
    [Number(id)],
  );
  if (!rows[0]) throw httpError("الطلب غير موجود.", 404);
  const order = mapStoredOrder(rows[0]);
  const { rows: files } = await pool.query(
    `SELECT id, original_name, mime_type, byte_size, secure_url, public_id, created_at
     FROM institutional_stored_order_files WHERE stored_order_id = $1 ORDER BY id ASC`,
    [Number(id)],
  );
  order.files = files.map((f) => ({
    id: String(f.id),
    originalName: f.original_name,
    mimeType: f.mime_type,
    byteSize: f.byte_size,
    secureUrl: f.secure_url,
    publicId: f.public_id,
    createdAt: f.created_at,
  }));
  if (order.releasedOrderId) {
    const { rows: live } = await pool.query(
      `SELECT id, order_status, is_published, is_open_for_pool, assigned_freelancer_id, visibility_scope
       FROM orders WHERE id = $1 LIMIT 1`,
      [Number(order.releasedOrderId)],
    );
    if (live[0]) {
      order.liveOrder = {
        id: String(live[0].id),
        orderStatus: live[0].order_status,
        isPublished: Boolean(live[0].is_published),
        isOpenForPool: Boolean(live[0].is_open_for_pool),
        assignedFreelancerId: live[0].assigned_freelancer_id
          ? String(live[0].assigned_freelancer_id)
          : null,
        visibilityScope: live[0].visibility_scope || "institution",
      };
    }
  }
  return order;
}

async function submitForApproval({ actorUserId, storedOrderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    const order = rows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    const institutionsService = require("./institutionsService");
    await institutionsService.assertStorageInstitutionsNotFrozen(order.storage_id, client);
    if (!["draft", "rejected"].includes(order.lifecycle_status)) {
      throw httpError("يمكن إرسال المسودات أو المرفوضة فقط للموافقة.", 409);
    }
    await client.query(
      `UPDATE institutional_stored_orders
       SET lifecycle_status = 'pending_super_admin_approval',
           submitted_for_approval_at = NOW(),
           submitted_for_approval_by = $2,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [order.id, Number(actorUserId)],
    );
    await writeReview(client, {
      storageId: order.storage_id,
      storedOrderId: order.id,
      actorUserId,
      action: "submit_for_approval",
      previousStatus: order.lifecycle_status,
      newStatus: "pending_super_admin_approval",
    });
    await client.query("COMMIT");
    return getStoredOrder(order.id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Super Admin approve — transactional budget check.
 * Concurrent approvals serialize on storage FOR UPDATE.
 */
async function approveStoredOrder({ actorUserId, storedOrderId, reason = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    const order = rows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    if (order.lifecycle_status !== "pending_super_admin_approval") {
      throw httpError("الطلب ليس بانتظار الموافقة.", 409);
    }

    const budget = await getStorageBudgetLocked(client, order.storage_id);
    const institutionsService = require("./institutionsService");
    await institutionsService.assertStorageInstitutionsNotFrozen(order.storage_id, client);
    const price = Number(order.order_price_jod);
    if (budget.consumedAmountJod + price > budget.financialLimitJod + 1e-9) {
      throw httpError(
        "الموافقة ستتجاوز الحد المالي للمخزن.",
        409,
        "FINANCIAL_LIMIT_EXCEEDED",
      );
    }

    await client.query(
      `UPDATE institutional_stored_orders
       SET lifecycle_status = 'approved_unscheduled',
           approved_at = NOW(),
           approved_by = $2,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [order.id, Number(actorUserId)],
    );
    await writeReview(client, {
      storageId: order.storage_id,
      storedOrderId: order.id,
      actorUserId,
      action: "approve",
      previousStatus: order.lifecycle_status,
      newStatus: "approved_unscheduled",
      reason,
      metadata: { orderPriceJod: price, remainingAfter: budget.remainingJod - price },
    });
    await client.query("COMMIT");
    return getStoredOrder(order.id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function updateApprovedOrderPrice({ actorUserId, storedOrderId, newPriceJod }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    const order = rows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    if (!BUDGET_CONSUMING_STATUSES.includes(order.lifecycle_status)) {
      throw httpError("تحديث السعر مسموح للطلبات المعتمدة فقط.", 409);
    }
    if (order.lifecycle_status === "released") {
      throw httpError("لا يمكن تغيير سعر طلب تم إطلاقه.", 409);
    }
    const nextPrice = Number(newPriceJod);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) throw httpError("السعر غير صالح.");

    const budget = await getStorageBudgetLocked(client, order.storage_id);
    const withoutThis = budget.consumedAmountJod - Number(order.order_price_jod);
    if (withoutThis + nextPrice > budget.financialLimitJod + 1e-9) {
      throw httpError("السعر الجديد يتجاوز الحد المالي للمخزن.", 409, "FINANCIAL_LIMIT_EXCEEDED");
    }

    const isBidding = order.project_type === "bidding";
    if (isBidding) {
      await client.query(
        `UPDATE institutional_stored_orders
         SET order_price_jod = $2, bid_budget_max = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $1`,
        [order.id, nextPrice, Number(actorUserId)],
      );
    } else {
      await client.query(
        `UPDATE institutional_stored_orders
         SET order_price_jod = $2, budget = $2, updated_by = $3, updated_at = NOW()
         WHERE id = $1`,
        [order.id, nextPrice, Number(actorUserId)],
      );
    }
    await writeReview(client, {
      storageId: order.storage_id,
      storedOrderId: order.id,
      actorUserId,
      action: "price_update",
      previousStatus: order.lifecycle_status,
      newStatus: order.lifecycle_status,
      metadata: { previousPrice: Number(order.order_price_jod), newPrice: nextPrice },
    });
    await client.query("COMMIT");
    return getStoredOrder(order.id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Transfer to training/fake inventory via createFakeOrder.
 * Releases institutional budget; prevents duplicate transfer.
 */
async function transferToTraining({ actorUserId, storedOrderId, reason = null }) {
  const client = await pool.connect();
  let order;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    order = rows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    if (order.transferred_fake_order_id) {
      throw httpError("تم نقل هذا الطلب مسبقاً إلى الطلبات التجريبية.", 409, "ALREADY_TRANSFERRED");
    }
    if (order.lifecycle_status === "released" || order.released_order_id) {
      throw httpError(
        "لا يمكن نقل طلب تم إطلاقه. استخدم مسار إلغاء الطلب الحقيقي إن لزم.",
        409,
        "RELEASED_TRANSFER_BLOCKED",
      );
    }
    if (["transferred", "deleted"].includes(order.lifecycle_status)) {
      throw httpError("حالة الطلب لا تسمح بالنقل.", 409);
    }
    // Mark transferring intent inside txn; createFakeOrder uses its own connection
    await client.query(
      `UPDATE institutional_stored_orders
       SET lifecycle_status = 'transferred',
           transferred_at = NOW(),
           transferred_by = $2,
           updated_by = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [order.id, Number(actorUserId)],
    );
    await writeReview(client, {
      storageId: order.storage_id,
      storedOrderId: order.id,
      actorUserId,
      action: "transfer_to_training",
      previousStatus: order.lifecycle_status,
      newStatus: "transferred",
      reason,
    });
    // Cancel any pending batch assignment
    await client.query(
      `UPDATE institutional_batch_orders
       SET release_status = 'cancelled'
       WHERE stored_order_id = $1 AND release_status = 'pending'`,
      [order.id],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const fakePayload = {
    title: order.title,
    description: order.description,
    categoryId: order.category_id,
    subcategoryId: order.subcategory_id,
    subSubcategoryId: order.sub_subcategory_id,
    projectType: order.project_type,
    budget: order.budget,
    bidBudgetMin: order.bid_budget_min,
    bidBudgetMax: order.bid_budget_max,
    minBudget: order.project_type === "bidding" ? order.bid_budget_min : order.budget,
    maxBudget: order.project_type === "bidding" ? order.bid_budget_max : order.budget,
    durationValue: order.duration_value,
    durationUnit: order.duration_unit,
    minDuration: order.duration_value,
    maxDuration: order.duration_value,
    isActive: true,
  };

  let fakeOrder;
  try {
    fakeOrder = await fakeOrdersService.createFakeOrder({
      actorUserId,
      payload: fakePayload,
    });
  } catch (e) {
    // Roll back transferred status if fake creation fails
    await pool.query(
      `UPDATE institutional_stored_orders
       SET lifecycle_status = $2, transferred_at = NULL, transferred_by = NULL, updated_at = NOW()
       WHERE id = $1 AND lifecycle_status = 'transferred' AND transferred_fake_order_id IS NULL`,
      [order.id, order.lifecycle_status],
    );
    throw e;
  }

  const fakeId = Number(fakeOrder?.id || fakeOrder?.data?.id);
  await pool.query(
    `UPDATE institutional_stored_orders
     SET transferred_fake_order_id = $2, updated_at = NOW()
     WHERE id = $1`,
    [order.id, fakeId],
  );
  await pool.query(
    `INSERT INTO institutional_order_reviews
      (storage_id, stored_order_id, actor_user_id, action, previous_status, new_status, reason, metadata)
     VALUES ($1, $2, $3, 'transfer_to_training', 'transferred', 'transferred', $4, $5::jsonb)`,
    [
      order.storage_id,
      order.id,
      Number(actorUserId),
      reason,
      JSON.stringify({ transferredFakeOrderId: fakeId }),
    ],
  );

  return { ...await getStoredOrder(order.id), transferredFakeOrderId: String(fakeId) };
}

/**
 * Archive: if approved but not released and no marketplace activity → release budget.
 * If already released → keep as archived marker on stored row only (real order untouched);
 * budget stays consumed for released orders.
 */
async function archiveStoredOrder({ actorUserId, storedOrderId, reason = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    const order = rows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    if (["archived", "transferred", "deleted"].includes(order.lifecycle_status)) {
      throw httpError("الطلب مؤرشف أو منقول مسبقاً.", 409);
    }
    if (order.lifecycle_status === "released") {
      // Prefer: do not release budget after release; just mark stored row archived for history
      // and cancel nothing on live order.
      await client.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'archived', archived_at = NOW(), archived_by = $2,
             updated_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [order.id, Number(actorUserId)],
      );
    } else {
      await client.query(
        `UPDATE institutional_batch_orders
         SET release_status = 'cancelled'
         WHERE stored_order_id = $1 AND release_status = 'pending'`,
        [order.id],
      );
      await client.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'archived', archived_at = NOW(), archived_by = $2,
             updated_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [order.id, Number(actorUserId)],
      );
    }
    await writeReview(client, {
      storageId: order.storage_id,
      storedOrderId: order.id,
      actorUserId,
      action: "archive",
      previousStatus: order.lifecycle_status,
      newStatus: "archived",
      reason,
      metadata: {
        budgetReleased: order.lifecycle_status !== "released",
      },
    });
    await client.query("COMMIT");
    return getStoredOrder(order.id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function deleteStoredOrder({ actorUserId, storedOrderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [Number(storedOrderId)],
    );
    const order = rows[0];
    if (!order) throw httpError("الطلب غير موجود.", 404);
    if (order.lifecycle_status === "released" || order.released_order_id) {
      throw httpError(
        "لا يمكن حذف طلب تم إطلاقه. يمكن أرشفة السجل الإداري فقط دون سحب الطلب الحي.",
        409,
        "RELEASED_DELETE_BLOCKED",
      );
    }
    const { rows: reviewCount } = await client.query(
      `SELECT COUNT(*)::int AS c FROM institutional_order_reviews WHERE stored_order_id = $1`,
      [order.id],
    );
    const hasHistory = Number(reviewCount[0]?.c || 0) > 0;
    if (!["draft", "pending_super_admin_approval", "rejected"].includes(order.lifecycle_status)) {
      throw httpError("لا يمكن حذف طلب معتمد أو مطلق أو منقول. استخدم الأرشفة.", 409);
    }
    if (hasHistory || order.lifecycle_status === "pending_super_admin_approval") {
      await client.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'deleted', deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
         WHERE id = $1`,
        [order.id, Number(actorUserId)],
      );
      await writeReview(client, {
        storageId: order.storage_id,
        storedOrderId: order.id,
        actorUserId,
        action: "delete",
        previousStatus: order.lifecycle_status,
        newStatus: "deleted",
      });
    } else {
      await client.query(`DELETE FROM institutional_stored_order_files WHERE stored_order_id = $1`, [
        order.id,
      ]);
      await client.query(`DELETE FROM institutional_stored_orders WHERE id = $1`, [order.id]);
      await writeAudit(client, {
        storageId: order.storage_id,
        actorUserId,
        action: "order_hard_deleted",
        entityType: "stored_order",
        entityId: order.id,
      });
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function listPendingApprovals({
  page = 1,
  limit = 20,
  storageId = null,
  institutionId = null,
  q = "",
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [];
  const where = [
    `o.lifecycle_status = 'pending_super_admin_approval'`,
    `o.deleted_at IS NULL`,
  ];
  if (storageId) {
    params.push(Number(storageId));
    where.push(`o.storage_id = $${params.length}`);
  }
  const iid = Number(institutionId);
  if (Number.isInteger(iid) && iid > 0) {
    params.push(iid);
    where.push(
      `EXISTS (
         SELECT 1 FROM institutional_storage_institutions si
         WHERE si.storage_id = o.storage_id AND si.institution_id = $${params.length}
       )`,
    );
  }
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(o.title ILIKE $${params.length} OR COALESCE(s.name,'') ILIKE $${params.length})`);
  }
  const whereSql = where.join(" AND ");
  const { rows: cRows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM institutional_stored_orders o
     INNER JOIN institutional_order_storages s ON s.id = o.storage_id
     WHERE ${whereSql}`,
    params,
  );
  const total = Number(cRows[0]?.c || 0);
  params.push(lim);
  const limIdx = params.length;
  params.push(off);
  const offIdx = params.length;
  params.push(BUDGET_CONSUMING_STATUSES);
  const consumingIdx = params.length;
  const { rows } = await pool.query(
    `SELECT o.*, c.name AS category_name, s.name AS storage_name,
       s.financial_limit_jod AS storage_financial_limit_jod,
       COALESCE(budget.consumed_amount, 0)::numeric AS storage_consumed_amount_jod,
       COALESCE(
         NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''),
         u.email
       ) AS submitted_by_name,
       (
         SELECT COALESCE(json_agg(json_build_object('id', i.id::text, 'name', i.name) ORDER BY i.name), '[]'::json)
         FROM institutional_storage_institutions si
         INNER JOIN institutions i ON i.id = si.institution_id
         WHERE si.storage_id = o.storage_id
       ) AS institutions_json
     FROM institutional_stored_orders o
     LEFT JOIN categories c ON c.id = o.category_id
     INNER JOIN institutional_order_storages s ON s.id = o.storage_id
     LEFT JOIN users u ON u.id = o.submitted_for_approval_by
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(x.order_price_jod), 0)::numeric AS consumed_amount
       FROM institutional_stored_orders x
       WHERE x.storage_id = o.storage_id
         AND x.deleted_at IS NULL
         AND x.lifecycle_status = ANY($${consumingIdx}::text[])
     ) budget ON TRUE
     WHERE ${whereSql}
     ORDER BY o.submitted_for_approval_at ASC NULLS LAST, o.id ASC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  );
  return {
    orders: rows.map((r) => {
      let institutions = [];
      try {
        const raw = r.institutions_json;
        institutions = Array.isArray(raw) ? raw : typeof raw === "string" ? JSON.parse(raw) : [];
      } catch {
        institutions = [];
      }
      const financialLimit = Number(r.storage_financial_limit_jod || 0);
      const consumedAmount = Number(r.storage_consumed_amount_jod || 0);
      const orderPrice = Number(r.order_price_jod || 0);
      return {
        ...mapStoredOrder(r),
        storageName: r.storage_name,
        storageFinancialLimitJod: financialLimit,
        storageRemainingJod: Math.max(0, financialLimit - consumedAmount),
        remainingAfterApprovalJod: financialLimit - consumedAmount - orderPrice,
        submittedByName: r.submitted_by_name || null,
        submittedAt: r.submitted_for_approval_at || null,
        institutions,
      };
    }),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim) || 1) },
  };
}

/**
 * Generate or regenerate schedule before any releases.
 * Only assigns approved_unscheduled (+ optionally re-packs scheduled that are not yet in a released batch).
 */
async function generateSchedule({ actorUserId, storageId, regenerate = false }) {
  const institutionsService = require("./institutionsService");
  await institutionsService.assertStorageInstitutionsNotFrozen(storageId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: sRows } = await client.query(
      `SELECT * FROM institutional_order_storages WHERE id = $1 FOR UPDATE`,
      [Number(storageId)],
    );
    const storage = sRows[0];
    if (!storage) throw httpError("المخزن غير موجود.", 404);

    const { rows: releasedBatches } = await client.query(
      `SELECT COUNT(*)::int AS c FROM institutional_release_batches
       WHERE storage_id = $1 AND status IN ('RELEASED', 'PARTIALLY_RELEASED', 'PROCESSING')`,
      [Number(storageId)],
    );
    const hasReleased = Number(releasedBatches[0]?.c || 0) > 0;
    if (hasReleased && regenerate) {
      throw httpError("لا يمكن إعادة توليد الجدول بعد بدء الإطلاقات.", 409);
    }

    if (!hasReleased) {
      await client.query(
        `DELETE FROM institutional_batch_orders
         WHERE batch_id IN (SELECT id FROM institutional_release_batches WHERE storage_id = $1)`,
        [Number(storageId)],
      );
      await client.query(`DELETE FROM institutional_release_batches WHERE storage_id = $1`, [
        Number(storageId),
      ]);
      await client.query(`DELETE FROM institutional_storage_months WHERE storage_id = $1`, [
        Number(storageId),
      ]);
      await client.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'approved_unscheduled', updated_at = NOW()
         WHERE storage_id = $1 AND lifecycle_status = 'scheduled' AND released_order_id IS NULL`,
        [Number(storageId)],
      );
    }

    const { rows: approved } = await client.query(
      `SELECT id FROM institutional_stored_orders
       WHERE storage_id = $1
         AND deleted_at IS NULL
         AND lifecycle_status = 'approved_unscheduled'
       ORDER BY approved_at ASC NULLS LAST, id ASC`,
      [Number(storageId)],
    );
    const orderIds = approved.map((r) => Number(r.id));
    const months = Number(storage.distribution_months);
    const counts = distributeEvenly(orderIds.length, months);
    const periods = buildMonthPeriods(storage.distribution_start_date, months);
    const staggerByMonth = counts.map((c) => buildStaggerBatchesForMonth(c));
    const plan = assignOrdersToMonthBatches({ orderIds, monthCounts: counts, staggerByMonth });

    for (const period of periods) {
      const monthPlan = plan.months.find((m) => m.monthSequence === period.monthSequence);
      const { rows: mRows } = await client.query(
        `INSERT INTO institutional_storage_months
          (storage_id, month_sequence, period_start_date, period_end_date, target_order_count, status)
         VALUES ($1, $2, $3::date, $4::date, $5, 'planned')
         RETURNING *`,
        [
          Number(storageId),
          period.monthSequence,
          period.periodStartDate,
          period.periodEndDate,
          monthPlan?.targetOrderCount || 0,
        ],
      );
      const month = mRows[0];
      for (const batch of monthPlan?.batches || []) {
        const releaseAt = new Date(period.periodStartAt.getTime());
        releaseAt.setUTCDate(releaseAt.getUTCDate() + batch.dayOffset);
        const idempotencyKey = `s${storageId}-m${period.monthSequence}-d${batch.dayOffset}-c${batch.assignedOrderCount}`;
        const { rows: bRows } = await client.query(
          `INSERT INTO institutional_release_batches
            (storage_id, month_id, month_sequence, scheduled_release_at, assigned_order_count,
             status, idempotency_key, created_by)
           VALUES ($1, $2, $3, $4, $5, 'SCHEDULED', $6, $7)
           RETURNING *`,
          [
            Number(storageId),
            month.id,
            period.monthSequence,
            releaseAt.toISOString(),
            batch.assignedOrderCount,
            idempotencyKey,
            Number(actorUserId),
          ],
        );
        const batchRow = bRows[0];
        let pos = 0;
        for (const oid of batch.orderIds) {
          await client.query(
            `INSERT INTO institutional_batch_orders (batch_id, stored_order_id, position, release_status)
             VALUES ($1, $2, $3, 'pending')`,
            [batchRow.id, oid, pos],
          );
          pos += 1;
          await client.query(
            `UPDATE institutional_stored_orders
             SET lifecycle_status = 'scheduled', updated_by = $2, updated_at = NOW()
             WHERE id = $1`,
            [oid, Number(actorUserId)],
          );
        }
      }
    }

    await writeAudit(client, {
      storageId,
      actorUserId,
      action: regenerate ? "schedule_regenerated" : "schedule_generated",
      entityType: "storage",
      entityId: storageId,
      after: { assigned: orderIds.length, unscheduled: plan.unscheduledOrderIds.length },
    });
    await client.query("COMMIT");
    return getSchedule(storageId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function getSchedule(storageId) {
  const { rows: months } = await pool.query(
    `SELECT * FROM institutional_storage_months WHERE storage_id = $1 ORDER BY month_sequence ASC`,
    [Number(storageId)],
  );
  const { rows: batches } = await pool.query(
    `SELECT b.*,
       (SELECT COUNT(*)::int FROM institutional_batch_orders bo
        WHERE bo.batch_id = b.id AND bo.release_status = 'released') AS released_count,
       (SELECT COUNT(*)::int FROM institutional_batch_orders bo
        WHERE bo.batch_id = b.id AND bo.release_status = 'pending') AS pending_count
     FROM institutional_release_batches b
     WHERE b.storage_id = $1
     ORDER BY b.scheduled_release_at ASC, b.id ASC`,
    [Number(storageId)],
  );
  const { rows: unscheduledRows } = await pool.query(
    `SELECT id, title, order_price_jod, lifecycle_status, approved_at
     FROM institutional_stored_orders
     WHERE storage_id = $1 AND lifecycle_status = 'approved_unscheduled' AND deleted_at IS NULL
     ORDER BY approved_at ASC NULLS LAST, id ASC`,
    [Number(storageId)],
  );
  return {
    months: months.map((m) => ({
      id: String(m.id),
      monthSequence: Number(m.month_sequence),
      periodStartDate: formatPgDateOnly(m.period_start_date),
      periodEndDate: formatPgDateOnly(m.period_end_date),
      targetOrderCount: Number(m.target_order_count),
      status: m.status,
      batches: batches
        .filter((b) => Number(b.month_id) === Number(m.id))
        .map((b) => ({
          id: String(b.id),
          monthSequence: Number(b.month_sequence),
          scheduledReleaseAt: b.scheduled_release_at,
          assignedOrderCount: Number(b.assigned_order_count),
          releasedCount: Number(b.released_count || 0),
          pendingCount: Number(b.pending_count || 0),
          status: b.status,
          releasedAt: b.released_at,
          failureReason: b.failure_reason,
          retryCount: Number(b.retry_count || 0),
          idempotencyKey: b.idempotency_key,
        })),
    })),
    unscheduledApprovedCount: unscheduledRows.length,
    unscheduledOrders: unscheduledRows.map((o) => ({
      id: String(o.id),
      title: o.title,
      orderPriceJod: Number(o.order_price_jod),
      lifecycleStatus: o.lifecycle_status,
      approvedAt: o.approved_at,
    })),
  };
}

/**
 * Release one stored order into real orders table with institution visibility.
 * Idempotent: if a live order already exists for this stored row, returns its id.
 */
async function releaseOneStoredOrder(_clientUnused, { storedOrder, storage, actorUserId }) {
  const claimClient = await pool.connect();
  try {
    await claimClient.query("BEGIN");
    const { rows: lockedRows } = await claimClient.query(
      `SELECT * FROM institutional_stored_orders WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
      [storedOrder.id],
    );
    const locked = lockedRows[0];
    if (!locked) {
      await claimClient.query("ROLLBACK");
      throw httpError("الطلب المخزّن غير موجود.", 404);
    }
    if (locked.released_order_id) {
      await claimClient.query("COMMIT");
      return Number(locked.released_order_id);
    }
    if (locked.lifecycle_status === "released") {
      const { rows: existing } = await claimClient.query(
        `SELECT id FROM orders WHERE institutional_stored_order_id = $1 ORDER BY id ASC LIMIT 1`,
        [storedOrder.id],
      );
      await claimClient.query("COMMIT");
      if (existing[0]) return Number(existing[0].id);
      throw httpError("الطلب مُطلق مسبقاً دون ربط صالح.", 409);
    }
    if (locked.lifecycle_status !== "scheduled") {
      await claimClient.query("COMMIT");
      throw httpError("لا يمكن إطلاق طلب غير مجدول.", 409);
    }
    const { rows: existingOrders } = await claimClient.query(
      `SELECT id FROM orders WHERE institutional_stored_order_id = $1 ORDER BY id ASC LIMIT 1`,
      [storedOrder.id],
    );
    if (existingOrders[0]) {
      const realOrderId = Number(existingOrders[0].id);
      await claimClient.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'released', released_order_id = $2,
             released_at = COALESCE(released_at, NOW()), updated_at = NOW()
         WHERE id = $1`,
        [storedOrder.id, realOrderId],
      );
      await claimClient.query("COMMIT");
      return realOrderId;
    }
    await claimClient.query("COMMIT");
  } catch (e) {
    await claimClient.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    claimClient.release();
  }

  const created = await ordersService.createInternalOrder({
    actorUserId: actorUserId || storage.created_by,
    actorRole: "super_admin",
    payload: {
      orderCode: storedOrder.order_code || undefined,
      title: storedOrder.title,
      description: storedOrder.description,
      categoryId: storedOrder.category_id,
      subcategoryId: storedOrder.subcategory_id,
      subSubcategoryId: storedOrder.sub_subcategory_id,
      extraCategoryIds: storedOrder.extra_category_ids || [],
      extraCategoryDetails: storedOrder.extra_category_details || {},
      projectType: storedOrder.project_type,
      budget: storedOrder.budget,
      bidBudgetMin: storedOrder.bid_budget_min,
      bidBudgetMax: storedOrder.bid_budget_max,
      durationValue: storedOrder.duration_value,
      durationUnit: storedOrder.duration_unit,
      preferredSkills: Array.isArray(storedOrder.preferred_skills)
        ? storedOrder.preferred_skills
        : [],
      assignedFreelancerId: null,
      archive: false,
    },
    uploadedFiles: [],
    options: {
      skipFreelancerBroadcast: true,
      visibilityScope: "institution",
      institutionalStorageId: storage.id,
      institutionalStoredOrderId: storedOrder.id,
    },
  });
  const realOrderId = Number(created?.id);
  if (!Number.isInteger(realOrderId) || realOrderId < 1) {
    throw httpError("فشل إنشاء الطلب الحقيقي عند الإطلاق.", 500);
  }

  // Copy brief files from institutional storage into the real order
  const { rows: files } = await pool.query(
    `SELECT * FROM institutional_stored_order_files WHERE stored_order_id = $1`,
    [storedOrder.id],
  );
  for (const f of files) {
    await pool.query(
      `INSERT INTO order_files (
        order_id, file_path, file_url, secure_url, public_id, original_name, mime_type, size_bytes, uploaded_by_user_id, purpose
      ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, 'brief')`,
      [
        realOrderId,
        f.public_id || "cloudinary_asset",
        f.secure_url,
        f.public_id,
        f.original_name,
        f.mime_type,
        f.byte_size || 0,
        storedOrder.created_by,
      ],
    ).catch(() => null);
  }

  return realOrderId;
}

async function processDueReleaseBatches({ limit = 10, actorUserId = null } = {}) {
  const scheduleSvc = require("./institutionalScheduleService");
  const lockClient = await pool.connect();
  const results = [];
  try {
    const locked = await tryAcquireReleaseLock(lockClient);
    if (!locked) {
      await scheduleSvc.recordSchedulerTick({ status: "skipped_lock", summary: { reason: "lock_busy" } }).catch(() => {});
      return { skipped: true, reason: "lock_busy", results: [] };
    }

    await lockClient.query("BEGIN");
    const { rows: due } = await lockClient.query(
      `SELECT b.*
       FROM institutional_release_batches b
       INNER JOIN institutional_order_storages s ON s.id = b.storage_id
       WHERE b.status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
         AND b.scheduled_release_at <= NOW()
         AND s.status = 'active'
       ORDER BY b.scheduled_release_at ASC, b.id ASC
       LIMIT $1
       FOR UPDATE OF b SKIP LOCKED`,
      [Math.min(Math.max(Number(limit) || 10, 1), 50)],
    );
    await lockClient.query("COMMIT");

    for (const batch of due) {
      results.push(await processOneBatch(batch, actorUserId));
    }
    await scheduleSvc
      .recordSchedulerTick({
        status: "success",
        summary: { processed: results.length, results },
      })
      .catch(() => {});
    return { skipped: false, results };
  } catch (e) {
    await lockClient.query("ROLLBACK").catch(() => {});
    await scheduleSvc
      .recordSchedulerTick({ status: "failed", error: String(e.message || e).slice(0, 1000) })
      .catch(() => {});
    throw e;
  } finally {
    await releaseReleaseLock(lockClient);
    lockClient.release();
  }
}

async function processOneBatch(batch, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: claimed } = await client.query(
      `UPDATE institutional_release_batches
       SET status = 'PROCESSING', updated_at = NOW()
       WHERE id = $1
         AND status IN ('SCHEDULED', 'FAILED', 'PARTIALLY_RELEASED')
       RETURNING *`,
      [batch.id],
    );
    const b = claimed[0];
    if (!b) {
      const { rows: bRows } = await client.query(
        `SELECT status FROM institutional_release_batches WHERE id = $1`,
        [batch.id],
      );
      await client.query("COMMIT");
      return { batchId: batch.id, skipped: true, status: bRows[0]?.status };
    }

    const { rows: sRows } = await client.query(
      `SELECT * FROM institutional_order_storages WHERE id = $1 FOR UPDATE`,
      [b.storage_id],
    );
    const storage = sRows[0];
    if (!storage || storage.status !== "active") {
      await client.query(
        `UPDATE institutional_release_batches
         SET status = 'FAILED', failure_reason = 'storage_not_active', updated_at = NOW()
         WHERE id = $1`,
        [b.id],
      );
      await client.query("COMMIT");
      return { batchId: b.id, status: "FAILED", reason: "storage_not_active" };
    }

    const institutions = await loadStorageInstitutions(storage.id, client);
    if (!institutions.length || institutions.every((i) => i.status !== "active")) {
      await client.query(
        `UPDATE institutional_release_batches
         SET status = 'FAILED', failure_reason = 'no_active_institutions', updated_at = NOW()
         WHERE id = $1`,
        [b.id],
      );
      await client.query("COMMIT");
      return { batchId: b.id, status: "FAILED", reason: "no_active_institutions" };
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const { rows: pendingOrders } = await pool.query(
    `SELECT o.*
     FROM institutional_batch_orders bo
     INNER JOIN institutional_stored_orders o ON o.id = bo.stored_order_id
     WHERE bo.batch_id = $1 AND bo.release_status = 'pending'
       AND o.lifecycle_status = 'scheduled'
       AND o.released_order_id IS NULL
       AND o.deleted_at IS NULL
     ORDER BY bo.position ASC, o.id ASC`,
    [batch.id],
  );

  let released = 0;
  let failed = 0;
  const { rows: storageRows } = await pool.query(
    `SELECT * FROM institutional_order_storages WHERE id = $1`,
    [batch.storage_id],
  );
  const storage = storageRows[0];

  for (const order of pendingOrders) {
    try {
      const realOrderId = await releaseOneStoredOrder(pool, {
        storedOrder: order,
        storage,
        actorUserId: actorUserId || storage.created_by,
      });
      if (!realOrderId) continue;

      const link = await pool.query(
        `UPDATE institutional_batch_orders
         SET release_status = 'released', released_order_id = $2
         WHERE batch_id = $1 AND stored_order_id = $3 AND release_status = 'pending'
         RETURNING stored_order_id`,
        [batch.id, realOrderId, order.id],
      );
      const storedUpd = await pool.query(
        `UPDATE institutional_stored_orders
         SET lifecycle_status = 'released', released_order_id = $2, released_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND (released_order_id IS NULL OR released_order_id = $2)
         RETURNING id`,
        [order.id, realOrderId],
      );
      if (link.rowCount > 0 && storedUpd.rowCount > 0) {
        await pool.query(
          `INSERT INTO institutional_release_logs
            (storage_id, batch_id, stored_order_id, event, success, message, metadata)
           VALUES ($1, $2, $3, 'order_released', TRUE, NULL, $4::jsonb)`,
          [batch.storage_id, batch.id, order.id, JSON.stringify({ releasedOrderId: realOrderId })],
        );
        released += 1;
      } else if (storedUpd.rowCount > 0 || link.rowCount > 0) {
        released += 1;
      }
    } catch (err) {
      failed += 1;
      await pool.query(
        `UPDATE institutional_batch_orders
         SET release_status = 'failed', failure_reason = $2
         WHERE batch_id = $1 AND stored_order_id = $3 AND release_status = 'pending'`,
        [batch.id, String(err.message || err).slice(0, 500), order.id],
      );
      await pool.query(
        `INSERT INTO institutional_release_logs
          (storage_id, batch_id, stored_order_id, event, success, message)
         VALUES ($1, $2, $3, 'order_release_failed', FALSE, $4)`,
        [batch.storage_id, batch.id, order.id, String(err.message || err).slice(0, 1000)],
      );
    }
  }

  let finalStatus = "RELEASED";
  if (failed > 0 && released > 0) finalStatus = "PARTIALLY_RELEASED";
  if (failed > 0 && released === 0) finalStatus = "FAILED";
  if (failed === 0 && released === 0) {
    const { rows: remaining } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM institutional_batch_orders
       WHERE batch_id = $1 AND release_status = 'pending'`,
      [batch.id],
    );
    if (Number(remaining[0]?.c || 0) === 0) {
      const { rows: anyReleased } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM institutional_batch_orders
         WHERE batch_id = $1 AND release_status = 'released'`,
        [batch.id],
      );
      finalStatus = Number(anyReleased[0]?.c || 0) > 0 ? "RELEASED" : "FAILED";
    }
  }

  await pool.query(
    `UPDATE institutional_release_batches
     SET status = $2::text,
         released_at = CASE WHEN $2::text IN ('RELEASED', 'PARTIALLY_RELEASED') THEN NOW() ELSE released_at END,
         failure_reason = CASE WHEN $3::int > 0 THEN $4::text ELSE NULL END,
         retry_count = retry_count + CASE WHEN $3::int > 0 THEN 1 ELSE 0 END,
         updated_at = NOW()
     WHERE id = $1`,
    [
      batch.id,
      finalStatus,
      failed,
      failed ? `${failed} order(s) failed to release` : null,
    ],
  );

  return { batchId: batch.id, status: finalStatus, released, failed };
}

async function retryBatch({ actorUserId, batchId }) {
  const { rows } = await pool.query(
    `UPDATE institutional_release_batches
     SET status = 'SCHEDULED',
         scheduled_release_at = LEAST(scheduled_release_at, NOW()),
         failure_reason = NULL,
         updated_by = $2,
         updated_at = NOW()
     WHERE id = $1 AND status IN ('FAILED', 'PARTIALLY_RELEASED')
     RETURNING *`,
    [Number(batchId), Number(actorUserId)],
  );
  if (!rows[0]) throw httpError("الدفعة غير موجودة أو لا يمكن إعادة محاولتها.", 404);
  await pool.query(
    `UPDATE institutional_batch_orders
     SET release_status = 'pending', failure_reason = NULL
     WHERE batch_id = $1 AND release_status = 'failed'`,
    [Number(batchId)],
  );
  return processDueReleaseBatches({ limit: 1, actorUserId });
}

/** Institution-scoped private pool listing. */
async function listInstitutionalPoolForUser({ userId, page = 1, limit = 20, q = "" }) {
  const institutionIds = await base.institutionsService.listActiveInstitutionIdsForUser(userId);
  if (!institutionIds.length) {
    return {
      orders: [],
      pagination: { page: 1, limit, total: 0, totalPages: 1 },
    };
  }
  const lim = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pg = Math.max(Number(page) || 1, 1);
  const off = (pg - 1) * lim;
  const params = [institutionIds];
  let searchSql = "";
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    searchSql = ` AND (o.title ILIKE $${params.length} OR COALESCE(o.order_code, '') ILIKE $${params.length}
      OR CAST(o.id AS text) ILIKE $${params.length})`;
  }

  const { rows: cRows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM orders o
     WHERE o.visibility_scope = 'institution'
       AND o.is_published = TRUE
       AND o.is_open_for_pool = TRUE
       AND o.assigned_freelancer_id IS NULL
       AND o.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
       AND o.institutional_storage_id IN (
         SELECT si.storage_id FROM institutional_storage_institutions si
         WHERE si.institution_id = ANY($1::bigint[])
       )${searchSql}`,
    params,
  );
  const total = Number(cRows[0]?.c || 0);
  params.push(lim, off);
  const { rows } = await pool.query(
    `SELECT o.id, o.order_code, o.title, o.description, o.project_type, o.budget,
            o.bid_budget_min, o.bid_budget_max, o.currency_code, o.order_status,
            o.duration_value, o.duration_unit, o.category_id, o.created_at,
            o.institutional_storage_id
     FROM orders o
     WHERE o.visibility_scope = 'institution'
       AND o.is_published = TRUE
       AND o.is_open_for_pool = TRUE
       AND o.assigned_freelancer_id IS NULL
       AND o.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')
       AND o.institutional_storage_id IN (
         SELECT si.storage_id FROM institutional_storage_institutions si
         WHERE si.institution_id = ANY($1::bigint[])
       )${searchSql}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    orders: rows.map((r) => ({
      id: String(r.id),
      orderCode: r.order_code,
      title: r.title,
      description: r.description,
      projectType: r.project_type,
      budget: r.budget != null ? Number(r.budget) : null,
      bidBudgetMin: r.bid_budget_min != null ? Number(r.bid_budget_min) : null,
      bidBudgetMax: r.bid_budget_max != null ? Number(r.bid_budget_max) : null,
      currencyCode: r.currency_code,
      orderStatus: r.order_status,
      durationValue: r.duration_value,
      durationUnit: r.duration_unit,
      categoryId: r.category_id != null ? String(r.category_id) : null,
      institutionalStorageId: r.institutional_storage_id != null ? String(r.institutional_storage_id) : null,
      createdAt: r.created_at,
      orderSource: "institutional",
    })),
    pagination: { page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) },
  };
}

async function assertUserCanViewInstitutionalOrder(userId, orderId) {
  const institutionsService = require("./institutionsService");
  const { rows } = await pool.query(
    `SELECT o.id, o.visibility_scope, o.institutional_storage_id
     FROM orders o WHERE o.id = $1 LIMIT 1`,
    [Number(orderId)],
  );
  const order = rows[0];
  if (!order) return { allowed: false, reason: "not_found" };
  if (order.visibility_scope !== "institution") return { allowed: true, reason: "public_scope" };
  if (!order.institutional_storage_id) return { allowed: false, reason: "missing_storage" };

  const { rows: frozen } = await pool.query(
    `SELECT 1
     FROM institutional_storage_institutions si
     INNER JOIN institutions i ON i.id = si.institution_id
     WHERE si.storage_id = $1 AND i.status = 'frozen'
     LIMIT 1`,
    [order.institutional_storage_id],
  );
  if (frozen[0]) return { allowed: false, reason: "institution_frozen" };

  const { rows: inst } = await pool.query(
    `SELECT institution_id FROM institutional_storage_institutions WHERE storage_id = $1`,
    [order.institutional_storage_id],
  );
  const ids = inst.map((r) => Number(r.institution_id));
  const ok = await institutionsService.userBelongsToAnyInstitution(userId, ids);
  return { allowed: ok, reason: ok ? "member" : "forbidden" };
}

module.exports = {
  createStoredOrder,
  listStoredOrders,
  getStoredOrder,
  submitForApproval,
  approveStoredOrder,
  updateApprovedOrderPrice,
  transferToTraining,
  archiveStoredOrder,
  deleteStoredOrder,
  listPendingApprovals,
  generateSchedule,
  getSchedule,
  processDueReleaseBatches,
  retryBatch,
  listInstitutionalPoolForUser,
  assertUserCanViewInstitutionalOrder,
  buildOrderPayloadFromBody,
  releaseOneStoredOrder,
};
