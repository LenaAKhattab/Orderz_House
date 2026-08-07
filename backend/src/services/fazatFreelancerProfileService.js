const { pool } = require("../config/db");
const { PARTNER_CODE } = require("../config/fazatIntegration");
const { writePartnerAudit } = require("./fazatAuditService");

const ALLOWED_RANKS = new Set(["UNAPPROVED", "APPROVED", "TRUSTED"]);

function mapProfile(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    partnerCode: row.partner_code,
    freelancerId: String(row.freelancer_user_id),
    providerFreelancerId: String(row.freelancer_user_id),
    publicCode: row.account_id != null ? String(row.account_id) : `FL-${row.freelancer_user_id}`,
    rank: row.rank,
    isAssignable: Boolean(row.is_assignable),
    displayName: [row.first_name, row.father_name, row.family_name].filter(Boolean).join(" ").trim() || null,
    skills: Array.isArray(row.skills_snapshot_json) ? row.skills_snapshot_json : [],
    ratingSummary: row.rating_summary != null ? Number(row.rating_summary) : null,
    completedCount: row.completed_count != null ? Number(row.completed_count) : 0,
    availability: row.is_active === false ? "unavailable" : "available",
    notesInternal: row.notes_internal || null,
    lastSyncedAt: row.last_synced_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rankAllowsAssignment(rank) {
  const r = String(rank || "").toUpperCase();
  return r === "APPROVED" || r === "TRUSTED";
}

async function ensurePartnerRow(client) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO integration_partners (code, name, enabled)
     VALUES ($1, 'FAZ3AT', TRUE)
     ON CONFLICT (code) DO UPDATE SET updated_at = NOW()`,
    [PARTNER_CODE],
  );
}

async function listAssignableSnapshots({ limit = 100, offset = 0, rank = null } = {}) {
  const { getFazatIntegrationConfig, isPilotAllowlisted } = require("../config/fazatIntegration");
  const cfg = getFazatIntegrationConfig();
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [PARTNER_CODE];
  let rankSql = "";
  if (rank && ALLOWED_RANKS.has(String(rank).toUpperCase())) {
    params.push(String(rank).toUpperCase());
    rankSql = ` AND p.rank = $${params.length}`;
  }
  let allowSql = "";
  if (cfg.requirePilotAllowlist && cfg.pilotFreelancerIds.length) {
    params.push(cfg.pilotFreelancerIds);
    allowSql = ` AND p.freelancer_user_id = ANY($${params.length}::bigint[])`;
  } else if (cfg.requirePilotAllowlist && !cfg.pilotFreelancerIds.length) {
    return [];
  }
  params.push(lim, off);

  const { rows } = await pool.query(
    `SELECT p.*,
            u.account_id, u.first_name, u.father_name, u.family_name, u.is_active,
            COALESCE((
              SELECT COUNT(*)::int FROM orders o
              WHERE o.assigned_freelancer_id = u.id AND o.order_status = 'completed'
            ), 0) AS completed_count
     FROM partner_freelancer_profiles p
     JOIN users u ON u.id = p.freelancer_user_id
     WHERE p.partner_code = $1
       AND u.role = 'freelancer'
       ${rankSql}
       ${allowSql}
     ORDER BY
       CASE p.rank WHEN 'TRUSTED' THEN 0 WHEN 'APPROVED' THEN 1 ELSE 2 END,
       p.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map(mapProfile).filter((p) => isPilotAllowlisted(p.freelancerId));
}

async function upsertRank({ freelancerId, rank, notesInternal = null, isAssignable = null }) {
  const { getFazatIntegrationConfig, assertPilotAllowlisted } = require("../config/fazatIntegration");
  const cfg = getFazatIntegrationConfig();
  const fid = Number(freelancerId);
  const nextRank = String(rank || "").toUpperCase();
  if (!Number.isInteger(fid) || fid < 1) {
    const err = new Error("freelancerId is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!ALLOWED_RANKS.has(nextRank)) {
    const err = new Error("rank must be UNAPPROVED, APPROVED, or TRUSTED.");
    err.statusCode = 400;
    throw err;
  }
  // During enabled pilot, only allowlisted freelancers may have ranks changed via API.
  if (cfg.requirePilotAllowlist) {
    assertPilotAllowlisted(fid);
  }

  const { rows: userRows } = await pool.query(
    `SELECT id, role, is_active, account_id, first_name, father_name, family_name
     FROM users WHERE id = $1 LIMIT 1`,
    [fid],
  );
  const user = userRows[0];
  if (!user || user.role !== "freelancer") {
    const err = new Error("Freelancer not found.");
    err.statusCode = 404;
    throw err;
  }

  await ensurePartnerRow();

  const assignable =
    isAssignable == null ? rankAllowsAssignment(nextRank) : Boolean(isAssignable) && rankAllowsAssignment(nextRank);

  const { rows: skillRows } = await pool.query(
    `SELECT DISTINCT s.name
     FROM order_skills os
     JOIN skills s ON s.id = os.skill_id
     JOIN orders o ON o.id = os.order_id
     WHERE o.assigned_freelancer_id = $1
     ORDER BY s.name ASC
     LIMIT 40`,
    [fid],
  );
  const skillsSnapshot = skillRows.map((r) => r.name);

  const { rows } = await pool.query(
    `INSERT INTO partner_freelancer_profiles (
       partner_code, freelancer_user_id, rank, is_assignable, notes_internal,
       skills_snapshot_json, last_synced_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb, NOW(), NOW())
     ON CONFLICT (partner_code, freelancer_user_id) DO UPDATE SET
       rank = EXCLUDED.rank,
       is_assignable = EXCLUDED.is_assignable,
       notes_internal = COALESCE(EXCLUDED.notes_internal, partner_freelancer_profiles.notes_internal),
       skills_snapshot_json = EXCLUDED.skills_snapshot_json,
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      PARTNER_CODE,
      fid,
      nextRank,
      assignable,
      notesInternal != null ? String(notesInternal).slice(0, 2000) : null,
      JSON.stringify(skillsSnapshot),
    ],
  );

  const mapped = mapProfile({
    ...rows[0],
    account_id: user.account_id,
    first_name: user.first_name,
    father_name: user.father_name,
    family_name: user.family_name,
    is_active: user.is_active,
    completed_count: 0,
  });

  await writePartnerAudit({
    action: "fazat.freelancer_rank.updated",
    entityType: "freelancer",
    entityId: String(fid),
    detail: { rank: nextRank, isAssignable: assignable },
  });

  return mapped;
}

async function getProfile(freelancerId) {
  const fid = Number(freelancerId);
  const { rows } = await pool.query(
    `SELECT p.*, u.account_id, u.first_name, u.father_name, u.family_name, u.is_active
     FROM partner_freelancer_profiles p
     JOIN users u ON u.id = p.freelancer_user_id
     WHERE p.partner_code = $1 AND p.freelancer_user_id = $2
     LIMIT 1`,
    [PARTNER_CODE, fid],
  );
  return mapProfile(rows[0] || null);
}

async function assertAssignableForPartner(freelancerId) {
  const profile = await getProfile(freelancerId);
  if (!profile) {
    const err = new Error("Freelancer is not enrolled for FAZAT assignments.");
    err.statusCode = 403;
    err.code = "FAZAT_FREELANCER_UNAPPROVED";
    throw err;
  }
  if (!rankAllowsAssignment(profile.rank) || !profile.isAssignable) {
    const err = new Error("Freelancer rank does not allow FAZAT assignment.");
    err.statusCode = 403;
    err.code = "FAZAT_FREELANCER_UNAPPROVED";
    throw err;
  }
  return profile;
}

module.exports = {
  ALLOWED_RANKS,
  rankAllowsAssignment,
  listAssignableSnapshots,
  upsertRank,
  getProfile,
  assertAssignableForPartner,
  mapProfile,
};
