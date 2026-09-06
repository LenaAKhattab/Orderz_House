const { pool } = require("../config/db");
const { PARTNER_CODE } = require("../config/fazatIntegration");

async function writePartnerAudit({
  partnerCode = PARTNER_CODE,
  action,
  actorType = "partner",
  entityType = null,
  entityId = null,
  detail = {},
  client = null,
} = {}) {
  const runner = client || pool;
  try {
    await runner.query(
      `INSERT INTO partner_integration_audit_logs
         (partner_code, action, actor_type, entity_type, entity_id, detail_json)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        String(partnerCode || PARTNER_CODE),
        String(action || "").trim(),
        String(actorType || "partner"),
        entityType != null ? String(entityType) : null,
        entityId != null ? String(entityId) : null,
        JSON.stringify(detail && typeof detail === "object" ? detail : {}),
      ],
    );
  } catch (err) {
    // Never break partner flows on audit insert failures (e.g. migration not applied yet).
    // eslint-disable-next-line no-console
    console.error("[fazat-audit] write failed:", String(err?.message || err).slice(0, 160));
  }
}

module.exports = { writePartnerAudit };
