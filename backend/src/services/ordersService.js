const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { pool } = require("../config/db");
const subscriptionsService = require("./subscriptionsService");
const orderFlowService = require("./orderFlowService");
const { baseUploadsDir } = require("../middleware/ordersUploadMiddleware");

/** Multer/busboy often stores UTF-8 filenames as latin1 bytes; fix for DB display and downloads. */
function decodeMultipartOriginalName(name) {
  const s = String(name ?? "");
  if (!s) return s;
  try {
    const decoded = Buffer.from(s, "latin1").toString("utf8");
    const hasArabic = (t) => /[\u0600-\u06FF]/.test(t);
    if (hasArabic(decoded) && !hasArabic(s)) return decoded;
  } catch (_) {
    /* ignore */
  }
  return s;
}

const ORDER_STATUSES = orderFlowService.ORDER_STATUSES;

function isPoolListedSourceType(sourceType) {
  return orderFlowService.isPoolListedSourceType(sourceType);
}

function hasPricedBiddingRow(row) {
  if (!row || row.project_type !== "bidding") return false;
  const min = row.bid_budget_min != null ? Number(row.bid_budget_min) : null;
  const max = row.bid_budget_max != null ? Number(row.bid_budget_max) : null;
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min;
}

function computeDueAt(startedAt, durationValue, durationUnit) {
  const v = Number(durationValue);
  if (!Number.isFinite(v) || v <= 0) return null;
  const startMs = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return null;
  const mul =
    durationUnit === "days" ? 24 * 60 * 60 * 1000 : durationUnit === "hours" ? 60 * 60 * 1000 : 60 * 1000;
  if (!mul) return null;
  return new Date(startMs + v * mul);
}

// Business rule toggle: keep subscription rules consistent by default.
// If your business ever needs "forced internal assignment", flip to true.
const ALLOW_ADMIN_ASSIGN_TO_INACTIVE_FREELANCERS = false;

function normalizeSkillName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatYmd(date) {
  const d = new Date(date);
  const y = String(d.getUTCFullYear());
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function generateUniqueOrderCode(client) {
  const runner = client || pool;
  const prefix = `ORD-${formatYmd(new Date())}-`;
  for (let i = 0; i < 30; i += 1) {
    const rnd = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 chars
    const code = `${prefix}${rnd}`;
    const { rowCount } = await runner.query(`SELECT 1 FROM orders WHERE order_code = $1`, [code]);
    if (rowCount === 0) return code;
  }
  const err = new Error("Could not allocate a unique order id. Please try again.");
  err.statusCode = 503;
  throw err;
}

function mapOrderBase(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderCode: row.order_code,
    title: row.title,
    description: row.description,
    categoryId: String(row.category_id),
    subcategoryId: row.subcategory_id ? String(row.subcategory_id) : null,
    subSubcategoryId: row.sub_subcategory_id ? String(row.sub_subcategory_id) : null,
    extraCategoryIds: Array.isArray(row.extra_category_ids) ? row.extra_category_ids.map((x) => String(x)) : [],
    extraCategoryDetails: row.extra_category_details && typeof row.extra_category_details === "object" ? row.extra_category_details : {},
    projectType: row.project_type,
    budget: row.budget != null ? Number(row.budget) : null,
    currencyCode: row.currency_code || null,
    bidBudgetMin: row.bid_budget_min != null ? Number(row.bid_budget_min) : null,
    bidBudgetMax: row.bid_budget_max != null ? Number(row.bid_budget_max) : null,
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    createdByUserId: String(row.created_by_user_id),
    createdByRole: row.created_by_role || null,
    sourceType: row.source_type,
    assignedFreelancerId: row.assigned_freelancer_id ? String(row.assigned_freelancer_id) : null,
    acceptedFreelancerId: row.accepted_freelancer_id ? String(row.accepted_freelancer_id) : null,
    stripeCheckoutSessionId: row.stripe_checkout_session_id || null,
    stripePaymentIntentId: row.stripe_payment_intent_id || null,
    paidAt: row.paid_at || null,
    paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : null,
    paymentCurrency: row.payment_currency || null,
    isArchived: Boolean(row.is_archived),
    isPublished: row.is_published,
    isOpenForPool: row.is_open_for_pool,
    paymentRequired: row.payment_required,
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    receivedAt: row.received_at || null,
    takenAt: row.taken_at || null,
    acceptedAt: row.accepted_at || null,
    startedAt: row.started_at || null,
    dueAt: row.due_at || null,
    /** Same instant as dueAt (API alias for «deadline»). */
    deadline: row.due_at || null,
    submittedAt: row.submitted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientRevisionNote: row.client_revision_note || null,
  };
}

async function isInternalPoolOrder(row) {
  return ["admin_created", "super_admin_created"].includes(row?.source_type);
}

async function assertCategoryChain({ categoryId, subcategoryId, subSubcategoryId }, client) {
  const runner = client || pool;
  const { rowCount: catOk } = await runner.query(`SELECT 1 FROM categories WHERE id = $1 AND is_active = TRUE`, [
    Number(categoryId),
  ]);
  if (catOk === 0) {
    const err = new Error("Invalid category.");
    err.statusCode = 400;
    throw err;
  }

  // If only sub-subcategory provided, infer subcategory and validate full chain.
  if (!subcategoryId && subSubcategoryId) {
    const { rows: inferRows } = await runner.query(
      `SELECT ss.subcategory_id, s.category_id
       FROM sub_subcategories ss
       JOIN subcategories s ON s.id = ss.subcategory_id
       WHERE ss.id = $1 AND ss.is_active = TRUE
       LIMIT 1`,
      [Number(subSubcategoryId)],
    );
    const inferred = inferRows[0];
    if (!inferred) {
      const err = new Error("Invalid sub sub category.");
      err.statusCode = 400;
      throw err;
    }
    if (Number(inferred.category_id) !== Number(categoryId)) {
      const err = new Error("Sub sub category does not belong to category.");
      err.statusCode = 400;
      throw err;
    }
    return { inferredSubcategoryId: String(inferred.subcategory_id) };
  }

  if (!subcategoryId) return true;

  const { rows } = await runner.query(
    `SELECT id, category_id, is_active
     FROM subcategories
     WHERE id = $1
     LIMIT 1`,
    [Number(subcategoryId)],
  );
  const sub = rows[0];
  if (!sub || !sub.is_active) {
    const err = new Error("Invalid sub category.");
    err.statusCode = 400;
    throw err;
  }
  if (Number(sub.category_id) !== Number(categoryId)) {
    const err = new Error("Sub category does not belong to category.");
    err.statusCode = 400;
    throw err;
  }

  if (!subSubcategoryId) return true;

  const { rows: subSubRows } = await runner.query(
    `SELECT id, subcategory_id, is_active
     FROM sub_subcategories
     WHERE id = $1
     LIMIT 1`,
    [Number(subSubcategoryId)],
  );
  const subSub = subSubRows[0];
  if (!subSub || !subSub.is_active) {
    const err = new Error("Invalid sub sub category.");
    err.statusCode = 400;
    throw err;
  }
  if (Number(subSub.subcategory_id) !== Number(subcategoryId)) {
    const err = new Error("Sub sub category does not belong to sub category.");
    err.statusCode = 400;
    throw err;
  }
  return true;
}

async function assertAssignableFreelancer({ freelancerUserId }, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT id, role, is_active FROM users WHERE id = $1 LIMIT 1`, [
    Number(freelancerUserId),
  ]);
  const u = rows[0];
  if (!u) {
    const err = new Error("Freelancer not found.");
    err.statusCode = 404;
    throw err;
  }
  if (u.role !== "freelancer") {
    const err = new Error("Assigned user must be a freelancer.");
    err.statusCode = 400;
    throw err;
  }
  if (!u.is_active) {
    const err = new Error("Assigned freelancer account is disabled.");
    err.statusCode = 400;
    throw err;
  }

  const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(u.id));
  if (!eligibility.eligible && !ALLOW_ADMIN_ASSIGN_TO_INACTIVE_FREELANCERS) {
    const err = new Error("Assigned freelancer must have an active subscription.");
    err.statusCode = 400;
    throw err;
  }
  return true;
}

async function upsertSkillsAndAttach({ orderId, skills }, client) {
  const runner = client || pool;
  const unique = [...new Set((Array.isArray(skills) ? skills : []).map(normalizeSkillName).filter(Boolean))];
  if (unique.length === 0) return [];

  const skillIds = [];
  for (const name of unique) {
    const normalized = name;
    const display = name.length > 80 ? name.slice(0, 80) : name;
    const { rows } = await runner.query(
      `INSERT INTO skills (name, normalized_name)
       VALUES ($1, $2)
       ON CONFLICT (normalized_name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [display, normalized],
    );
    const id = rows[0]?.id;
    if (id) skillIds.push(Number(id));
  }

  for (const sid of skillIds) {
    await runner.query(
      `INSERT INTO order_skills (order_id, skill_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [Number(orderId), Number(sid)],
    );
  }
  return skillIds;
}

async function attachFiles({ orderId, actorUserId, files, defaultPurpose = "brief" }, client) {
  const runner = client || pool;
  const rowsOut = [];
  for (const f of Array.isArray(files) ? files : []) {
    const relativePath = f.relativePath;
    const urlPath = f.urlPath;
    const purpose = f.purpose || defaultPurpose;
    const originalName = decodeMultipartOriginalName(f.originalname);
    const { rows } = await runner.query(
      `INSERT INTO order_files (
        order_id, file_path, file_url, original_name, mime_type, size_bytes, uploaded_by_user_id, purpose
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        Number(orderId),
        relativePath,
        urlPath,
        originalName,
        f.mimetype,
        Number(f.size || 0),
        actorUserId ? Number(actorUserId) : null,
        purpose,
      ],
    );
    rowsOut.push(rows[0]);
  }
  return rowsOut;
}

async function getOrderById(orderId, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [Number(orderId)]);
  const base = mapOrderBase(rows[0]);
  if (!base) return null;

  const { rows: skillRows } = await runner.query(
    `SELECT s.id, s.name
     FROM order_skills os
     JOIN skills s ON s.id = os.skill_id
     WHERE os.order_id = $1
     ORDER BY s.name ASC`,
    [Number(orderId)],
  );

  const { rows: fileRows } = await runner.query(
    `SELECT id, file_path, file_url, original_name, mime_type, size_bytes, uploaded_at, purpose
     FROM order_files
     WHERE order_id = $1
     ORDER BY id ASC`,
    [Number(orderId)],
  );

  const { rows: catRows } = await runner.query(`SELECT id, slug, name FROM categories WHERE id = $1 LIMIT 1`, [
    Number(base.categoryId),
  ]);
  const category = catRows[0] ? { id: String(catRows[0].id), slug: catRows[0].slug, name: catRows[0].name } : null;

  // Extra categories + their optional detailed selections (if provided)
  const extraCategories = [];
  const extraCatIds = Array.isArray(base.extraCategoryIds) ? base.extraCategoryIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
  const extraDetails = base.extraCategoryDetails && typeof base.extraCategoryDetails === "object" ? base.extraCategoryDetails : {};
  if (extraCatIds.length) {
    const { rows: extraCatRows } = await runner.query(
      `SELECT id, slug, name
       FROM categories
       WHERE id = ANY($1::bigint[])
       ORDER BY id ASC`,
      [extraCatIds],
    );
    const byId = new Map(extraCatRows.map((r) => [Number(r.id), r]));

    // Collect all referenced sub_subcategory ids for lookup.
    const ssIds = [];
    for (const cid of extraCatIds) {
      const raw = extraDetails[String(cid)];
      const ssId = raw ? Number(raw) : null;
      if (ssId && Number.isInteger(ssId) && ssId > 0) ssIds.push(ssId);
    }
    let ssById = new Map();
    if (ssIds.length) {
      const { rows: ssRows2 } = await runner.query(
        `SELECT id, slug, name, subcategory_id
         FROM sub_subcategories
         WHERE id = ANY($1::bigint[])
         ORDER BY id ASC`,
        [Array.from(new Set(ssIds))],
      );
      ssById = new Map(ssRows2.map((r) => [Number(r.id), r]));
    }

    for (const cid of extraCatIds) {
      const cRow = byId.get(cid);
      const raw = extraDetails[String(cid)];
      const ssId = raw ? Number(raw) : null;
      const ssRow = ssId && Number.isInteger(ssId) ? ssById.get(ssId) : null;
      extraCategories.push({
        category: cRow ? { id: String(cRow.id), slug: cRow.slug, name: cRow.name } : { id: String(cid), slug: null, name: String(cid) },
        subSubcategory: ssRow
          ? { id: String(ssRow.id), slug: ssRow.slug, name: ssRow.name, subcategoryId: String(ssRow.subcategory_id) }
          : null,
      });
    }
  }

  let subcategory = null;
  if (base.subcategoryId) {
    const { rows: subRows } = await runner.query(
      `SELECT id, slug, name, category_id FROM subcategories WHERE id = $1 LIMIT 1`,
      [Number(base.subcategoryId)],
    );
    if (subRows[0]) {
      subcategory = {
        id: String(subRows[0].id),
        slug: subRows[0].slug,
        name: subRows[0].name,
        categoryId: String(subRows[0].category_id),
      };
    }
  }

  let subSubcategory = null;
  if (base.subSubcategoryId) {
    const { rows: ssRows } = await runner.query(
      `SELECT id, slug, name, subcategory_id
       FROM sub_subcategories
       WHERE id = $1
       LIMIT 1`,
      [Number(base.subSubcategoryId)],
    );
    if (ssRows[0]) {
      subSubcategory = {
        id: String(ssRows[0].id),
        slug: ssRows[0].slug,
        name: ssRows[0].name,
        subcategoryId: String(ssRows[0].subcategory_id),
      };
    }
  }

  return {
    ...base,
    category,
    subcategory,
    subSubcategory,
    extraCategories,
    preferredSkills: skillRows.map((r) => ({ id: String(r.id), name: r.name })),
    files: fileRows.map((r) => ({
      id: String(r.id),
      filePath: r.file_path,
      fileUrl: r.file_url,
      originalName: decodeMultipartOriginalName(r.original_name) || r.original_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      uploadedAt: r.uploaded_at,
      purpose: r.purpose || "brief",
    })),
  };
}

async function createInternalOrder({ actorUserId, actorRole, payload, uploadedFiles = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sourceType = actorRole === "super_admin" ? "super_admin_created" : "admin_created";
    const assignedFreelancerId = payload.assignedFreelancerId ? Number(payload.assignedFreelancerId) : null;
    const wantsArchive = Boolean(payload.archive);

    const chainResult = await assertCategoryChain(
      {
        categoryId: payload.categoryId,
        subcategoryId: payload.subcategoryId || null,
        subSubcategoryId: payload.subSubcategoryId || null,
      },
      client,
    );

    const effectiveSubcategoryId =
      payload.subcategoryId || (chainResult && typeof chainResult === "object" ? chainResult.inferredSubcategoryId : null);

    if (assignedFreelancerId) {
      await assertAssignableFreelancer({ freelancerUserId: assignedFreelancerId }, client);
    }

    const orderCode = String(payload.orderCode || "").trim();
    const { rowCount: codeExists } = await client.query(`SELECT 1 FROM orders WHERE order_code = $1`, [orderCode]);
    if (codeExists > 0) {
      const err = new Error("Order code already exists.");
      err.statusCode = 409;
      throw err;
    }
    const isAssigned = Boolean(assignedFreelancerId);
    // Official assignment moment (تاريخ الاستلام) for direct admin assignment.
    const receivedAt = isAssigned ? new Date() : null;
    const startedAt = receivedAt;
    const dueAt = receivedAt ? computeDueAt(receivedAt, payload.durationValue, payload.durationUnit) : null;
    const shouldArchive = !isAssigned && wantsArchive;
    const isPublished = shouldArchive ? false : true;
    const isOpenForPool = isAssigned ? false : !shouldArchive;
    const orderStatus = isAssigned
      ? ORDER_STATUSES.ASSIGNED
      : shouldArchive
        ? ORDER_STATUSES.DRAFT
        : payload.projectType === "bidding"
          ? ORDER_STATUSES.OPEN_FOR_BIDS
          : ORDER_STATUSES.OPEN_FOR_FREELANCERS;
    const createdByRole = actorRole === "super_admin" ? "super_admin" : "admin";
    const internalPaymentAmount =
      payload.projectType === "bidding" ? null : payload.budget != null ? Number(payload.budget) : null;
    const internalPaymentCurrency =
      payload.projectType === "bidding"
        ? null
        : payload.currencyCode
          ? String(payload.currencyCode).toUpperCase()
          : null;

    const extraCategoryIds = Array.isArray(payload.extraCategoryIds)
      ? payload.extraCategoryIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
      : [];
    // Don't duplicate the primary category and cap to 10.
    const extraCategoryIdsSafe = extraCategoryIds.filter((n) => n !== Number(payload.categoryId)).slice(0, 10);

    const extraDetailsRaw =
      payload.extraCategoryDetails && typeof payload.extraCategoryDetails === "object" ? payload.extraCategoryDetails : {};
    const extraCategoryDetailsSafe = {};
    for (const catId of extraCategoryIdsSafe) {
      const raw = extraDetailsRaw[String(catId)];
      if (raw === undefined || raw === null || raw === "") continue; // optional
      const ssId = Number(raw);
      if (!Number.isInteger(ssId) || ssId < 1) continue;
      // Validate the detailed sub-subcategory belongs to the category chain.
      await assertCategoryChain({ categoryId: catId, subcategoryId: null, subSubcategoryId: ssId }, client);
      extraCategoryDetailsSafe[String(catId)] = String(ssId);
    }

    const { rows } = await client.query(
      `INSERT INTO orders (
        order_code, title, description,
        category_id, subcategory_id,
        sub_subcategory_id,
        extra_category_ids,
        extra_category_details,
        project_type, budget, currency_code, duration_value, duration_unit,
        created_by_user_id, source_type,
        assigned_freelancer_id,
        received_at, started_at, due_at,
        is_published, is_open_for_pool,
        is_archived,
        created_by_role,
        accepted_freelancer_id,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        stripe_checkout_expected_amount_minor,
        paid_at,
        payment_amount,
        payment_currency,
        payment_required, payment_status,
        order_status,
        bid_budget_min, bid_budget_max
      ) VALUES (
        $1,$2,$3,
        $4,$5,
        $6,
        $7,
        $8,
        $9,$10,$11,$12,$13,
        $14,$15,
        $16,
        $17,$18,$19,
        $20,$21,
        $22,
        $24,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        $25,
        $26,
        FALSE,'skipped_by_admin',
        $23,
        NULL, NULL
      )
      RETURNING *`,
      [
        orderCode,
        payload.title,
        payload.description,
        Number(payload.categoryId),
        effectiveSubcategoryId ? Number(effectiveSubcategoryId) : null,
        payload.subSubcategoryId ? Number(payload.subSubcategoryId) : null,
        extraCategoryIdsSafe,
        extraCategoryDetailsSafe,
        payload.projectType,
        payload.projectType === "bidding" ? null : payload.budget,
        payload.projectType === "bidding" ? null : (payload.currencyCode ? String(payload.currencyCode).toUpperCase() : null),
        Number(payload.durationValue),
        payload.durationUnit,
        Number(actorUserId),
        sourceType,
        assignedFreelancerId,
        receivedAt,
        startedAt,
        dueAt,
        isPublished,
        isOpenForPool,
        shouldArchive,
        orderStatus,
        createdByRole,
        internalPaymentAmount,
        internalPaymentCurrency,
      ],
    );

    const orderRow = rows[0];

    if (assignedFreelancerId) {
      // A directly assigned internal order is considered the freelancer's first real order if they haven't started yet.
      await subscriptionsService.activateCurrentSubscriptionOnFirstOrder(
        { freelancerUserId: String(assignedFreelancerId), activatedAt: new Date() },
        client,
      );
    }

    await upsertSkillsAndAttach({ orderId: orderRow.id, skills: payload.preferredSkills }, client);

    // Persist uploaded files (move from tmp to per-order directory)
    const orderDir = path.join(baseUploadsDir, "..", String(orderRow.id));
    if (!fs.existsSync(orderDir)) {
      fs.mkdirSync(orderDir, { recursive: true });
    }

    const preparedFiles = [];
    for (const f of uploadedFiles) {
      const srcPath = path.join(baseUploadsDir, f.filename);
      const destPath = path.join(orderDir, f.filename);
      try {
        // If the file is already moved or missing, this will throw.
        // We treat that as a hard error because DB references must be correct.
        await fsp.rename(srcPath, destPath);
      } catch (e) {
        const err = new Error("File upload could not be finalized.");
        err.statusCode = 500;
        err.cause = e;
        throw err;
      }

      const relativePath = path.join("orders", String(orderRow.id), f.filename).replace(/\\/g, "/");
      preparedFiles.push({ ...f, relativePath, urlPath: `/uploads/${relativePath}` });
    }
    await attachFiles({ orderId: orderRow.id, actorUserId, files: preparedFiles }, client);

    await client.query("COMMIT");
    return await getOrderById(orderRow.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createClientOrder({ clientUserId, payload, uploadedFiles = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: roleRows } = await client.query(`SELECT id, role FROM users WHERE id = $1 LIMIT 1`, [Number(clientUserId)]);
    const u = roleRows[0];
    if (!u || u.role !== "client") {
      const err = new Error("Only client accounts can create client orders.");
      err.statusCode = 403;
      throw err;
    }

    const chainResult = await assertCategoryChain(
      {
        categoryId: payload.categoryId,
        subcategoryId: payload.subcategoryId || null,
        subSubcategoryId: payload.subSubcategoryId || null,
      },
      client,
    );

    const effectiveSubcategoryId =
      payload.subcategoryId || (chainResult && typeof chainResult === "object" ? chainResult.inferredSubcategoryId : null);

    const orderCode = await generateUniqueOrderCode(client);

    const isFixed = payload.projectType === "fixed";
    const budget = isFixed ? Number(payload.budget) : null;
    const currencyCode = String(payload.currencyCode || "").trim().toUpperCase();
    const bidMin = !isFixed && payload.bidBudgetMin != null ? Number(payload.bidBudgetMin) : null;
    const bidMax = !isFixed && payload.bidBudgetMax != null ? Number(payload.bidBudgetMax) : null;

    if (isFixed) {
      if (!currencyCode || !Number.isFinite(budget) || budget <= 0) {
        const err = new Error("Valid budget and currency are required for fixed-price orders.");
        err.statusCode = 400;
        throw err;
      }
    }

    const orderStatus = isFixed ? ORDER_STATUSES.PENDING_PAYMENT : ORDER_STATUSES.OPEN_FOR_BIDS;
    const paymentStatus = isFixed ? "pending" : "not_required";
    const paymentRequired = isFixed;
    const isPublished = !isFixed;
    const isOpenForPool = !isFixed;
    const paymentAmount = isFixed ? budget : null;
    const paymentCurrency = isFixed ? currencyCode : null;

    const { rows } = await client.query(
      `INSERT INTO orders (
        order_code, title, description,
        category_id, subcategory_id,
        sub_subcategory_id,
        extra_category_ids,
        extra_category_details,
        project_type, budget, currency_code,
        bid_budget_min, bid_budget_max,
        duration_value, duration_unit,
        created_by_user_id, source_type,
        created_by_role,
        accepted_freelancer_id,
        stripe_checkout_session_id,
        stripe_payment_intent_id,
        stripe_checkout_expected_amount_minor,
        paid_at,
        payment_amount,
        payment_currency,
        assigned_freelancer_id,
        received_at, started_at, due_at,
        is_published, is_open_for_pool,
        is_archived,
        payment_required, payment_status,
        order_status
      ) VALUES (
        $1,$2,$3,
        $4,$5,
        $6,
        '{}'::bigint[],
        '{}'::jsonb,
        $7,$8,$9,
        $10,$11,
        $12,$13,
        $14,'client_created',
        'client',
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        $15,
        $16,
        NULL,
        NULL, NULL, NULL,
        $17, $18,
        FALSE,
        $19, $20,
        $21
      )
      RETURNING *`,
      [
        orderCode,
        payload.title,
        payload.description,
        Number(payload.categoryId),
        effectiveSubcategoryId ? Number(effectiveSubcategoryId) : null,
        payload.subSubcategoryId ? Number(payload.subSubcategoryId) : null,
        payload.projectType,
        budget,
        currencyCode,
        isFixed ? null : bidMin,
        isFixed ? null : bidMax,
        Number(payload.durationValue),
        payload.durationUnit,
        Number(clientUserId),
        paymentAmount,
        paymentCurrency,
        isPublished,
        isOpenForPool,
        paymentRequired,
        paymentStatus,
        orderStatus,
      ],
    );

    const orderRow = rows[0];
    await upsertSkillsAndAttach({ orderId: orderRow.id, skills: payload.preferredSkills }, client);

    const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    if (files.length) {
      const orderDir = path.join(baseUploadsDir, "..", String(orderRow.id));
      if (!fs.existsSync(orderDir)) {
        fs.mkdirSync(orderDir, { recursive: true });
      }
      const preparedFiles = [];
      for (const f of files) {
        const srcPath = path.join(baseUploadsDir, f.filename);
        const destPath = path.join(orderDir, f.filename);
        await fsp.rename(srcPath, destPath);
        const relativePath = path.join("orders", String(orderRow.id), f.filename).replace(/\\/g, "/");
        preparedFiles.push({ ...f, relativePath, urlPath: `/uploads/${relativePath}` });
      }
      await attachFiles({ orderId: orderRow.id, actorUserId: clientUserId, files: preparedFiles }, client);
    }

    await client.query("COMMIT");
    return await getOrderById(orderRow.id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listAdminInternalOrders({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id
     FROM orders
     WHERE source_type IN ('admin_created','super_admin_created')
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  );
  const out = [];
  for (const r of rows) {
    const o = await getOrderById(r.id);
    if (o) out.push(o);
  }
  return out;
}

/**
 * Client "my orders" list: avoid N×getOrderById (many round-trips per row → slow / client timeout).
 * Keeps the same response shape as getOrderById for UI compatibility.
 */
async function listClientOrders({ clientUserId, limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const uid = Number(clientUserId);
  if (!Number.isInteger(uid) || uid < 1) return [];

  const { rows: orderRows } = await pool.query(
    `SELECT *
     FROM orders
     WHERE created_by_user_id = $1
       AND source_type = 'client_created'
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  );
  if (!orderRows.length) return [];

  const orderIds = orderRows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);

  const [{ rows: skillRowsAll }, { rows: fileRowsAll }] = await Promise.all([
    pool.query(
      `SELECT os.order_id, s.id, s.name
       FROM order_skills os
       JOIN skills s ON s.id = os.skill_id
       WHERE os.order_id = ANY($1::bigint[])
       ORDER BY os.order_id, s.name ASC`,
      [orderIds],
    ),
    pool.query(
      `SELECT id, order_id, file_path, file_url, original_name, mime_type, size_bytes, uploaded_at, purpose
       FROM order_files
       WHERE order_id = ANY($1::bigint[])
       ORDER BY order_id, id ASC`,
      [orderIds],
    ),
  ]);

  const skillsByOrder = new Map();
  for (const sr of skillRowsAll) {
    const oid = String(sr.order_id);
    if (!skillsByOrder.has(oid)) skillsByOrder.set(oid, []);
    skillsByOrder.get(oid).push({ id: String(sr.id), name: sr.name });
  }

  const filesByOrder = new Map();
  for (const fr of fileRowsAll) {
    const oid = String(fr.order_id);
    if (!filesByOrder.has(oid)) filesByOrder.set(oid, []);
    filesByOrder.get(oid).push({
      id: String(fr.id),
      filePath: fr.file_path,
      fileUrl: fr.file_url,
      originalName: decodeMultipartOriginalName(fr.original_name) || fr.original_name,
      mimeType: fr.mime_type,
      sizeBytes: Number(fr.size_bytes),
      uploadedAt: fr.uploaded_at,
      purpose: fr.purpose || "brief",
    });
  }

  const bases = orderRows.map((row) => mapOrderBase(row)).filter(Boolean);
  const primaryCatIds = new Set();
  const primarySubIds = new Set();
  const primarySsIds = new Set();
  const extraCatIdsAll = new Set();
  const extraSsIdsAll = new Set();

  for (const b of bases) {
    const c = Number(b.categoryId);
    if (Number.isInteger(c) && c > 0) primaryCatIds.add(c);
    const sc = b.subcategoryId ? Number(b.subcategoryId) : null;
    if (Number.isInteger(sc) && sc > 0) primarySubIds.add(sc);
    const ss = b.subSubcategoryId ? Number(b.subSubcategoryId) : null;
    if (Number.isInteger(ss) && ss > 0) primarySsIds.add(ss);

    const extraCatIds = Array.isArray(b.extraCategoryIds) ? b.extraCategoryIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    const extraDetails = b.extraCategoryDetails && typeof b.extraCategoryDetails === "object" ? b.extraCategoryDetails : {};
    for (const cid of extraCatIds) {
      extraCatIdsAll.add(cid);
      const raw = extraDetails[String(cid)];
      const ssId = raw ? Number(raw) : null;
      if (Number.isInteger(ssId) && ssId > 0) extraSsIdsAll.add(ssId);
    }
  }

  const catIdList = [...new Set([...primaryCatIds, ...extraCatIdsAll])];
  const subIdList = [...primarySubIds];
  const ssIdList = [...new Set([...primarySsIds, ...extraSsIdsAll])];

  const queries = [];
  if (catIdList.length) {
    queries.push(pool.query(`SELECT id, slug, name FROM categories WHERE id = ANY($1::bigint[])`, [catIdList]));
  } else {
    queries.push(Promise.resolve({ rows: [] }));
  }
  if (subIdList.length) {
    queries.push(pool.query(`SELECT id, slug, name, category_id FROM subcategories WHERE id = ANY($1::bigint[])`, [subIdList]));
  } else {
    queries.push(Promise.resolve({ rows: [] }));
  }
  if (ssIdList.length) {
    queries.push(
      pool.query(`SELECT id, slug, name, subcategory_id FROM sub_subcategories WHERE id = ANY($1::bigint[])`, [ssIdList]),
    );
  } else {
    queries.push(Promise.resolve({ rows: [] }));
  }

  const [{ rows: catRows }, { rows: subRows }, { rows: ssRows }] = await Promise.all(queries);
  const catById = new Map(catRows.map((r) => [Number(r.id), r]));
  const subById = new Map(subRows.map((r) => [Number(r.id), r]));
  const ssById = new Map(ssRows.map((r) => [Number(r.id), r]));

  const out = [];
  for (const row of orderRows) {
    const base = mapOrderBase(row);
    if (!base) continue;

    const cRow = catById.get(Number(base.categoryId));
    const category = cRow ? { id: String(cRow.id), slug: cRow.slug, name: cRow.name } : null;

    let subcategory = null;
    if (base.subcategoryId) {
      const sRow = subById.get(Number(base.subcategoryId));
      if (sRow) {
        subcategory = {
          id: String(sRow.id),
          slug: sRow.slug,
          name: sRow.name,
          categoryId: String(sRow.category_id),
        };
      }
    }

    let subSubcategory = null;
    if (base.subSubcategoryId) {
      const ssRow = ssById.get(Number(base.subSubcategoryId));
      if (ssRow) {
        subSubcategory = {
          id: String(ssRow.id),
          slug: ssRow.slug,
          name: ssRow.name,
          subcategoryId: String(ssRow.subcategory_id),
        };
      }
    }

    const extraCategories = [];
    const extraCatIds = Array.isArray(base.extraCategoryIds) ? base.extraCategoryIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    const extraDetails = base.extraCategoryDetails && typeof base.extraCategoryDetails === "object" ? base.extraCategoryDetails : {};
    for (const cid of extraCatIds) {
      const cR = catById.get(cid);
      const raw = extraDetails[String(cid)];
      const ssId = raw ? Number(raw) : null;
      const ssR = ssId && Number.isInteger(ssId) ? ssById.get(ssId) : null;
      extraCategories.push({
        category: cR ? { id: String(cR.id), slug: cR.slug, name: cR.name } : { id: String(cid), slug: null, name: String(cid) },
        subSubcategory: ssR
          ? { id: String(ssR.id), slug: ssR.slug, name: ssR.name, subcategoryId: String(ssR.subcategory_id) }
          : null,
      });
    }

    const oid = String(base.id);
    out.push({
      ...base,
      category,
      subcategory,
      subSubcategory,
      extraCategories,
      preferredSkills: skillsByOrder.get(oid) || [],
      files: filesByOrder.get(oid) || [],
    });
  }

  const { rows: bidRows } = await pool.query(
    `SELECT order_id, COUNT(*)::int AS c
     FROM order_freelancer_bids
     WHERE order_id = ANY($1::bigint[])
     GROUP BY order_id`,
    [orderIds],
  );
  const bidCountByOrder = new Map(bidRows.map((br) => [String(br.order_id), Number(br.c)]));
  for (const o of out) {
    o.bidsCount = bidCountByOrder.has(String(o.id)) ? bidCountByOrder.get(String(o.id)) : 0;
  }

  return out;
}

async function listPoolOrders({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id
     FROM orders
     WHERE is_published = TRUE
       AND is_open_for_pool = TRUE
       AND assigned_freelancer_id IS NULL
       AND order_status IN ('published','open_for_freelancers','open_for_bids')
       AND source_type IN ('admin_created','super_admin_created','client_created')
       AND NOT (
         source_type = 'client_created'
         AND project_type = 'fixed'
         AND payment_status NOT IN ('paid','skipped_by_admin')
       )
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  );
  const out = [];
  for (const r of rows) {
    const o = await getOrderById(r.id);
    if (o) out.push(o);
  }
  return out;
}

async function getMyOrderClaim({ orderId, freelancerUserId }, clientMaybe) {
  if (!freelancerUserId) return null;
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT id, status
     FROM order_claims
     WHERE order_id = $1
       AND freelancer_user_id = $2
     LIMIT 1`,
    [Number(orderId), Number(freelancerUserId)],
  );
  if (!rows[0]) return null;
  return { id: String(rows[0].id), status: rows[0].status };
}

async function getMyOrderBid({ orderId, freelancerUserId }, clientMaybe) {
  if (!freelancerUserId) return null;
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT id, amount, status
     FROM order_freelancer_bids
     WHERE order_id = $1
       AND freelancer_user_id = $2
     LIMIT 1`,
    [Number(orderId), Number(freelancerUserId)],
  );
  if (!rows[0]) return null;
  return { id: String(rows[0].id), amount: Number(rows[0].amount), status: rows[0].status };
}

async function listPoolOrdersForFreelancer({ freelancerUserId, limit = 50, offset = 0 } = {}) {
  const orders = await listPoolOrders({ limit, offset });
  const out = [];
  for (const o of orders) {
    const myClaim = await getMyOrderClaim({ orderId: o.id, freelancerUserId });
    let myBid = null;
    if (o.projectType === "bidding" && o.bidBudgetMin != null && o.bidBudgetMax != null) {
      myBid = await getMyOrderBid({ orderId: o.id, freelancerUserId });
    }
    out.push({ ...o, myClaim, myBid });
  }
  return out;
}

async function listFreelancerAssignedOrders({ freelancerUserId, limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) return [];

  const { rows: assignedRows } = await pool.query(
    `SELECT id
     FROM orders
     WHERE assigned_freelancer_id = $1
       AND received_at IS NOT NULL
     ORDER BY id DESC`,
    [uid],
  );
  const { rows: pendingClaimRows } = await pool.query(
    `SELECT o.id
     FROM orders o
     INNER JOIN order_claims c ON c.order_id = o.id AND c.freelancer_user_id = $1
     WHERE c.status = 'pending'
       AND o.assigned_freelancer_id IS NULL
     ORDER BY o.id DESC`,
    [uid],
  );

  const mergedIds = [];
  const seen = new Set();
  const pushId = (id) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1 || seen.has(n)) return;
    seen.add(n);
    mergedIds.push(n);
  };
  for (const r of assignedRows) pushId(r.id);
  for (const r of pendingClaimRows) pushId(r.id);
  mergedIds.sort((a, b) => b - a);
  const pageIds = mergedIds.slice(off, off + lim);

  const out = [];
  for (const id of pageIds) {
    const o = await getOrderById(id);
    if (!o) continue;
    const myClaim = await getMyOrderClaim({ orderId: id, freelancerUserId: uid });
    let myBid = null;
    if (o.projectType === "bidding" && o.bidBudgetMin != null && o.bidBudgetMax != null) {
      myBid = await getMyOrderBid({ orderId: id, freelancerUserId: uid });
    }
    out.push({ ...o, myClaim, myBid });
  }
  return out;
}

async function getFreelancerAssignedOrderById({ freelancerUserId, orderId }) {
  const oid = Number(orderId);
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(oid) || oid < 1 || !Number.isInteger(uid) || uid < 1) return null;

  const { rows: assignedRows } = await pool.query(
    `SELECT id
     FROM orders
     WHERE id = $1
       AND assigned_freelancer_id = $2
       AND received_at IS NOT NULL
     LIMIT 1`,
    [oid, uid],
  );
  if (assignedRows[0]) {
    const o = await getOrderById(orderId);
    if (!o) return null;
    const myClaim = await getMyOrderClaim({ orderId: oid, freelancerUserId: uid });
    let myBid = null;
    if (o.projectType === "bidding" && o.bidBudgetMin != null && o.bidBudgetMax != null) {
      myBid = await getMyOrderBid({ orderId: oid, freelancerUserId: uid });
    }
    return { ...o, myClaim, myBid };
  }

  const { rows: pendingRows } = await pool.query(
    `SELECT o.id
     FROM orders o
     INNER JOIN order_claims c ON c.order_id = o.id AND c.freelancer_user_id = $2
     WHERE o.id = $1
       AND c.status = 'pending'
       AND o.assigned_freelancer_id IS NULL
     LIMIT 1`,
    [oid, uid],
  );
  if (!pendingRows[0]) return null;
  const o = await getOrderById(orderId);
  if (!o) return null;
  const myClaim = await getMyOrderClaim({ orderId: oid, freelancerUserId: uid });
  let myBid = null;
  if (o.projectType === "bidding" && o.bidBudgetMin != null && o.bidBudgetMax != null) {
    myBid = await getMyOrderBid({ orderId: oid, freelancerUserId: uid });
  }
  return { ...o, myClaim, myBid };
}

async function submitPoolOrderBid({ freelancerUserId, orderId, amount }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(freelancerUserId));
    if (!eligibility.eligible) {
      const err = new Error("Your subscription is not active. You cannot submit bids.");
      err.statusCode = 403;
      err.reason = eligibility.reason;
      throw err;
    }

    const { rows } = await client.query(
      `SELECT * FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [Number(orderId)],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!order.is_published || !order.is_open_for_pool || order.assigned_freelancer_id || order.received_at) {
      const err = new Error("Order is not available.");
      err.statusCode = 409;
      throw err;
    }
    if (!isPoolListedSourceType(order.source_type)) {
      const err = new Error("Order is not available.");
      err.statusCode = 409;
      throw err;
    }
    const bidStatusesOk =
      order.order_status === ORDER_STATUSES.PUBLISHED || order.order_status === ORDER_STATUSES.OPEN_FOR_BIDS;
    if (!bidStatusesOk) {
      const err = new Error("Order is not available.");
      err.statusCode = 409;
      throw err;
    }
    if (!orderFlowService.clientFixedOrderPaidForPool(order)) {
      const err = new Error("Order is not available.");
      err.statusCode = 409;
      throw err;
    }
    if (!hasPricedBiddingRow(order)) {
      const err = new Error("This order does not accept price bids.");
      err.statusCode = 409;
      throw err;
    }

    const bid = Number(amount);
    if (!Number.isFinite(bid) || bid <= 0) {
      const err = new Error("Invalid bid amount.");
      err.statusCode = 400;
      throw err;
    }
    const min = Number(order.bid_budget_min);
    const max = Number(order.bid_budget_max);
    if (bid < min || bid > max) {
      const err = new Error(`Bid must be between ${min} and ${max}.`);
      err.statusCode = 400;
      throw err;
    }

    await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (order_id, freelancer_user_id)
       DO UPDATE SET amount = EXCLUDED.amount, status = 'pending', updated_at = NOW()`,
      [Number(orderId), Number(freelancerUserId), bid],
    );

    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function claimPoolOrder({ freelancerUserId, orderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const eligibility = await subscriptionsService.canFreelancerTakeOrders(String(freelancerUserId));
    if (!eligibility.eligible) {
      const err = new Error("Your subscription is not active. You cannot take orders.");
      err.statusCode = 403;
      err.reason = eligibility.reason;
      throw err;
    }

    const { rows } = await client.query(
      `SELECT * FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [Number(orderId)],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!order.is_published || !order.is_open_for_pool || order.assigned_freelancer_id || order.received_at) {
      const err = new Error("Order is not available in the pool.");
      err.statusCode = 409;
      throw err;
    }
    if (!isPoolListedSourceType(order.source_type)) {
      const err = new Error("Order is not available in the pool.");
      err.statusCode = 409;
      throw err;
    }
    if (hasPricedBiddingRow(order)) {
      const err = new Error("This is a bidding order. Submit a price offer instead of taking the order directly.");
      err.statusCode = 409;
      throw err;
    }
    const fixedPoolStatusesOk =
      order.order_status === ORDER_STATUSES.PUBLISHED || order.order_status === ORDER_STATUSES.OPEN_FOR_FREELANCERS;
    if (!fixedPoolStatusesOk) {
      const err = new Error("Order is not available in the pool.");
      err.statusCode = 409;
      throw err;
    }
    if (!orderFlowService.clientFixedOrderPaidForPool(order)) {
      const err = new Error("Order is not available in the pool.");
      err.statusCode = 409;
      throw err;
    }

    // Create claim record. Do NOT assign yet, do NOT remove from pool.
    // Unique constraint prevents duplicates; allow re-apply only if withdrawn/rejected? (we block for now).
    const { rows: existing } = await client.query(
      `SELECT id, status FROM order_claims WHERE order_id = $1 AND freelancer_user_id = $2 LIMIT 1`,
      [Number(orderId), Number(freelancerUserId)],
    );
    if (existing[0]) {
      const st = existing[0].status;
      const err = new Error(st === "withdrawn" ? "You already withdrew this application." : "You already applied for this order.");
      err.statusCode = 409;
      throw err;
    }

    await client.query(
      `INSERT INTO order_claims (order_id, freelancer_user_id, status)
       VALUES ($1, $2, 'pending')`,
      [Number(orderId), Number(freelancerUserId)],
    );

    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function withdrawPoolClaim({ freelancerUserId, orderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [Number(orderId)],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (order.assigned_freelancer_id || order.received_at) {
      const err = new Error("Order is already assigned.");
      err.statusCode = 409;
      throw err;
    }

    const { rows: claimRows } = await client.query(
      `SELECT * FROM order_claims
       WHERE order_id = $1 AND freelancer_user_id = $2
       FOR UPDATE`,
      [Number(orderId), Number(freelancerUserId)],
    );
    const claim = claimRows[0];
    if (!claim) {
      const err = new Error("Claim not found.");
      err.statusCode = 404;
      throw err;
    }
    if (claim.status !== "pending") {
      const err = new Error("Claim cannot be withdrawn.");
      err.statusCode = 409;
      throw err;
    }

    await client.query(
      `UPDATE order_claims
         SET status = 'withdrawn',
             updated_at = NOW()
       WHERE id = $1`,
      [Number(claim.id)],
    );

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listOrderClaimsAdmin({ orderId }, clientMaybe) {
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT oc.id, oc.order_id, oc.freelancer_user_id, oc.status, oc.reviewed_at, oc.reviewed_by_user_id, oc.created_at, oc.updated_at,
            u.first_name, u.father_name, u.family_name, u.email, u.account_id
     FROM order_claims oc
     JOIN users u ON u.id = oc.freelancer_user_id
     WHERE oc.order_id = $1
     ORDER BY oc.created_at ASC`,
    [Number(orderId)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id),
    freelancerUserId: String(r.freelancer_user_id),
    status: r.status,
    reviewedAt: r.reviewed_at,
    reviewedByUserId: r.reviewed_by_user_id ? String(r.reviewed_by_user_id) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    freelancer: {
      id: String(r.freelancer_user_id),
      accountId: r.account_id,
      firstName: r.first_name,
      fatherName: r.father_name,
      familyName: r.family_name,
      email: r.email,
    },
  }));
}

async function approvePoolClaimAdmin({ actorUserId, orderId, claimId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT *
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [Number(orderId)],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!(await isInternalPoolOrder(order))) {
      const err = new Error("Order is not eligible for approval.");
      err.statusCode = 400;
      throw err;
    }
    if (!order.is_published || !order.is_open_for_pool || order.assigned_freelancer_id || order.received_at) {
      const err = new Error("Order is not pending approval.");
      err.statusCode = 409;
      throw err;
    }
    if (!orderFlowService.orderRowAllowsClaimApproval(order)) {
      const err = new Error("Order is not pending approval.");
      err.statusCode = 409;
      throw err;
    }

    const { rows: claimRows } = await client.query(
      `SELECT * FROM order_claims
       WHERE id = $1 AND order_id = $2
       FOR UPDATE`,
      [Number(claimId), Number(orderId)],
    );
    const claim = claimRows[0];
    if (!claim) {
      const err = new Error("Claim not found.");
      err.statusCode = 404;
      throw err;
    }
    if (claim.status !== "pending") {
      const err = new Error("Claim is not pending.");
      err.statusCode = 409;
      throw err;
    }

    const receivedAt = new Date();
    const startedAt = receivedAt;
    const dueAt = computeDueAt(startedAt, order.duration_value, order.duration_unit);

    const { rows: updated } = await client.query(
      `UPDATE orders
         SET assigned_freelancer_id = $2,
             accepted_freelancer_id = $2,
             received_at = $3,
             started_at = $3,
             due_at = $4,
             is_open_for_pool = FALSE,
             order_status = $5,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(orderId), Number(claim.freelancer_user_id), receivedAt, dueAt, ORDER_STATUSES.IN_PROGRESS],
    );

    // Mark approved claim + reject the rest.
    await client.query(
      `UPDATE order_claims
         SET status = 'approved',
             reviewed_at = $2,
             reviewed_by_user_id = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(claim.id), receivedAt, Number(actorUserId)],
    );
    await client.query(
      `UPDATE order_claims
         SET status = 'rejected',
             reviewed_at = $2,
             reviewed_by_user_id = $3,
             updated_at = NOW()
       WHERE order_id = $1
         AND id <> $4
         AND status = 'pending'`,
      [Number(orderId), receivedAt, Number(actorUserId), Number(claim.id)],
    );

    // The first accepted pool order starts the subscription countdown (only once).
    await subscriptionsService.activateCurrentSubscriptionOnFirstOrder(
      { freelancerUserId: String(updated[0].assigned_freelancer_id), activatedAt: receivedAt },
      client,
    );

    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function assertClientOwnsOrder({ clientUserId, orderId }, clientMaybe) {
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT id, created_by_user_id, source_type FROM orders WHERE id = $1 LIMIT 1`,
    [Number(orderId)],
  );
  const order = rows[0];
  if (!order) {
    const err = new Error("الطلب غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== Number(clientUserId)) {
    const err = new Error("لا يمكنك إدارة هذا الطلب.");
    err.statusCode = 403;
    throw err;
  }
  return order;
}

async function listOrderClaimsForClient({ clientUserId, orderId }) {
  await assertClientOwnsOrder({ clientUserId, orderId });
  const { rows } = await pool.query(
    `SELECT o.id, o.order_status, o.assigned_freelancer_id, o.is_open_for_pool, o.is_published
     FROM orders o
     WHERE o.id = $1
     LIMIT 1`,
    [Number(orderId)],
  );
  const o = rows[0];
  if (!o) return { claims: [], orderSummary: null };
  if (!orderFlowService.orderRowAllowsFixedClaimReview(o) || o.assigned_freelancer_id) {
    return { claims: [], orderSummary: { hasOpenPool: false } };
  }
  const claims = await listOrderClaimsAdmin({ orderId });
  const pending = claims.filter((c) => c.status === "pending");
  return { claims: pending, orderSummary: { hasOpenPool: true } };
}

async function rejectPoolClaimClient({ clientUserId, orderId, claimId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertClientOwnsOrder({ clientUserId, orderId }, client);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
    const order = rows[0];
    if (
      !order.is_published ||
      !order.is_open_for_pool ||
      order.assigned_freelancer_id ||
      order.received_at ||
      !orderFlowService.orderRowAllowsClaimApproval(order)
    ) {
      const err = new Error("لا يمكن رفض الطلبات في هذه الحالة.");
      err.statusCode = 409;
      throw err;
    }
    const { rows: claimRows } = await client.query(
      `SELECT * FROM order_claims WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [Number(claimId), Number(orderId)],
    );
    const claim = claimRows[0];
    if (!claim) {
      const err = new Error("طلب المستقل غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    if (claim.status !== "pending") {
      const err = new Error("تمت معالجة هذا الطلب مسبقاً.");
      err.statusCode = 409;
      throw err;
    }
    const reviewedAt = new Date();
    await client.query(
      `UPDATE order_claims
         SET status = 'rejected',
             reviewed_at = $2,
             reviewed_by_user_id = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(claim.id), reviewedAt, Number(clientUserId)],
    );
    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function approvePoolClaimClient({ clientUserId, orderId, claimId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT *
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [Number(orderId)],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("الطلب غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== Number(clientUserId)) {
      const err = new Error("لا يمكنك اعتماد هذا الإسناد.");
      err.statusCode = 403;
      throw err;
    }
    if (!order.is_published || !order.is_open_for_pool || order.assigned_freelancer_id || order.received_at) {
      const err = new Error("الطلب غير متاح لاعتماد مستقل حالياً.");
      err.statusCode = 409;
      throw err;
    }
    if (!orderFlowService.orderRowAllowsClaimApproval(order)) {
      const err = new Error("الطلب غير متاح لاعتماد مستقل حالياً.");
      err.statusCode = 409;
      throw err;
    }

    const { rows: claimRows } = await client.query(
      `SELECT * FROM order_claims
       WHERE id = $1 AND order_id = $2
       FOR UPDATE`,
      [Number(claimId), Number(orderId)],
    );
    const claim = claimRows[0];
    if (!claim) {
      const err = new Error("طلب المستقل غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    if (claim.status !== "pending") {
      const err = new Error("تمت معالجة هذا الطلب مسبقاً.");
      err.statusCode = 409;
      throw err;
    }

    const receivedAt = new Date();
    const startedAt = receivedAt;
    const dueAt = computeDueAt(startedAt, order.duration_value, order.duration_unit);

    await client.query(
      `UPDATE orders
         SET assigned_freelancer_id = $2,
             accepted_freelancer_id = $2,
             received_at = $3,
             started_at = $3,
             due_at = $4,
             is_open_for_pool = FALSE,
             order_status = $5,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(orderId), Number(claim.freelancer_user_id), receivedAt, dueAt, ORDER_STATUSES.IN_PROGRESS],
    );

    await client.query(
      `UPDATE order_claims
         SET status = 'approved',
             reviewed_at = $2,
             reviewed_by_user_id = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(claim.id), receivedAt, Number(clientUserId)],
    );
    await client.query(
      `UPDATE order_claims
         SET status = 'rejected',
             reviewed_at = $2,
             reviewed_by_user_id = $3,
             updated_at = NOW()
       WHERE order_id = $1
         AND id <> $4
         AND status = 'pending'`,
      [Number(orderId), receivedAt, Number(clientUserId), Number(claim.id)],
    );

    await subscriptionsService.activateCurrentSubscriptionOnFirstOrder(
      { freelancerUserId: String(claim.freelancer_user_id), activatedAt: receivedAt },
      client,
    );

    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function submitFreelancerOrderDelivery({ freelancerUserId, orderId, uploadedFiles = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
    const order = rows[0];
    if (!order) {
      const err = new Error("الطلب غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    if (!order.assigned_freelancer_id || Number(order.assigned_freelancer_id) !== Number(freelancerUserId)) {
      const err = new Error("هذا الطلب غير مسند إليك.");
      err.statusCode = 403;
      throw err;
    }
    if (order.order_status !== ORDER_STATUSES.IN_PROGRESS) {
      const err = new Error("لا يمكن التسليم في الحالة الحالية للطلب.");
      err.statusCode = 409;
      throw err;
    }
    const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    if (!files.length) {
      const err = new Error("يرجى إرفاق ملف واحد على الأقل.");
      err.statusCode = 400;
      throw err;
    }

    const orderDir = path.join(baseUploadsDir, "..", String(order.id));
    await fsp.mkdir(orderDir, { recursive: true });
    const preparedFiles = [];
    for (const f of files) {
      const srcPath = path.join(baseUploadsDir, f.filename);
      const destPath = path.join(orderDir, f.filename);
      try {
        await fsp.rename(srcPath, destPath);
      } catch {
        const err = new Error("تعذر حفظ الملفات. حاول مجدداً.");
        err.statusCode = 500;
        throw err;
      }
      const relativePath = path.join("orders", String(order.id), f.filename).replace(/\\/g, "/");
      preparedFiles.push({ ...f, relativePath, urlPath: `/uploads/${relativePath}`, purpose: "delivery" });
    }

    await attachFiles({ orderId: order.id, actorUserId: freelancerUserId, files: preparedFiles, defaultPurpose: "delivery" }, client);

    // Same instant as the delivery files (DB clock), not a separate Node Date — avoids skew vs due_at.
    await client.query(
      `UPDATE orders
         SET order_status = $2,
             client_revision_note = NULL,
             submitted_at = COALESCE(
               (SELECT MAX(uploaded_at) FROM order_files
                WHERE order_id = $1::bigint AND purpose = 'delivery'),
               NOW()
             ),
             updated_at = NOW()
       WHERE id = $1`,
      [Number(orderId), ORDER_STATUSES.PENDING_CLIENT_REVIEW],
    );

    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function clientApproveDelivery({ clientUserId, orderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertClientOwnsOrder({ clientUserId, orderId }, client);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
    const order = rows[0];
    if (order.order_status !== ORDER_STATUSES.PENDING_CLIENT_REVIEW) {
      const err = new Error("لا يوجد تسليم بانتظار اعتمادك حالياً.");
      err.statusCode = 409;
      throw err;
    }
    const now = new Date();
    await client.query(
      `UPDATE orders
         SET order_status = $2,
             accepted_at = $3,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(orderId), ORDER_STATUSES.COMPLETED, now],
    );
    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function clientRequestDeliveryRevision({ clientUserId, orderId, note }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertClientOwnsOrder({ clientUserId, orderId }, client);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
    const order = rows[0];
    const noteText = note != null ? String(note).trim() : "";
    if (order.order_status === ORDER_STATUSES.PENDING_CLIENT_REVIEW) {
      await client.query(`DELETE FROM order_files WHERE order_id = $1 AND purpose = 'delivery'`, [Number(orderId)]);
      await client.query(
        `UPDATE orders
           SET order_status = $2,
               client_revision_note = $3,
               submitted_at = NULL,
               updated_at = NOW()
         WHERE id = $1`,
        [Number(orderId), ORDER_STATUSES.IN_PROGRESS, noteText || null],
      );
    } else if (order.order_status === ORDER_STATUSES.IN_PROGRESS) {
      await client.query(
        `UPDATE orders
           SET client_revision_note = $2,
               updated_at = NOW()
         WHERE id = $1`,
        [Number(orderId), noteText || null],
      );
    } else {
      const err = new Error("لا يمكن طلب تعديل في هذه الحالة.");
      err.statusCode = 409;
      throw err;
    }
    await client.query("COMMIT");
    return await getOrderById(orderId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function prepareClientOrderFileDownload({ clientUserId, orderId, fileId }) {
  await assertClientOwnsOrder({ clientUserId, orderId });
  const { rows } = await pool.query(
    `SELECT id, order_id, file_path, original_name, mime_type
     FROM order_files
     WHERE id = $1 AND order_id = $2
     LIMIT 1`,
    [Number(fileId), Number(orderId)],
  );
  const f = rows[0];
  if (!f) {
    const err = new Error("الملف غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  const rel = String(f.file_path || "").replace(/\\/g, "/").trim();
  if (!rel || rel.includes("..")) {
    const err = new Error("مسار الملف غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const uploadsRoot = path.resolve(path.join(__dirname, "..", "..", "uploads"));
  const absPath = path.resolve(uploadsRoot, rel);
  if (!absPath.startsWith(uploadsRoot + path.sep) && absPath !== uploadsRoot) {
    const err = new Error("مسار الملف غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  try {
    await fsp.access(absPath);
  } catch {
    const err = new Error("الملف غير موجود على الخادم.");
    err.statusCode = 404;
    throw err;
  }
  return {
    absPath,
    downloadName: decodeMultipartOriginalName(f.original_name) || f.original_name || "file",
    mimeType: f.mime_type || "application/octet-stream",
  };
}

async function activateArchivedInternalOrder({ orderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [Number(orderId)],
    );
    const row = rows[0];
    if (!row) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (!row.is_archived) {
      const err = new Error("Order is not archived.");
      err.statusCode = 400;
      throw err;
    }
    if (row.assigned_freelancer_id) {
      const err = new Error("Cannot activate an assigned order.");
      err.statusCode = 400;
      throw err;
    }

    const nextStatus =
      row.project_type === "bidding" ? ORDER_STATUSES.OPEN_FOR_BIDS : ORDER_STATUSES.OPEN_FOR_FREELANCERS;

    const { rows: updated } = await client.query(
      `UPDATE orders
         SET is_archived = FALSE,
             is_published = TRUE,
             is_open_for_pool = TRUE,
             order_status = $2,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(orderId), nextStatus],
    );

    await client.query("COMMIT");
    return await getOrderById(updated[0].id);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  ORDER_STATUSES,
  createInternalOrder,
  createClientOrder,
  listClientOrders,
  getOrderById,
  listAdminInternalOrders,
  listPoolOrders,
  listPoolOrdersForFreelancer,
  getMyOrderClaim,
  getMyOrderBid,
  listFreelancerAssignedOrders,
  getFreelancerAssignedOrderById,
  submitPoolOrderBid,
  claimPoolOrder,
  withdrawPoolClaim,
  listOrderClaimsAdmin,
  approvePoolClaimAdmin,
  listOrderClaimsForClient,
  rejectPoolClaimClient,
  approvePoolClaimClient,
  submitFreelancerOrderDelivery,
  clientApproveDelivery,
  clientRequestDeliveryRevision,
  prepareClientOrderFileDownload,
  activateArchivedInternalOrder,
};

