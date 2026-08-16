/**
 * Bid-collection threshold for Mini Bid Article and Pantry House.
 * Does not auto-assign. Does not touch ordersService or Stripe.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const marketplaceEconomySettingsService = require("./marketplaceEconomySettingsService");
const reservationService = require("./marketplaceBidCreditReservationService");
const {
  OPPORTUNITY_TYPES,
  VALID_APPLICATION_STATUSES_FOR_COUNT,
  ARTICLE_THRESHOLD_REACHED_MESSAGE_AR,
  ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR,
  ARTICLE_DEADLINE_PASSED_MESSAGE_AR,
  ARTICLE_SELECTION_TOO_EARLY_MESSAGE_AR,
  BID_COLLECTION_ERROR_CODES,
  resolveArticleBidCollectionSettings,
  resolvePantryBidCollectionSettings,
  assertRequiredBidCount,
  isTruthyAck,
  buildArticleBidCollectionPublicView,
  isIntakeLockedStatus,
  isThresholdStatus,
} = require("../constants/opportunityBidCollection");

let schemaReadyCache = null;

async function articleBidCollectionSchemaReady(db = pool) {
  if (schemaReadyCache === true) return true;
  if (schemaReadyCache === false) return false;
  try {
    const { rows } = await db.query(
      `SELECT
         to_regclass('public.opportunity_bid_collection_rounds') AS rounds,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name='marketplace_articles'
              AND column_name='required_bid_count'
         ) AS article_col`,
    );
    schemaReadyCache = Boolean(rows[0]?.rounds) && Boolean(rows[0]?.article_col);
  } catch {
    schemaReadyCache = false;
  }
  return schemaReadyCache;
}

function clearArticleBidCollectionSchemaCache() {
  schemaReadyCache = null;
}

function wrapAssertRequiredBidCount(value, settings) {
  try {
    return assertRequiredBidCount(value, settings);
  } catch (err) {
    throw createAppError(err.message, err.statusCode || 400, {
      exposeToClient: true,
      publicCode: err.publicCode || BID_COLLECTION_ERROR_CODES.ARTICLE_REQUIRED_BID_COUNT_INVALID,
    });
  }
}

function assertMinRequiredBidsAcknowledged(payload, { publishing = false } = {}) {
  const ack =
    payload.minRequiredBidsAcknowledged ??
    payload.min_required_bids_acknowledged ??
    payload.requiredBidCountAcknowledged;
  if (publishing || payload.requireAck === true) {
    if (!isTruthyAck(ack)) {
      throw createAppError("يجب الإقرار بحد المناقصات الأدنى قبل النشر.", 400, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_MIN_REQUIRED_BIDS_ACK_REQUIRED,
      });
    }
  }
}

const VALID_STATUS_SQL = VALID_APPLICATION_STATUSES_FOR_COUNT.map((s) => `'${s}'`).join(", ");

function collectionRoundMatchSql(paramIndex, roundNumber) {
  if (Number(roundNumber) > 1) {
    return ` AND collection_round_id = $${paramIndex}`;
  }
  return ` AND (collection_round_id = $${paramIndex} OR collection_round_id IS NULL)`;
}

function resolveNextBidCollectionDeadline(previousDeadline, now = new Date()) {
  if (!previousDeadline) return null;
  const d = new Date(previousDeadline);
  if (Number.isNaN(d.getTime()) || d <= new Date(now)) return null;
  return previousDeadline;
}

async function lockAndCountArticleApplications(client, articleId, roundId = null, roundNumber = null) {
  const params = [Number(articleId)];
  let roundClause = "";
  if (roundId != null) {
    params.push(Number(roundId));
    roundClause = collectionRoundMatchSql(2, roundNumber);
  }
  const { rows } = await client.query(
    `SELECT id, status, bid_reservation_id, collection_round_id
       FROM marketplace_article_applications
      WHERE article_id = $1
        AND status IN (${VALID_STATUS_SQL})
        ${roundClause}
      FOR UPDATE`,
    params,
  );
  return { count: rows.length, applications: rows };
}

async function loadRoundForUpdate(client, roundId) {
  const { rows } = await client.query(
    `SELECT * FROM opportunity_bid_collection_rounds WHERE id = $1 FOR UPDATE`,
    [Number(roundId)],
  );
  return rows[0] || null;
}

async function loadCurrentArticleRound(client, articleId) {
  const { rows: articleRows } = await client.query(
    `SELECT current_bid_collection_round_id FROM marketplace_articles WHERE id = $1 FOR UPDATE`,
    [Number(articleId)],
  );
  const roundId = articleRows[0]?.current_bid_collection_round_id;
  if (!roundId) return null;
  return loadRoundForUpdate(client, roundId);
}

async function createInitialArticleRound(articleId, requiredBidCount, deadline, { client: externalClient = null } = {}) {
  if (requiredBidCount == null || requiredBidCount === "") {
    return null;
  }
  if (!(await articleBidCollectionSchemaReady(externalClient || pool))) {
    return null;
  }
  const settings = await marketplaceEconomySettingsService.getMarketplaceEconomySettings(externalClient || pool);
  const cfg = resolveArticleBidCollectionSettings(settings);
  const required = wrapAssertRequiredBidCount(requiredBidCount, settings);
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO opportunity_bid_collection_rounds (
         opportunity_type, opportunity_id, round_number, required_bid_count,
         bid_collection_status, bid_collection_deadline_at,
         auto_close_when_threshold_reached, auto_assign_when_threshold_reached
       ) VALUES (
         $1, $2, 1, $3, 'collecting', $4, $5, $6
       )
       RETURNING *`,
      [
        OPPORTUNITY_TYPES.MINI_BID_ARTICLE,
        Number(articleId),
        required,
        deadline || null,
        cfg.autoCloseWhenThresholdReached,
        false,
      ],
    );
    const round = rows[0];
    await client.query(
      `UPDATE marketplace_articles
          SET required_bid_count = $2,
              current_bid_collection_round_id = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [Number(articleId), required, round.id],
    );
    if (own) await client.query("COMMIT");
    return round;
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (err?.code === "42703" || err?.code === "42P01") return null;
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function getArticleBidCollectionProgress(articleId, { client: db = pool } = {}) {
  if (!(await articleBidCollectionSchemaReady(db))) {
    return null;
  }
  const aid = Number(articleId);
  if (!Number.isInteger(aid) || aid < 1) return null;
  try {
    const { rows } = await db.query(
      `SELECT a.required_bid_count, a.bid_collection_outcome, a.application_deadline_at,
              a.status AS article_status, a.relist_count,
              r.id AS round_id, r.round_number, r.bid_collection_status, r.required_bid_count AS round_required,
              r.bid_collection_deadline_at, r.min_bid_not_met_at, r.bid_collection_completed_at,
              r.auto_close_when_threshold_reached
         FROM marketplace_articles a
         LEFT JOIN opportunity_bid_collection_rounds r ON r.id = a.current_bid_collection_round_id
        WHERE a.id = $1
        LIMIT 1`,
      [aid],
    );
    const row = rows[0];
    if (!row) return null;
    const required = Number(row.round_required || row.required_bid_count) || 0;
    if (!required) {
      return buildArticleBidCollectionPublicView({
        required: 0,
        current: 0,
        status: null,
        outcome: row.bid_collection_outcome || null,
        deadline: row.application_deadline_at || null,
        articleStatus: row.article_status || null,
        relistCount: row.relist_count,
        currentRoundNumber: row.round_number,
        schemaReady: true,
      });
    }
    const roundMatch =
      Number(row.round_number) > 1
        ? `AND collection_round_id = $2`
        : `AND (collection_round_id = $2 OR ($2::bigint IS NULL AND collection_round_id IS NULL))`;
    const counted = await db.query(
      `SELECT count(*)::int AS n
         FROM marketplace_article_applications
        WHERE article_id = $1
          AND status IN (${VALID_STATUS_SQL})
          ${roundMatch}`,
      [aid, row.round_id || null],
    );
    return buildArticleBidCollectionPublicView({
      required,
      current: counted.rows[0]?.n || 0,
      status: row.bid_collection_status || null,
      outcome: row.bid_collection_outcome || null,
      deadline: row.bid_collection_deadline_at || row.application_deadline_at || null,
      articleStatus: row.article_status || null,
      relistCount: row.relist_count,
      currentRoundNumber: row.round_number,
      schemaReady: true,
    });
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") return null;
    throw err;
  }
}

async function assertArticleIntakeOpen(client, articleRow) {
  if (!(await articleBidCollectionSchemaReady(client))) return null;
  const roundId = articleRow.current_bid_collection_round_id;
  if (!roundId) return null;
  const round = await loadRoundForUpdate(client, roundId);
  if (!round) return null;
  if (round.bid_collection_status === "minimum_not_met") {
    throw createAppError(ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }
  if (round.bid_collection_deadline_at && new Date(round.bid_collection_deadline_at) <= new Date()) {
    throw createAppError(ARTICLE_DEADLINE_PASSED_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_DEADLINE_PASSED,
    });
  }
  if (isIntakeLockedStatus(round.bid_collection_status) && round.auto_close_when_threshold_reached !== false) {
    throw createAppError(ARTICLE_THRESHOLD_REACHED_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_THRESHOLD_REACHED,
    });
  }
  return round;
}

async function assertArticleSelectionAllowed(client, articleRow) {
  if (!(await articleBidCollectionSchemaReady(client))) return null;
  const required = Number(articleRow.required_bid_count);
  const roundId = articleRow.current_bid_collection_round_id;
  if (!Number.isInteger(required) || required < 1 || !roundId) {
    return null;
  }
  const round = await loadRoundForUpdate(client, roundId);
  if (!round) return null;
  if (round.bid_collection_status === "minimum_not_met") {
    throw createAppError(ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }
  if (round.bid_collection_status === "cancelled") {
    throw createAppError("جمع المناقصات ملغى ولا يمكن الإسناد.", 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }
  const { count } = await lockAndCountArticleApplications(
    client,
    round.opportunity_id,
    round.id,
    round.round_number,
  );
  if (isThresholdStatus(round.bid_collection_status) || count >= Number(round.required_bid_count)) {
    if (round.bid_collection_status === "collecting" && count >= Number(round.required_bid_count)) {
      await markThresholdReached(client, round, { currentCount: count });
    }
    return round;
  }
  throw createAppError(ARTICLE_SELECTION_TOO_EARLY_MESSAGE_AR, 409, {
    exposeToClient: true,
    publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
  });
}

async function markRoundAssigned(client, roundId) {
  if (!roundId) return null;
  try {
    const { rows } = await client.query(
      `UPDATE opportunity_bid_collection_rounds
          SET bid_collection_status = 'assigned',
              updated_at = NOW()
        WHERE id = $1
          AND bid_collection_status IN ('eligible_for_assignment', 'threshold_reached', 'collecting')
        RETURNING *`,
      [Number(roundId)],
    );
    if (rows[0]) {
      await client.query(
        `UPDATE marketplace_articles
            SET bid_collection_outcome = COALESCE(bid_collection_outcome, 'assigned'),
                updated_at = NOW()
          WHERE current_bid_collection_round_id = $1`,
        [Number(roundId)],
      );
      try {
        await client.query(
          `UPDATE pantry_requests
              SET bid_collection_outcome = COALESCE(bid_collection_outcome, 'assigned'),
                  updated_at = NOW()
            WHERE current_bid_collection_round_id = $1`,
          [Number(roundId)],
        );
      } catch (pantryErr) {
        if (pantryErr?.code !== "42703" && pantryErr?.code !== "42P01") throw pantryErr;
      }
    }
    return rows[0] || null;
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") return null;
    throw err;
  }
}

async function markThresholdReached(client, round, { now = new Date(), currentCount } = {}) {
  if (!round) return null;
  if (round.bid_collection_status !== "collecting") return round;
  const { rows } = await client.query(
    `UPDATE opportunity_bid_collection_rounds
        SET bid_collection_status = 'eligible_for_assignment',
            bid_collection_completed_at = COALESCE(bid_collection_completed_at, $2::timestamptz),
            updated_at = NOW()
      WHERE id = $1
        AND bid_collection_status = 'collecting'
      RETURNING *`,
    [round.id, new Date(now).toISOString()],
  );
  const updated = rows[0] || round;
  await client.query(
    `UPDATE marketplace_articles
        SET bid_collection_outcome = COALESCE(bid_collection_outcome, 'threshold_reached'),
            updated_at = NOW()
      WHERE current_bid_collection_round_id = $1`,
    [round.id],
  );
  return { ...updated, currentCount };
}

async function onArticleApplicationSubmitted(client, { articleId, applicationId, roundId, now = new Date() } = {}) {
  if (!roundId && !(await articleBidCollectionSchemaReady(client))) return { skipped: true };
  const round = roundId
    ? await loadRoundForUpdate(client, roundId)
    : await loadCurrentArticleRound(client, articleId);
  if (!round || round.opportunity_type !== OPPORTUNITY_TYPES.MINI_BID_ARTICLE) {
    return { skipped: true };
  }
  if (applicationId && round.id) {
    try {
      await client.query(
        `UPDATE marketplace_article_applications
            SET collection_round_id = $2, updated_at = NOW()
          WHERE id = $1 AND collection_round_id IS NULL`,
        [Number(applicationId), round.id],
      );
    } catch (err) {
      if (err?.code !== "42703") throw err;
    }
  }
  const { count } = await lockAndCountArticleApplications(client, articleId, round.id, round.round_number);
  const required = Number(round.required_bid_count);
  if (count < required) {
    return { count, required, status: round.bid_collection_status, thresholdReached: false };
  }
  const autoClose = round.auto_close_when_threshold_reached !== false;
  if (!autoClose && round.bid_collection_status === "collecting") {
    return { count, required, status: "collecting", thresholdReached: true, intakeLocked: false };
  }
  const updated = await markThresholdReached(client, round, { now, currentCount: count });
  return {
    count,
    required,
    status: updated?.bid_collection_status || "eligible_for_assignment",
    thresholdReached: true,
    intakeLocked: true,
    autoAssigned: false,
  };
}

async function closeArticleRoundMinimumNotMet(client, round, { now = new Date() } = {}) {
  if (!round || round.bid_collection_status !== "collecting") {
    return { skipped: true, reason: round?.bid_collection_status || "missing" };
  }
  const { count, applications } = await lockAndCountArticleApplications(
    client,
    round.opportunity_id,
    round.id,
    round.round_number,
  );
  if (count >= Number(round.required_bid_count)) {
    await markThresholdReached(client, round, { now, currentCount: count });
    return { skipped: true, reason: "threshold_met", count };
  }

  let released = 0;
  for (const app of applications) {
    const reservationId = app.bid_reservation_id != null ? Number(app.bid_reservation_id) : null;
    if (!reservationId) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await reservationService.releaseBidCreditReservation({
        client,
        reservationId,
        reason: "article_minimum_not_met",
        now,
        restoreDailyLimit: true,
      });
      released += 1;
    } catch (err) {
      if (
        err?.publicCode === "BID_RESERVATION_NOT_FOUND" ||
        err?.publicCode === "ARTICLE_RESERVATION_NOT_ACTIVE" ||
        err?.publicCode === "BID_RESERVATION_ALREADY_RELEASED"
      ) {
        continue;
      }
      throw err;
    }
  }

  await client.query(
    `UPDATE marketplace_article_applications
        SET status = 'cancelled',
            cancelled_at = COALESCE(cancelled_at, NOW()),
            updated_at = NOW()
      WHERE article_id = $1
        AND status = 'pending'
        AND (collection_round_id = $2 OR collection_round_id IS NULL)`,
    [round.opportunity_id, round.id],
  );

  const { rows: stamped } = await client.query(
    `UPDATE opportunity_bid_collection_rounds
        SET bid_collection_status = 'minimum_not_met',
            min_bid_not_met_at = COALESCE(min_bid_not_met_at, $2::timestamptz),
            bid_collection_completed_at = COALESCE(bid_collection_completed_at, $2::timestamptz),
            updated_at = NOW()
      WHERE id = $1
        AND bid_collection_status = 'collecting'
      RETURNING *`,
    [round.id, new Date(now).toISOString()],
  );
  if (!stamped[0]) {
    throw createAppError("تعذر إغلاق جولة جمع المناقصات بعد تحرير الحجوزات.", 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }

  await client.query(
    `UPDATE marketplace_articles
        SET bid_collection_outcome = 'minimum_not_met',
            status = CASE WHEN status = 'published' THEN 'closed' ELSE status END,
            closed_at = COALESCE(closed_at, $2::timestamptz),
            updated_at = NOW()
      WHERE id = $1`,
    [round.opportunity_id, new Date(now).toISOString()],
  );

  return {
    skipped: false,
    roundId: round.id,
    articleId: round.opportunity_id,
    count,
    required: Number(round.required_bid_count),
    reservationsReleased: released,
    status: "minimum_not_met",
  };
}

async function closeExpiredArticleBidCollections({ now = new Date(), limit = 50, client: externalClient = null } = {}) {
  if (!(await articleBidCollectionSchemaReady(externalClient || pool))) {
    return { ok: true, skipped: true, reason: "SCHEMA_NOT_READY", closed: 0 };
  }
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  const results = [];
  try {
    if (own) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT r.*
         FROM marketplace_articles a
         JOIN opportunity_bid_collection_rounds r
           ON r.id = a.current_bid_collection_round_id
        WHERE r.opportunity_type = $1
          AND r.bid_collection_status = 'collecting'
          AND r.bid_collection_deadline_at IS NOT NULL
          AND r.bid_collection_deadline_at <= $2::timestamptz
        ORDER BY r.bid_collection_deadline_at ASC, r.id ASC
        LIMIT $3
        FOR UPDATE OF a, r SKIP LOCKED`,
      [OPPORTUNITY_TYPES.MINI_BID_ARTICLE, new Date(now).toISOString(), Math.min(200, Math.max(1, Number(limit) || 50))],
    );
    for (const round of rows) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await closeArticleRoundMinimumNotMet(client, round, { now }));
    }
    if (own) await client.query("COMMIT");
    return {
      ok: true,
      closed: results.filter((r) => r && r.skipped === false).length,
      results,
    };
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

let pantrySchemaReadyCache = null;

async function pantryBidCollectionSchemaReady(db = pool) {
  if (pantrySchemaReadyCache === true) return true;
  if (pantrySchemaReadyCache === false) return false;
  try {
    const { rows } = await db.query(
      `SELECT
         to_regclass('public.opportunity_bid_collection_rounds') AS rounds,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name='pantry_requests'
              AND column_name='required_bid_count'
         ) AS pantry_col`,
    );
    pantrySchemaReadyCache = Boolean(rows[0]?.rounds) && Boolean(rows[0]?.pantry_col);
  } catch {
    pantrySchemaReadyCache = false;
  }
  return pantrySchemaReadyCache;
}

function clearPantryBidCollectionSchemaCache() {
  pantrySchemaReadyCache = null;
}

function wrapAssertPantryRequiredBidCount(value, settings) {
  try {
    return assertRequiredBidCount(value, {
      articleMinRequiredBids: resolvePantryBidCollectionSettings(settings).minRequiredBids,
      articleAllowedRequiredBidCounts: resolvePantryBidCollectionSettings(settings).allowedRequiredBidCounts,
      articleDefaultRequiredBidCount: resolvePantryBidCollectionSettings(settings).defaultRequiredBidCount,
    });
  } catch (err) {
    throw createAppError(err.message, err.statusCode || 400, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.PANTRY_REQUIRED_BID_COUNT_INVALID,
    });
  }
}

function assertPantryMinRequiredBidsAcknowledged(payload, { thresholdMode = false } = {}) {
  if (!thresholdMode) return;
  const ack =
    payload.minRequiredBidsAcknowledged ??
    payload.min_required_bids_acknowledged ??
    payload.requiredBidCountAcknowledged;
  if (!isTruthyAck(ack)) {
    throw createAppError("يجب الإقرار بحد المناقصات الأدنى لبيت المونة قبل الحفظ.", 400, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.PANTRY_MIN_REQUIRED_BIDS_ACK_REQUIRED,
    });
  }
}

const PANTRY_COUNT_STATUSES = ["pending", "accepted"];

async function lockAndCountPantryBids(client, pantryRequestId, roundId = null, roundNumber = null) {
  const params = [Number(pantryRequestId), PANTRY_COUNT_STATUSES];
  let roundClause = "";
  if (roundId != null) {
    params.push(Number(roundId));
    roundClause = collectionRoundMatchSql(3, roundNumber);
  }
  const { rows } = await client.query(
    `SELECT id, status, collection_round_id
       FROM pantry_bids
      WHERE pantry_request_id = $1
        AND status = ANY($2::text[])
        ${roundClause}
      FOR UPDATE`,
    params,
  );
  return { count: rows.length, bids: rows };
}

async function loadCurrentPantryRound(client, pantryRequestId) {
  const { rows } = await client.query(
    `SELECT current_bid_collection_round_id FROM pantry_requests WHERE id = $1 FOR UPDATE`,
    [Number(pantryRequestId)],
  );
  const roundId = rows[0]?.current_bid_collection_round_id;
  if (!roundId) return null;
  return loadRoundForUpdate(client, roundId);
}

async function createInitialPantryRound(pantryRequestId, requiredBidCount, deadline, { client: externalClient = null } = {}) {
  if (requiredBidCount == null || requiredBidCount === "") return null;
  if (!(await pantryBidCollectionSchemaReady(externalClient || pool))) return null;
  const settings = await marketplaceEconomySettingsService.getMarketplaceEconomySettings(externalClient || pool);
  const cfg = resolvePantryBidCollectionSettings(settings);
  const required = wrapAssertPantryRequiredBidCount(requiredBidCount, settings);
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO opportunity_bid_collection_rounds (
         opportunity_type, opportunity_id, round_number, required_bid_count,
         bid_collection_status, bid_collection_deadline_at,
         auto_close_when_threshold_reached, auto_assign_when_threshold_reached
       ) VALUES (
         $1, $2, 1, $3, 'collecting', $4, $5, $6
       )
       RETURNING *`,
      [
        OPPORTUNITY_TYPES.PANTRY_REQUEST,
        Number(pantryRequestId),
        required,
        deadline || null,
        cfg.autoCloseWhenThresholdReached,
        false,
      ],
    );
    const round = rows[0];
    await client.query(
      `UPDATE pantry_requests
          SET required_bid_count = $2,
              current_bid_collection_round_id = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [Number(pantryRequestId), required, round.id],
    );
    if (own) await client.query("COMMIT");
    return round;
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (err?.code === "42703" || err?.code === "42P01") return null;
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function getPantryBidCollectionProgress(pantryRequestId, { client: db = pool } = {}) {
  if (!(await pantryBidCollectionSchemaReady(db))) return null;
  const pid = Number(pantryRequestId);
  if (!Number.isInteger(pid) || pid < 1) return null;
  try {
    const { rows } = await db.query(
      `SELECT p.required_bid_count, p.bid_collection_outcome, p.application_deadline_at,
              p.status AS pantry_status, p.relist_count,
              r.id AS round_id, r.round_number, r.bid_collection_status, r.required_bid_count AS round_required,
              r.bid_collection_deadline_at
         FROM pantry_requests p
         LEFT JOIN opportunity_bid_collection_rounds r ON r.id = p.current_bid_collection_round_id
        WHERE p.id = $1
        LIMIT 1`,
      [pid],
    );
    const row = rows[0];
    if (!row) return null;
    const required = Number(row.round_required || row.required_bid_count) || 0;
    if (!required) {
      return buildArticleBidCollectionPublicView({
        required: 0,
        current: 0,
        status: null,
        outcome: row.bid_collection_outcome || null,
        deadline: row.application_deadline_at || null,
        articleStatus: row.pantry_status || null,
        relistCount: row.relist_count,
        currentRoundNumber: row.round_number,
        schemaReady: true,
      });
    }
    const roundMatch =
      Number(row.round_number) > 1
        ? `AND collection_round_id = $2`
        : `AND (collection_round_id = $2 OR ($2::bigint IS NULL AND collection_round_id IS NULL))`;
    const counted = await db.query(
      `SELECT count(*)::int AS n
         FROM pantry_bids
        WHERE pantry_request_id = $1
          AND status = ANY($3::text[])
          ${roundMatch}`,
      [pid, row.round_id || null, PANTRY_COUNT_STATUSES],
    );
    return buildArticleBidCollectionPublicView({
      required,
      current: counted.rows[0]?.n || 0,
      status: row.bid_collection_status || null,
      outcome: row.bid_collection_outcome || null,
      deadline: row.bid_collection_deadline_at || row.application_deadline_at || null,
      articleStatus: row.pantry_status || null,
      relistCount: row.relist_count,
      currentRoundNumber: row.round_number,
      schemaReady: true,
    });
  } catch (err) {
    if (err?.code === "42703" || err?.code === "42P01") return null;
    throw err;
  }
}

async function assertPantryIntakeOpen(client, pantryRow) {
  if (!(await pantryBidCollectionSchemaReady(client))) return null;
  const roundId = pantryRow.current_bid_collection_round_id;
  if (!roundId || pantryRow.required_bid_count == null) return null;
  const round = await loadRoundForUpdate(client, roundId);
  if (!round) return null;
  if (round.bid_collection_status === "minimum_not_met") {
    throw createAppError(ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }
  if (round.bid_collection_deadline_at && new Date(round.bid_collection_deadline_at) <= new Date()) {
    throw createAppError(ARTICLE_DEADLINE_PASSED_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_DEADLINE_PASSED,
    });
  }
  if (isIntakeLockedStatus(round.bid_collection_status) && round.auto_close_when_threshold_reached !== false) {
    throw createAppError(ARTICLE_THRESHOLD_REACHED_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_THRESHOLD_REACHED,
    });
  }
  return round;
}

async function assertPantrySelectionAllowed(client, pantryRow) {
  if (!(await pantryBidCollectionSchemaReady(client))) return null;
  const required = Number(pantryRow.required_bid_count);
  const roundId = pantryRow.current_bid_collection_round_id;
  if (!Number.isInteger(required) || required < 1 || !roundId) return null;
  const round = await loadRoundForUpdate(client, roundId);
  if (!round) return null;
  if (round.bid_collection_status === "minimum_not_met") {
    throw createAppError(ARTICLE_MINIMUM_NOT_MET_MESSAGE_AR, 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }
  const { count } = await lockAndCountPantryBids(client, round.opportunity_id, round.id, round.round_number);
  if (isThresholdStatus(round.bid_collection_status) || count >= Number(round.required_bid_count)) {
    if (round.bid_collection_status === "collecting" && count >= Number(round.required_bid_count)) {
      await markPantryThresholdReached(client, round, { currentCount: count });
    }
    return round;
  }
  throw createAppError(ARTICLE_SELECTION_TOO_EARLY_MESSAGE_AR, 409, {
    exposeToClient: true,
    publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
  });
}

function assertPantryBidInCurrentRound(pantryRow, bidRow) {
  const currentRoundId = pantryRow?.current_bid_collection_round_id;
  if (currentRoundId == null || pantryRow?.required_bid_count == null) return;
  const bidRound = bidRow?.collection_round_id;
  if (bidRound == null) return;
  if (Number(bidRound) !== Number(currentRoundId)) {
    throw createAppError("لا يمكن قبول عرض من جولة سابقة.", 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SELECTION_TOO_EARLY,
    });
  }
}

async function markPantryThresholdReached(client, round, { now = new Date(), currentCount } = {}) {
  if (!round) return null;
  if (round.bid_collection_status !== "collecting") return round;
  const { rows } = await client.query(
    `UPDATE opportunity_bid_collection_rounds
        SET bid_collection_status = 'eligible_for_assignment',
            bid_collection_completed_at = COALESCE(bid_collection_completed_at, $2::timestamptz),
            updated_at = NOW()
      WHERE id = $1
        AND bid_collection_status = 'collecting'
      RETURNING *`,
    [round.id, new Date(now).toISOString()],
  );
  const updated = rows[0] || round;
  await client.query(
    `UPDATE pantry_requests
        SET bid_collection_outcome = COALESCE(bid_collection_outcome, 'threshold_reached'),
            updated_at = NOW()
      WHERE current_bid_collection_round_id = $1`,
    [round.id],
  );
  return { ...updated, currentCount };
}

async function onPantryBidSubmitted(client, { pantryRequestId, bidId, roundId, now = new Date() } = {}) {
  if (!roundId && !(await pantryBidCollectionSchemaReady(client))) return { skipped: true };
  const round = roundId
    ? await loadRoundForUpdate(client, roundId)
    : await loadCurrentPantryRound(client, pantryRequestId);
  if (!round || round.opportunity_type !== OPPORTUNITY_TYPES.PANTRY_REQUEST) {
    return { skipped: true };
  }
  if (bidId && round.id) {
    try {
      await client.query(
        `UPDATE pantry_bids
            SET collection_round_id = $2, updated_at = NOW()
          WHERE id = $1 AND collection_round_id IS NULL`,
        [Number(bidId), round.id],
      );
    } catch (err) {
      if (err?.code !== "42703") throw err;
    }
  }
  const { count } = await lockAndCountPantryBids(client, pantryRequestId, round.id, round.round_number);
  const required = Number(round.required_bid_count);
  if (count < required) {
    return { count, required, status: round.bid_collection_status, thresholdReached: false };
  }
  const autoClose = round.auto_close_when_threshold_reached !== false;
  if (!autoClose && round.bid_collection_status === "collecting") {
    return { count, required, status: "collecting", thresholdReached: true, intakeLocked: false };
  }
  const updated = await markPantryThresholdReached(client, round, { now, currentCount: count });
  return {
    count,
    required,
    status: updated?.bid_collection_status || "eligible_for_assignment",
    thresholdReached: true,
    intakeLocked: true,
    autoAssigned: false,
  };
}

async function closePantryRoundMinimumNotMet(client, round, { now = new Date() } = {}) {
  if (!round || round.bid_collection_status !== "collecting") {
    return { skipped: true, reason: round?.bid_collection_status || "missing" };
  }
  const { count } = await lockAndCountPantryBids(client, round.opportunity_id, round.id, round.round_number);
  if (count >= Number(round.required_bid_count)) {
    await markPantryThresholdReached(client, round, { now, currentCount: count });
    return { skipped: true, reason: "threshold_met", count };
  }

  const pantryMembershipBid = require("./pantryMembershipBidService");
  const refunded = await pantryMembershipBid.refundChargedPantryApplicationsForOutcome({
    client,
    pantryRequestId: round.opportunity_id,
    outcomeKey: "minimum_not_met",
    reason: "minimum_not_met",
  });

  await client.query(
    `UPDATE pantry_bids
        SET status = 'withdrawn',
            updated_at = NOW()
      WHERE pantry_request_id = $1
        AND status = 'pending'
        AND (collection_round_id = $2 OR collection_round_id IS NULL)`,
    [round.opportunity_id, round.id],
  );

  const { rows: stamped } = await client.query(
    `UPDATE opportunity_bid_collection_rounds
        SET bid_collection_status = 'minimum_not_met',
            min_bid_not_met_at = COALESCE(min_bid_not_met_at, $2::timestamptz),
            bid_collection_completed_at = COALESCE(bid_collection_completed_at, $2::timestamptz),
            updated_at = NOW()
      WHERE id = $1
        AND bid_collection_status = 'collecting'
      RETURNING *`,
    [round.id, new Date(now).toISOString()],
  );
  if (!stamped[0]) {
    throw createAppError("تعذر إغلاق جولة جمع مناقصات بيت المونة بعد الاسترداد.", 409, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET,
    });
  }

  await client.query(
    `UPDATE pantry_requests
        SET bid_collection_outcome = 'minimum_not_met',
            applications_closed_at = COALESCE(applications_closed_at, $2::timestamptz),
            updated_at = NOW()
      WHERE id = $1`,
    [round.opportunity_id, new Date(now).toISOString()],
  );

  return {
    skipped: false,
    roundId: round.id,
    pantryRequestId: round.opportunity_id,
    count,
    required: Number(round.required_bid_count),
    refundedCount: refunded?.refundedCount || 0,
    status: "minimum_not_met",
  };
}

async function insertNextCollectionRound(client, {
  opportunityType,
  opportunityId,
  required,
  deadline,
  autoClose,
}) {
  const { rows: maxRows } = await client.query(
    `SELECT COALESCE(MAX(round_number), 0)::int AS n
       FROM opportunity_bid_collection_rounds
      WHERE opportunity_type = $1 AND opportunity_id = $2`,
    [opportunityType, Number(opportunityId)],
  );
  const nextNumber = (maxRows[0]?.n || 0) + 1;
  const { rows } = await client.query(
    `INSERT INTO opportunity_bid_collection_rounds (
       opportunity_type, opportunity_id, round_number, required_bid_count,
       bid_collection_status, bid_collection_deadline_at,
       auto_close_when_threshold_reached, auto_assign_when_threshold_reached
     ) VALUES (
       $1, $2, $3, $4, 'collecting', $5, $6, $7
     )
     RETURNING *`,
    [
      opportunityType,
      Number(opportunityId),
      nextNumber,
      required,
      deadline,
      autoClose !== false,
      false,
    ],
  );
  return rows[0];
}

async function relistArticleBidCollection(articleId, payload = {}, { client: externalClient = null } = {}) {
  if (!(await articleBidCollectionSchemaReady(externalClient || pool))) {
    throw createAppError("مخطط جمع المناقصات غير جاهز.", 503, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SCHEMA_NOT_READY,
    });
  }
  const aid = Number(articleId);
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const { rows: articleRows } = await client.query(
      `SELECT * FROM marketplace_articles WHERE id = $1 FOR UPDATE`,
      [aid],
    );
    const article = articleRows[0];
    if (!article) {
      throw createAppError("المقال غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "ARTICLE_NOT_FOUND",
      });
    }
    if (article.status === "cancelled") {
      throw createAppError("لا يمكن إعادة طرح مقال ملغى.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    const round = article.current_bid_collection_round_id
      ? await loadRoundForUpdate(client, article.current_bid_collection_round_id)
      : null;
    if (!round || round.bid_collection_status !== "minimum_not_met") {
      throw createAppError("إعادة الطرح متاحة فقط بعد عدم اكتمال الحد الأدنى للمناقصات.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    const { rows: selected } = await client.query(
      `SELECT id FROM marketplace_article_applications
        WHERE article_id = $1
          AND status IN ('selected','assigned','writing','submitted','under_review','revision_requested','approved')
        LIMIT 1`,
      [aid],
    );
    if (selected[0]) {
      throw createAppError("لا يمكن إعادة الطرح بعد اختيار متقدم.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    const settings = await marketplaceEconomySettingsService.getMarketplaceEconomySettings(client);
    const requiredRaw =
      payload.requiredBidCount ?? payload.required_bid_count ?? round.required_bid_count ?? article.required_bid_count;
    const required = wrapAssertRequiredBidCount(requiredRaw, settings);
    const cfg = resolveArticleBidCollectionSettings(settings);
    const deadline = resolveNextBidCollectionDeadline(
      payload.bidCollectionDeadlineAt ||
        payload.applicationDeadlineAt ||
        round.bid_collection_deadline_at ||
        article.application_deadline_at,
    );
    const newRound = await insertNextCollectionRound(client, {
      opportunityType: OPPORTUNITY_TYPES.MINI_BID_ARTICLE,
      opportunityId: aid,
      required,
      deadline,
      autoClose: cfg.autoCloseWhenThresholdReached,
    });
    const { rows: updated } = await client.query(
      `UPDATE marketplace_articles
          SET current_bid_collection_round_id = $2,
              required_bid_count = $3,
              bid_collection_outcome = NULL,
              status = CASE WHEN status IN ('closed', 'published') THEN 'published' ELSE status END,
              closed_at = NULL,
              application_deadline_at = $4,
              relist_count = COALESCE(relist_count, 0) + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [aid, newRound.id, required, deadline],
    );
    if (own) await client.query("COMMIT");
    return {
      article: updated[0],
      round: newRound,
      previousRoundId: round.id,
      previousRoundNumber: round.round_number,
      relistCount: updated[0]?.relist_count != null ? Number(updated[0].relist_count) : null,
    };
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function relistPantryBidCollection(pantryRequestId, payload = {}, { client: externalClient = null } = {}) {
  if (!(await pantryBidCollectionSchemaReady(externalClient || pool))) {
    throw createAppError("مخطط جمع مناقصات بيت المونة غير جاهز.", 503, {
      exposeToClient: true,
      publicCode: BID_COLLECTION_ERROR_CODES.ARTICLE_BID_COLLECTION_SCHEMA_NOT_READY,
    });
  }
  const pid = Number(pantryRequestId);
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const { rows: requestRows } = await client.query(
      `SELECT * FROM pantry_requests WHERE id = $1 FOR UPDATE`,
      [pid],
    );
    const request = requestRows[0];
    if (!request) {
      throw createAppError("طلب بيت المونة غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "NOT_FOUND",
      });
    }
    if (request.status === "cancelled" || request.status === "archived") {
      throw createAppError("لا يمكن إعادة طرح طلب بيت المونة في هذه الحالة.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    if (request.assigned_freelancer_id || request.accepted_bid_id) {
      throw createAppError("لا يمكن إعادة الطرح بعد قبول عرض.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    const { rows: accepted } = await client.query(
      `SELECT id FROM pantry_bids WHERE pantry_request_id = $1 AND status = 'accepted' LIMIT 1`,
      [pid],
    );
    if (accepted[0]) {
      throw createAppError("لا يمكن إعادة الطرح بعد قبول عرض.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    const round = request.current_bid_collection_round_id
      ? await loadRoundForUpdate(client, request.current_bid_collection_round_id)
      : null;
    if (!round || round.bid_collection_status !== "minimum_not_met") {
      throw createAppError("إعادة الطرح متاحة فقط بعد عدم اكتمال الحد الأدنى للمناقصات.", 409, {
        exposeToClient: true,
        publicCode: BID_COLLECTION_ERROR_CODES.PANTRY_BID_COLLECTION_RELIST_NOT_ALLOWED,
      });
    }
    const settings = await marketplaceEconomySettingsService.getMarketplaceEconomySettings(client);
    const requiredRaw =
      payload.requiredBidCount ?? payload.required_bid_count ?? round.required_bid_count ?? request.required_bid_count;
    const required = wrapAssertPantryRequiredBidCount(requiredRaw, settings);
    const cfg = resolvePantryBidCollectionSettings(settings);
    const deadline = resolveNextBidCollectionDeadline(
      payload.bidCollectionDeadlineAt ||
        payload.applicationDeadlineAt ||
        round.bid_collection_deadline_at ||
        request.application_deadline_at,
    );
    const newRound = await insertNextCollectionRound(client, {
      opportunityType: OPPORTUNITY_TYPES.PANTRY_REQUEST,
      opportunityId: pid,
      required,
      deadline,
      autoClose: cfg.autoCloseWhenThresholdReached,
    });
    const { rows: updated } = await client.query(
      `UPDATE pantry_requests
          SET current_bid_collection_round_id = $2,
              required_bid_count = $3,
              bid_collection_outcome = NULL,
              status = CASE
                WHEN status IN ('assigned', 'in_progress', 'submitted', 'revision_requested', 'approved') THEN status
                ELSE 'open_for_bids'
              END,
              applications_closed_at = NULL,
              applications_close_reason = NULL,
              application_deadline_at = $4,
              relist_count = COALESCE(relist_count, 0) + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [pid, newRound.id, required, deadline],
    );
    if (own) await client.query("COMMIT");
    return {
      request: updated[0],
      round: newRound,
      previousRoundId: round.id,
      previousRoundNumber: round.round_number,
      relistCount: updated[0]?.relist_count != null ? Number(updated[0].relist_count) : null,
    };
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function closeExpiredPantryBidCollections({ now = new Date(), limit = 50, client: externalClient = null } = {}) {
  if (!(await pantryBidCollectionSchemaReady(externalClient || pool))) {
    return { ok: true, skipped: true, reason: "SCHEMA_NOT_READY", closed: 0 };
  }
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  const results = [];
  try {
    if (own) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT r.*
         FROM pantry_requests p
         JOIN opportunity_bid_collection_rounds r
           ON r.id = p.current_bid_collection_round_id
        WHERE r.opportunity_type = $1
          AND r.bid_collection_status = 'collecting'
          AND r.bid_collection_deadline_at IS NOT NULL
          AND r.bid_collection_deadline_at <= $2::timestamptz
        ORDER BY r.bid_collection_deadline_at ASC, r.id ASC
        LIMIT $3
        FOR UPDATE OF p, r SKIP LOCKED`,
      [OPPORTUNITY_TYPES.PANTRY_REQUEST, new Date(now).toISOString(), Math.min(200, Math.max(1, Number(limit) || 50))],
    );
    for (const round of rows) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await closePantryRoundMinimumNotMet(client, round, { now }));
    }
    if (own) await client.query("COMMIT");
    return {
      ok: true,
      closed: results.filter((r) => r && r.skipped === false).length,
      results,
    };
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

module.exports = {
  articleBidCollectionSchemaReady,
  clearArticleBidCollectionSchemaCache,
  wrapAssertRequiredBidCount,
  assertMinRequiredBidsAcknowledged,
  createInitialArticleRound,
  getArticleBidCollectionProgress,
  lockAndCountArticleApplications,
  onArticleApplicationSubmitted,
  markThresholdReached,
  closeArticleRoundMinimumNotMet,
  closeExpiredArticleBidCollections,
  assertArticleIntakeOpen,
  assertArticleSelectionAllowed,
  markRoundAssigned,
  resolveArticleBidCollectionSettings,
  pantryBidCollectionSchemaReady,
  clearPantryBidCollectionSchemaCache,
  wrapAssertPantryRequiredBidCount,
  assertPantryMinRequiredBidsAcknowledged,
  createInitialPantryRound,
  getPantryBidCollectionProgress,
  lockAndCountPantryBids,
  onPantryBidSubmitted,
  markPantryThresholdReached,
  closePantryRoundMinimumNotMet,
  closeExpiredPantryBidCollections,
  relistArticleBidCollection,
  relistPantryBidCollection,
  resolveNextBidCollectionDeadline,
  assertPantryIntakeOpen,
  assertPantrySelectionAllowed,
  assertPantryBidInCurrentRound,
  resolvePantryBidCollectionSettings,
};
