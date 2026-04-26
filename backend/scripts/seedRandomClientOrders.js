/**
 * Insert random orders into PostgreSQL.
 *
 * Default: client-created orders (source_type = client_created) for a given user id.
 * These do NOT appear on GET /orders/pool (pool only lists admin/super_admin internal orders).
 *
 * Usage (from backend/):
 *   node scripts/seedRandomClientOrders.js --user-id=1 --count=10
 *   node scripts/seedRandomClientOrders.js --email=client@example.com --count=5
 *   node scripts/seedRandomClientOrders.js --name-like=هزبر --count=3
 *
 * Pool test data (visible to freelancers on /orders):
 *   node scripts/seedRandomClientOrders.js --for-pool --count=8
 *   (uses first active admin or super_admin as created_by_user_id)
 *
 * Options:
 *   --user-id=N
 *   --email=...
 *   --name-like=...   (matches concat of Arabic name parts, ILIKE)
 *   --count=N         (default 10)
 *   --for-pool        (admin_created, published, open pool — not "from client" in DB terms)
 */

const path = require("path");
const crypto = require("crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");

function parseArgs(argv) {
  const out = { count: 10, userId: null, email: null, nameLike: null, forPool: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--for-pool") {
      out.forPool = true;
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (!m) continue;
    const k = m[1];
    const v = m[2];
    if (k === "count") out.count = Math.max(1, Math.min(200, Number(v) || 10));
    else if (k === "user-id") {
      const n = Number(v);
      if (Number.isInteger(n) && n > 0) out.userId = n;
    }
    else if (k === "email") out.email = v.trim();
    else if (k === "name-like") out.nameLike = v.trim();
  }
  return out;
}

function formatYmd(date) {
  const d = new Date(date);
  const y = String(d.getUTCFullYear());
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${mo}${day}`;
}

async function generateUniqueOrderCode(client) {
  const runner = client || pool;
  const prefix = `ORD-${formatYmd(new Date())}-`;
  for (let i = 0; i < 30; i += 1) {
    const rnd = crypto.randomBytes(3).toString("hex").toUpperCase();
    const code = `${prefix}${rnd}`;
    const { rowCount } = await runner.query(`SELECT 1 FROM orders WHERE order_code = $1`, [code]);
    if (rowCount === 0) return code;
  }
  throw new Error("Could not allocate a unique order_code.");
}

const SAMPLE_TITLES = [
  "تطوير واجهة مستخدم لتطبيق داخلي",
  "كتابة محتوى تسويقي لصفحة هبوط",
  "مراجعة أداء API وتحسين الاستعلامات",
  "تصميم شعار وهوية بصرية مبسطة",
  "إعداد تقرير بحثي قصير بالعربية",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function resolveCreatorUserId({ userId, email, nameLike, forPool }) {
  if (forPool) {
    const { rows } = await pool.query(
      `SELECT id FROM users
       WHERE role IN ('admin','super_admin') AND is_active = TRUE
       ORDER BY id ASC
       LIMIT 1`,
    );
    if (!rows[0]) {
      throw new Error("No active admin/super_admin user found. Create one first, or omit --for-pool.");
    }
    return { id: Number(rows[0].id), role: "admin", forPool: true };
  }

  if (userId && Number.isInteger(userId) && userId > 0) {
    const { rows } = await pool.query(`SELECT id, role FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (!rows[0]) throw new Error(`User id ${userId} not found.`);
    return { id: Number(rows[0].id), role: rows[0].role, forPool: false };
  }

  if (email) {
    const { rows } = await pool.query(`SELECT id, role FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
    if (!rows[0]) throw new Error(`No user with email: ${email}`);
    return { id: Number(rows[0].id), role: rows[0].role, forPool: false };
  }

  if (nameLike) {
    const { rows } = await pool.query(
      `SELECT id, role
       FROM users
       WHERE (first_name || ' ' || father_name || ' ' || family_name) ILIKE $1
       ORDER BY id ASC
       LIMIT 1`,
      [`%${nameLike}%`],
    );
    if (!rows[0]) throw new Error(`No user matching name-like: ${nameLike}`);
    return { id: Number(rows[0].id), role: rows[0].role, forPool: false };
  }

  throw new Error("Specify --user-id, --email, or --name-like (or use --for-pool for pool orders).");
}

async function pickCategoryIds(client) {
  const { rows: cats } = await client.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`);
  if (!cats[0]) throw new Error("No active categories in DB. Run migrations / seed SQL first.");

  const categoryId = Number(cats[0].id);
  const { rows: subs } = await client.query(
    `SELECT id FROM subcategories WHERE category_id = $1 AND is_active = TRUE ORDER BY id ASC LIMIT 1`,
    [categoryId],
  );
  const subcategoryId = subs[0] ? Number(subs[0].id) : null;
  return { categoryId, subcategoryId };
}

async function insertOneOrder(client, { creatorId, sourceType, isPublished, isOpenForPool, orderStatus }) {
  const orderCode = await generateUniqueOrderCode(client);
  const title = `${pick(SAMPLE_TITLES)} (#${crypto.randomBytes(2).toString("hex")})`;
  const description =
    "وصف تجريبي تلقائي للطلب. يمكنك تعديله من لوحة الإدارة أو حذف هذه السجلات عند الانتهاء من الاختبار.";

  const { categoryId, subcategoryId } = await pickCategoryIds(client);
  const projectType = Math.random() < 0.6 ? "fixed" : "bidding";
  const budget = projectType === "fixed" ? (50 + Math.floor(Math.random() * 450)).toFixed(2) : null;
  const currencyCode = projectType === "fixed" ? "USD" : null;
  const durationValue = projectType === "fixed" ? 3 + Math.floor(Math.random() * 10) : 1 + Math.floor(Math.random() * 5);
  const durationUnit = pick(["days", "hours"]);

  const paymentRequired = sourceType === "client_created";
  const paymentStatus = paymentRequired ? "unpaid" : "not_required";

  await client.query(
    `INSERT INTO orders (
      order_code, title, description,
      category_id, subcategory_id, sub_subcategory_id,
      extra_category_ids, extra_category_details,
      project_type, budget, currency_code, duration_value, duration_unit,
      created_by_user_id, source_type,
      assigned_freelancer_id,
      received_at, started_at, due_at,
      is_published, is_open_for_pool,
      is_archived,
      payment_required, payment_status,
      order_status
    ) VALUES (
      $1, $2, $3,
      $4, $5, NULL,
      '{}', '{}'::jsonb,
      $6, $7, $8, $9, $10,
      $11, $12,
      NULL,
      NULL, NULL, NULL,
      $13, $14,
      FALSE,
      $15, $16,
      $17
    )`,
    [
      orderCode,
      title,
      description,
      categoryId,
      subcategoryId,
      projectType,
      budget,
      currencyCode,
      durationValue,
      durationUnit,
      creatorId,
      sourceType,
      isPublished,
      isOpenForPool,
      paymentRequired,
      paymentStatus,
      orderStatus,
    ],
  );

  return orderCode;
}

async function main() {
  const args = parseArgs(process.argv);
  const creator = await resolveCreatorUserId({
    userId: args.userId,
    email: args.email,
    nameLike: args.nameLike,
    forPool: args.forPool,
  });

  if (!args.forPool && creator.role !== "client") {
    console.warn(
      `Warning: user ${creator.id} has role "${creator.role}" (expected "client" for typical client orders). Continuing.`,
    );
  }

  const client = await pool.connect();
  const codes = [];
  try {
    await client.query("BEGIN");
    for (let i = 0; i < args.count; i += 1) {
      if (args.forPool) {
        const code = await insertOneOrder(client, {
          creatorId: creator.id,
          sourceType: "admin_created",
          isPublished: true,
          isOpenForPool: true,
          orderStatus: "published",
        });
        codes.push(code);
      } else {
        const code = await insertOneOrder(client, {
          creatorId: creator.id,
          sourceType: "client_created",
          isPublished: false,
          isOpenForPool: false,
          orderStatus: "draft",
        });
        codes.push(code);
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(
    args.forPool
      ? `Inserted ${codes.length} pool-ready admin orders (codes: ${codes.slice(0, 5).join(", ")}${codes.length > 5 ? "…" : ""}).`
      : `Inserted ${codes.length} client_created draft orders for user_id=${creator.id} (codes: ${codes.slice(0, 5).join(", ")}${codes.length > 5 ? "…" : ""}).`,
  );
  if (!args.forPool) {
    console.log("");
    console.log("AR: طلبات العميل (client_created) لا تظهر في صفحة /orders — تلك الصفحة تعرض فقط طلبات الحوض المنشأة من الإدارة.");
    console.log("AR: لتعبئة الصفحة استخدم: npm run db:seed-pool-orders -- --count=15");
    console.log("");
    console.log("EN: client_created orders are NOT returned by GET /orders/pool (admin/super_admin internal orders only).");
    console.log("EN: To fill the freelancer pool UI run: npm run db:seed-pool-orders -- --count=15");
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
