/**
 * Enable FAZAT integration_partners.enabled=true after pilot prechecks.
 * Does not delete data. Does not seed. Does not create orders.
 *
 * Requires:
 *   FAZAT_INTEGRATION_ENABLED=true (env)
 *   FAZAT_INTEGRATION_API_KEY / SHARED_SECRET set
 *   FAZAT_PILOT_FREELANCER_IDS non-empty
 *   FAZAT_ENABLE_PARTNER_CONFIRM=ENABLE_FAZAT_PARTNER
 *   at least one APPROVED/TRUSTED profile for an allowlisted freelancer
 *
 *   npm run fazat:enable-partner
 */
const path = require("node:path");
const dotenvPath = process.env.DOTENV_CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
  : path.resolve(process.cwd(), ".env");
require("dotenv").config({ path: dotenvPath, override: true, quiet: true });

const { pool } = require("../src/config/db");
const {
  PARTNER_CODE,
  getFazatIntegrationConfig,
  assertFazatEnabled,
} = require("../src/config/fazatIntegration");

(async () => {
  if (String(process.env.FAZAT_ENABLE_PARTNER_CONFIRM || "").trim() !== "ENABLE_FAZAT_PARTNER") {
    throw new Error("Set FAZAT_ENABLE_PARTNER_CONFIRM=ENABLE_FAZAT_PARTNER to enable partner row.");
  }

  const cfg = assertFazatEnabled();
  if (!cfg.webhookUrl) {
    console.warn("[fazat:enable-partner] WARNING: FAZAT_WEBHOOK_URL is empty");
  } else if (/localhost|127\.0\.0\.1/i.test(cfg.webhookUrl)) {
    console.warn(
      "[fazat:enable-partner] WARNING: webhook URL is localhost — live Orderz cannot reach FAZ3AT without a tunnel",
    );
  }

  const { rows } = await pool.query(
    `SELECT p.freelancer_user_id, p.rank, p.is_assignable
     FROM partner_freelancer_profiles p
     WHERE p.partner_code = $1
       AND p.freelancer_user_id = ANY($2::bigint[])
       AND p.rank IN ('APPROVED','TRUSTED')
       AND p.is_assignable = TRUE`,
    [PARTNER_CODE, cfg.pilotFreelancerIds],
  );
  if (!rows.length) {
    throw new Error(
      "No APPROVED/TRUSTED assignable pilot freelancers found. Run setFazatPilotRank.js first.",
    );
  }

  await pool.query(
    `INSERT INTO integration_partners (code, name, enabled, webhook_url, updated_at)
     VALUES ($1, 'FAZ3AT', TRUE, $2, NOW())
     ON CONFLICT (code) DO UPDATE SET
       enabled = TRUE,
       webhook_url = COALESCE(EXCLUDED.webhook_url, integration_partners.webhook_url),
       updated_at = NOW()`,
    [PARTNER_CODE, cfg.webhookUrl],
  );

  const { rows: partner } = await pool.query(
    `SELECT code, enabled, webhook_url FROM integration_partners WHERE code = $1`,
    [PARTNER_CODE],
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        partner: partner[0],
        assignablePilotFreelancers: rows.map((r) => ({
          id: String(r.freelancer_user_id),
          rank: r.rank,
        })),
        reminder: "Keep FAZAT_PILOT_FREELANCER_IDS narrow. Unset FAZAT_ENABLE_PARTNER_CONFIRM.",
      },
      null,
      2,
    ),
  );
  await pool.end();
})().catch(async (err) => {
  console.error("[fazat:enable-partner] FAIL", err && err.message ? err.message : err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
