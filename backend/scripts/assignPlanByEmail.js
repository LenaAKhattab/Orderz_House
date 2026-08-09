/**
 * Assign a plan subscription to a freelancer by email.
 *
 * Usage (from backend/):
 *   node scripts/assignPlanByEmail.js lenakattab@gmail.com orderzhouse_50_jod
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { guardQaOrSeed } = require("./lib/assertScriptDatabaseAllowed");
guardQaOrSeed(require("path").basename(__filename));

const { pool } = require("../src/config/db");
const subscriptionsService = require("../src/services/subscriptionsService");

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const planName = String(process.argv[3] || "orderzhouse_50_jod").trim();
  if (!email) {
    console.error("Usage: node scripts/assignPlanByEmail.js <email> [plan_name]");
    process.exit(1);
  }

  const { rows: users } = await pool.query(
    `SELECT id, email, role, first_name, father_name, family_name
     FROM users WHERE lower(email) = lower($1::text) LIMIT 1`,
    [email],
  );
  if (!users[0]) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }
  const user = users[0];
  if (user.role !== "freelancer") {
    console.error(`User ${email} is role=${user.role}, expected freelancer`);
    process.exit(1);
  }

  const { rows: plans } = await pool.query(
    `SELECT id, name, title FROM plans
     WHERE (name = $1::text OR title = $1::text) AND deleted_at IS NULL AND is_active = TRUE
     LIMIT 1`,
    [planName],
  );
  if (!plans[0]) {
    console.error(`Plan not found: ${planName}`);
    process.exit(1);
  }
  const plan = plans[0];

  const displayName = [user.first_name, user.father_name, user.family_name].filter(Boolean).join(" ");
  console.log(`Assigning plan "${plan.title}" (id=${plan.id}) to ${displayName} <${user.email}>`);

  const result = await subscriptionsService.assignPlanToFreelancer({
    actorUserId: null,
    freelancerUserId: String(user.id),
    planId: String(plan.id),
    notes: `assignPlanByEmail.js: ${plan.title}`,
  });

  const check = await subscriptionsService.canFreelancerTakeOrders(String(user.id));
  console.log(JSON.stringify({ subscription: result.subscription, canTakeOrders: check }, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
