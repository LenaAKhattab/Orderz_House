const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const bcrypt = require("bcrypt");
const { pool } = require("../src/config/db");
const { ensureUserRole } = require("../src/services/rbacService");
const subscriptionsService = require("../src/services/subscriptionsService");

const BCRYPT_ROUNDS = 12;
const ACCOUNT_ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateAccountIdCandidate() {
  let out = "";
  for (let i = 0; i < 10; i += 1) out += ACCOUNT_ID_CHARS[crypto.randomInt(0, ACCOUNT_ID_CHARS.length)];
  return out;
}

async function generateUniqueAccountId() {
  for (let i = 0; i < 50; i += 1) {
    const id = generateAccountIdCandidate();
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE account_id = $1", [id]);
    if (rowCount === 0) return id;
  }
  throw new Error("Could not allocate account_id.");
}

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const password = String(process.argv[3] || "Houseorderz6@123");
  if (!email) {
    throw new Error("Usage: node scripts/provisionFreelancerWithSubscription.js <email> [password]");
  }

  let user = null;
  const { rows: existing } = await pool.query(
    "SELECT id, email, role, account_id FROM users WHERE lower(email) = lower($1) LIMIT 1",
    [email],
  );
  user = existing[0] || null;

  if (!user) {
    const accountId = await generateUniqueAccountId();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await pool.query(
      `INSERT INTO users (
         account_id, first_name, father_name, family_name, email, password_hash, role,
         country, phone, whatsapp, gender, terms_accepted, freelancer_categories
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE,$12)
       RETURNING id, email, role, account_id`,
      [
        accountId,
        "House",
        "Orderz",
        "Six",
        email,
        passwordHash,
        "freelancer",
        "JO",
        "+962790000006",
        "+962790000006",
        "ذكر",
        null,
      ],
    );
    user = rows[0];
    await ensureUserRole({ userId: user.id, roleName: "freelancer" });
  } else {
    await ensureUserRole({ userId: user.id, roleName: "freelancer" });
  }

  const { rows: plans } = await pool.query(
    "SELECT id, name, title FROM plans WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY sort_order ASC, id ASC LIMIT 1",
  );
  if (!plans[0]) throw new Error("No active plan found.");
  const plan = plans[0];

  const { rows: admins } = await pool.query(
    "SELECT id, email FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1",
  );
  if (!admins[0]) throw new Error("No admin/super_admin user found.");
  const admin = admins[0];

  const assigned = await subscriptionsService.assignPlanToFreelancer({
    actorUserId: admin.id,
    freelancerUserId: String(user.id),
    planId: String(plan.id),
    notes: "provisionFreelancerWithSubscription script",
  });

  const activated = await subscriptionsService.activateCompanyApprovalForSubscription({
    actorUserId: admin.id,
    subscriptionId: assigned.subscription.id,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        user: {
          id: String(user.id),
          email: user.email,
          accountId: user.account_id,
          password,
        },
        plan: { id: String(plan.id), name: plan.name, title: plan.title },
        adminActor: { id: String(admin.id), email: admin.email },
        subscription: {
          id: String(assigned.subscription.id),
          status: activated.status,
          paymentStatus: activated.paymentStatus,
          activationStatus: activated.activationStatus,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
