/**
 * Read-only FAZAT freelancer export audit counts (no PII, no mutations).
 * Usage: node scripts/auditFazatFreelancerExportCounts.js
 */
require("dotenv").config({ quiet: true });
const { pool } = require("../src/config/db");
const { getFazatIntegrationConfig } = require("../src/config/fazatIntegration");
const fazatFreelancerProfileService = require("../src/services/fazatFreelancerProfileService");

async function q1(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

async function main() {
  const cfg = getFazatIntegrationConfig();
  const pilotCount = cfg.pilotFreelancerIds.length;
  const out = {
    fazatEnabled: cfg.enabled,
    requirePilotAllowlist: cfg.requirePilotAllowlist,
    pilotAllowlistCount: pilotCount,
    defaultListLimit: 100,
    maxListLimit: 200,
  };

  const totalFl = await q1("SELECT COUNT(*)::int AS c FROM users WHERE role = 'freelancer'");
  const activeFl = await q1(
    "SELECT COUNT(*)::int AS c FROM users WHERE role = 'freelancer' AND COALESCE(is_active, true) = true",
  );
  const inactiveFl = await q1(
    "SELECT COUNT(*)::int AS c FROM users WHERE role = 'freelancer' AND is_active = false",
  );

  let partnerTotal = null;
  let partnerByRank = [];
  let partnerAssignable = null;
  let partnerActiveJoin = null;
  let partnerPilotIntersect = null;
  let partnerNotOnPilot = null;
  let partnerPilotByRank = [];
  let partnerPilotAssignable = null;

  try {
    partnerTotal = await q1(
      "SELECT COUNT(*)::int AS c FROM partner_freelancer_profiles WHERE partner_code = 'FAZAT'",
    );
    partnerByRank = (
      await pool.query(
        "SELECT rank, COUNT(*)::int AS c FROM partner_freelancer_profiles WHERE partner_code = 'FAZAT' GROUP BY rank ORDER BY rank",
      )
    ).rows;
    partnerAssignable = await q1(
      "SELECT COUNT(*)::int AS c FROM partner_freelancer_profiles WHERE partner_code = 'FAZAT' AND is_assignable = true",
    );
    partnerActiveJoin = await q1(
      `SELECT COUNT(*)::int AS c
       FROM partner_freelancer_profiles p
       JOIN users u ON u.id = p.freelancer_user_id
       WHERE p.partner_code = 'FAZAT' AND u.role = 'freelancer'`,
    );
    if (pilotCount) {
      partnerPilotIntersect = await q1(
        `SELECT COUNT(*)::int AS c
         FROM partner_freelancer_profiles p
         WHERE p.partner_code = 'FAZAT'
           AND p.freelancer_user_id = ANY($1::bigint[])`,
        [cfg.pilotFreelancerIds],
      );
      partnerNotOnPilot = await q1(
        `SELECT COUNT(*)::int AS c
         FROM partner_freelancer_profiles p
         WHERE p.partner_code = 'FAZAT'
           AND NOT (p.freelancer_user_id = ANY($1::bigint[]))`,
        [cfg.pilotFreelancerIds],
      );
      partnerPilotByRank = (
        await pool.query(
          `SELECT rank, COUNT(*)::int AS c
           FROM partner_freelancer_profiles p
           WHERE p.partner_code = 'FAZAT'
             AND p.freelancer_user_id = ANY($1::bigint[])
           GROUP BY rank
           ORDER BY rank`,
          [cfg.pilotFreelancerIds],
        )
      ).rows;
      partnerPilotAssignable = await q1(
        `SELECT COUNT(*)::int AS c
         FROM partner_freelancer_profiles p
         WHERE p.partner_code = 'FAZAT'
           AND p.freelancer_user_id = ANY($1::bigint[])
           AND p.is_assignable = true`,
        [cfg.pilotFreelancerIds],
      );
    }
  } catch (e) {
    out.partnerProfilesError = e.code || String(e.message || e);
  }

  const dataDefault = await fazatFreelancerProfileService.listAssignableSnapshots({});
  const dataMax = await fazatFreelancerProfileService.listAssignableSnapshots({ limit: 200, offset: 0 });
  const dataOffset = await fazatFreelancerProfileService.listAssignableSnapshots({
    limit: 200,
    offset: 200,
  });
  const ranks = {};
  let assignable = 0;
  for (const p of dataDefault) {
    ranks[p.rank] = (ranks[p.rank] || 0) + 1;
    if (p.isAssignable) assignable += 1;
  }

  out.source = {
    totalFreelancerUsers: totalFl.c,
    activeFreelancerUsers: activeFl.c,
    inactiveFreelancerUsers: inactiveFl.c,
  };
  out.partnerProfiles = {
    total: partnerTotal ? partnerTotal.c : null,
    byRank: partnerByRank,
    assignableFlagTrue: partnerAssignable ? partnerAssignable.c : null,
    joinedFreelancerRole: partnerActiveJoin ? partnerActiveJoin.c : null,
    onPilotAllowlist: partnerPilotIntersect ? partnerPilotIntersect.c : null,
    notOnPilotAllowlist: partnerNotOnPilot ? partnerNotOnPilot.c : null,
    onPilotByRank: partnerPilotByRank,
    onPilotAssignable: partnerPilotAssignable ? partnerPilotAssignable.c : null,
  };
  out.endpointSimulation = {
    defaultLimitReturned: dataDefault.length,
    maxLimitReturned: dataMax.length,
    offset200Returned: dataOffset.length,
    ranks,
    assignableCount: assignable,
    responseHasTotalField: false,
    responseHasHasMore: false,
    paginationParamsSupported: ["limit", "offset", "rank"],
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error("AUDIT_QUERY_FAIL", e && e.message ? e.message : e);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
