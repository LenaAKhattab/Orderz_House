/**
 * Trial pending earnings — lazy grace evaluation + forfeiture to company (audit trail).
 * Does not delete ledger rows. No cron in this phase.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { millisToJodString, parseJodToMillis } = require("../utils/marketplaceBidPoolMoney");
const engine = require("./freelancerActivationEngineService");
const {
  TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT,
  TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION,
  TRIAL_PENDING_EARNINGS_COMPANY_ENTRY_TYPE,
  TRIAL_PENDING_EARNINGS_LOCK_STATES,
  TRIAL_PENDING_EARNINGS_EVENT_TYPE,
  entryEligibleForForfeiturePolicy,
} = require("../constants/trialPendingEarningsPolicy");

let schemaReadyCache = null;

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

async function forfeitureSchemaReady(client = null) {
  if (schemaReadyCache === true) return true;
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT to_regclass('public.trial_pending_earnings_forfeiture_events') AS tbl`,
    );
    schemaReadyCache = Boolean(rows[0]?.tbl);
    return schemaReadyCache;
  } catch (err) {
    if (isMissingSchema(err)) {
      schemaReadyCache = false;
      return false;
    }
    throw err;
  }
}

function clearForfeitureSchemaCache() {
  schemaReadyCache = null;
}

async function loadGraceDaysSettings(client) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT freelancer_activation_trial_pending_earnings_grace_days AS grace_days
         FROM marketplace_economy_settings WHERE id = 1 LIMIT 1`,
    );
    const n = Number(rows[0]?.grace_days);
    if (Number.isInteger(n) && n >= 1) return n;
    return TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT;
  } catch (err) {
    if (isMissingSchema(err)) return TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT;
    throw err;
  }
}

function computeForfeitureDeadline(endsAt, graceDays) {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const days = Number(graceDays) || TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT;
  return new Date(end + days * 86400000);
}

function computeDaysRemaining(deadlineAt, now = new Date()) {
  if (!deadlineAt) return null;
  const end = new Date(deadlineAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
}

function buildLockPolicyMessages(state, { graceDaysRemaining = null } = {}) {
  switch (state) {
    case TRIAL_PENDING_EARNINGS_LOCK_STATES.TRIAL_ACTIVE_LOCKED:
      return {
        ar: {
          headline: "أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.",
          detail: "أرباحك محفوظة وتصبح قابلة للسحب بعد تفعيل Silver.",
          cta: "اشترك لتفعيل السحب",
        },
        en: {
          headline: "Your earnings are saved but not withdrawable yet.",
          detail: "Your earnings are saved and become withdrawable after Silver activation.",
          cta: "Subscribe to unlock withdrawal",
        },
      };
    case TRIAL_PENDING_EARNINGS_LOCK_STATES.GRACE_PERIOD:
      return {
        ar: {
          headline: "أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.",
          detail:
            graceDaysRemaining != null
              ? `متبقي ${graceDaysRemaining} يوم لتفعيل السحب قبل إغلاق الرصيد.`
              : "متبقي وقت محدود لتفعيل السحب قبل إغلاق الرصيد.",
          cta: "اشترك لتفعيل السحب",
        },
        en: {
          headline: "Your earnings are saved but not withdrawable yet.",
          detail:
            graceDaysRemaining != null
              ? `${graceDaysRemaining} day(s) left to unlock withdrawal before the balance is closed.`
              : "Limited time left to unlock withdrawal before the balance is closed.",
          cta: "Subscribe to unlock withdrawal",
        },
      };
    case TRIAL_PENDING_EARNINGS_LOCK_STATES.FORFEITED_CLOSED:
      return {
        ar: {
          headline: "انتهت مهلة تفعيل الأرباح.",
          detail: "الرصيد المعلّق السابق لم يعد متاحًا للسحب.",
          cta: null,
        },
        en: {
          headline: "The earnings activation window has ended.",
          detail: "The previous pending balance is no longer available for withdrawal.",
          cta: null,
        },
      };
    default:
      return {
        ar: { headline: null, detail: null, cta: null },
        en: { headline: null, detail: null, cta: null },
      };
  }
}

async function resolveEarningsLockPolicy(freelancerUserId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const empty = {
    state: TRIAL_PENDING_EARNINGS_LOCK_STATES.NONE,
    graceDays: TRIAL_PENDING_EARNINGS_GRACE_DAYS_DEFAULT,
    trialEndsAt: null,
    forfeitureDeadlineAt: null,
    graceDaysRemaining: null,
    showSilverCta: false,
    messages: buildLockPolicyMessages(TRIAL_PENDING_EARNINGS_LOCK_STATES.NONE),
  };

  try {
    const [graceDays, paid, trialRow] = await Promise.all([
      loadGraceDaysSettings(runner),
      engine.loadPaidMembership(runner, freelancerUserId),
      engine.loadTrialRow(runner, freelancerUserId),
    ]);
    if (paid?.hasActivePaidSilver) {
      return {
        ...empty,
        state: TRIAL_PENDING_EARNINGS_LOCK_STATES.RELEASED,
        graceDays,
        showSilverCta: false,
      };
    }

    let trial = engine.mapTrialRow(trialRow);
    if (!trial?.endsAt) return { ...empty, graceDays };

    if (trial.status === "trial_active") {
      trial = (await engine.expireTrialIfNeeded(runner, {
        freelancerUserId,
        trial,
        now,
      })) || trial;
    }

    const endsAt = trial.endsAt;
    const deadline = computeForfeitureDeadline(endsAt, graceDays);
    const trialEnded = new Date(endsAt).getTime() <= now.getTime();
    const pastDeadline = deadline && now.getTime() >= deadline.getTime();

    if (!trialEnded) {
      return {
        ...empty,
        state: TRIAL_PENDING_EARNINGS_LOCK_STATES.TRIAL_ACTIVE_LOCKED,
        graceDays,
        trialEndsAt: endsAt,
        forfeitureDeadlineAt: deadline ? deadline.toISOString() : null,
        graceDaysRemaining: deadline ? computeDaysRemaining(deadline, now) : null,
        showSilverCta: true,
        messages: buildLockPolicyMessages(TRIAL_PENDING_EARNINGS_LOCK_STATES.TRIAL_ACTIVE_LOCKED),
      };
    }

    if (!pastDeadline) {
      const remaining = computeDaysRemaining(deadline, now);
      return {
        ...empty,
        state: TRIAL_PENDING_EARNINGS_LOCK_STATES.GRACE_PERIOD,
        graceDays,
        trialEndsAt: endsAt,
        forfeitureDeadlineAt: deadline ? deadline.toISOString() : null,
        graceDaysRemaining: remaining,
        showSilverCta: true,
        messages: buildLockPolicyMessages(TRIAL_PENDING_EARNINGS_LOCK_STATES.GRACE_PERIOD, {
          graceDaysRemaining: remaining,
        }),
      };
    }

    return {
      ...empty,
      state: TRIAL_PENDING_EARNINGS_LOCK_STATES.FORFEITED_CLOSED,
      graceDays,
      trialEndsAt: endsAt,
      forfeitureDeadlineAt: deadline ? deadline.toISOString() : null,
      graceDaysRemaining: 0,
      showSilverCta: true,
      messages: buildLockPolicyMessages(TRIAL_PENDING_EARNINGS_LOCK_STATES.FORFEITED_CLOSED),
    };
  } catch (err) {
    if (isMissingSchema(err)) return empty;
    throw err;
  }
}

async function loadPendingWriterEntriesForForfeiture(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT e.*,
            s.terms_version AS submission_terms_version
       FROM marketplace_article_financial_entries e
       LEFT JOIN marketplace_article_submissions s ON s.application_id = e.article_application_id
      WHERE e.beneficiary_user_id = $1
        AND e.entry_type = 'writer_starter_pending'
        AND e.status = 'pending'
      FOR UPDATE`,
    [Number(freelancerUserId)],
  );
  return rows;
}

async function forfeitSingleWriterEntry(client, {
  entry,
  freelancerUserId,
  trial,
  forfeitureDeadlineAt,
  now,
  policyTermsVersion,
}) {
  const entryId = Number(entry.id);
  const idempotencyKey = `trial_pending_forfeiture:writer_entry:${entryId}`;
  const forfeitKey = `trial_forfeiture:entry:${entryId}`;

  const existingEvent = await client.query(
    `SELECT id FROM trial_pending_earnings_forfeiture_events WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  if (existingEvent.rows[0]) {
    return { idempotent: true, entryId };
  }

  const amountJod = String(entry.amount_jod);
  const { rows: writerUpd } = await client.query(
    `UPDATE marketplace_article_financial_entries
        SET status = 'forfeited',
            forfeited_at = $2::timestamptz,
            forfeiture_idempotency_key = $3,
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
      WHERE id = $1
        AND status = 'pending'
        AND entry_type = 'writer_starter_pending'
      RETURNING *`,
    [
      entryId,
      new Date(now).toISOString(),
      forfeitKey,
      JSON.stringify({
        forfeitureReason: "trial_grace_deadline_passed",
        policyTermsVersion,
        forfeitureDeadlineAt: new Date(forfeitureDeadlineAt).toISOString(),
        trialId: trial?.id || null,
      }),
    ],
  );
  if (!writerUpd[0]) {
    return { skipped: true, entryId, reason: "not_pending" };
  }

  const companyKey = `company_trial_forfeiture:writer_entry:${entryId}`;
  const { rows: companyRows } = await client.query(
    `INSERT INTO marketplace_article_financial_entries (
       settlement_id, article_id, article_application_id, entry_type,
       beneficiary_user_id, amount_jod, status, idempotency_key, metadata
     ) VALUES ($1,$2,$3,$4,NULL,$5::numeric,'posted',$6,$7::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      entry.settlement_id,
      entry.article_id,
      entry.article_application_id,
      TRIAL_PENDING_EARNINGS_COMPANY_ENTRY_TYPE,
      amountJod,
      companyKey,
      JSON.stringify({
        sourceWriterEntryId: entryId,
        freelancerUserId: Number(freelancerUserId),
        forfeitureReason: "trial_grace_deadline_passed",
        policyTermsVersion,
      }),
    ],
  );
  const companyEntry = companyRows[0] || null;
  let companyEntryId = companyEntry?.id || null;
  if (!companyEntryId) {
    const again = await client.query(
      `SELECT id FROM marketplace_article_financial_entries WHERE idempotency_key = $1 LIMIT 1`,
      [companyKey],
    );
    companyEntryId = again.rows[0]?.id || null;
    if (!companyEntryId) {
      throw createAppError("Company forfeiture ledger row missing.", 503, {
        exposeToClient: false,
        publicCode: "TRIAL_FORFEITURE_LEDGER_FAILED",
      });
    }
  }

  await client.query(
    `INSERT INTO trial_pending_earnings_forfeiture_events (
       freelancer_user_id, trial_id, writer_entry_id, company_entry_id,
       amount_jod, forfeiture_deadline_at, forfeited_at, policy_terms_version,
       idempotency_key, metadata
     ) VALUES ($1,$2,$3,$4,$5::numeric,$6::timestamptz,$7::timestamptz,$8,$9,$10::jsonb)`,
    [
      Number(freelancerUserId),
      trial?.id || null,
      entryId,
      companyEntry?.id || companyEntryId,
      amountJod,
      new Date(forfeitureDeadlineAt).toISOString(),
      new Date(now).toISOString(),
      policyTermsVersion,
      idempotencyKey,
      JSON.stringify({ writerEntryId: entryId, companyEntryId }),
    ],
  );

  try {
    await engine.insertEvent(client, {
      freelancerUserId,
      trialId: trial?.id || null,
      eventType: TRIAL_PENDING_EARNINGS_EVENT_TYPE,
      metadata: {
        writerEntryId: entryId,
        amountJod,
        policyTermsVersion,
        forfeitureDeadlineAt: new Date(forfeitureDeadlineAt).toISOString(),
      },
    });
  } catch {
    /* events table optional */
  }

  return { forfeited: true, entryId, amountJod, companyEntryId };
}

async function evaluateAndApplyForfeitureIfDue(freelancerUserId, { client = null, now = new Date() } = {}) {
  const fid = Number(freelancerUserId);
  if (!Number.isInteger(fid) || fid < 1) {
    return { skipped: true, reason: "invalid_user" };
  }

  if (!(await forfeitureSchemaReady(client))) {
    return { skipped: true, reason: "schema_not_ready" };
  }

  const own = !client;
  const runner = client || (await pool.connect());
  try {
    if (own) await runner.query("BEGIN");

    const paid = await engine.loadPaidMembership(runner, fid);
    if (paid?.hasActivePaidSilver) {
      if (own) await runner.query("COMMIT");
      return { skipped: true, reason: "paid_active" };
    }

    const graceDays = await loadGraceDaysSettings(runner);
    let trial = engine.mapTrialRow(await engine.loadTrialRow(runner, fid));
    if (!trial?.endsAt) {
      if (own) await runner.query("COMMIT");
      return { skipped: true, reason: "no_trial_end" };
    }

    if (trial.status === "trial_active") {
      trial = (await engine.expireTrialIfNeeded(runner, {
        freelancerUserId: fid,
        trial,
        now,
      })) || trial;
    }

    const deadline = computeForfeitureDeadline(trial.endsAt, graceDays);
    if (!deadline || now.getTime() < new Date(trial.endsAt).getTime()) {
      if (own) await runner.query("COMMIT");
      return { skipped: true, reason: "trial_not_expired", forfeitureDeadlineAt: deadline?.toISOString() || null };
    }

    if (now.getTime() < deadline.getTime()) {
      if (own) await runner.query("COMMIT");
      return {
        skipped: true,
        reason: "grace_period",
        forfeitureDeadlineAt: deadline.toISOString(),
        graceDaysRemaining: computeDaysRemaining(deadline, now),
      };
    }

    const pendingRows = await loadPendingWriterEntriesForForfeiture(runner, fid);
    const forfeited = [];
    const skippedLegacy = [];
    for (const row of pendingRows) {
      const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const eligible = entryEligibleForForfeiturePolicy({
        entryMetadata: meta,
        submissionTermsVersion: row.submission_terms_version,
      });
      if (!eligible) {
        skippedLegacy.push(Number(row.id));
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const out = await forfeitSingleWriterEntry(runner, {
        entry: row,
        freelancerUserId: fid,
        trial,
        forfeitureDeadlineAt: deadline,
        now,
        policyTermsVersion: TRIAL_PENDING_EARNINGS_POLICY_MIN_TERMS_VERSION,
      });
      if (out.forfeited) forfeited.push(out);
    }

    if (own) await runner.query("COMMIT");
    return {
      applied: forfeited.length > 0,
      forfeitedCount: forfeited.length,
      skippedLegacyCount: skippedLegacy.length,
      forfeitureDeadlineAt: deadline.toISOString(),
      forfeited,
    };
  } catch (err) {
    if (own) {
      try {
        await runner.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (isMissingSchema(err)) return { skipped: true, reason: "schema_not_ready" };
    throw err;
  } finally {
    if (own) runner.release();
  }
}

function sumJodMillisFromRows(rows, { statusFilter } = {}) {
  let millis = 0;
  for (const row of rows || []) {
    if (statusFilter && !statusFilter(row)) continue;
    try {
      millis += parseJodToMillis(row.amount_jod, { label: "forfeitureSum" });
    } catch {
      /* skip */
    }
  }
  return millis;
}

module.exports = {
  forfeitureSchemaReady,
  clearForfeitureSchemaCache,
  loadGraceDaysSettings,
  computeForfeitureDeadline,
  computeDaysRemaining,
  buildLockPolicyMessages,
  resolveEarningsLockPolicy,
  evaluateAndApplyForfeitureIfDue,
  forfeitSingleWriterEntry,
  sumJodMillisFromRows,
  TRIAL_PENDING_EARNINGS_LOCK_STATES,
};
