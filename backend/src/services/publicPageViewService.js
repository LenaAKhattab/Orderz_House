const { pool } = require("../config/db");

const MAX_PATH_LEN = 2048;
const MAX_TITLE_LEN = 512;
const MAX_REFERRER_LEN = 2048;
const MAX_IDEMPOTENCY_LEN = 128;
const MAX_CLIENT_SESSION_LEN = 128;

function truncate(value, maxLen) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeUserId(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Insert a pageview (idempotent). Increments the singleton total when new.
 * @returns {Promise<{ recorded: boolean, totalCount: number }>}
 */
async function recordPageView({
  path,
  title = null,
  referrer = null,
  idempotencyKey,
  clientSessionId = null,
  userId = null,
}) {
  const safePath = truncate(path, MAX_PATH_LEN);
  const safeTitle = truncate(title, MAX_TITLE_LEN);
  const safeReferrer = truncate(referrer, MAX_REFERRER_LEN);
  const safeKey = truncate(idempotencyKey, MAX_IDEMPOTENCY_LEN);
  const safeClientSession = truncate(clientSessionId, MAX_CLIENT_SESSION_LEN);
  const safeUserId = normalizeUserId(userId);

  if (!safePath || !safeKey) {
    const err = new Error("path and idempotencyKey are required.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insert = await client.query(
      `
      INSERT INTO public_page_views (path, title, referrer, idempotency_key, client_session_id, user_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (idempotency_key) DO NOTHING
      RETURNING id
      `,
      [safePath, safeTitle, safeReferrer, safeKey, safeClientSession, safeUserId],
    );

    const recorded = insert.rowCount > 0;
    if (recorded) {
      await client.query(
        `
        UPDATE public_page_view_totals
        SET total_count = total_count + 1, updated_at = NOW()
        WHERE id = 1
        `,
      );
    }

    const total = await client.query(
      `SELECT total_count::bigint AS total_count FROM public_page_view_totals WHERE id = 1`,
    );

    let activeUsersLast7Days = null;
    const active = await client.query(
      `
      SELECT COUNT(DISTINCT (
        CASE
          WHEN user_id IS NOT NULL THEN 'u:' || user_id::text
          WHEN client_session_id IS NOT NULL AND TRIM(client_session_id) <> '' THEN 's:' || TRIM(client_session_id)
        END
      ))::bigint AS active_count
      FROM public_page_views
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND (
          user_id IS NOT NULL
          OR (client_session_id IS NOT NULL AND TRIM(client_session_id) <> '')
        )
      `,
    );
    activeUsersLast7Days = Number(active.rows[0]?.active_count) || 0;

    await client.query("COMMIT");

    return {
      recorded,
      totalCount: Number(total.rows[0]?.total_count) || 0,
      activeUsersLast7Days,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getTotalPageViewCount() {
  const { rows } = await pool.query(
    `SELECT total_count::bigint AS total_count FROM public_page_view_totals WHERE id = 1`,
  );
  return Number(rows[0]?.total_count) || 0;
}

async function getLastPageViewAt() {
  const { rows } = await pool.query(
    `SELECT created_at FROM public_page_views ORDER BY created_at DESC NULLS LAST LIMIT 1`,
  );
  const raw = rows[0]?.created_at;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

async function getActiveUsersLast7Days() {
  const { rows } = await pool.query(
    `
    SELECT COUNT(DISTINCT (
      CASE
        WHEN user_id IS NOT NULL THEN 'u:' || user_id::text
        WHEN client_session_id IS NOT NULL AND TRIM(client_session_id) <> '' THEN 's:' || TRIM(client_session_id)
      END
    ))::bigint AS active_count
    FROM public_page_views
    WHERE created_at >= NOW() - INTERVAL '7 days'
      AND (
        user_id IS NOT NULL
        OR (client_session_id IS NOT NULL AND TRIM(client_session_id) <> '')
      )
    `,
  );
  return Number(rows[0]?.active_count) || 0;
}

/**
 * One-time floor for the singleton total from PostHog all-time pageviews (never sums both).
 * @param {number} posthogAllTimeTotal
 * @returns {Promise<{ previous: number, next: number, updated: boolean }>}
 */
async function seedTotalCountFloor(posthogAllTimeTotal) {
  const posthogTotal = Math.max(0, Math.trunc(Number(posthogAllTimeTotal) || 0));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT total_count::bigint AS total_count FROM public_page_view_totals WHERE id = 1 FOR UPDATE`,
    );
    const previous = Number(current.rows[0]?.total_count) || 0;
    const next = Math.max(previous, posthogTotal);
    const updated = next > previous;
    if (updated) {
      await client.query(
        `UPDATE public_page_view_totals SET total_count = $1, updated_at = NOW() WHERE id = 1`,
        [next],
      );
    }
    await client.query("COMMIT");
    return { previous, next, updated };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  recordPageView,
  getTotalPageViewCount,
  getLastPageViewAt,
  getActiveUsersLast7Days,
  seedTotalCountFloor,
};
