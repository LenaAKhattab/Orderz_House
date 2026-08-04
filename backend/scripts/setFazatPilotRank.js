/**
 * Manually set FAZAT partner rank for explicitly selected freelancers only.
 * Does NOT delete data. Does NOT mass-update.
 *
 * Safety:
 * - Requires FAZAT_PILOT_FREELANCER_IDS to include the target id(s), OR
 *   FAZAT_PILOT_RANK_CONFIRM=PILOT_RANK for each CLI run with explicit ids.
 * - Never uses seed:fazat-staging.
 *
 * Usage:
 *   node scripts/setFazatPilotRank.js --id=123 --rank=APPROVED
 *   node scripts/setFazatPilotRank.js --id=123 --rank=TRUSTED --notes="pilot"
 *   node scripts/setFazatPilotRank.js --id=123 --rank=UNAPPROVED
 */
const path = require("node:path");
const dotenvPath = process.env.DOTENV_CONFIG_PATH
  ? path.resolve(process.cwd(), process.env.DOTENV_CONFIG_PATH)
  : path.resolve(process.cwd(), ".env");
require("dotenv").config({ path: dotenvPath, override: true, quiet: true });

const fazatFreelancerProfileService = require("../src/services/fazatFreelancerProfileService");
const { parsePilotFreelancerIds, getFazatIntegrationConfig } = require("../src/config/fazatIntegration");
const { pool } = require("../src/config/db");

function parseArgs(argv) {
  const out = { id: null, rank: null, notes: null };
  for (const a of argv) {
    if (a.startsWith("--id=")) out.id = Number(a.slice(5));
    else if (a.startsWith("--rank=")) out.rank = String(a.slice(7)).toUpperCase();
    else if (a.startsWith("--notes=")) out.notes = a.slice(8);
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.id) || args.id < 1 || !args.rank) {
    console.error("Usage: node scripts/setFazatPilotRank.js --id=<freelancerId> --rank=APPROVED|TRUSTED|UNAPPROVED");
    process.exit(1);
  }

  const allowlist = parsePilotFreelancerIds();
  const confirm = String(process.env.FAZAT_PILOT_RANK_CONFIRM || "").trim() === "PILOT_RANK";
  if (allowlist.length && !allowlist.includes(args.id) && !confirm) {
    throw new Error(
      `Freelancer ${args.id} is not in FAZAT_PILOT_FREELANCER_IDS. Add them to the allowlist or set FAZAT_PILOT_RANK_CONFIRM=PILOT_RANK.`,
    );
  }
  if (!allowlist.length && !confirm) {
    throw new Error(
      "Set FAZAT_PILOT_FREELANCER_IDS (including this id) or FAZAT_PILOT_RANK_CONFIRM=PILOT_RANK for explicit single-id rank set.",
    );
  }

  // Bypass API allowlist gate by temporarily ensuring id is treated as allowlisted for upsertRank when integration enabled.
  if (!allowlist.includes(args.id)) {
    process.env.FAZAT_PILOT_FREELANCER_IDS = String(args.id);
  }

  const profile = await fazatFreelancerProfileService.upsertRank({
    freelancerId: args.id,
    rank: args.rank,
    notesInternal: args.notes || `manual pilot rank ${args.rank}`,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        pilotAllowlist: getFazatIntegrationConfig().pilotFreelancerIds,
        profile: {
          freelancerId: profile.freelancerId,
          publicCode: profile.publicCode,
          rank: profile.rank,
          isAssignable: profile.isAssignable,
          displayName: profile.displayName,
        },
      },
      null,
      2,
    ),
  );
  await pool.end();
})().catch(async (err) => {
  console.error("[setFazatPilotRank] FAIL", err && err.message ? err.message : err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
