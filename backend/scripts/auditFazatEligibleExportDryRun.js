/**
 * Read-only dry-run counts for FAZAT eligible export (no PII, no mutations).
 * Usage: node scripts/auditFazatEligibleExportDryRun.js
 */
require("dotenv").config({ quiet: true });
const { pool } = require("../src/config/db");
const { getFazatIntegrationConfig } = require("../src/config/fazatIntegration");
const fazatFreelancerProfileService = require("../src/services/fazatFreelancerProfileService");
const { auditEligibleExportCounts } = require("../src/services/fazatFreelancerExportService");

async function main() {
  const cfg = getFazatIntegrationConfig();
  const audit = await auditEligibleExportCounts();

  const prevMode = process.env.FAZAT_FREELANCER_EXPORT_MODE;
  process.env.FAZAT_FREELANCER_EXPORT_MODE = "pilot";
  const pilotPage = await fazatFreelancerProfileService.listAssignableSnapshots({ limit: 200, offset: 0 });
  process.env.FAZAT_FREELANCER_EXPORT_MODE = "eligible";
  const eligiblePage = await fazatFreelancerProfileService.listAssignableSnapshots({ limit: 200, offset: 0 });
  if (prevMode == null) delete process.env.FAZAT_FREELANCER_EXPORT_MODE;
  else process.env.FAZAT_FREELANCER_EXPORT_MODE = prevMode;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        configuredExportMode: cfg.freelancerExportMode,
        requirePilotAllowlist: cfg.requirePilotAllowlist,
        pilotAllowlistCount: cfg.pilotFreelancerIds.length,
        audit,
        simulatedPilotList: {
          count: pilotPage.data.length,
          total: pilotPage.total,
          hasMore: pilotPage.hasMore,
          exportMode: pilotPage.exportMode,
        },
        simulatedEligibleFirstPage: {
          count: eligiblePage.data.length,
          total: eligiblePage.total,
          limit: eligiblePage.limit,
          offset: eligiblePage.offset,
          hasMore: eligiblePage.hasMore,
          exportMode: eligiblePage.exportMode,
          legacyFallback: Boolean(eligiblePage.legacyFallback),
        },
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error("DRY_RUN_FAIL", e && e.message ? e.message : e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
