/**

 * Local mobile QA users — idempotent dev seed only.

 *

 * NEVER run in production without explicit review.

 *

 * Usage (from backend/):

 *   ALLOW_QA_SEED=true node scripts/seed-mobile-qa-users.js

 *   ALLOW_QA_SEED=true node scripts/seed-mobile-qa-users.js --with-pool-orders

 *

 * Requires: DATABASE_URL, JWT_SECRET in backend/.env

 */

const path = require("node:path");

const crypto = require("node:crypto");



require("dotenv").config({ path: path.join(__dirname, "..", ".env") });



const bcrypt = require("bcrypt");

const { pool } = require("../src/config/db");

const { ensureUserRole } = require("../src/services/rbacService");

const subscriptionsService = require("../src/services/subscriptionsService");

const { markActivationFeePaidOffline } = require("../src/services/subscriptionActivationFeeService");



const BCRYPT_ROUNDS = 12;

const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";



const QA_CLIENT_EMAIL = "qa.client@orderzhouse.test";

const QA_FREELANCER_EMAIL = "qa.freelancer@orderzhouse.test";

const QA_PASSWORD = "Test123456!";



/** Stable titles — re-seed updates rows by title (idempotent). */

const QA_POOL_FIXED_TITLE = "QA-2C Pool Fixed (mobile QA)";

const QA_POOL_BIDDING_TITLE = "QA-2C Pool Bidding (mobile QA)";



/** Fixed budget within platinum plan band (min 10 JOD, no max). */

const QA_POOL_FIXED_BUDGET = "75.00";

const QA_POOL_BID_MIN = "50.00";

const QA_POOL_BID_MAX = "100.00";



const QA_FREELANCER_PLAN_NAME = "orderzhouse_platinum";



function assertQaSeedAllowed() {

  if (process.env.NODE_ENV === "production" && process.env.ALLOW_QA_SEED !== "true") {

    console.error("Refusing QA seed in production. Set ALLOW_QA_SEED=true only on local dev.");

    process.exit(1);

  }

  if (process.env.ALLOW_QA_SEED !== "true") {

    console.error("Set ALLOW_QA_SEED=true to run this script.");

    process.exit(1);

  }

}



function generateAccountIdCandidate() {

  let out = "";

  for (let i = 0; i < 10; i += 1) {

    out += ACCOUNT_ID_CHARS[crypto.randomInt(0, ACCOUNT_ID_CHARS.length)];

  }

  return out;

}



async function generateUniqueAccountId(client) {

  const runner = client || pool;

  for (let i = 0; i < 25; i += 1) {

    const id = generateAccountIdCandidate();

    const { rowCount } = await runner.query("SELECT 1 FROM users WHERE account_id = $1", [id]);

    if (rowCount === 0) return id;

  }

  throw new Error("Could not allocate account_id.");

}



async function findUserByEmail(email, client) {

  const runner = client || pool;

  const { rows } = await runner.query(

    `SELECT id, email, role, email_verified, is_active

     FROM users WHERE lower(email) = lower($1::text) LIMIT 1`,

    [email],

  );

  return rows[0] || null;

}



async function upsertQaUser(

  {

    email,

    role,

    firstName,

    fatherName,

    familyName,

    freelancerCategories = null,

  },

  client,

) {

  const runner = client || pool;

  const normalizedEmail = String(email).trim().toLowerCase();

  const passwordHash = await bcrypt.hash(QA_PASSWORD, BCRYPT_ROUNDS);

  const existing = await findUserByEmail(normalizedEmail, runner);



  if (existing) {

    await runner.query(

      `UPDATE users SET

         role = $2::text,

         first_name = $3::text,

         father_name = $4::text,

         family_name = $5::text,

         password_hash = $6::text,

         email_verified = TRUE,

         is_active = TRUE,

         terms_accepted = TRUE,

         freelancer_categories = $7::text[],

         updated_at = NOW()

       WHERE id = $1::bigint`,

      [

        existing.id,

        role,

        firstName,

        fatherName,

        familyName,

        passwordHash,

        freelancerCategories,

      ],

    );

    return Number(existing.id);

  }



  const accountId = await generateUniqueAccountId(runner);

  const { rows } = await runner.query(

    `INSERT INTO users (

      account_id, first_name, father_name, family_name, email, password_hash, role,

      country, phone, whatsapp, gender, terms_accepted, freelancer_categories,

      email_verified, is_active

    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,TRUE)

    RETURNING id, email, role`,

    [

      accountId,

      firstName,

      fatherName,

      familyName,

      normalizedEmail,

      passwordHash,

      role,

      "JO",

      "+962790000001",

      "+962790000001",

      "ذكر",

      true,

      freelancerCategories,

    ],

  );

  const row = rows[0];

  return Number(row.id);

}



async function resolveQaFreelancerPlanId(client) {

  const runner = client || pool;

  const { rows } = await runner.query(

    `SELECT id, name, title FROM plans

     WHERE name = $1::text AND deleted_at IS NULL AND is_active = TRUE

     LIMIT 1`,

    [QA_FREELANCER_PLAN_NAME],

  );

  if (rows[0]) return Number(rows[0].id);

  const fallbackId = 3;

  const { rows: byId } = await runner.query(

    `SELECT id, name FROM plans WHERE id = $1::bigint AND deleted_at IS NULL AND is_active = TRUE LIMIT 1`,

    [fallbackId],

  );

  if (byId[0]) {

    console.warn(`Plan ${QA_FREELANCER_PLAN_NAME} not found by name; using plan id=${fallbackId}`);

    return Number(byId[0].id);

  }

  throw new Error(`Plan ${QA_FREELANCER_PLAN_NAME} not found. Run migrations first.`);

}



async function ensureFreelancerEligible(freelancerUserId) {

  const planId = await resolveQaFreelancerPlanId();

  await subscriptionsService.assignPlanToFreelancer({

    actorUserId: null,

    freelancerUserId: String(freelancerUserId),

    planId: String(planId),

    notes: "seed-mobile-qa-users.js (QA platinum for mobile E2E)",

  });

  await markActivationFeePaidOffline({

    adminUserId: null,

    freelancerUserId,

    notes: "seed-mobile-qa-users.js (local QA activation fee)",

  });

  return subscriptionsService.canFreelancerTakeOrders(String(freelancerUserId));

}



function formatYmd(date) {

  const d = new Date(date);

  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

}



async function generateUniqueOrderCode(client) {

  const prefix = `ORD-${formatYmd(new Date())}-`;

  for (let i = 0; i < 30; i += 1) {

    const rnd = crypto.randomBytes(3).toString("hex").toUpperCase();

    const code = `${prefix}${rnd}`;

    const { rowCount } = await client.query(`SELECT 1 FROM orders WHERE order_code = $1`, [code]);

    if (rowCount === 0) return code;

  }

  throw new Error("Could not allocate order_code.");

}



async function pickCategoryIds(client) {

  const { rows: cats } = await client.query(

    `SELECT id FROM categories WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`,

  );

  if (!cats[0]) throw new Error("No active categories.");

  const categoryId = Number(cats[0].id);

  const { rows: subs } = await client.query(

    `SELECT id FROM subcategories WHERE category_id = $1 AND is_active = TRUE ORDER BY id ASC LIMIT 1`,

    [categoryId],

  );

  return { categoryId, subcategoryId: subs[0] ? Number(subs[0].id) : null };

}



/**

 * Clears bids, submissions, and assignment so pool orders can be re-used in QA.

 */

async function resetPoolOrderWorkState(client, orderId) {

  await client.query(`DELETE FROM order_freelancer_bids WHERE order_id = $1::bigint`, [orderId]);

  const { rows: subs } = await client.query(

    `SELECT id FROM order_submissions WHERE order_id = $1::bigint`,

    [orderId],

  );

  for (const sub of subs) {

    await client.query(`DELETE FROM order_files WHERE submission_id = $1::bigint`, [sub.id]);

  }

  await client.query(`DELETE FROM order_submissions WHERE order_id = $1::bigint`, [orderId]);

  await client.query(

    `DELETE FROM freelancer_reviews WHERE order_id = $1::bigint`,

    [orderId],

  ).catch(() => {

    /* table may not exist on older DB snapshots */

  });

}



async function upsertPoolOrder(client, { clientUserId, projectType, title }) {

  const isFixed = projectType === "fixed";

  const { categoryId, subcategoryId } = await pickCategoryIds(client);

  const orderStatus = isFixed ? "open_for_freelancers" : "open_for_bids";

  const description =

    "طلب اختبار QA-3A للتطبيق المحمول. مملوك لعميل QA — يمكن حذفه بعد انتهاء الاختبار.";



  const paymentRequired = false;

  const paymentStatus = isFixed ? "paid" : "not_required";

  const budget = isFixed ? QA_POOL_FIXED_BUDGET : null;

  const currencyCode = "JOD";

  const bidBudgetMin = isFixed ? null : QA_POOL_BID_MIN;

  const bidBudgetMax = isFixed ? null : QA_POOL_BID_MAX;

  const durationValue = isFixed ? 5 : 3;



  const { rows: existing } = await client.query(

    `SELECT id, order_code FROM orders WHERE title = $1::text LIMIT 1`,

    [title],

  );



  if (existing[0]) {

    const orderId = Number(existing[0].id);

    await resetPoolOrderWorkState(client, orderId);

    await client.query(

      `UPDATE orders SET

         description = $2::text,

         category_id = $3::bigint,

         subcategory_id = $4::bigint,

         project_type = $5::text,

         budget = $6::numeric,

         currency_code = $7::text,

         bid_budget_min = $8::numeric,

         bid_budget_max = $9::numeric,

         duration_value = $10::int,

         duration_unit = 'days',

         created_by_user_id = $11::bigint,

         created_by_role = 'client',

         source_type = 'client_created',

         assigned_freelancer_id = NULL,

         accepted_freelancer_id = NULL,

         received_at = NULL,

         taken_at = NULL,

         accepted_at = NULL,

         started_at = NULL,

         submitted_at = NULL,

         due_at = NULL,

         is_published = TRUE,

         is_open_for_pool = TRUE,

         is_archived = FALSE,

         payment_required = $12::boolean,

         payment_status = $13::text,

         order_status = $14::text,

         client_revision_note = NULL,
updated_at = NOW()

       WHERE id = $1::bigint`,

      [

        orderId,

        description,

        categoryId,

        subcategoryId,

        projectType,

        budget,

        currencyCode,

        bidBudgetMin,

        bidBudgetMax,

        durationValue,

        clientUserId,

        paymentRequired,

        paymentStatus,

        orderStatus,

      ],

    );

    return {

      created: false,

      updated: true,

      id: orderId,

      orderCode: existing[0].order_code,

      title,

      projectType,

      budget: isFixed ? QA_POOL_FIXED_BUDGET : null,

      bidBudgetMin: isFixed ? null : QA_POOL_BID_MIN,

      bidBudgetMax: isFixed ? null : QA_POOL_BID_MAX,

      createdByUserId: clientUserId,

    };

  }



  const orderCode = await generateUniqueOrderCode(client);

  const { rows: inserted } = await client.query(

    `INSERT INTO orders (

      order_code, title, description,

      category_id, subcategory_id, sub_subcategory_id,

      extra_category_ids, extra_category_details,

      project_type, budget, currency_code,

      bid_budget_min, bid_budget_max,

      duration_value, duration_unit,

      created_by_user_id, source_type,

      assigned_freelancer_id,

      received_at, started_at, due_at,

      is_published, is_open_for_pool,

      is_archived,

      payment_required, payment_status,

      order_status,

      created_by_role

    ) VALUES (

      $1, $2, $3,

      $4, $5, NULL,

      '{}', '{}'::jsonb,

      $6, $7, $8,

      $9, $10,

      $11, $12,

      $13, 'client_created',

      NULL,

      NULL, NULL, NULL,

      TRUE, TRUE,

      FALSE,

      $14, $15,

      $16,

      'client'

    )

    RETURNING id, order_code`,

    [

      orderCode,

      title,

      description,

      categoryId,

      subcategoryId,

      projectType,

      budget,

      currencyCode,

      bidBudgetMin,

      bidBudgetMax,

      durationValue,

      "days",

      clientUserId,

      paymentRequired,

      paymentStatus,

      orderStatus,

    ],

  );

  const row = inserted[0];

  return {

    created: true,

    updated: false,

    id: Number(row.id),

    orderCode: row.order_code,

    title,

    projectType,

    budget: isFixed ? QA_POOL_FIXED_BUDGET : null,

    bidBudgetMin: isFixed ? null : QA_POOL_BID_MIN,

    bidBudgetMax: isFixed ? null : QA_POOL_BID_MAX,

    createdByUserId: clientUserId,

  };

}



async function seedPoolOrdersIfRequested(client, clientUserId) {

  const fixed = await upsertPoolOrder(client, {

    clientUserId,

    projectType: "fixed",

    title: QA_POOL_FIXED_TITLE,

  });

  const bidding = await upsertPoolOrder(client, {

    clientUserId,

    projectType: "bidding",

    title: QA_POOL_BIDDING_TITLE,

  });

  return { fixed, bidding };

}



function printCredentials({ clientId, freelancerId, eligibility, planName }) {

  console.log("");

  console.log("=== Mobile QA accounts (local dev only) ===");

  console.log(`Client:     ${QA_CLIENT_EMAIL}`);

  console.log(`Freelancer: ${QA_FREELANCER_EMAIL}`);

  console.log(`Password:   ${QA_PASSWORD}`);

  console.log(`Client user id:     ${clientId}`);

  console.log(`Freelancer user id: ${freelancerId}`);

  console.log(`Freelancer plan:    ${planName}`);

  console.log("Freelancer eligibility:", JSON.stringify(eligibility));

  console.log("");

  console.log("Login (mobile): POST /api/auth/login with header X-Client-Type: mobile");

  console.log("Eligibility:    GET /api/freelancer/eligibility (Bearer token)");

  console.log("");

}



async function main() {

  assertQaSeedAllowed();

  const withPoolOrders = process.argv.includes("--with-pool-orders");



  const clientId = await upsertQaUser({

    email: QA_CLIENT_EMAIL,

    role: "client",

    firstName: "عميل",

    fatherName: "اختبار",

    familyName: "QA",

  });

  await ensureUserRole({ userId: clientId, roleName: "client" });



  const freelancerId = await upsertQaUser({

    email: QA_FREELANCER_EMAIL,

    role: "freelancer",

    firstName: "مستقل",

    fatherName: "اختبار",

    familyName: "QA",

    freelancerCategories: ["1"],

  });

  await ensureUserRole({ userId: freelancerId, roleName: "freelancer" });



  const planId = await resolveQaFreelancerPlanId();

  const eligibility = await ensureFreelancerEligible(freelancerId);



  let poolOrders = null;

  if (withPoolOrders) {

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      poolOrders = await seedPoolOrdersIfRequested(client, clientId);

      await client.query("COMMIT");

    } catch (err) {

      await client.query("ROLLBACK");

      throw err;

    } finally {

      client.release();

    }

  }



  printCredentials({

    clientId,

    freelancerId,

    eligibility,

    planName: QA_FREELANCER_PLAN_NAME,

  });

  if (poolOrders) {

    console.log("Pool orders (owned by QA client):");

    console.log(JSON.stringify(poolOrders, null, 2));

    console.log("");

    console.log("Re-run with --with-pool-orders to reset pool order state (take/bid/delivery).");

  } else {

    console.log("Tip: re-run with --with-pool-orders to seed/update 1 fixed + 1 bidding pool order.");

    console.log("Client orders (my orders / payment): create from the mobile app during QA.");

  }



  await pool.end();

}



main().catch((err) => {

  console.error(err);

  process.exit(1);

});


