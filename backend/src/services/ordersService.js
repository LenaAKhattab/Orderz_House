const path = require("node:path");
const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const { pool } = require("../config/db");
const subscriptionsService = require("./subscriptionsService");
const notificationService = require("./notificationService");
const notificationEventsService = require("./notificationEventsService");
const { baseUploadsDir } = require("../middleware/ordersUploadMiddleware");
const { uploadBuffer, destroyByPublicId } = require("./cloudinaryUploadService");
const fakeOrdersService = require("./fakeOrdersService");

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

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

const ORDER_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  PENDING_PAYMENT: "pending_payment",
  OPEN_FOR_BIDS: "open_for_bids",
  AWAITING_PAYMENT_AFTER_BID_SELECTION: "awaiting_payment_after_bid_selection",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  PENDING_CLIENT_REVIEW: "pending_client_review",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
});

/** Pool listing: internal admin jobs + client-published jobs */
const POOL_ORDER_SOURCE_TYPES = Object.freeze(["admin_created", "super_admin_created", "client_created"]);
const CLAIMABLE_POOL_ORDER_STATUSES = Object.freeze(["published", "open_for_freelancers"]);

function isPoolListedSourceType(sourceType) {
  return POOL_ORDER_SOURCE_TYPES.includes(sourceType);
}

function isClaimablePoolOrderStatus(status) {
  return CLAIMABLE_POOL_ORDER_STATUSES.includes(String(status || ""));
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
  const revisionNote = row.client_revision_note || null;
  const revisionRequestedBy = revisionNote
    ? ["admin_created", "super_admin_created"].includes(String(row.source_type || ""))
      ? "admin"
      : "client"
    : null;
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
    currencyCode: row.currency_code || "JOD",
    bidBudgetMin: row.bid_budget_min != null ? Number(row.bid_budget_min) : null,
    bidBudgetMax: row.bid_budget_max != null ? Number(row.bid_budget_max) : null,
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    createdByUserId: String(row.created_by_user_id),
    sourceType: row.source_type,
    assignedFreelancerId: row.assigned_freelancer_id ? String(row.assigned_freelancer_id) : null,
    isDirectAdminAssignment: Boolean(row.is_direct_admin_assignment),
    isArchived: Boolean(row.is_archived),
    isPublished: row.is_published,
    isOpenForPool: row.is_open_for_pool,
    paymentRequired: row.payment_required,
    paymentStatus: row.payment_status,
    paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : null,
    paymentCurrency: row.payment_currency || null,
    orderStatus: row.order_status,
    isFake: Boolean(row.is_fake),
    fakeRoundId: row.fake_round_id ? String(row.fake_round_id) : null,
    fakeExpiresAt: row.fake_expires_at || null,
    fakeStatus: row.fake_status || null,
    showFakeBadge: Boolean(row.show_fake_badge),
    receivedAt: row.received_at || null,
    takenAt: row.taken_at || null,
    acceptedAt: row.accepted_at || null,
    startedAt: row.started_at || null,
    submittedAt: row.submitted_at || null,
    dueAt: row.due_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientRevisionNote: revisionNote,
    revisionRequestedBy,
    revisionRequestedAt: revisionNote ? row.updated_at || null : null,
    revisionDeadlineAt: revisionNote ? row.due_at || null : null,
  };
}

async function isInternalPoolOrder(row) {
  return ["admin_created", "super_admin_created"].includes(row?.source_type);
}

async function getUserIdentitySnapshot(userId, clientMaybe) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT id, account_id, first_name, father_name, family_name
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [uid],
  );
  const u = rows[0];
  if (!u) return null;
  const fullName = [u.first_name, u.father_name, u.family_name].filter(Boolean).join(" ").trim();
  return {
    id: String(u.id),
    accountId: u.account_id || null,
    fullName: fullName || null,
  };
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
    const storedPath =
      (relativePath && String(relativePath).trim()) ||
      (f.publicId && String(f.publicId).trim()) ||
      (f.urlPath && String(f.urlPath).trim()) ||
      "cloudinary_asset";
    const urlPath = f.urlPath || f.secureUrl || null;
    const purpose = f.purpose || defaultPurpose;
    const originalName = decodeMultipartOriginalName(f.originalname);
    const { rows } = await runner.query(
      `INSERT INTO order_files (
        order_id, file_path, file_url, secure_url, public_id, original_name, mime_type, size_bytes, uploaded_by_user_id, purpose, assignment_id, revision_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        Number(orderId),
        storedPath,
        urlPath,
        f.secureUrl || urlPath,
        f.publicId || null,
        originalName,
        f.mimetype,
        Number(f.size || 0),
        actorUserId ? Number(actorUserId) : null,
        purpose,
        f.assignmentId ? Number(f.assignmentId) : null,
        f.revisionId ? Number(f.revisionId) : null,
      ],
    );
    rowsOut.push(rows[0]);
  }
  return rowsOut;
}

async function uploadFilesToCloudinary({ orderId, files, purpose }) {
  const input = Array.isArray(files) ? files : [];
  const uploaded = [];
  try {
    for (const file of input) {
      // eslint-disable-next-line no-await-in-loop
      const out = await uploadBuffer({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        orderId,
        purpose,
      });
      uploaded.push({
        ...file,
        purpose,
        relativePath: null,
        urlPath: out.secureUrl,
        secureUrl: out.secureUrl,
        publicId: out.publicId,
        size: out.bytes || file.size,
      });
    }
    return uploaded;
  } catch (e) {
    for (const f of uploaded) {
      // eslint-disable-next-line no-await-in-loop
      await destroyByPublicId(f.publicId);
    }
    const err = new Error("فشل رفع الملفات، يرجى المحاولة مرة أخرى.");
    err.statusCode = 500;
    err.cause = e;
    throw err;
  }
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
    `SELECT id, file_path, file_url, secure_url, public_id, original_name, mime_type, size_bytes, uploaded_at, purpose
     FROM order_files
     WHERE order_id = $1
     ORDER BY id ASC`,
    [Number(orderId)],
  );

  const { rows: orderBidRows } = await runner.query(
    `SELECT b.id, b.amount, b.status, b.created_at, b.order_id,
            u.id AS user_id, u.first_name, u.father_name, u.family_name, u.email
     FROM order_freelancer_bids b
     JOIN users u ON u.id = b.freelancer_user_id
     WHERE b.order_id = $1
     ORDER BY b.created_at DESC, b.id DESC`,
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
      orderId: String(orderId),
      filePath: r.file_path,
      fileUrl: r.secure_url || r.file_url,
      secureUrl: r.secure_url || null,
      publicId: r.public_id || null,
      originalName: decodeMultipartOriginalName(r.original_name) || r.original_name,
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes),
      uploadedAt: r.uploaded_at,
      purpose: r.purpose || "brief",
    })),
    bidsCount: orderBidRows.length,
    bidUsers: orderBidRows.map((r) => ({
      bidId: String(r.id),
      amount: Number(r.amount),
      status: r.status,
      createdAt: r.created_at,
      user: {
        id: String(r.user_id),
        firstName: r.first_name || "",
        fatherName: r.father_name || "",
        familyName: r.family_name || "",
        email: r.email || "",
      },
    })),
  };
}

async function createInternalOrder({ actorUserId, actorRole, payload, uploadedFiles = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const createdByRole = actorRole === "super_admin" ? "super_admin" : "admin";
    const sourceType = createdByRole === "super_admin" ? "super_admin_created" : "admin_created";
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

    let orderCode = String(payload.orderCode || "").trim();
    if (!orderCode) {
      orderCode = await generateUniqueOrderCode(client);
    }
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
    const orderStatus = isAssigned ? ORDER_STATUSES.IN_PROGRESS : shouldArchive ? ORDER_STATUSES.DRAFT : ORDER_STATUSES.PUBLISHED;

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

    const isBidding = payload.projectType === "bidding";
    let bidMinIns = null;
    let bidMaxIns = null;
    let budgetIns = null;
    let currencyIns = "JOD";
    if (!isBidding) {
      budgetIns = Number(payload.budget);
      currencyIns = "JOD";
    } else {
      const bm = payload.bidBudgetMin != null ? Number(payload.bidBudgetMin) : null;
      const bx = payload.bidBudgetMax != null ? Number(payload.bidBudgetMax) : null;
      if (Number.isFinite(bm) && Number.isFinite(bx) && bm > 0 && bx >= bm) {
        bidMinIns = bm;
        bidMaxIns = bx;
        currencyIns = "JOD";
      }
    }

    const { rows } = await client.query(
      `INSERT INTO orders (
        order_code, title, description,
        category_id, subcategory_id,
        sub_subcategory_id,
        extra_category_ids,
        extra_category_details,
        project_type, budget, currency_code, duration_value, duration_unit,
        created_by_user_id, created_by_role, source_type,
        assigned_freelancer_id,
        is_direct_admin_assignment,
        received_at, started_at, due_at,
        is_published, is_open_for_pool,
        is_archived,
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
        $14,$15,$16,
        $17,
        $18,
        $19,$20,$21,
        $22,$23,
        $24,
        FALSE,'not_required',
        $25,
        $26, $27
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
        budgetIns,
        currencyIns,
        Number(payload.durationValue),
        payload.durationUnit,
        Number(actorUserId),
        createdByRole,
        sourceType,
        assignedFreelancerId,
        isAssigned,
        receivedAt,
        startedAt,
        dueAt,
        isPublished,
        isOpenForPool,
        shouldArchive,
        orderStatus,
        bidMinIns,
        bidMaxIns,
      ],
    );

    const orderRow = rows[0];

    await upsertSkillsAndAttach({ orderId: orderRow.id, skills: payload.preferredSkills }, client);

    const preparedFiles = await uploadFilesToCloudinary({
      orderId: orderRow.id,
      files: uploadedFiles,
      purpose: "brief",
    });
    await attachFiles({ orderId: orderRow.id, actorUserId, files: preparedFiles }, client);

    if (assignedFreelancerId) {
      await safeNotify(() =>
        notificationService.createIfNotExists(
          {
            recipientUserId: Number(assignedFreelancerId),
            recipientRole: "freelancer",
            actorUserId: Number(actorUserId),
            type: "order.freelancer.assigned",
            title: "تم إسناد مشروع لك",
            message: "تم إسناد مشروع جديد لك مباشرة من الإدارة.",
            entityType: "order",
            entityId: Number(orderRow.id),
            link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderRow.id))}`,
            priority: "high",
            metadata: { orderId: String(orderRow.id), source: "admin_direct_assignment" },
          },
          `freelancer_assigned_${String(orderRow.id)}`,
          client,
        ),
      );
    }
    if (!assignedFreelancerId && !shouldArchive) {
      await safeNotify(async () => {
        const freelancerIds = await notificationEventsService.getRoleUserIds(["freelancer"], client);
        await notificationEventsService.notifyUsers(
          {
            userIds: freelancerIds,
            recipientRole: "freelancer",
            actorUserId: Number(actorUserId),
            type: "order.created",
            title: "مشروع جديد متاح في الطلبات",
            message: "تم نشر مشروع جديد ويمكنك التقديم عليه.",
            entityType: "order",
            entityId: Number(orderRow.id),
            link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderRow.id))}`,
            priority: "medium",
            metadata: { orderId: String(orderRow.id), sourceType: sourceType },
            dedupeKey: `order_created_pool_${String(orderRow.id)}`,
          },
          client,
        );
      });
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

    let orderCode = String(payload.orderCode || "").trim();
    if (!orderCode) {
      orderCode = await generateUniqueOrderCode(client);
    }
    const { rowCount: codeExists } = await client.query(`SELECT 1 FROM orders WHERE order_code = $1`, [orderCode]);
    if (codeExists > 0) {
      const err = new Error("Order code already exists.");
      err.statusCode = 409;
      throw err;
    }

    const isFixed = payload.projectType === "fixed";
    const budget = isFixed ? Number(payload.budget) : null;
    const currencyCode = "JOD";
    const bidMin = !isFixed && payload.bidBudgetMin != null ? Number(payload.bidBudgetMin) : null;
    const bidMax = !isFixed && payload.bidBudgetMax != null ? Number(payload.bidBudgetMax) : null;

    const initialIsPublished = isFixed ? false : true;
    const initialIsOpenForPool = isFixed ? false : true;
    const initialPaymentRequired = isFixed ? true : false;
    const initialPaymentStatus = isFixed ? "pending" : "unpaid";
    const initialOrderStatus = isFixed ? ORDER_STATUSES.PENDING_PAYMENT : ORDER_STATUSES.OPEN_FOR_BIDS;

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
        created_by_user_id, created_by_role, source_type,
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
        $14,'client','client_created',
        NULL,
        NULL, NULL, NULL,
        $15, $16,
        FALSE,
        $17, $18,
        $19
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
        initialIsPublished,
        initialIsOpenForPool,
        initialPaymentRequired,
        initialPaymentStatus,
        initialOrderStatus,
      ],
    );

    const orderRow = rows[0];
    await safeNotify(() =>
      notificationEventsService.notifyOrderOwner(
        {
          order: orderRow,
          actorUserId: Number(clientUserId),
          type: "order.created",
          title: "تم إنشاء الطلب",
          message: isFixed ? "تم إنشاء طلبك وبانتظار إتمام الدفع." : "تم إنشاء طلب مزايدة جديد وفتحه للمستقلين.",
          priority: "high",
          dedupeKey: `order_created_${String(orderRow.id)}`,
          metadata: { orderId: String(orderRow.id), projectType: payload.projectType },
        },
        client,
      ),
    );
    if (!isFixed) {
      await safeNotify(async () => {
        const freelancerIds = await notificationEventsService.getRoleUserIds(["freelancer"], client);
        await notificationEventsService.notifyUsers(
          {
            userIds: freelancerIds,
            recipientRole: "freelancer",
            actorUserId: Number(clientUserId),
            type: "order.created",
            title: "مشروع مزايدة جديد",
            message: "تم نشر مشروع جديد بنظام المزايدة.",
            entityType: "order",
            entityId: Number(orderRow.id),
            link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderRow.id))}`,
            priority: "medium",
            metadata: { orderId: String(orderRow.id), projectType: "bidding" },
            dedupeKey: `order_bidding_created_${String(orderRow.id)}`,
          },
          client,
        );
      });
    }
    await upsertSkillsAndAttach({ orderId: orderRow.id, skills: payload.preferredSkills }, client);

    const files = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    if (files.length) {
      const preparedFiles = await uploadFilesToCloudinary({
        orderId: orderRow.id,
        files,
        purpose: "brief",
      });
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

async function purgeClientUnpaidFixedOrderDraft({ clientUserId, orderId }, clientMaybe) {
  const runner = clientMaybe || (await pool.connect());
  const ownsClient = !clientMaybe;
  try {
    if (ownsClient) await runner.query("BEGIN");
    const uid = Number(clientUserId);
    const oid = Number(orderId);
    const { rows } = await runner.query(
      `SELECT id, created_by_user_id, source_type, project_type, order_status, payment_status
       FROM orders
       WHERE id = $1
       FOR UPDATE`,
      [oid],
    );
    const order = rows[0];
    if (!order) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    if (Number(order.created_by_user_id) !== uid || order.source_type !== "client_created") {
      const err = new Error("You cannot cancel this order payment.");
      err.statusCode = 403;
      throw err;
    }
    if (order.project_type !== "fixed") {
      const err = new Error("This order does not use fixed checkout.");
      err.statusCode = 409;
      throw err;
    }
    if (String(order.payment_status || "") === "paid") {
      const err = new Error("Order payment is already completed.");
      err.statusCode = 409;
      throw err;
    }
    if (String(order.order_status || "") !== ORDER_STATUSES.PENDING_PAYMENT) {
      const err = new Error("Order is not in pending payment state.");
      err.statusCode = 409;
      throw err;
    }

    const { rows: fileRows } = await runner.query(`SELECT file_path, public_id FROM order_files WHERE order_id = $1`, [oid]);
    await runner.query(`DELETE FROM order_claims WHERE order_id = $1`, [oid]);
    await runner.query(`DELETE FROM order_freelancer_bids WHERE order_id = $1`, [oid]);
    await runner.query(`DELETE FROM client_order_payments WHERE order_id = $1`, [oid]);
    await runner.query(`DELETE FROM order_skills WHERE order_id = $1`, [oid]);
    await runner.query(`DELETE FROM order_files WHERE order_id = $1`, [oid]);
    await runner.query(`DELETE FROM orders WHERE id = $1`, [oid]);

    if (ownsClient) await runner.query("COMMIT");

    for (const f of fileRows || []) {
      if (f.public_id) {
        // eslint-disable-next-line no-await-in-loop
        await destroyByPublicId(f.public_id);
      }
      const rel = String(f.file_path || "").replace(/^\/+/, "");
      if (!rel) continue;
      const abs = path.join(baseUploadsDir, "..", rel);
      try {
        // Best-effort cleanup; DB deletion is authoritative.
        // eslint-disable-next-line no-await-in-loop
        await fsp.unlink(abs);
      } catch {
        // ignore
      }
    }
    try {
      await fsp.rm(path.join(baseUploadsDir, "..", String(oid)), { recursive: true, force: true });
    } catch {
      // ignore
    }
    return { removed: true };
  } catch (err) {
    if (ownsClient) await runner.query("ROLLBACK");
    throw err;
  } finally {
    if (ownsClient) runner.release();
  }
}

async function listAdminInternalOrders({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const { rows } = await pool.query(
    `SELECT id
     FROM orders
     WHERE source_type IN ('admin_created','super_admin_created')
       AND COALESCE(is_fake, FALSE) = FALSE
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
       AND (
         order_status <> 'pending_payment'
         OR payment_status IN ('paid', 'skipped_by_admin')
       )
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
      `SELECT id, order_id, file_path, file_url, secure_url, public_id, original_name, mime_type, size_bytes, uploaded_at, purpose
       FROM order_files
       WHERE order_id = ANY($1::bigint[])
       ORDER BY order_id, id ASC`,
      [orderIds],
    ),
  ]);

  const { rows: bidUserRowsAll } = await pool.query(
    `SELECT b.id, b.order_id, b.amount, b.status, b.created_at,
            u.id AS user_id, u.first_name, u.father_name, u.family_name, u.email
     FROM order_freelancer_bids b
     JOIN users u ON u.id = b.freelancer_user_id
     WHERE b.order_id = ANY($1::bigint[])
     ORDER BY b.order_id, b.created_at DESC, b.id DESC`,
    [orderIds],
  );

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
      orderId: oid,
      filePath: fr.file_path,
      fileUrl: fr.secure_url || fr.file_url,
      secureUrl: fr.secure_url || null,
      publicId: fr.public_id || null,
      originalName: decodeMultipartOriginalName(fr.original_name) || fr.original_name,
      mimeType: fr.mime_type,
      sizeBytes: Number(fr.size_bytes),
      uploadedAt: fr.uploaded_at,
      purpose: fr.purpose || "brief",
    });
  }

  const bidUsersByOrder = new Map();
  for (const br of bidUserRowsAll) {
    const oid = String(br.order_id);
    if (!bidUsersByOrder.has(oid)) bidUsersByOrder.set(oid, []);
    bidUsersByOrder.get(oid).push({
      bidId: String(br.id),
      amount: Number(br.amount),
      status: br.status,
      createdAt: br.created_at,
      user: {
        id: String(br.user_id),
        firstName: br.first_name || "",
        fatherName: br.father_name || "",
        familyName: br.family_name || "",
        email: br.email || "",
      },
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
      bidUsers: bidUsersByOrder.get(oid) || [],
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

function parsePageLimitOffset({ page, limit, offset, defaultLimit = 12, maxLimit = 200 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || defaultLimit, 1), maxLimit);
  const off = Number.isFinite(Number(offset)) ? Math.max(Number(offset), 0) : Math.max(((Number(page) || 1) - 1) * lim, 0);
  const currentPage = Math.floor(off / lim) + 1;
  return { limit: lim, offset: off, page: currentPage };
}

function mapListOrderRow(row) {
  const base = mapOrderBase(row);
  if (!base) return null;
  const category = row.category_id
    ? { id: String(row.category_id), slug: row.category_slug || null, name: row.category_name || null }
    : null;
  const subSubcategory = row.sub_subcategory_id
    ? {
        id: String(row.sub_subcategory_id),
        slug: row.sub_subcategory_slug || null,
        name: row.sub_subcategory_name || null,
        subcategoryId: row.sub_subcategory_parent_id ? String(row.sub_subcategory_parent_id) : null,
      }
    : null;

  const out = {
    ...base,
    category,
    subSubcategory,
    filesCount: Number(row.files_count || 0),
    applicantsCount: Number(row.applicants_count || 0),
    files: [],
  };
  if (row.my_claim_id) {
    out.myClaim = { id: String(row.my_claim_id), status: row.my_claim_status };
  }
  if (row.my_bid_id) {
    out.myBid = { id: String(row.my_bid_id), amount: Number(row.my_bid_amount), status: row.my_bid_status };
  }
  return out;
}

function buildOrderByClause(sort, alias) {
  const key = String(sort || "newest").trim().toLowerCase();
  if (key === "oldest") return `${alias}.created_at ASC, ${alias}.id ASC`;
  if (key === "price_high") return `COALESCE(${alias}.budget, 0) DESC, ${alias}.created_at DESC, ${alias}.id DESC`;
  if (key === "price_low") return `COALESCE(${alias}.budget, 0) ASC, ${alias}.created_at DESC, ${alias}.id DESC`;
  return `${alias}.created_at DESC, ${alias}.id DESC`;
}

function parseIdCsv(input) {
  const s = String(input || "").trim();
  if (!s) return [];
  return [...new Set(s.split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
}

async function listPoolOrders({
  page = 1,
  limit = 12,
  offset = null,
  status = null,
  projectType = null,
  categoryId = null,
  subSubCategoryIds = "",
  sort = "newest",
  q = "",
} = {}) {
  const pg = parsePageLimitOffset({ page, limit, offset, defaultLimit: 12 });
  const params = [];
  const where = [
    `o.is_published = TRUE`,
    `o.is_open_for_pool = TRUE`,
    `o.assigned_freelancer_id IS NULL`,
    `o.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`,
    `o.source_type IN ('admin_created','super_admin_created','client_created')`,
    `o.is_fake = FALSE`,
  ];
  if (status && ["published", "open_for_freelancers", "open_for_bids"].includes(String(status))) {
    params.push(String(status));
    where.push(`o.order_status = $${params.length}`);
  }
  if (projectType) {
    params.push(String(projectType));
    where.push(`o.project_type = $${params.length}`);
  }
  if (categoryId) {
    params.push(Number(categoryId));
    where.push(`o.category_id = $${params.length}`);
  }
  const subSubIds = parseIdCsv(subSubCategoryIds);
  if (subSubIds.length) {
    params.push(subSubIds);
    where.push(`o.sub_subcategory_id = ANY($${params.length}::int[])`);
  }
  if (String(q || "").trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(o.order_code ILIKE $${params.length} OR o.title ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBySql = buildOrderByClause(sort, "o");

  const countSql = `SELECT COUNT(*)::int AS total FROM orders o ${whereSql}`;
  const listSql = `
    SELECT
      o.*,
      c.slug AS category_slug,
      c.name AS category_name,
      ss.slug AS sub_subcategory_slug,
      ss.name AS sub_subcategory_name,
      ss.subcategory_id AS sub_subcategory_parent_id,
      COALESCE(ofc.files_count, 0)::int AS files_count,
      COALESCE(ac.applicants_count, 0)::int AS applicants_count
    FROM orders o
    LEFT JOIN categories c ON c.id = o.category_id
    LEFT JOIN sub_subcategories ss ON ss.id = o.sub_subcategory_id
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS files_count
      FROM order_files
      GROUP BY order_id
    ) ofc ON ofc.order_id = o.id
    LEFT JOIN (
      SELECT z.order_id, COUNT(DISTINCT z.freelancer_user_id)::int AS applicants_count
      FROM (
        SELECT order_id, freelancer_user_id
        FROM order_claims
        WHERE freelancer_user_id IS NOT NULL
        UNION ALL
        SELECT order_id, freelancer_user_id
        FROM order_freelancer_bids
        WHERE freelancer_user_id IS NOT NULL
      ) z
      GROUP BY z.order_id
    ) ac ON ac.order_id = o.id
    ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const listParams = [...params, pg.limit, pg.offset];

  const [{ rows: countRows }, { rows }] = await Promise.all([pool.query(countSql, params), pool.query(listSql, listParams)]);
  const total = Number(countRows[0]?.total || 0);
  const orders = rows.map(mapListOrderRow).filter(Boolean);
  return {
    orders,
    pagination: {
      page: pg.page,
      limit: pg.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pg.limit)),
    },
  };
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

async function listPoolOrdersForFreelancer({
  freelancerUserId,
  page = 1,
  limit = 12,
  offset = null,
  status = null,
  projectType = null,
  categoryId = null,
  subSubCategoryIds = "",
  sort = "newest",
  q = "",
} = {}) {
  await fakeOrdersService.markExpiredRounds();
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    return { orders: [], pagination: { page: 1, limit: Number(limit) || 12, total: 0, totalPages: 1 } };
  }
  const pg = parsePageLimitOffset({ page, limit, offset, defaultLimit: 12 });
  const filterParams = [];
  const whereBase = [
    `o.is_published = TRUE`,
    `o.is_open_for_pool = TRUE`,
    `o.assigned_freelancer_id IS NULL`,
    `o.order_status IN ('published', 'open_for_freelancers', 'open_for_bids')`,
    `o.source_type IN ('admin_created','super_admin_created','client_created')`,
    `(
      o.is_fake = FALSE
      OR (
        o.is_fake = TRUE
        AND o.fake_status = 'active'
        AND (o.fake_expires_at IS NULL OR o.fake_expires_at > NOW())
        AND EXISTS (
          SELECT 1
          FROM freelancer_subscriptions fs
          JOIN fake_order_round_plans frp
            ON frp.plan_id = fs.plan_id
           AND frp.fake_round_id = o.fake_round_id
          WHERE fs.freelancer_user_id = ${uid}
            AND fs.is_current = TRUE
            AND fs.status IN ('active', 'assigned_not_started')
            AND COALESCE(fs.payment_status, 'not_required') IN ('paid', 'pending', 'not_required')
            AND (fs.activation_status IS NULL OR fs.activation_status = 'company_approved')
            AND (fs.expiry_date IS NULL OR fs.expiry_date > NOW())
        )
      )
    )`,
  ];
  const whereCount = [...whereBase];
  const whereList = [...whereBase];
  const addFilter = (sqlExprCount, sqlExprList, value) => {
    filterParams.push(value);
    const idx = filterParams.length;
    whereCount.push(sqlExprCount(idx));
    whereList.push(sqlExprList(idx + 1)); // +1 because $1 is freelancer id in list query joins
  };
  if (status && ["published", "open_for_freelancers", "open_for_bids"].includes(String(status))) {
    addFilter((i) => `o.order_status = $${i}`, (i) => `o.order_status = $${i}`, String(status));
  }
  if (projectType) {
    addFilter((i) => `o.project_type = $${i}`, (i) => `o.project_type = $${i}`, String(projectType));
  }
  if (categoryId) {
    addFilter((i) => `o.category_id = $${i}`, (i) => `o.category_id = $${i}`, Number(categoryId));
  }
  const subSubIds = parseIdCsv(subSubCategoryIds);
  if (subSubIds.length) {
    addFilter((i) => `o.sub_subcategory_id = ANY($${i}::int[])`, (i) => `o.sub_subcategory_id = ANY($${i}::int[])`, subSubIds);
  }
  if (String(q || "").trim()) {
    const v = `%${String(q).trim()}%`;
    addFilter((i) => `(o.order_code ILIKE $${i} OR o.title ILIKE $${i})`, (i) => `(o.order_code ILIKE $${i} OR o.title ILIKE $${i})`, v);
  }
  const whereSqlCount = whereCount.length ? `WHERE ${whereCount.join(" AND ")}` : "";
  const whereSqlList = whereList.length ? `WHERE ${whereList.join(" AND ")}` : "";
  const orderBySql = buildOrderByClause(sort, "o");

  const countSql = `SELECT COUNT(*)::int AS total FROM orders o ${whereSqlCount}`;
  const listSql = `
    SELECT
      o.*,
      c.slug AS category_slug,
      c.name AS category_name,
      ss.slug AS sub_subcategory_slug,
      ss.name AS sub_subcategory_name,
      ss.subcategory_id AS sub_subcategory_parent_id,
      COALESCE(ofc.files_count, 0)::int AS files_count,
      COALESCE(ac.applicants_count, 0)::int AS applicants_count,
      oc.id AS my_claim_id,
      oc.status AS my_claim_status,
      mb.id AS my_bid_id,
      mb.amount AS my_bid_amount,
      mb.status AS my_bid_status
    FROM orders o
    LEFT JOIN categories c ON c.id = o.category_id
    LEFT JOIN sub_subcategories ss ON ss.id = o.sub_subcategory_id
    LEFT JOIN (
      SELECT order_id, COUNT(*)::int AS files_count
      FROM order_files
      GROUP BY order_id
    ) ofc ON ofc.order_id = o.id
    LEFT JOIN (
      SELECT z.order_id, COUNT(DISTINCT z.freelancer_user_id)::int AS applicants_count
      FROM (
        SELECT order_id, freelancer_user_id
        FROM order_claims
        WHERE freelancer_user_id IS NOT NULL
        UNION ALL
        SELECT order_id, freelancer_user_id
        FROM order_freelancer_bids
        WHERE freelancer_user_id IS NOT NULL
      ) z
      GROUP BY z.order_id
    ) ac ON ac.order_id = o.id
    LEFT JOIN order_claims oc
      ON oc.order_id = o.id
     AND oc.freelancer_user_id = $1
    LEFT JOIN order_freelancer_bids mb
      ON mb.order_id = o.id
     AND mb.freelancer_user_id = $1
    ${whereSqlList}
    ORDER BY ${orderBySql}
    LIMIT $${filterParams.length + 2} OFFSET $${filterParams.length + 3}
  `;
  const listParams = [uid, ...filterParams, pg.limit, pg.offset];
  const [{ rows: countRows }, { rows }] = await Promise.all([
    pool.query(countSql, filterParams),
    pool.query(listSql, listParams),
  ]);
  const total = Number(countRows[0]?.total || 0);
  const orders = rows.map(mapListOrderRow).filter(Boolean);
  return {
    orders,
    pagination: {
      page: pg.page,
      limit: pg.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pg.limit)),
    },
  };
}

async function listFreelancerAssignedOrders({
  freelancerUserId,
  page = 1,
  limit = 12,
  offset = null,
  status = "all",
  projectType = null,
  categoryId = null,
  subSubCategoryIds = "",
  sort = "newest",
  q = "",
} = {}) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    return {
      orders: [],
      pagination: { page: 1, limit: Number(limit) || 12, total: 0, totalPages: 1 },
      counts: {
        all: 0,
        waitingApproval: 0,
        revisionRequired: 0,
        assigned: 0,
        inProgress: 0,
        waitingClientApproval: 0,
        completed: 0,
        canceled: 0,
      },
    };
  }
  const pg = parsePageLimitOffset({ page, limit, offset, defaultLimit: 12 });
  const normalizedStatus = String(status || "all");

  const where = [];
  const params = [uid];
  if (projectType) {
    params.push(String(projectType));
    where.push(`b.project_type = $${params.length}`);
  }
  if (categoryId) {
    params.push(Number(categoryId));
    where.push(`b.category_id = $${params.length}`);
  }
  const subSubIds = parseIdCsv(subSubCategoryIds);
  if (subSubIds.length) {
    params.push(subSubIds);
    where.push(`b.sub_subcategory_id = ANY($${params.length}::int[])`);
  }
  if (String(q || "").trim()) {
    params.push(`%${String(q).trim()}%`);
    where.push(`(b.order_code ILIKE $${params.length} OR b.title ILIKE $${params.length})`);
  }
  if (normalizedStatus === "pending_claim") where.push(`b.assigned_freelancer_id IS NULL AND b.my_claim_status = 'pending'`);
  if (normalizedStatus === "revision_required") where.push(`b.client_revision_note IS NOT NULL AND b.order_status IN ('in_progress','ready_for_work','pending_client_review')`);
  if (normalizedStatus === "assigned") where.push(`b.order_status = 'assigned'`);
  if (normalizedStatus === "in_progress") where.push(`b.order_status IN ('in_progress','ready_for_work')`);
  if (normalizedStatus === "pending_client_review") where.push(`b.order_status = 'pending_client_review'`);
  if (normalizedStatus === "completed") where.push(`b.order_status = 'completed'`);
  if (normalizedStatus === "cancelled") where.push(`(b.order_status = 'cancelled' OR b.my_claim_status = 'rejected')`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderBySql = buildOrderByClause(sort, "b");

  const baseCte = `
    WITH my_claims AS (
      SELECT DISTINCT ON (oc.order_id)
        oc.order_id,
        oc.id AS my_claim_id,
        oc.status AS my_claim_status
      FROM order_claims oc
      WHERE oc.freelancer_user_id = $1
        AND oc.status IN ('pending', 'rejected')
      ORDER BY oc.order_id, oc.updated_at DESC, oc.id DESC
    ),
    base AS (
      SELECT
        o.*,
        mc.my_claim_id,
        mc.my_claim_status
      FROM orders o
      LEFT JOIN my_claims mc ON mc.order_id = o.id
      WHERE o.assigned_freelancer_id = $1
         OR mc.order_id IS NOT NULL
    )
  `;

  const countSql = `${baseCte} SELECT COUNT(*)::int AS total FROM base b ${whereSql}`;
  const rowsSql = `
    ${baseCte}
    SELECT
      b.*,
      c.slug AS category_slug,
      c.name AS category_name,
      ss.slug AS sub_subcategory_slug,
      ss.name AS sub_subcategory_name,
      ss.subcategory_id AS sub_subcategory_parent_id,
      COALESCE(ac.applicants_count, 0)::int AS applicants_count
    FROM base b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN sub_subcategories ss ON ss.id = b.sub_subcategory_id
    LEFT JOIN (
      SELECT z.order_id, COUNT(DISTINCT z.freelancer_user_id)::int AS applicants_count
      FROM (
        SELECT order_id, freelancer_user_id
        FROM order_claims
        WHERE freelancer_user_id IS NOT NULL
        UNION ALL
        SELECT order_id, freelancer_user_id
        FROM order_freelancer_bids
        WHERE freelancer_user_id IS NOT NULL
      ) z
      GROUP BY z.order_id
    ) ac ON ac.order_id = b.id
    ${whereSql}
    ORDER BY ${orderBySql}
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const countsSql = `
    ${baseCte}
    SELECT
      COUNT(*)::int AS all_count,
      SUM(CASE WHEN b.assigned_freelancer_id IS NULL AND b.my_claim_status = 'pending' THEN 1 ELSE 0 END)::int AS waiting_approval_count,
      SUM(CASE WHEN b.client_revision_note IS NOT NULL AND b.order_status IN ('in_progress','ready_for_work','pending_client_review') THEN 1 ELSE 0 END)::int AS revision_required_count,
      SUM(CASE WHEN b.order_status = 'assigned' THEN 1 ELSE 0 END)::int AS assigned_count,
      SUM(CASE WHEN b.order_status IN ('in_progress','ready_for_work') THEN 1 ELSE 0 END)::int AS in_progress_count,
      SUM(CASE WHEN b.order_status = 'pending_client_review' THEN 1 ELSE 0 END)::int AS waiting_client_approval_count,
      SUM(CASE WHEN b.order_status = 'completed' THEN 1 ELSE 0 END)::int AS completed_count,
      SUM(CASE WHEN b.order_status = 'cancelled' OR b.my_claim_status = 'rejected' THEN 1 ELSE 0 END)::int AS canceled_count
    FROM base b
  `;

  const [countRes, rowsRes, countsRes] = await Promise.all([
    pool.query(countSql, params),
    pool.query(rowsSql, [...params, pg.limit, pg.offset]),
    pool.query(countsSql, [uid]),
  ]);
  const total = Number(countRes.rows[0]?.total || 0);
  const orders = rowsRes.rows.map(mapListOrderRow).filter(Boolean);
  const c = countsRes.rows[0] || {};

  return {
    orders,
    pagination: {
      page: pg.page,
      limit: pg.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pg.limit)),
    },
    counts: {
      all: Number(c.all_count || 0),
      waitingApproval: Number(c.waiting_approval_count || 0),
      revisionRequired: Number(c.revision_required_count || 0),
      assigned: Number(c.assigned_count || 0),
      inProgress: Number(c.in_progress_count || 0),
      waitingClientApproval: Number(c.waiting_client_approval_count || 0),
      completed: Number(c.completed_count || 0),
      canceled: Number(c.canceled_count || 0),
    },
  };
}

async function getFreelancerAssignedOrderById({ freelancerUserId, orderId }) {
  const { rows } = await pool.query(
    `SELECT o.id
     FROM orders o
     LEFT JOIN order_claims oc
       ON oc.order_id = o.id
      AND oc.freelancer_user_id = $2
     WHERE o.id = $1
       AND (
         o.assigned_freelancer_id = $2
         OR oc.status IN ('pending', 'rejected')
       )
     LIMIT 1`,
    [Number(orderId), Number(freelancerUserId)],
  );
  if (!rows[0]) return null;
  const order = await getOrderById(orderId);
  if (!order) return null;
  const myClaim = await getMyOrderClaim({ orderId, freelancerUserId });
  return { ...order, myClaim };
}

async function submitPoolOrderBid({ freelancerUserId, orderId, amount, message = null }) {
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
    if (order.order_status !== ORDER_STATUSES.OPEN_FOR_BIDS) {
      const err = new Error("Order is not available.");
      err.statusCode = 409;
      throw err;
    }
    if (!hasPricedBiddingRow(order)) {
      const err = new Error("This order does not accept price bids.");
      err.statusCode = 409;
      throw err;
    }
    if (order.is_fake) {
      const eligible = await fakeOrdersService.isFreelancerEligibleForFakeOrder(
        { freelancerUserId: Number(freelancerUserId), orderId: Number(orderId) },
        client,
      );
      if (!eligible) {
        const err = new Error("هذا الطلب التدريبي غير متاح لخطة اشتراكك.");
        err.statusCode = 403;
        throw err;
      }
    }
    const bidMessage = message != null ? String(message).trim() : null;

    const bid = Number(amount);
    if (!Number.isFinite(bid) || bid <= 0) {
      const err = new Error("مبلغ العرض غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    const min = Number(order.bid_budget_min);
    const max = Number(order.bid_budget_max);
    if (bid < min || bid > max) {
      const err = new Error(`يجب أن يكون مبلغ العرض بين ${min} و ${max}.`);
      err.statusCode = 400;
      throw err;
    }

    const { rows: prevBidRows } = await client.query(
      `SELECT id, amount, status
       FROM order_freelancer_bids
       WHERE order_id = $1
         AND freelancer_user_id = $2
       LIMIT 1`,
      [Number(orderId), Number(freelancerUserId)],
    );
    const hadBidBefore = Boolean(prevBidRows[0]);
    await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status, is_fake_bid, fake_round_id, proposal_message)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)
       ON CONFLICT (order_id, freelancer_user_id)
       DO UPDATE SET amount = EXCLUDED.amount, status = 'pending', proposal_message = EXCLUDED.proposal_message, is_fake_bid = EXCLUDED.is_fake_bid, fake_round_id = EXCLUDED.fake_round_id, updated_at = NOW()`,
      [Number(orderId), Number(freelancerUserId), bid, Boolean(order.is_fake), order.fake_round_id ? Number(order.fake_round_id) : null, bidMessage || null],
    );
    await safeNotify(() =>
      notificationEventsService.notifyOrderOwner(
        {
          order,
          actorUserId: Number(freelancerUserId),
          type: hadBidBefore ? "order.bid.updated" : "order.bid.submitted",
          title: hadBidBefore ? "تم تحديث عرض السعر" : "تم استلام عرض سعر جديد",
          message: hadBidBefore ? "قام مستقل بتحديث عرضه على المشروع." : "تم إرسال عرض سعر جديد على مشروعك.",
          priority: "high",
          dedupeKey: hadBidBefore ? `order_bid_updated_${orderId}_${freelancerUserId}_${bid}` : `order_bid_submitted_${orderId}_${freelancerUserId}`,
          metadata: { orderId: String(orderId), freelancerUserId: String(freelancerUserId), amount: bid },
        },
        client,
      ),
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
    if (!isClaimablePoolOrderStatus(order.order_status)) {
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

    await safeNotify(() =>
      notificationService.createNotification(
        {
          recipientUserId: Number(order.created_by_user_id),
          recipientRole: order.created_by_role || null,
          actorUserId: Number(freelancerUserId),
          type: "order.claim.submitted",
          title: "تم استلام طلب تقديم جديد",
          message: "تقدّم مستقل جديد لاستلام هذا المشروع.",
          entityType: "order",
          entityId: Number(orderId),
          link:
            order.source_type === "client_created"
              ? `/dashboard/client/my-orders`
              : `/dashboard/${String(order.created_by_role || "").trim() === "super_admin" ? "super-admin" : "admin"}/orders`,
          priority: "high",
          metadata: { orderId: String(orderId), freelancerUserId: String(freelancerUserId), source: "claim_pool_order" },
        },
        client,
      ),
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
    await safeNotify(() =>
      notificationEventsService.notifyOrderOwner(
        {
          order,
          actorUserId: Number(freelancerUserId),
          type: "order.claim.withdrawn",
          title: "تم سحب طلب التقديم",
          message: "قام المستقل بسحب طلب التقديم على المشروع.",
          priority: "medium",
          dedupeKey: `order_claim_withdrawn_${orderId}_${freelancerUserId}`,
          metadata: { orderId: String(orderId), freelancerUserId: String(freelancerUserId) },
        },
        client,
      ),
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
    if (!isClaimablePoolOrderStatus(order.order_status)) {
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
    const { rows: rejectedRows } = await client.query(
      `SELECT freelancer_user_id
       FROM order_claims
       WHERE order_id = $1
         AND id <> $2
         AND status = 'rejected'`,
      [Number(orderId), Number(claim.id)],
    );
    await safeNotify(() =>
      notificationEventsService.notifyUsers(
        {
          userIds: rejectedRows.map((r) => Number(r.freelancer_user_id)),
          recipientRole: "freelancer",
          actorUserId: Number(actorUserId),
          type: "order.freelancer.rejected",
          title: "تم رفض طلبك على المشروع",
          message: "تم اختيار مستقل آخر لهذا المشروع.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderId))}`,
          priority: "medium",
          metadata: { orderId: String(orderId) },
          dedupeKey: `order_claim_rejected_batch_${orderId}`,
        },
        client,
      ),
    );

    // The first accepted pool order starts the subscription countdown (only once).
    await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
      { freelancerUserId: String(updated[0].assigned_freelancer_id), orderId, activatedAt: receivedAt },
      client,
    );
    await safeNotify(() =>
      notificationService.createIfNotExists(
      {
        recipientUserId: Number(updated[0].assigned_freelancer_id),
        recipientRole: "freelancer",
        actorUserId: Number(actorUserId),
        type: "order.freelancer.assigned",
        title: "تم إسناد مشروع لك",
        message: "وافقت الإدارة على طلبك وتم إسناد المشروع لك.",
        entityType: "order",
        entityId: Number(orderId),
        link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`,
        priority: "high",
        metadata: { orderId: String(orderId), source: "admin_accept" },
      },
      `freelancer_assigned_${String(orderId)}`,
      client,
      ),
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
  if (!isClaimablePoolOrderStatus(o.order_status) || !o.is_published || !o.is_open_for_pool || o.assigned_freelancer_id) {
    return { claims: [], orderSummary: { hasOpenPool: false } };
  }
  const claims = await listOrderClaimsAdmin({ orderId });
  const pending = claims.filter((c) => c.status === "pending");
  return { claims: pending, orderSummary: { hasOpenPool: true } };
}

async function listOrderBidsWithFreelancers({ orderId }, clientMaybe) {
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(
    `SELECT b.id, b.order_id, b.freelancer_user_id, b.amount, b.status, b.created_at, b.updated_at, b.proposal_message, b.is_fake_bid, b.fake_round_id,
            u.first_name, u.father_name, u.family_name, u.email, u.account_id
     FROM order_freelancer_bids b
     JOIN users u ON u.id = b.freelancer_user_id
     WHERE b.order_id = $1
     ORDER BY b.amount ASC, b.created_at ASC`,
    [Number(orderId)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id),
    freelancerUserId: String(r.freelancer_user_id),
    amount: Number(r.amount),
    status: r.status,
    message: r.proposal_message || null,
    isFakeBid: Boolean(r.is_fake_bid),
    fakeRoundId: r.fake_round_id ? String(r.fake_round_id) : null,
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

async function listOrderBidsForClient({ clientUserId, orderId }) {
  await assertClientOwnsOrder({ clientUserId, orderId });
  const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1 LIMIT 1`, [Number(orderId)]);
  const o = rows[0];
  if (!o) return { bids: [], orderSummary: null };
  if (o.project_type !== "bidding" || !hasPricedBiddingRow(o)) {
    return { bids: [], orderSummary: { hasOpenPool: false } };
  }
  if (o.order_status !== ORDER_STATUSES.OPEN_FOR_BIDS || !o.is_published || !o.is_open_for_pool || o.assigned_freelancer_id) {
    return { bids: [], orderSummary: { hasOpenPool: false } };
  }
  const all = await listOrderBidsWithFreelancers({ orderId });
  const pending = all.filter((b) => b.status === "pending" || b.status === "selected_pending_payment");
  return {
    bids: pending,
    orderSummary: { hasOpenPool: true, currencyCode: o.currency_code || "JOD" },
  };
}

async function rejectFreelancerBidClient({ clientUserId, orderId, bidId }) {
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
      order.order_status !== ORDER_STATUSES.OPEN_FOR_BIDS
    ) {
      const err = new Error("لا يمكن رفض العروض في هذه الحالة.");
      err.statusCode = 409;
      throw err;
    }
    if (order.project_type !== "bidding" || !hasPricedBiddingRow(order)) {
      const err = new Error("هذا الطلب لا يقبل عروض الأسعار بهذه الطريقة.");
      err.statusCode = 409;
      throw err;
    }
    const { rows: bidRows } = await client.query(
      `SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [Number(bidId), Number(orderId)],
    );
    const bid = bidRows[0];
    if (!bid) {
      const err = new Error("العرض غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    if (bid.status !== "pending") {
      const err = new Error("تمت معالجة هذا العرض مسبقاً.");
      err.statusCode = 409;
      throw err;
    }
    await client.query(`UPDATE order_freelancer_bids SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [
      Number(bid.id),
    ]);
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(bid.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: Number(clientUserId),
          type: "order.bid.rejected",
          title: "تم رفض عرض السعر",
          message: "قام العميل برفض عرضك على المشروع.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderId))}`,
          priority: "medium",
          metadata: { orderId: String(orderId), bidId: String(bid.id) },
        },
        `order_bid_rejected_${orderId}_${bid.id}`,
        client,
      ),
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

async function acceptFreelancerBidClient({ clientUserId, orderId, bidId }) {
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
    if (order.source_type !== "client_created" || Number(order.created_by_user_id) !== Number(clientUserId)) {
      const err = new Error("لا يمكنك اعتماد هذا العرض.");
      err.statusCode = 403;
      throw err;
    }
    if (order.project_type !== "bidding" || !hasPricedBiddingRow(order)) {
      const err = new Error("هذا الطلب لا يقبل اعتماد عرض بهذه الطريقة.");
      err.statusCode = 409;
      throw err;
    }
    if (!order.is_published || !order.is_open_for_pool || order.assigned_freelancer_id || order.received_at) {
      const err = new Error("الطلب غير متاح لاعتماد عرض حالياً.");
      err.statusCode = 409;
      throw err;
    }
    if (order.order_status !== ORDER_STATUSES.OPEN_FOR_BIDS) {
      const err = new Error("الطلب غير متاح لاعتماد عرض حالياً.");
      err.statusCode = 409;
      throw err;
    }

    const { rows: bidRows } = await client.query(
      `SELECT * FROM order_freelancer_bids WHERE id = $1 AND order_id = $2 FOR UPDATE`,
      [Number(bidId), Number(orderId)],
    );
    const bid = bidRows[0];
    if (!bid) {
      const err = new Error("العرض غير موجود.");
      err.statusCode = 404;
      throw err;
    }
    if (bid.status !== "pending") {
      const err = new Error("تمت معالجة هذا العرض مسبقاً.");
      err.statusCode = 409;
      throw err;
    }
    const amt = Number(bid.amount);
    const min = Number(order.bid_budget_min);
    const max = Number(order.bid_budget_max);
    if (!Number.isFinite(amt) || amt < min || amt > max) {
      const err = new Error("مبلغ العرض خارج النطاق المسموح.");
      err.statusCode = 400;
      throw err;
    }

    const receivedAt = new Date();
    const startedAt = receivedAt;
    const dueAt = computeDueAt(startedAt, order.duration_value, order.duration_unit);

    await client.query(
      `UPDATE orders
         SET assigned_freelancer_id = $2,
             received_at = $3,
             started_at = $3,
             due_at = $4,
             is_open_for_pool = FALSE,
             order_status = $5,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(orderId), Number(bid.freelancer_user_id), receivedAt, dueAt, ORDER_STATUSES.IN_PROGRESS],
    );

    await client.query(`UPDATE order_freelancer_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`, [
      Number(bid.id),
    ]);
    await client.query(
      `UPDATE order_freelancer_bids
         SET status = 'rejected', updated_at = NOW()
       WHERE order_id = $1
         AND id <> $2
         AND status = 'pending'`,
      [Number(orderId), Number(bid.id)],
    );

    await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
      { freelancerUserId: String(bid.freelancer_user_id), orderId, activatedAt: receivedAt },
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
      !isClaimablePoolOrderStatus(order.order_status)
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
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(claim.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: Number(clientUserId),
          type: "order.freelancer.rejected",
          title: "تم رفض طلبك على المشروع",
          message: "قام العميل برفض طلب التقديم الخاص بك.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderId))}`,
          priority: "medium",
          metadata: { orderId: String(orderId), claimId: String(claim.id) },
        },
        `order_claim_rejected_${orderId}_${claim.id}`,
        client,
      ),
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
    if (!isClaimablePoolOrderStatus(order.order_status)) {
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
    const { rows: rejectedRows } = await client.query(
      `SELECT freelancer_user_id
       FROM order_claims
       WHERE order_id = $1
         AND id <> $2
         AND status = 'rejected'`,
      [Number(orderId), Number(claim.id)],
    );
    await safeNotify(() =>
      notificationEventsService.notifyUsers(
        {
          userIds: rejectedRows.map((r) => Number(r.freelancer_user_id)),
          recipientRole: "freelancer",
          actorUserId: Number(clientUserId),
          type: "order.freelancer.rejected",
          title: "تم رفض طلبك على المشروع",
          message: "تم اختيار مستقل آخر لهذا المشروع.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/orders/${encodeURIComponent(String(orderId))}`,
          priority: "medium",
          metadata: { orderId: String(orderId) },
          dedupeKey: `order_claim_rejected_batch_${orderId}`,
        },
        client,
      ),
    );

    await subscriptionsService.activateCurrentSubscriptionOnFirstAcceptedOrder(
      { freelancerUserId: String(claim.freelancer_user_id), orderId, activatedAt: receivedAt },
      client,
    );
    await safeNotify(() =>
      notificationService.createIfNotExists(
      {
        recipientUserId: Number(claim.freelancer_user_id),
        recipientRole: "freelancer",
        actorUserId: Number(clientUserId),
        type: "order.freelancer.assigned",
        title: "تم قبولك في المشروع",
        message: "وافق العميل على طلبك وتم إسناد المشروع لك.",
        entityType: "order",
        entityId: Number(orderId),
        link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`,
        priority: "high",
        metadata: { orderId: String(orderId), source: "client_accept" },
      },
      `freelancer_assigned_${String(orderId)}`,
      client,
      ),
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

    const preparedFiles = await uploadFilesToCloudinary({
      orderId: order.id,
      files,
      purpose: "delivery",
    });

    await attachFiles({ orderId: order.id, actorUserId: freelancerUserId, files: preparedFiles, defaultPurpose: "delivery" }, client);

    await client.query(
      `UPDATE orders
         SET order_status = $2,
             client_revision_note = NULL,
             updated_at = NOW()
       WHERE id = $1`,
      [Number(orderId), ORDER_STATUSES.PENDING_CLIENT_REVIEW],
    );

    const actorIdentity = await getUserIdentitySnapshot(freelancerUserId, client);
    await safeNotify(() =>
      notificationService.createNotification(
        {
          recipientUserId: Number(order.created_by_user_id),
          recipientRole: order.created_by_role || null,
          actorUserId: Number(freelancerUserId),
          type: "order.delivery.submitted",
          title: "تم تسليم العمل وبانتظار المراجعة",
          message: "قام المستقل برفع التسليم، يرجى مراجعة الطلب.",
          entityType: "order",
          entityId: Number(orderId),
          link:
            order.source_type === "client_created"
              ? `/dashboard/client/my-orders`
              : `/dashboard/${String(order.created_by_role || "").trim() === "super_admin" ? "super-admin" : "admin"}/orders`,
          priority: "high",
          metadata: {
            orderId: String(orderId),
            orderCode: order.order_code || null,
            projectName: order.title || null,
            freelancerUserId: String(freelancerUserId),
            actorName: actorIdentity?.fullName || null,
            actorAccountId: actorIdentity?.accountId || null,
            source: "delivery_submitted",
          },
        },
        client,
      ),
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

async function assertInternalOrderForAdmin({ orderId }, clientMaybe) {
  const runner = clientMaybe || pool;
  const { rows } = await runner.query(`SELECT id, source_type FROM orders WHERE id = $1 LIMIT 1`, [Number(orderId)]);
  const order = rows[0];
  if (!order) {
    const err = new Error("الطلب غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  if (!["admin_created", "super_admin_created"].includes(order.source_type)) {
    const err = new Error("لا يمكن إدارة هذا الطلب من الطلبات الداخلية.");
    err.statusCode = 403;
    throw err;
  }
  return order;
}

async function adminApproveInternalDelivery({ orderId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertInternalOrderForAdmin({ orderId }, client);
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
    await safeNotify(() =>
      notificationEventsService.notifyAssignedFreelancer(
        {
          order,
          actorUserId: null,
          type: "order.delivery.approved",
          title: "تم اعتماد التسليم",
          message: "تم اعتماد التسليم وإغلاق المشروع بنجاح.",
          priority: "high",
          dedupeKey: `order_delivery_approved_${orderId}`,
          metadata: { orderId: String(orderId), source: "admin_approve_delivery" },
        },
        client,
      ),
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

async function adminRequestInternalDeliveryRevision({ orderId, note, uploadedFiles = [] }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertInternalOrderForAdmin({ orderId }, client);
    const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [Number(orderId)]);
    const order = rows[0];
    const noteText = note != null ? String(note).trim() : "";
    if (order.order_status === ORDER_STATUSES.PENDING_CLIENT_REVIEW) {
      await client.query(`DELETE FROM order_files WHERE order_id = $1 AND purpose = 'delivery'`, [Number(orderId)]);
      await client.query(
        `UPDATE orders
           SET order_status = $2,
               client_revision_note = $3,
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
    const revisionFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    if (revisionFiles.length) {
      const prepared = await uploadFilesToCloudinary({
        orderId: Number(orderId),
        files: revisionFiles,
        purpose: "revision_request",
      });
      await attachFiles({ orderId: Number(orderId), actorUserId: null, files: prepared, defaultPurpose: "revision_request" }, client);
    }
    if (order.assigned_freelancer_id) {
      await safeNotify(() =>
        notificationService.createNotification(
        {
          recipientUserId: Number(order.assigned_freelancer_id),
          recipientRole: "freelancer",
          actorUserId: null,
          type: "order.revision.requested",
          title: "تم طلب تعديل على التسليم",
          message: noteText || "تم طلب تعديل على العمل المرسل.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`,
          priority: "high",
          metadata: { orderId: String(orderId), source: "admin_revision" },
        },
        client,
        ),
      );
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

async function prepareAdminInternalOrderFileDownload({ orderId, fileId }) {
  await assertInternalOrderForAdmin({ orderId });
  const { rows } = await pool.query(
    `SELECT id, order_id, file_path, file_url, secure_url, original_name, mime_type
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
  const remoteUrl = String(f.secure_url || f.file_url || "").trim();
  if (/^https?:\/\//i.test(remoteUrl)) {
    return {
      redirectUrl: remoteUrl,
      downloadName: decodeMultipartOriginalName(f.original_name) || f.original_name || "file",
      mimeType: f.mime_type || "application/octet-stream",
    };
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
    await safeNotify(() =>
      notificationEventsService.notifyAssignedFreelancer(
        {
          order,
          actorUserId: Number(clientUserId),
          type: "order.delivery.approved",
          title: "تم اعتماد التسليم",
          message: "قام العميل باعتماد التسليم وإغلاق المشروع.",
          priority: "high",
          dedupeKey: `order_delivery_approved_${orderId}`,
          metadata: { orderId: String(orderId), source: "client_approve_delivery" },
        },
        client,
      ),
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

async function clientRequestDeliveryRevision({ clientUserId, orderId, note, uploadedFiles = [] }) {
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
    const revisionFiles = Array.isArray(uploadedFiles) ? uploadedFiles : [];
    if (revisionFiles.length) {
      const prepared = await uploadFilesToCloudinary({
        orderId: Number(orderId),
        files: revisionFiles,
        purpose: "revision_request",
      });
      await attachFiles({ orderId: Number(orderId), actorUserId: Number(clientUserId), files: prepared, defaultPurpose: "revision_request" }, client);
    }
    if (order.assigned_freelancer_id) {
      await safeNotify(() =>
        notificationService.createNotification(
        {
          recipientUserId: Number(order.assigned_freelancer_id),
          recipientRole: "freelancer",
          actorUserId: Number(clientUserId),
          type: "order.revision.requested",
          title: "العميل طلب تعديلاً على التسليم",
          message: noteText || "يرجى تعديل التسليم وإعادة الرفع.",
          entityType: "order",
          entityId: Number(orderId),
          link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`,
          priority: "high",
          metadata: { orderId: String(orderId), source: "client_revision" },
        },
        client,
        ),
      );
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
    `SELECT id, order_id, file_path, file_url, secure_url, original_name, mime_type
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
  const remoteUrl = String(f.secure_url || f.file_url || "").trim();
  if (/^https?:\/\//i.test(remoteUrl)) {
    return {
      redirectUrl: remoteUrl,
      downloadName: decodeMultipartOriginalName(f.original_name) || f.original_name || "file",
      mimeType: f.mime_type || "application/octet-stream",
    };
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

    const { rows: updated } = await client.query(
      `UPDATE orders
         SET is_archived = FALSE,
             is_published = TRUE,
             is_open_for_pool = TRUE,
             order_status = 'published',
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [Number(orderId)],
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
  listOrderBidsForClient,
  rejectFreelancerBidClient,
  acceptFreelancerBidClient,
  rejectPoolClaimClient,
  approvePoolClaimClient,
  submitFreelancerOrderDelivery,
  clientApproveDelivery,
  clientRequestDeliveryRevision,
  prepareClientOrderFileDownload,
  adminApproveInternalDelivery,
  adminRequestInternalDeliveryRevision,
  prepareAdminInternalOrderFileDownload,
  activateArchivedInternalOrder,
  purgeClientUnpaidFixedOrderDraft,
};

