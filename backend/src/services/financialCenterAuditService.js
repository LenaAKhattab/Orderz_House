const { pool } = require("../config/db");

async function logFinancialAudit({ entityType, entityId, action, oldValue, newValue, actorId }, client) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO financial_audit_logs (entity_type, entity_id, action, old_value, new_value, actor_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
    [
      String(entityType),
      Number(entityId),
      String(action),
      oldValue != null ? JSON.stringify(oldValue) : null,
      newValue != null ? JSON.stringify(newValue) : null,
      actorId != null ? Number(actorId) : null,
    ],
  );
}

async function listAuditLogsForEntity({ entityType, entityId, limit = 50 }) {
  const { rows } = await pool.query(
    `SELECT l.id, l.entity_type, l.entity_id, l.action, l.old_value, l.new_value,
            l.actor_id, l.created_at,
            u.first_name AS actor_first_name, u.family_name AS actor_family_name, u.email AS actor_email
     FROM financial_audit_logs l
     LEFT JOIN users u ON u.id = l.actor_id
     WHERE l.entity_type = $1 AND l.entity_id = $2
     ORDER BY l.created_at DESC
     LIMIT $3`,
    [String(entityType), Number(entityId), Math.min(100, Math.max(1, Number(limit) || 50))],
  );
  return rows.map((r) => ({
    id: String(r.id),
    entityType: r.entity_type,
    entityId: String(r.entity_id),
    action: r.action,
    oldValue: r.old_value,
    newValue: r.new_value,
    actorId: r.actor_id != null ? String(r.actor_id) : null,
    actorName: [r.actor_first_name, r.actor_family_name].filter(Boolean).join(" ").trim() || r.actor_email || null,
    createdAt: r.created_at,
  }));
}

module.exports = {
  logFinancialAudit,
  listAuditLogsForEntity,
};
