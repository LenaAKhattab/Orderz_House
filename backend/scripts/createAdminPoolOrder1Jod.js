/**
 * Create one admin internal pool order with a fixed budget (default 1 JOD).
 *
 * Usage (from backend/):
 *   node scripts/createAdminPoolOrder1Jod.js
 *   node scripts/createAdminPoolOrder1Jod.js --budget=1
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { guardQaOrSeed } = require("./lib/assertScriptDatabaseAllowed");
guardQaOrSeed(require("path").basename(__filename));

const ordersService = require("../src/services/ordersService");
const { pool } = require("../src/config/db");

function parseBudget(argv) {
  for (const raw of argv.slice(2)) {
    const m = /^--budget=(.+)$/.exec(raw);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 1;
}

async function main() {
  const budget = parseBudget(process.argv);

  const { rows: admins } = await pool.query(
    `SELECT id, role FROM users
     WHERE role IN ('admin', 'super_admin') AND is_active = TRUE
     ORDER BY id ASC
     LIMIT 1`,
  );
  if (!admins[0]) {
    throw new Error("No active admin/super_admin user found.");
  }

  const { rows: cats } = await pool.query(
    `SELECT id FROM categories WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`,
  );
  if (!cats[0]) {
    throw new Error("No active category found.");
  }

  const actorRole = admins[0].role === "super_admin" ? "super_admin" : "admin";
  const order = await ordersService.createInternalOrder({
    actorUserId: Number(admins[0].id),
    actorRole,
    payload: {
      title: `Ø·Ù„Ø¨ ØªØ¬Ø±ÙŠØ¨ÙŠ â€” ${budget} Ø¯ÙŠÙ†Ø§Ø±`,
      description:
        `Ø·Ù„Ø¨ Ø¯Ø§Ø®Ù„ÙŠ Ù…Ù† Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ø¨Ø³Ø¹Ø± ${budget} Ø¯.Ø£ Ù„Ø§Ø®ØªØ¨Ø§Ø± Ø§Ù„Ù…Ø¹Ø±Ø¶ ÙˆÙ‚ÙÙ„ Ø§Ù„Ø¨Ø§Ù‚Ø© (Ø®Ø§Ø±Ø¬ Ù†Ø·Ø§Ù‚ Ù…Ø¹Ø¸Ù… Ø§Ù„Ø¨Ø§Ù‚Ø§Øª).`,
      categoryId: Number(cats[0].id),
      projectType: "fixed",
      budget,
      durationValue: 3,
      durationUnit: "days",
    },
    uploadedFiles: [],
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        id: order.id,
        orderCode: order.orderCode,
        title: order.title,
        budget: order.budget,
        currencyCode: order.currencyCode,
        orderStatus: order.orderStatus,
        isPublished: order.isPublished,
        isOpenForPool: order.isOpenForPool,
        sourceType: order.sourceType,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
