/**
 * Notification retention policy + dry-run / bounded-batch delete engine (R1A).
 *
 * Policy is an explicit type allowlist: a type that is not listed is never deleted (reported as unclassified).
 * FINANCIAL and SECURITY types are excluded from deletion (user-visible payment/claim/account history with audit
 * relevance; tiny volume). Rules may narrow by recipient role (order.created → freelancers = marketplace discovery
 * broadcast; client owner confirmations share the type but are transactional).
 *
 * Dry run: id-range chunks, aggregates only (no user ids, no bodies), inside READ ONLY transactions.
 * Apply: per rule, keyset batches `DELETE … WHERE id IN (oldest N eligible by (type, created_at))`, one short
 * autocommit transaction per batch, pause between batches, stop on first error; re-running resumes naturally
 * because eligibility is purely age-based.
 */

const RETENTION_CLASSES = Object.freeze({
  EPHEMERAL_DISCOVERY: "EPHEMERAL_DISCOVERY",
  TRANSACTIONAL: "TRANSACTIONAL",
  SECURITY: "SECURITY",
  FINANCIAL: "FINANCIAL",
  MODERATION: "MODERATION",
  SYSTEM: "SYSTEM",
  OTHER: "OTHER",
});

const DISCOVERY_DAYS = 30;
const DEFAULT_DAYS = 365;

const C = RETENTION_CLASSES;

/**
 * type → class. `recipientRoles` narrows a rule; the first matching rule wins, so role-specific rules come
 * before the type's fallback.
 * @type {{ type: string, class: string, recipientRoles?: string[] }[]}
 */
const POLICY_RULES = Object.freeze([
  // Marketplace discovery broadcasts (training pool items, client bidding / admin pool broadcasts).
  { type: "order.created", class: C.EPHEMERAL_DISCOVERY, recipientRoles: ["freelancer"] },
  { type: "order.pool.summary", class: C.EPHEMERAL_DISCOVERY },
  // Client owner "order created" confirmation shares the type.
  { type: "order.created", class: C.TRANSACTIONAL },

  { type: "order.assigned", class: C.TRANSACTIONAL },
  { type: "order.freelancer.assigned", class: C.TRANSACTIONAL },
  { type: "order.freelancer.rejected", class: C.TRANSACTIONAL },
  { type: "order.claim.withdrawn", class: C.TRANSACTIONAL },
  { type: "order.bid.submitted", class: C.TRANSACTIONAL },
  { type: "order.bid.updated", class: C.TRANSACTIONAL },
  { type: "order.bid.rejected", class: C.TRANSACTIONAL },
  { type: "order.bid.selected", class: C.TRANSACTIONAL },
  { type: "order.delivery.submitted", class: C.TRANSACTIONAL },
  { type: "order.delivery.approved", class: C.TRANSACTIONAL },
  { type: "order.revision.requested", class: C.TRANSACTIONAL },
  { type: "course.assigned", class: C.TRANSACTIONAL },
  { type: "course.lesson.added", class: C.TRANSACTIONAL },
  { type: "course.lesson.completed", class: C.TRANSACTIONAL },
  { type: "course.completed", class: C.TRANSACTIONAL },
  { type: "freelancer.review.received", class: C.TRANSACTIONAL },
  { type: "user.registered", class: C.TRANSACTIONAL },
  { type: "subscription.assigned", class: C.TRANSACTIONAL },
  { type: "subscription.started", class: C.TRANSACTIONAL },
  { type: "subscription.company.activated", class: C.TRANSACTIONAL },
  { type: "subscription.company.activation.pending", class: C.TRANSACTIONAL },

  { type: "payment_success", class: C.FINANCIAL },
  { type: "payment_failed", class: C.FINANCIAL },
  { type: "payment_cancelled", class: C.FINANCIAL },
  { type: "order.payment.started", class: C.FINANCIAL },
  { type: "subscription.payment.started", class: C.FINANCIAL },
  { type: "payment.client_order.succeeded", class: C.FINANCIAL },
  { type: "payment.client_order.failed", class: C.FINANCIAL },
  { type: "financial_claim.created", class: C.FINANCIAL },
  { type: "financial_claim.status.changed", class: C.FINANCIAL },
  { type: "financial_claim.pricing.updated", class: C.FINANCIAL },
  { type: "financial_claim.paid", class: C.FINANCIAL },

  { type: "user.account.activated", class: C.SECURITY },
  { type: "user.account.deactivated", class: C.SECURITY },
  { type: "user.account.suspended", class: C.SECURITY },
  { type: "user.account.reactivated", class: C.SECURITY },

  { type: "feedback.created", class: C.MODERATION },
  { type: "feedback.status.resolved", class: C.MODERATION },
  { type: "ad.created", class: C.MODERATION },
  { type: "ad.updated", class: C.MODERATION },
  { type: "ad.published", class: C.MODERATION },
  { type: "ad.unpublished", class: C.MODERATION },
  { type: "ad.scheduled", class: C.MODERATION },
  { type: "ad.expired", class: C.MODERATION },

  { type: "plan.created", class: C.SYSTEM },
  { type: "plan.updated", class: C.SYSTEM },
  { type: "plan.deleted", class: C.SYSTEM },
  { type: "general.test", class: C.SYSTEM },
]);

/** Retention per class in days; null = excluded from deletion (kept until a separate decision). */
const CLASS_RETENTION_DAYS = Object.freeze({
  [C.EPHEMERAL_DISCOVERY]: DISCOVERY_DAYS,
  [C.TRANSACTIONAL]: DEFAULT_DAYS,
  [C.MODERATION]: DEFAULT_DAYS,
  [C.SYSTEM]: DEFAULT_DAYS,
  [C.OTHER]: DEFAULT_DAYS,
  [C.FINANCIAL]: null,
  [C.SECURITY]: null,
});

/** Age buckets (days). Every retention value must be a boundary so bucket sums are exact. */
const AGE_BUCKET_BOUNDS = Object.freeze([7, 30, 90, 180, 365]);

function ageBucketLabels() {
  const labels = [];
  let prev = 0;
  for (const b of AGE_BUCKET_BOUNDS) {
    labels.push(`${prev}-${b}d`);
    prev = b;
  }
  labels.push(`${prev}d+`);
  return labels;
}

function resolveRule(type, recipientRole) {
  const t = String(type || "");
  const role = recipientRole == null ? null : String(recipientRole);
  const rule = POLICY_RULES.find(
    (r) => r.type === t && (!r.recipientRoles || (role != null && r.recipientRoles.includes(role))),
  );
  if (!rule) return { type: t, class: null, days: null, deletable: false, unclassified: true };
  const days = CLASS_RETENTION_DAYS[rule.class];
  return { type: t, class: rule.class, days, deletable: days != null, unclassified: false, recipientRoles: rule.recipientRoles || null };
}

/**
 * Delete targets: one per (type, role filter) whose class has a retention period.
 * A role-narrowed rule followed by a same-type fallback with a different period yields two targets
 * (fallback excludes the narrowed roles).
 */
function listDeleteTargets() {
  const targets = [];
  const narrowedByType = new Map();
  for (const rule of POLICY_RULES) {
    const days = CLASS_RETENTION_DAYS[rule.class];
    if (rule.recipientRoles) {
      if (!narrowedByType.has(rule.type)) narrowedByType.set(rule.type, []);
      narrowedByType.get(rule.type).push(...rule.recipientRoles);
      if (days != null) targets.push({ type: rule.type, class: rule.class, days, onlyRoles: [...rule.recipientRoles], exceptRoles: null });
      continue;
    }
    if (targets.some((t) => t.type === rule.type && !t.onlyRoles)) continue;
    if (days != null) {
      const except = narrowedByType.get(rule.type) || null;
      targets.push({ type: rule.type, class: rule.class, days, onlyRoles: null, exceptRoles: except ? [...except] : null });
    }
  }
  return targets.map((t) => ({ ...t, key: targetKey(t) }));
}

/** Stable target id for progress output and --resume: `type`, `type[role]` or `type[!role]`. */
function targetKey(target) {
  if (target.onlyRoles) return `${target.type}[${target.onlyRoles.join(",")}]`;
  if (target.exceptRoles) return `${target.type}[!${target.exceptRoles.join(",")}]`;
  return target.type;
}

function assertPolicyConsistent() {
  for (const rule of POLICY_RULES) {
    if (!CLASS_RETENTION_DAYS.hasOwnProperty(rule.class)) throw new Error(`unknown class ${rule.class}`);
    const days = CLASS_RETENTION_DAYS[rule.class];
    if (days != null && !AGE_BUCKET_BOUNDS.includes(days)) {
      throw new Error(`retention ${days}d must be an age bucket boundary`);
    }
  }
}

/** Per-chunk aggregate SQL: groups only (type, role, age bucket, read state) — never ids or bodies. */
function dryRunChunkSql() {
  const cases = AGE_BUCKET_BOUNDS.map(
    (b, i) => `WHEN created_at >= $3::timestamptz - interval '${b} days' THEN ${i}`,
  ).join(" ");
  return `SELECT type, recipient_role,
       CASE ${cases} ELSE ${AGE_BUCKET_BOUNDS.length} END AS bucket,
       is_read,
       COUNT(*)::bigint AS rows,
       SUM(pg_column_size(n.*))::bigint AS row_bytes,
       MIN(created_at) AS oldest,
       MAX(created_at) AS newest
     FROM notifications n
     WHERE id >= $1 AND id < $2
     GROUP BY 1, 2, 3, 4`;
}

function newTotals() {
  return { rows: 0, read: 0, unread: 0, rowBytes: 0, oldest: null, newest: null };
}

function addTo(t, g) {
  t.rows += g.rows;
  if (g.isRead) t.read += g.rows;
  else t.unread += g.rows;
  t.rowBytes += g.rowBytes;
  if (g.oldest && (!t.oldest || g.oldest < t.oldest)) t.oldest = g.oldest;
  if (g.newest && (!t.newest || g.newest > t.newest)) t.newest = g.newest;
}

/** Folds chunk groups into the report. `groups`: { type, recipientRole, bucket, isRead, rows, rowBytes, oldest, newest }. */
function summarizeDryRun(groups, { now, relation = null } = {}) {
  const labels = ageBucketLabels();
  const total = newTotals();
  const eligible = newTotals();
  const byType = new Map();
  const byBucket = labels.map((label) => ({ bucket: label, rows: 0, eligible: 0 }));
  const byClass = new Map();
  for (const g of groups) {
    const rule = resolveRule(g.type, g.recipientRole);
    // bucket index i covers ages [bound[i-1], bound[i]); eligible when the whole bucket is older than `days`.
    const bucketStartDays = g.bucket === 0 ? 0 : AGE_BUCKET_BOUNDS[g.bucket - 1];
    const isEligible = rule.deletable && bucketStartDays >= rule.days;
    addTo(total, g);
    byBucket[g.bucket].rows += g.rows;
    const key = `${g.type}|${rule.class || "UNCLASSIFIED"}|${rule.days == null ? "keep" : rule.days}`;
    if (!byType.has(key)) {
      byType.set(key, {
        type: g.type,
        class: rule.class || "UNCLASSIFIED",
        retentionDays: rule.days,
        roles: rule.recipientRoles ? rule.recipientRoles.join(",") : null,
        total: newTotals(),
        eligible: newTotals(),
      });
    }
    const entry = byType.get(key);
    addTo(entry.total, g);
    const cls = rule.class || "UNCLASSIFIED";
    if (!byClass.has(cls)) byClass.set(cls, { class: cls, retentionDays: rule.days, rows: 0, eligible: 0 });
    byClass.get(cls).rows += g.rows;
    if (isEligible) {
      addTo(eligible, g);
      addTo(entry.eligible, g);
      byBucket[g.bucket].eligible += g.rows;
      byClass.get(cls).eligible += g.rows;
    }
  }
  const pct = total.rows ? Math.round((eligible.rows / total.rows) * 10000) / 100 : 0;
  const report = {
    mode: "dry-run",
    asOf: now ? new Date(now).toISOString() : null,
    policy: { discoveryDays: DISCOVERY_DAYS, defaultDays: DEFAULT_DAYS, excludedClasses: [C.FINANCIAL, C.SECURITY] },
    totalRows: total.rows,
    eligibleRows: eligible.rows,
    retainedRows: total.rows - eligible.rows,
    reductionPercent: pct,
    eligibleRead: eligible.read,
    eligibleUnread: eligible.unread,
    eligibleOldest: eligible.oldest,
    eligibleNewest: eligible.newest,
    totalRowDataBytes: total.rowBytes,
    eligibleRowDataBytes: eligible.rowBytes,
    byClass: [...byClass.values()].sort((a, b) => b.rows - a.rows),
    byAgeBucket: byBucket,
    byType: [...byType.values()]
      .sort((a, b) => b.total.rows - a.total.rows)
      .map((e) => ({
        type: e.type,
        roles: e.roles,
        class: e.class,
        retentionDays: e.retentionDays,
        rows: e.total.rows,
        eligible: e.eligible.rows,
        eligibleRead: e.eligible.read,
        eligibleUnread: e.eligible.unread,
        eligibleOldest: e.eligible.oldest,
        eligibleNewest: e.eligible.newest,
        oldest: e.total.oldest,
        newest: e.total.newest,
      })),
  };
  if (relation) {
    // Heap share by row bytes; index share by row count. Space becomes reusable inside the relation only.
    const heapShare = total.rowBytes ? eligible.rowBytes / total.rowBytes : 0;
    const rowShare = total.rows ? eligible.rows / total.rows : 0;
    report.relation = relation;
    report.estimatedReusableBytes = Math.round(relation.heapBytes * heapShare + relation.indexBytes * rowShare);
  }
  return report;
}

/** SELECT part of one delete batch for a target (also used for EXPLAIN). $1 type, $2 cutoff, $3 lower bound, $4 limit, $5 roles. */
function batchSelectSql(target) {
  const roleSql = target.onlyRoles
    ? " AND recipient_role = ANY($5::text[])"
    : target.exceptRoles
      ? " AND (recipient_role IS NULL OR recipient_role <> ALL($5::text[]))"
      : "";
  return `SELECT id, created_at FROM notifications
       WHERE type = $1 AND created_at < $2 AND created_at >= $3${roleSql}
       ORDER BY created_at ASC
       LIMIT $4`;
}

function batchDeleteSql(target) {
  return `WITH batch AS (
       ${batchSelectSql(target)}
     )
     DELETE FROM notifications n USING batch WHERE n.id = batch.id
     RETURNING batch.created_at`;
}

function batchParams(target, { cutoff, lowerBound, limit }) {
  const params = [target.type, cutoff, lowerBound, limit];
  if (target.onlyRoles) params.push(target.onlyRoles);
  else if (target.exceptRoles) params.push(target.exceptRoles);
  return params;
}

function cutoffFor(days, now) {
  return new Date(new Date(now).getTime() - days * 86400000);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runDryRun(client, { now = new Date(), chunkSize = 250000, statementTimeoutMs = 120000, onProgress = null } = {}) {
  assertPolicyConsistent();
  const nowIso = new Date(now).toISOString();
  const groups = [];
  await client.query("BEGIN READ ONLY");
  let bounds;
  let relation;
  try {
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(statementTimeoutMs)}`);
    ({ rows: [bounds] } = await client.query(
      `SELECT COALESCE(MIN(id), 0)::bigint AS min_id, COALESCE(MAX(id), 0)::bigint AS max_id FROM notifications`,
    ));
    const { rows: [rel] } = await client.query(
      `SELECT pg_total_relation_size('notifications')::bigint AS total_bytes,
              pg_relation_size('notifications')::bigint AS heap_bytes,
              pg_indexes_size('notifications')::bigint AS index_bytes`,
    );
    relation = { totalBytes: Number(rel.total_bytes), heapBytes: Number(rel.heap_bytes), indexBytes: Number(rel.index_bytes) };
  } finally {
    await client.query("ROLLBACK");
  }
  const minId = Number(bounds.min_id);
  const maxId = Number(bounds.max_id);
  const sql = dryRunChunkSql();
  const step = Math.max(1000, Math.floor(Number(chunkSize) || 250000));
  let chunks = 0;
  for (let lo = minId; lo <= maxId && maxId > 0; lo += step) {
    const hi = Math.min(lo + step, maxId + 1);
    await client.query("BEGIN READ ONLY");
    try {
      await client.query(`SET LOCAL statement_timeout = ${Math.floor(statementTimeoutMs)}`);
      const { rows } = await client.query(sql, [lo, hi, nowIso]);
      for (const r of rows) {
        groups.push({
          type: r.type,
          recipientRole: r.recipient_role,
          bucket: Number(r.bucket),
          isRead: r.is_read === true,
          rows: Number(r.rows),
          rowBytes: Number(r.row_bytes),
          oldest: r.oldest ? new Date(r.oldest).toISOString() : null,
          newest: r.newest ? new Date(r.newest).toISOString() : null,
        });
      }
    } finally {
      await client.query("ROLLBACK");
    }
    chunks += 1;
    if (onProgress) onProgress({ chunks, lo, hi, maxId });
  }
  const report = summarizeDryRun(groups, { now, relation });
  report.idRange = { minId, maxId, chunkSize: step, chunks };
  return report;
}

async function explainTargets(client, { now = new Date(), batchSize = 5000, analyze = false } = {}) {
  const out = [];
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SET LOCAL statement_timeout = 120000");
    for (const target of listDeleteTargets()) {
      const params = batchParams(target, { cutoff: cutoffFor(target.days, now), lowerBound: "-infinity", limit: batchSize });
      const opts = analyze ? "ANALYZE, BUFFERS, COSTS" : "COSTS";
      // eslint-disable-next-line no-await-in-loop
      const { rows } = await client.query(`EXPLAIN (${opts}) ${batchSelectSql(target)}`, params);
      out.push({ type: target.type, onlyRoles: target.onlyRoles, exceptRoles: target.exceptRoles, days: target.days, plan: rows.map((r) => r["QUERY PLAN"]) });
    }
  } finally {
    await client.query("ROLLBACK");
  }
  return out;
}

/**
 * Bounded-batch delete. Each batch is its own autocommit statement (no long transaction).
 * Stops on the first error (throws with progress attached). Idempotent and resumable: eligibility is age-based.
 *
 * `resume` ({ key, after }) starts one target at the `cursor` a previous run printed for it. Until vacuum cleans
 * them, rows deleted by earlier runs still sit at the start of the (type, created_at) index, so a run starting
 * from -infinity must walk all of them in its first batch (minutes on millions of rows → statement timeout).
 * Rows below the cursor were already deleted by that run; a cursor that is too late can only leave rows behind
 * (the next dry run shows them), never delete outside the policy.
 */
async function runApply(client, {
  now = new Date(),
  batchSize = 5000,
  sleepMs = 250,
  maxRows = null,
  statementTimeoutMs = 60000,
  resume = null,
  onProgress = null,
} = {}) {
  assertPolicyConsistent();
  const limit = Math.min(50000, Math.max(100, Math.floor(Number(batchSize) || 5000)));
  const cap = maxRows != null && Number(maxRows) > 0 ? Math.floor(Number(maxRows)) : null;
  const targets = listDeleteTargets();
  if (resume) {
    const resumeAt = new Date(resume.after);
    if (!targets.some((t) => t.key === resume.key)) throw new Error(`--resume: unknown target ${resume.key}`);
    if (Number.isNaN(resumeAt.getTime())) throw new Error("--resume: invalid timestamp");
  }
  const progress = { mode: "apply", asOf: new Date(now).toISOString(), batchSize: limit, deleted: 0, batches: 0, targets: [] };
  if (resume) progress.resumed = { key: resume.key, after: new Date(resume.after).toISOString() };
  await client.query(`SET statement_timeout = ${Math.floor(statementTimeoutMs)}`);
  for (const target of targets) {
    const cutoff = cutoffFor(target.days, now);
    const t = { key: target.key, type: target.type, onlyRoles: target.onlyRoles, exceptRoles: target.exceptRoles, days: target.days, cutoff: cutoff.toISOString(), deleted: 0, cursor: null };
    progress.targets.push(t);
    let lowerBound = resume && resume.key === target.key ? new Date(resume.after) : "-infinity";
    for (;;) {
      if (cap != null && progress.deleted >= cap) return { ...progress, stoppedAt: "max_rows" };
      const thisLimit = cap != null ? Math.min(limit, cap - progress.deleted) : limit;
      let rows;
      try {
        // eslint-disable-next-line no-await-in-loop
        ({ rows } = await client.query(batchDeleteSql(target), batchParams(target, { cutoff, lowerBound, limit: thisLimit })));
      } catch (err) {
        err.retentionProgress = progress;
        throw err;
      }
      if (!rows.length) break;
      t.deleted += rows.length;
      progress.deleted += rows.length;
      progress.batches += 1;
      // Keyset: next batch starts at the newest created_at just deleted (ties re-checked, already-deleted rows gone).
      const maxCreated = rows.reduce((m, r) => (r.created_at > m ? r.created_at : m), rows[0].created_at);
      lowerBound = maxCreated;
      t.cursor = new Date(maxCreated).toISOString();
      if (onProgress) onProgress(progress, t);
      // eslint-disable-next-line no-await-in-loop
      if (sleepMs > 0) await sleep(sleepMs);
    }
  }
  return { ...progress, stoppedAt: "complete" };
}

module.exports = {
  RETENTION_CLASSES,
  POLICY_RULES,
  CLASS_RETENTION_DAYS,
  AGE_BUCKET_BOUNDS,
  DISCOVERY_DAYS,
  DEFAULT_DAYS,
  ageBucketLabels,
  resolveRule,
  listDeleteTargets,
  targetKey,
  assertPolicyConsistent,
  dryRunChunkSql,
  summarizeDryRun,
  batchSelectSql,
  batchDeleteSql,
  batchParams,
  cutoffFor,
  runDryRun,
  explainTargets,
  runApply,
};
