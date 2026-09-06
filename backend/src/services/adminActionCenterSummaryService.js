/**
 * Web Admin Action Center — single-response COUNT summary (admin + super_admin).
 * Lightweight COUNT queries + DB statement_timeout; never fails the whole HTTP body
 * for a single section (partialErrors + numeric fallbacks).
 */

const { pool } = require("../config/db");
const freelancerAccountActivationKycService = require("./freelancerAccountActivationKycService");

/** Soft JS race (connect hang / stuck client). Slightly above DB statement_timeout. */
const PER_COUNT_TIMEOUT_MS = 4000;
/** Postgres statement_timeout for each summary COUNT transaction. */
const COUNT_STATEMENT_TIMEOUT_MS = 3000;

const EMPTY_COUNTS = Object.freeze({
  identityPendingCount: 0,
  /**
   * Legacy only — not displayed in Web Admin/Super Admin action center (Web-Admin-A2).
   * Paid packages activate via Stripe webhook; STARTER self-starts after KYC + training.
   * Always returned as 0 so clients do not treat free/legacy rows as action-needed.
   */
  paidActivationPendingCount: 0,
  packageAssignmentCount: 0,
  pantryPendingCount: 0,
  articlesPendingCount: 0,
  feedbackPendingCount: 0,
  unreadNotificationsCount: 0,
});

function toCount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * Run work on a dedicated client with SET LOCAL statement_timeout.
 * Cancels long-running SQL at the DB when the timeout is hit (error 57014).
 */
async function withDbStatementTimeout(fn, timeoutMs = COUNT_STATEMENT_TIMEOUT_MS) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('statement_timeout', $1, true)`, [
      String(Math.max(1, Math.trunc(timeoutMs))),
    ]);
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function safeCount(label, fn, { timeoutMs = PER_COUNT_TIMEOUT_MS } = {}) {
  try {
    const value = await withTimeout(Promise.resolve().then(fn), timeoutMs, label);
    return { ok: true, label, value: toCount(value) };
  } catch (err) {
    return {
      ok: false,
      label,
      value: 0,
      error: err?.message || String(err),
    };
  }
}

/** KYC identity: pending_review only — pure COUNT (no list / user join). */
async function countIdentityPending() {
  return withDbStatementTimeout((client) =>
    freelancerAccountActivationKycService.countPendingReviewRequestsForAdmin({ client }),
  );
}

/**
 * Legacy helper — no longer used by action-center summary (Web-Admin-A2).
 * Kept exported for compatibility / diagnostics; do not surface as a primary Admin action.
 */
async function countPaidActivationPending() {
  return withDbStatementTimeout(async (client) => {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM freelancer_subscriptions fs
       JOIN plans p ON p.id = fs.plan_id
       WHERE fs.is_current = TRUE
         AND fs.status NOT IN ('expired', 'cancelled')
         AND fs.activation_status = 'company_pending'
         AND (
           fs.payment_status IN ('paid', 'pending', 'not_required')
           OR fs.payment_status IS NULL
           OR fs.payment_status = ''
         )
         AND NOT (
           LOWER(COALESCE(fs.source, '')) = 'admin'
           AND COALESCE(fs.payment_status, '') IN ('not_required', 'paid')
           AND fs.assigned_by_user_id IS NOT NULL
           AND COALESCE(fs.notes, '') <> 'auto_default_free_plan'
         )
         AND COALESCE(fs.plan_id::text, '') <> '1'
         AND COALESCE(fs.notes, '') <> 'auto_default_free_plan'
         AND LOWER(COALESCE(p.name, '')) <> 'orderzhouse_free'
         AND LOWER(COALESCE(p.name, '')) NOT LIKE '%starter%'
         AND LOWER(COALESCE(p.name, '')) NOT LIKE '%free%'
         AND LOWER(COALESCE(p.title, '')) NOT LIKE '%مجاني%'
         AND LOWER(COALESCE(p.title, '')) NOT LIKE '%free%'
         AND LOWER(COALESCE(p.title, '')) NOT LIKE '%starter%'
         AND NOT (
           COALESCE(p.price_jod, 0) <= 0
           AND COALESCE(fs.payment_status, '') IN ('not_required', '')
         )`,
    );
    return toCount(rows[0]?.n);
  });
}

const BID_COLLECTION_ATTENTION_SQL = `(
  COALESCE(r.bid_collection_status, '') IN (
    'minimum_not_met',
    'threshold_reached',
    'eligible_for_assignment',
    'locked'
  )
  OR COALESCE(%ENTITY%.bid_collection_outcome, '') IN (
    'minimum_not_met',
    'threshold_reached'
  )
)`;

async function countArticlesPending() {
  const attention = BID_COLLECTION_ATTENTION_SQL.replace(/%ENTITY%/g, "a");
  try {
    return await withDbStatementTimeout(async (client) => {
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM marketplace_articles a
         LEFT JOIN opportunity_bid_collection_rounds r
           ON r.id = a.current_bid_collection_round_id
         WHERE ${attention}`,
      );
      return toCount(rows[0]?.n);
    });
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") return 0;
    throw err;
  }
}

async function countPantryPending() {
  const attention = BID_COLLECTION_ATTENTION_SQL.replace(/%ENTITY%/g, "pr");
  try {
    return await withDbStatementTimeout(async (client) => {
      const { rows } = await client.query(
        `SELECT (
           (
             SELECT COUNT(*)::int
             FROM pantry_requests pr
             LEFT JOIN opportunity_bid_collection_rounds r
               ON r.id = pr.current_bid_collection_round_id
             WHERE pr.status IN ('submitted', 'revision_requested')
                OR ${attention}
           )
           +
           (
             SELECT COUNT(*)::int
             FROM pantry_deliveries d
             WHERE d.status IN ('submitted', 'revision_requested')
           )
         )::int AS n`,
      );
      return toCount(rows[0]?.n);
    });
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") {
      return withDbStatementTimeout(async (client) => {
        const fallback = await client.query(
          `SELECT (
             (SELECT COUNT(*)::int FROM pantry_requests
               WHERE status IN ('submitted', 'revision_requested'))
             +
             (SELECT COUNT(*)::int FROM pantry_deliveries
               WHERE status IN ('submitted', 'revision_requested'))
           )::int AS n`,
        );
        return toCount(fallback.rows[0]?.n);
      });
    }
    throw err;
  }
}

async function countFeedbackPending() {
  return withDbStatementTimeout(async (client) => {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM user_feedback WHERE status = 'new'`,
    );
    return toCount(rows[0]?.n);
  });
}

async function countUnreadNotifications(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return 0;
  return withDbStatementTimeout(async (client) => {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS unread_count
       FROM notifications
       WHERE recipient_user_id = $1 AND is_read = FALSE`,
      [uid],
    );
    return toCount(rows[0]?.unread_count);
  });
}

/** Package assignment is a search tool — no pending queue. */
async function countPackageAssignment() {
  return 0;
}

function buildEmptySummary(partialErrors = []) {
  return {
    updatedAt: new Date().toISOString(),
    ...EMPTY_COUNTS,
    partialErrors,
  };
}

async function getActionCenterSummary({ userId }) {
  try {
    const [
      identityR,
      packagesR,
      pantryR,
      articlesR,
      feedbackR,
      unreadR,
    ] = await Promise.all([
      safeCount("identityPendingCount", countIdentityPending),
      safeCount("packageAssignmentCount", countPackageAssignment),
      safeCount("pantryPendingCount", countPantryPending),
      safeCount("articlesPendingCount", countArticlesPending),
      safeCount("feedbackPendingCount", countFeedbackPending),
      safeCount("unreadNotificationsCount", () => countUnreadNotifications(userId)),
    ]);

    const results = [identityR, packagesR, pantryR, articlesR, feedbackR, unreadR];
    const partialErrors = [];
    for (const result of results) {
      if (!result.ok) {
        partialErrors.push({ key: result.label, error: result.error });
      }
    }

    return {
      updatedAt: new Date().toISOString(),
      identityPendingCount: identityR.value,
      // Legacy field: always 0 — not shown in primary action center (Web-Admin-A2).
      paidActivationPendingCount: 0,
      packageAssignmentCount: packagesR.value,
      pantryPendingCount: pantryR.value,
      articlesPendingCount: articlesR.value,
      feedbackPendingCount: feedbackR.value,
      unreadNotificationsCount: unreadR.value,
      partialErrors,
    };
  } catch (err) {
    return buildEmptySummary([
      { key: "summary", error: err?.message || String(err) },
    ]);
  }
}

module.exports = {
  EMPTY_COUNTS,
  PER_COUNT_TIMEOUT_MS,
  COUNT_STATEMENT_TIMEOUT_MS,
  getActionCenterSummary,
  countIdentityPending,
  countPaidActivationPending,
  countPantryPending,
  countArticlesPending,
  countFeedbackPending,
  countUnreadNotifications,
  toCount,
  safeCount,
  withTimeout,
  withDbStatementTimeout,
  buildEmptySummary,
};
