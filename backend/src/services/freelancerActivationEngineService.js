/**
 * Freelancer Activation Engine — Phase A1.
 *
 * Eligibility + one-time trial row. Feature-flagged (default off).
 * A2.1 grants trial Bid Credits once via marketplace Bid Credit grants.
 * Does not mutate paid memberships, call Stripe, touch ordersService,
 * Pantry, Bildazo, claims, or rewrite article apply reserve/consume/return.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  resolveBusinessSpendDate,
} = require("./marketplaceMembershipDailyBidSpendService");
const {
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
  FREELANCER_ACTIVATION_PAID_TIER_CODES,
  FREELANCER_ACTIVATION_EVENT_TYPES,
  FREELANCER_ACTIVATION_NEXT_ACTIONS,
  FREELANCER_ACTIVATION_ERROR_CODES,
  FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
  FREELANCER_ACTIVATION_TRIAL_BID_LEDGER_EVENT,
  isTerminalTrialStatus,
  normalizeSilverPlanCode,
} = require("../constants/freelancerActivationEngine");
const bidCreditAccounting = require("./marketplaceBidCreditAccountingService");

function isMissingSchema(err) {
  return err?.code === "42P01" || err?.code === "42703";
}

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1" || value === "true";
}

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function mapSettingsRow(row) {
  if (!row) return { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS };
  return {
    engineEnabled: isTruthyFlag(row.freelancer_activation_engine_enabled),
    trialDurationDays: toInt(
      row.freelancer_activation_trial_duration_days,
      FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.trialDurationDays,
    ),
    trialBids: toInt(
      row.freelancer_activation_trial_bids,
      FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.trialBids,
    ),
    dailyBidLimit: toInt(
      row.freelancer_activation_daily_bid_limit,
      FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.dailyBidLimit,
    ),
    successfulWorkCap: toInt(
      row.freelancer_activation_successful_work_cap,
      FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.successfulWorkCap,
    ),
    requiresTraining: row.freelancer_activation_requires_training == null
      ? true
      : isTruthyFlag(row.freelancer_activation_requires_training),
    requiresVerification: row.freelancer_activation_requires_verification == null
      ? true
      : isTruthyFlag(row.freelancer_activation_requires_verification),
    silverPlanCode: normalizeSilverPlanCode(row.freelancer_activation_silver_plan_code),
    archiveAfterDays: toInt(
      row.freelancer_activation_archive_after_days,
      FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.archiveAfterDays,
    ),
    workInventoryEnabled: row.freelancer_activation_work_inventory_enabled == null
      ? FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryEnabled
      : isTruthyFlag(row.freelancer_activation_work_inventory_enabled),
    workInventoryPercentage: (() => {
      const n = Number(row.freelancer_activation_work_inventory_percentage);
      if (!Number.isFinite(n)) return FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.workInventoryPercentage;
      return Math.min(100, Math.max(0, n));
    })(),
  };
}

function mapTrialRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    freelancerUserId: Number(row.freelancer_user_id),
    status: row.status,
    sourceMembershipId: row.source_membership_id != null ? Number(row.source_membership_id) : null,
    startedAt: row.started_at || null,
    endsAt: row.ends_at || null,
    expiredAt: row.expired_at || null,
    archivedAt: row.archived_at || null,
    trialBidLimit: toInt(row.trial_bid_limit, 20),
    dailyBidLimit: toInt(row.daily_bid_limit, 2),
    trialDurationDays: toInt(row.trial_duration_days, 10),
    successfulWorkCap: toInt(row.successful_work_cap, 2),
    acceptedWorkCount: toInt(row.accepted_work_count, 0),
    publishedWorkCount: toInt(row.published_work_count, 0),
    firstBidAt: row.first_bid_at || null,
    firstWinAt: row.first_win_at || null,
    firstAcceptedAt: row.first_accepted_at || null,
    firstPublishedAt: row.first_published_at || null,
    silverCtaFirstShownAt: row.silver_cta_first_shown_at || null,
    silverPaidAt: row.silver_paid_at || null,
    trialBidGrantedAt: row.trial_bid_granted_at || null,
    trialBidGrantReference: row.trial_bid_grant_reference || null,
    trialBidGrantedAmount:
      row.trial_bid_granted_amount != null ? toInt(row.trial_bid_granted_amount, 0) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function computeDaysRemaining(endsAt, now = new Date()) {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86400000);
}

function emptyEligibility() {
  return {
    emailVerified: false,
    activationApproved: false,
    trainingCompleted: false,
    alreadyUsedTrial: false,
    hasActivePaidSilver: false,
    isFreelancer: false,
    trainingConfigured: false,
  };
}

function resolveNextRequiredAction({
  engineEnabled,
  eligibility,
  settings,
  trial,
  canActivate,
  usage = null,
}) {
  if (!engineEnabled) return FREELANCER_ACTIVATION_NEXT_ACTIONS.NONE;
  if (trial?.status === "paid_active" || eligibility.hasActivePaidSilver) {
    return FREELANCER_ACTIVATION_NEXT_ACTIONS.NONE;
  }
  if (trial?.status === "trial_expired_high_intent" || isTerminalTrialStatus(trial?.status) || eligibility.alreadyUsedTrial) {
    return FREELANCER_ACTIVATION_NEXT_ACTIONS.CONVERT_TO_SILVER;
  }
  if (trial?.status === "trial_active") {
    if (usage && usage.acceptedWorkCount >= usage.successfulWorkCap) {
      return FREELANCER_ACTIVATION_NEXT_ACTIONS.CONVERT_TO_SILVER;
    }
    return FREELANCER_ACTIVATION_NEXT_ACTIONS.USE_TRIAL;
  }
  if (settings.requiresVerification && !eligibility.emailVerified) {
    return FREELANCER_ACTIVATION_NEXT_ACTIONS.VERIFY_EMAIL;
  }
  if (settings.requiresVerification && !eligibility.activationApproved) {
    return FREELANCER_ACTIVATION_NEXT_ACTIONS.COMPLETE_ACTIVATION;
  }
  if (settings.requiresTraining && !eligibility.trainingCompleted) {
    return FREELANCER_ACTIVATION_NEXT_ACTIONS.COMPLETE_TRAINING;
  }
  if (canActivate) return FREELANCER_ACTIVATION_NEXT_ACTIONS.ACTIVATE_TRIAL;
  return FREELANCER_ACTIVATION_NEXT_ACTIONS.NONE;
}

function userFacingMessage({ engineEnabled, nextRequiredAction, trial, isEn = false }) {
  if (!engineEnabled) {
    return isEn
      ? "The freelancer activation trial is not enabled."
      : "تجربة تفعيل المستقل غير مفعّلة حالياً.";
  }
  switch (nextRequiredAction) {
    case FREELANCER_ACTIVATION_NEXT_ACTIONS.VERIFY_EMAIL:
      return isEn ? "Verify your email to continue." : "يرجى توثيق البريد الإلكتروني للمتابعة.";
    case FREELANCER_ACTIVATION_NEXT_ACTIONS.COMPLETE_ACTIVATION:
      return isEn
        ? "Company activation approval is required before the trial."
        : "يلزم اعتماد تفعيل الحساب من الشركة قبل بدء التجربة.";
    case FREELANCER_ACTIVATION_NEXT_ACTIONS.COMPLETE_TRAINING:
      return isEn ? "Complete required training before the trial." : "أكمل التدريب المطلوب قبل بدء التجربة.";
    case FREELANCER_ACTIVATION_NEXT_ACTIONS.ACTIVATE_TRIAL:
      return isEn ? "You are eligible to start the Mini Article trial." : "يمكنك بدء تجربة مقالات Mini Article.";
    case FREELANCER_ACTIVATION_NEXT_ACTIONS.USE_TRIAL:
      return isEn ? "Your trial is active." : "تجربتك نشطة.";
    case FREELANCER_ACTIVATION_NEXT_ACTIONS.CONVERT_TO_SILVER:
      return isEn
        ? "Your work trial has ended. Continue with Silver."
        : "انتهت تجربة العمل. للمتابعة، انتقل إلى Silver.";
    default:
      if (trial?.status === "not_started") {
        return isEn ? "Trial has not started." : "التجربة لم تبدأ بعد.";
      }
      return isEn ? "No activation action is required." : "لا يوجد إجراء تفعيل مطلوب الآن.";
  }
}

function isEligibleToActivate({ settings, eligibility }) {
  if (!eligibility.isFreelancer) return false;
  if (eligibility.alreadyUsedTrial) return false;
  if (eligibility.hasActivePaidSilver) return false;
  if (settings.requiresVerification && (!eligibility.emailVerified || !eligibility.activationApproved)) {
    return false;
  }
  if (settings.requiresTraining && !eligibility.trainingCompleted) return false;
  return true;
}

async function getActivationEngineSettings(client) {
  const runner = client || pool;
  const selectWithWir = `SELECT
         freelancer_activation_engine_enabled,
         freelancer_activation_trial_duration_days,
         freelancer_activation_trial_bids,
         freelancer_activation_daily_bid_limit,
         freelancer_activation_successful_work_cap,
         freelancer_activation_requires_training,
         freelancer_activation_requires_verification,
         freelancer_activation_silver_plan_code,
         freelancer_activation_archive_after_days,
         freelancer_activation_work_inventory_enabled,
         freelancer_activation_work_inventory_percentage
       FROM marketplace_economy_settings
       WHERE id = 1
       LIMIT 1`;
  const selectWithoutWir = `SELECT
         freelancer_activation_engine_enabled,
         freelancer_activation_trial_duration_days,
         freelancer_activation_trial_bids,
         freelancer_activation_daily_bid_limit,
         freelancer_activation_successful_work_cap,
         freelancer_activation_requires_training,
         freelancer_activation_requires_verification,
         freelancer_activation_silver_plan_code,
         freelancer_activation_archive_after_days
       FROM marketplace_economy_settings
       WHERE id = 1
       LIMIT 1`;
  try {
    const { rows } = await runner.query(selectWithWir);
    return mapSettingsRow(rows[0]);
  } catch (err) {
    if (err?.code === "42703") {
      try {
        const { rows } = await runner.query(selectWithoutWir);
        return mapSettingsRow(rows[0]);
      } catch (inner) {
        if (isMissingSchema(inner)) return { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS };
        throw inner;
      }
    }
    if (isMissingSchema(err)) return { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS };
    throw err;
  }
}

async function loadUserFacts(runner, freelancerUserId) {
  const { rows } = await runner.query(
    `SELECT id, role, is_active, COALESCE(email_verified, FALSE) AS email_verified
       FROM users WHERE id = $1`,
    [freelancerUserId],
  );
  return rows[0] || null;
}

async function loadActivationApproved(runner, freelancerUserId) {
  try {
    const { rows } = await runner.query(
      `SELECT activation_status
         FROM freelancer_subscriptions
        WHERE freelancer_user_id = $1 AND is_current = TRUE
        ORDER BY id DESC
        LIMIT 1`,
      [freelancerUserId],
    );
    return String(rows[0]?.activation_status || "").toLowerCase() === "company_approved";
  } catch (err) {
    if (isMissingSchema(err)) return false;
    throw err;
  }
}

async function loadTrainingFacts(runner, freelancerUserId) {
  let requiredCourseId = null;
  try {
    const { rows } = await runner.query(
      `SELECT marketplace_membership_required_course_id AS course_id
         FROM marketplace_economy_settings WHERE id = 1`,
    );
    requiredCourseId = rows[0]?.course_id != null ? Number(rows[0].course_id) : null;
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }

  if (Number.isInteger(requiredCourseId) && requiredCourseId >= 1) {
    try {
      const { rows } = await runner.query(
        `SELECT completed_at
           FROM course_assignments
          WHERE freelancer_id = $1 AND course_id = $2 AND completed_at IS NOT NULL
          LIMIT 1`,
        [freelancerUserId, requiredCourseId],
      );
      return { trainingConfigured: true, trainingCompleted: Boolean(rows[0]) };
    } catch (err) {
      if (isMissingSchema(err)) return { trainingConfigured: false, trainingCompleted: false };
      throw err;
    }
  }

  try {
    const { rows } = await runner.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completed
         FROM course_assignments
        WHERE freelancer_id = $1`,
      [freelancerUserId],
    );
    const total = Number(rows[0]?.total) || 0;
    const completed = Number(rows[0]?.completed) || 0;
    if (total < 1) return { trainingConfigured: false, trainingCompleted: false };
    return { trainingConfigured: true, trainingCompleted: completed === total };
  } catch (err) {
    if (isMissingSchema(err)) return { trainingConfigured: false, trainingCompleted: false };
    throw err;
  }
}

async function loadPaidMembership(runner, freelancerUserId) {
  try {
    const { rows } = await runner.query(
      `SELECT p.tier_code, p.id AS plan_id, p.monthly_price_jod, m.id AS membership_id
         FROM freelancer_marketplace_memberships m
         JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
        WHERE m.freelancer_user_id = $1
          AND m.is_current = TRUE
          AND m.status IN ('active', 'cancel_at_period_end')
        LIMIT 1`,
      [freelancerUserId],
    );
    const tier = String(rows[0]?.tier_code || "").toLowerCase();
    return {
      hasActivePaidSilver: FREELANCER_ACTIVATION_PAID_TIER_CODES.includes(tier),
      currentMembershipId: rows[0]?.membership_id != null ? Number(rows[0].membership_id) : null,
      currentTierCode: tier || null,
      currentPlanId: rows[0]?.plan_id != null ? Number(rows[0].plan_id) : null,
      monthlyPriceJod:
        rows[0]?.monthly_price_jod != null ? String(rows[0].monthly_price_jod) : null,
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return {
        hasActivePaidSilver: false,
        currentMembershipId: null,
        currentTierCode: null,
        currentPlanId: null,
        monthlyPriceJod: null,
      };
    }
    throw err;
  }
}

async function loadTrialRow(runner, freelancerUserId) {
  try {
    const { rows } = await runner.query(
      `SELECT * FROM freelancer_activation_trials WHERE freelancer_user_id = $1 LIMIT 1`,
      [freelancerUserId],
    );
    return rows[0] || null;
  } catch (err) {
    if (isMissingSchema(err)) return null;
    throw err;
  }
}

function buildStatePayload({
  settings,
  eligibility,
  trial,
  schemaReady = true,
  now = new Date(),
  usage = null,
}) {
  const engineEnabled = Boolean(settings.engineEnabled) && schemaReady;
  const canActivate =
    engineEnabled && !trial?.status && isEligibleToActivate({ settings, eligibility })
      ? true
      : engineEnabled &&
        trial &&
        (trial.status === "not_started" || trial.status === "eligible") &&
        isEligibleToActivate({ settings, eligibility });
  const nextRequiredAction = resolveNextRequiredAction({
    engineEnabled,
    eligibility,
    settings,
    trial: trial ? { status: trial.status } : null,
    canActivate,
    usage,
  });
  const status = trial?.status
    || (engineEnabled && canActivate ? "eligible" : "not_started");

  return {
    engineEnabled,
    schemaReady,
    status,
    eligibility,
    canActivate: Boolean(canActivate),
    nextRequiredAction,
    message: userFacingMessage({ engineEnabled, nextRequiredAction, trial, isEn: false }),
    messageEn: userFacingMessage({ engineEnabled, nextRequiredAction, trial, isEn: true }),
    usage,
    trial: trial
      ? {
          ...trial,
          daysRemaining: computeDaysRemaining(trial.endsAt, now),
          clockExpired: computeDaysRemaining(trial.endsAt, now) === 0 && trial.status === "trial_active",
          trialBidsUsed: usage?.trialBidsUsed ?? null,
          dailyUsed: usage?.dailyUsed ?? null,
          acceptedWorkCount: usage?.acceptedWorkCount ?? trial.acceptedWorkCount,
          publishedWorkCount: usage?.publishedWorkCount ?? trial.publishedWorkCount,
        }
      : null,
    settings: {
      trialDurationDays: settings.trialDurationDays,
      trialBids: settings.trialBids,
      dailyBidLimit: settings.dailyBidLimit,
      successfulWorkCap: settings.successfulWorkCap,
      requiresTraining: settings.requiresTraining,
      requiresVerification: settings.requiresVerification,
      silverPlanCode: settings.silverPlanCode,
      archiveAfterDays: settings.archiveAfterDays,
    },
  };
}

async function gatherEligibility(runner, freelancerUserId) {
  const user = await loadUserFacts(runner, freelancerUserId);
  const isFreelancer = Boolean(user && user.role === "freelancer" && user.is_active !== false);
  const emailVerified = Boolean(user && (user.email_verified === true || user.email_verified === "t"));
  const [activationApproved, training, paid, trialRow] = await Promise.all([
    isFreelancer ? loadActivationApproved(runner, freelancerUserId) : Promise.resolve(false),
    isFreelancer ? loadTrainingFacts(runner, freelancerUserId) : Promise.resolve({
      trainingConfigured: false,
      trainingCompleted: false,
    }),
    isFreelancer ? loadPaidMembership(runner, freelancerUserId) : Promise.resolve({
      hasActivePaidSilver: false,
      currentMembershipId: null,
      currentTierCode: null,
    }),
    loadTrialRow(runner, freelancerUserId),
  ]);
  const trial = mapTrialRow(trialRow);
  const alreadyUsedTrial = Boolean(trial && isTerminalTrialStatus(trial.status));
  return {
    user,
    trial,
    trialRow,
    paid,
    eligibility: {
      emailVerified,
      activationApproved: Boolean(activationApproved),
      trainingCompleted: Boolean(training.trainingCompleted),
      alreadyUsedTrial,
      hasActivePaidSilver: Boolean(paid.hasActivePaidSilver),
      isFreelancer,
      trainingConfigured: Boolean(training.trainingConfigured),
    },
  };
}

/**
 * Read-only trial state. Never writes. Does not block article apply.
 */
async function getFreelancerActivationTrialState(userId, { client = null, now = new Date() } = {}) {
  const runner = client || pool;
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    return buildStatePayload({
      settings: { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS },
      eligibility: emptyEligibility(),
      trial: null,
      schemaReady: true,
      now,
    });
  }

  const settings = await getActivationEngineSettings(runner);
  if (!settings.engineEnabled) {
    return buildStatePayload({
      settings,
      eligibility: emptyEligibility(),
      trial: null,
      schemaReady: true,
      now,
    });
  }
  try {
    const gathered = await gatherEligibility(runner, freelancerUserId);
    let trial = gathered.trial;
    if (trial?.status === "trial_active") {
      trial = (await expireTrialIfNeeded(runner, {
        freelancerUserId,
        trial,
        now,
      })) || trial;
    }
    const usage = trial
      ? await countTrialBidUsage(runner, {
          freelancerUserId,
          trial,
          now,
        })
      : emptyTrialUsage(null);
    return buildStatePayload({
      settings,
      eligibility: {
        ...gathered.eligibility,
        alreadyUsedTrial: Boolean(trial && isTerminalTrialStatus(trial.status)),
      },
      trial,
      schemaReady: true,
      now,
      usage,
    });
  } catch (err) {
    if (isMissingSchema(err)) {
      return buildStatePayload({
        settings: { ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS, engineEnabled: false },
        eligibility: emptyEligibility(),
        trial: null,
        schemaReady: false,
        now,
      });
    }
    throw err;
  }
}

const TRIAL_APPLY_MESSAGES = Object.freeze({
  FREELANCER_TRIAL_REQUIRED: {
    ar: "يلزم تفعيل تجربة العمل قبل التقديم على مقالات Mini Article.",
    en: "Activate the work trial before applying to Mini Articles.",
  },
  FREELANCER_TRIAL_EXPIRED: {
    ar: "انتهت تجربة العمل. للمتابعة، انتقل إلى Silver.",
    en: "Your work trial has ended. Continue with Silver.",
  },
  FREELANCER_TRIAL_DAILY_BID_LIMIT_REACHED: {
    ar: "وصلت للحد اليومي من عروض التجربة.",
    en: "You reached today's trial bid limit.",
  },
  FREELANCER_TRIAL_BID_LIMIT_REACHED: {
    ar: "وصلت للحد الأقصى من عروض التجربة.",
    en: "You reached the trial bid limit.",
  },
  FREELANCER_TRIAL_WORK_CAP_REACHED: {
    ar: "وصلت للحد الأقصى من المقالات المقبولة في التجربة.",
    en: "You reached the trial accepted-work cap.",
  },
  FREELANCER_TRIAL_MINI_ARTICLES_ONLY: {
    ar: "التجربة تسمح بالتقديم على مقالات Mini Article فقط.",
    en: "The trial allows Mini Article applications only.",
  },
});

function emptyTrialUsage(trial) {
  return {
    trialBidsUsed: 0,
    trialBidLimit: trial?.trialBidLimit ?? 20,
    dailyUsed: 0,
    dailyLimit: trial?.dailyBidLimit ?? 2,
    acceptedWorkCount: trial?.acceptedWorkCount ?? 0,
    publishedWorkCount: trial?.publishedWorkCount ?? 0,
    successfulWorkCap: trial?.successfulWorkCap ?? 2,
    daysRemaining: trial ? computeDaysRemaining(trial.endsAt) : null,
  };
}

function applicationCountsTowardTrialBid(row) {
  const status = String(row.status || row.application_status || "");
  if (status === "withdrawn" || status === "cancelled") return false;
  const reservationStatus = String(row.reservation_status || row.reservationStatus || "active");
  if (reservationStatus === "released") return false;
  return true;
}

function countTrialUsageFromRows(rows, { trial, now = new Date(), spendDate } = {}) {
  const usage = emptyTrialUsage(trial);
  const day = spendDate || resolveBusinessSpendDate(now);
  const startedAt = trial?.startedAt ? new Date(trial.startedAt).getTime() : 0;
  const seen = new Set();
  for (const row of rows || []) {
    const id = String(row.id ?? row.application_id ?? "");
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const created = row.created_at || row.createdAt;
    if (created && startedAt && new Date(created).getTime() < startedAt) continue;
    if (String(row.status || "") === "approved") {
      usage.acceptedWorkCount += 1;
    }
    if (applicationCountsTowardTrialBid(row)) {
      usage.trialBidsUsed += 1;
      if (created && resolveBusinessSpendDate(new Date(created)) === day) {
        usage.dailyUsed += 1;
      }
    }
  }
  if (trial?.acceptedWorkCount != null) {
    usage.acceptedWorkCount = Math.max(usage.acceptedWorkCount, Number(trial.acceptedWorkCount) || 0);
  }
  if (trial?.publishedWorkCount != null) {
    usage.publishedWorkCount = Math.max(usage.publishedWorkCount, Number(trial.publishedWorkCount) || 0);
  }
  usage.daysRemaining = computeDaysRemaining(trial?.endsAt, now);
  return usage;
}

function trialApplyMeta(trial, usage, nextRequiredAction) {
  return {
    daysRemaining: usage?.daysRemaining ?? computeDaysRemaining(trial?.endsAt),
    trialBidsUsed: usage?.trialBidsUsed ?? 0,
    trialBidLimit: usage?.trialBidLimit ?? trial?.trialBidLimit ?? 20,
    dailyUsed: usage?.dailyUsed ?? 0,
    dailyLimit: usage?.dailyLimit ?? trial?.dailyBidLimit ?? 2,
    acceptedWorkCount: usage?.acceptedWorkCount ?? trial?.acceptedWorkCount ?? 0,
    successfulWorkCap: usage?.successfulWorkCap ?? trial?.successfulWorkCap ?? 2,
    nextRequiredAction: nextRequiredAction || FREELANCER_ACTIVATION_NEXT_ACTIONS.NONE,
  };
}

async function expireTrialIfNeeded(runner, { freelancerUserId, trial, now = new Date() } = {}) {
  if (!trial || trial.status !== "trial_active" || !trial.endsAt) return trial;
  if (new Date(trial.endsAt).getTime() > now.getTime()) return trial;
  try {
    const { rows } = await runner.query(
      `UPDATE freelancer_activation_trials
          SET status = 'trial_expired_high_intent',
              expired_at = COALESCE(expired_at, $2::timestamptz),
              updated_at = NOW()
        WHERE freelancer_user_id = $1
          AND status = 'trial_active'
        RETURNING *`,
      [freelancerUserId, now.toISOString()],
    );
    const updated = mapTrialRow(rows[0]) || { ...trial, status: "trial_expired_high_intent", expiredAt: now };
    await insertEvent(runner, {
      freelancerUserId,
      trialId: updated.id,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_EXPIRED,
      metadata: { from: "trial_active", endsAt: trial.endsAt },
    });
    return updated;
  } catch (err) {
    if (isMissingSchema(err)) return { ...trial, status: "trial_expired_high_intent" };
    throw err;
  }
}

async function loadTrialApplicationRows(runner, { freelancerUserId, startedAt }) {
  try {
    const { rows } = await runner.query(
      `SELECT a.id, a.status, a.created_at, r.status AS reservation_status
         FROM marketplace_article_applications a
         LEFT JOIN marketplace_bid_credit_reservations r ON r.id = a.bid_reservation_id
        WHERE a.freelancer_user_id = $1
          AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)`,
      [freelancerUserId, startedAt || null],
    );
    return rows;
  } catch (err) {
    if (isMissingSchema(err)) {
      try {
        const { rows } = await runner.query(
          `SELECT a.id, a.status, a.created_at
             FROM marketplace_article_applications a
            WHERE a.freelancer_user_id = $1
              AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)`,
          [freelancerUserId, startedAt || null],
        );
        return rows;
      } catch (inner) {
        if (isMissingSchema(inner)) return [];
        throw inner;
      }
    }
    throw err;
  }
}

async function countTrialBidUsage(runner, { freelancerUserId, trial, now = new Date() } = {}) {
  if (!trial) return emptyTrialUsage(null);
  const rows = await loadTrialApplicationRows(runner, {
    freelancerUserId,
    startedAt: trial.startedAt,
  });
  return countTrialUsageFromRows(rows, {
    trial,
    now,
    spendDate: resolveBusinessSpendDate(now),
  });
}

function trialApplyBlock(code, trial, usage, nextRequiredAction) {
  const copy = TRIAL_APPLY_MESSAGES[code] || TRIAL_APPLY_MESSAGES.FREELANCER_TRIAL_REQUIRED;
  return {
    skipped: false,
    allowed: false,
    code,
    message: copy.ar,
    messageEn: copy.en,
    meta: trialApplyMeta(trial, usage, nextRequiredAction),
    trial,
    usage,
  };
}

/**
 * Mini Article apply gate. Engine off → skipped (existing apply unchanged).
 * Does not reserve or consume Bids.
 */
async function evaluateTrialMiniArticleApplyGate({
  client,
  freelancerUserId,
  now = new Date(),
  surface = "mini_article",
  ignoreUsageLimits = false,
} = {}) {
  const runner = client || pool;
  let settings;
  try {
    settings = await getActivationEngineSettings(runner);
  } catch {
    return { skipped: true, allowed: true, reason: "SETTINGS_UNAVAILABLE" };
  }
  if (!settings.engineEnabled) {
    return { skipped: true, allowed: true, reason: "ENGINE_OFF" };
  }

  const paid = await loadPaidMembership(runner, freelancerUserId);
  if (paid.hasActivePaidSilver) {
    return { skipped: false, allowed: true, bypass: "paid_membership", paidTier: paid.currentTierCode };
  }

  let trial = mapTrialRow(await loadTrialRow(runner, freelancerUserId));
  trial = await expireTrialIfNeeded(runner, { freelancerUserId, trial, now });
  const usage = await countTrialBidUsage(runner, { freelancerUserId, trial, now });

  if (!trial || trial.status !== "trial_active") {
    const code = trial && isTerminalTrialStatus(trial.status)
      ? FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_EXPIRED
      : FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_REQUIRED;
    const next = code === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_EXPIRED
      ? FREELANCER_ACTIVATION_NEXT_ACTIONS.CONVERT_TO_SILVER
      : FREELANCER_ACTIVATION_NEXT_ACTIONS.ACTIVATE_TRIAL;
    return trialApplyBlock(code, trial, usage, next);
  }

  if (String(surface || "") !== "mini_article") {
    return trialApplyBlock(
      FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_MINI_ARTICLES_ONLY,
      trial,
      usage,
      FREELANCER_ACTIVATION_NEXT_ACTIONS.USE_TRIAL,
    );
  }

  if (usage.acceptedWorkCount >= usage.successfulWorkCap) {
    return trialApplyBlock(
      FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_WORK_CAP_REACHED,
      trial,
      usage,
      FREELANCER_ACTIVATION_NEXT_ACTIONS.CONVERT_TO_SILVER,
    );
  }
  if (!ignoreUsageLimits && usage.dailyUsed >= usage.dailyLimit) {
    return trialApplyBlock(
      FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_DAILY_BID_LIMIT_REACHED,
      trial,
      usage,
      FREELANCER_ACTIVATION_NEXT_ACTIONS.USE_TRIAL,
    );
  }
  if (!ignoreUsageLimits && usage.trialBidsUsed >= usage.trialBidLimit) {
    return trialApplyBlock(
      FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_LIMIT_REACHED,
      trial,
      usage,
      FREELANCER_ACTIVATION_NEXT_ACTIONS.USE_TRIAL,
    );
  }

  return {
    skipped: false,
    allowed: true,
    trial,
    usage,
    meta: trialApplyMeta(trial, usage, FREELANCER_ACTIVATION_NEXT_ACTIONS.USE_TRIAL),
  };
}

async function assertTrialEligibleForMiniArticleApply(input = {}) {
  const result = await evaluateTrialMiniArticleApplyGate(input);
  if (result.skipped || result.allowed) return result;
  throw createAppError(result.message, 403, {
    exposeToClient: true,
    publicCode: result.code,
    meta: result.meta,
  });
}

async function markTrialFirstBidIfNeeded(runner, { freelancerUserId, now = new Date() } = {}) {
  try {
    await runner.query(
      `UPDATE freelancer_activation_trials
          SET first_bid_at = COALESCE(first_bid_at, $2::timestamptz),
              updated_at = NOW()
        WHERE freelancer_user_id = $1
          AND status = 'trial_active'`,
      [freelancerUserId, now.toISOString()],
    );
  } catch (err) {
    if (!isMissingSchema(err)) throw err;
  }
}

async function syncTrialWorkCountsAfterApproval({
  client,
  freelancerUserId,
  now = new Date(),
} = {}) {
  const runner = client || pool;
  try {
    const settings = await getActivationEngineSettings(runner);
    if (!settings.engineEnabled) return { skipped: true };
    let trial = mapTrialRow(await loadTrialRow(runner, freelancerUserId));
    if (!trial) return { skipped: true };
    const usage = await countTrialBidUsage(runner, { freelancerUserId, trial, now });
    const { rows } = await runner.query(
      `UPDATE freelancer_activation_trials
          SET accepted_work_count = GREATEST(accepted_work_count, $2),
              published_work_count = GREATEST(published_work_count, $3),
              first_accepted_at = COALESCE(first_accepted_at, $4::timestamptz),
              updated_at = NOW()
        WHERE freelancer_user_id = $1
        RETURNING *`,
      [
        freelancerUserId,
        usage.acceptedWorkCount,
        usage.publishedWorkCount,
        now.toISOString(),
      ],
    );
    return { skipped: false, trial: mapTrialRow(rows[0]), usage };
  } catch (err) {
    if (isMissingSchema(err)) return { skipped: true };
    throw err;
  }
}

function trialBidGrantIdempotencyKey(trialId) {
  return `activation_trial_bid_grant:${Number(trialId)}`;
}

function trialHasCompletedBidGrant(trial) {
  return Boolean(trial?.trialBidGrantedAt && trial?.trialBidGrantReference);
}

async function stampTrialBidGrantMetadata(client, { trialId, grantId, amount, grantedAt }) {
  const { rows } = await client.query(
    `UPDATE freelancer_activation_trials
        SET trial_bid_granted_at = $2,
            trial_bid_grant_reference = $3,
            trial_bid_granted_amount = $4,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [trialId, new Date(grantedAt).toISOString(), String(grantId), amount],
  );
  return mapTrialRow(rows[0]);
}

/**
 * One-time trial Bid grant via existing Bid Credit ledger.
 * Idempotent on grant idempotency_key + trial grant columns.
 */
async function grantTrialBidCreditsOnce({
  client,
  trial,
  freelancerUserId,
  actor = {},
  now = new Date(),
} = {}) {
  if (trialHasCompletedBidGrant(trial)) {
    return { trial, granted: false, idempotent: true, grant: null };
  }
  const amount = toInt(trial?.trialBidLimit, FREELANCER_ACTIVATION_SETTINGS_DEFAULTS.trialBids);
  if (!Number.isInteger(amount) || amount < 1) {
    throw createAppError("Could not grant trial Bid Credits. The trial was not completed.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_GRANT_FAILED,
    });
  }
  if (!trial?.endsAt || new Date(trial.endsAt).getTime() <= now.getTime()) {
    throw createAppError("Could not grant trial Bid Credits. The trial was not completed.", 409, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_GRANT_FAILED,
    });
  }

  let out;
  try {
    out = await bidCreditAccounting.createBidCreditGrant({
      client,
      freelancerUserId,
      sourceType: FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
      amount,
      expiresAt: trial.endsAt,
      eventType: FREELANCER_ACTIVATION_TRIAL_BID_LEDGER_EVENT,
      idempotencyKey: trialBidGrantIdempotencyKey(trial.id),
      membershipId: trial.sourceMembershipId,
      reason: FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
      actorUserId: actor.actorUserId || actor.userId || null,
      referenceType: FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
      referenceId: String(trial.id),
      metadata: {
        trialId: trial.id,
        source: FREELANCER_ACTIVATION_TRIAL_BID_SOURCE,
      },
      grantedAt: now,
    });
  } catch (err) {
    if (err?.publicCode === FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_GRANT_FAILED) throw err;
    throw createAppError("Could not grant trial Bid Credits. The trial was not completed.", err?.statusCode || 503, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_GRANT_FAILED,
      meta: { causeCode: err?.publicCode || err?.code || null },
    });
  }

  const grantId = out.grant?.id;
  const grantedAmount = out.grant?.amountGranted || amount;
  const stamped = await stampTrialBidGrantMetadata(client, {
    trialId: trial.id,
    grantId,
    amount: grantedAmount,
    grantedAt: now,
  });
  if (!stamped || !trialHasCompletedBidGrant(stamped)) {
    throw createAppError("Could not grant trial Bid Credits. The trial was not completed.", 503, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.TRIAL_BID_GRANT_FAILED,
    });
  }

  await insertEvent(client, {
    freelancerUserId,
    trialId: trial.id,
    eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_BID_GRANTED,
    metadata: {
      grantId,
      amount: grantedAmount,
      expiresAt: trial.endsAt,
      recovered: Boolean(out.idempotent),
    },
  });

  return {
    trial: stamped,
    granted: !out.idempotent,
    idempotent: Boolean(out.idempotent),
    grant: out.grant,
  };
}

async function insertEvent(runner, { freelancerUserId, trialId, eventType, metadata }) {
  await runner.query(
    `INSERT INTO freelancer_activation_events (
       freelancer_user_id, trial_id, event_type, metadata
     ) VALUES ($1, $2, $3, $4::jsonb)`,
    [
      freelancerUserId,
      trialId || null,
      eventType,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
}

/**
 * Explicit trial start. Flag must be on. Grants trial Bid Credits once (A2.1).
 * Does not mutate memberships.
 */
async function activateFreelancerTrialIfEligible(userId, actor = {}, { client: externalClient = null, now = new Date() } = {}) {
  const freelancerUserId = Number(userId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("Invalid freelancer.", 400, {
      exposeToClient: true,
      publicCode: FREELANCER_ACTIVATION_ERROR_CODES.NOT_FREELANCER,
    });
  }

  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const settings = await getActivationEngineSettings(client);
    if (!settings.engineEnabled) {
      throw createAppError("Freelancer activation engine is disabled.", 403, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.ENGINE_DISABLED,
      });
    }

    await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [freelancerUserId]);
    const gathered = await gatherEligibility(client, freelancerUserId);
    if (!gathered.eligibility.isFreelancer) {
      throw createAppError("Only active freelancers can start this trial.", 403, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.NOT_FREELANCER,
      });
    }

    if (gathered.trial?.status === "trial_active") {
      const maybeExpired = await expireTrialIfNeeded(client, {
        freelancerUserId,
        trial: gathered.trial,
        now,
      });
      if (isTerminalTrialStatus(maybeExpired?.status)) {
        await insertEvent(client, {
          freelancerUserId,
          trialId: maybeExpired.id,
          eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATION_BLOCKED,
          metadata: { reason: "already_used", status: maybeExpired.status },
        });
        throw createAppError("This freelancer already used the one-time trial.", 409, {
          exposeToClient: true,
          publicCode: FREELANCER_ACTIVATION_ERROR_CODES.ALREADY_USED,
        });
      }
      const grantOut = await grantTrialBidCreditsOnce({
        client,
        trial: maybeExpired,
        freelancerUserId,
        actor,
        now,
      });
      await insertEvent(client, {
        freelancerUserId,
        trialId: grantOut.trial.id,
        eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATION_IDEMPOTENT,
        metadata: { actorUserId: actor.actorUserId || actor.userId || null },
      });
      if (own) await client.query("COMMIT");
      return {
        created: false,
        idempotent: true,
        trial: grantOut.trial,
        state: buildStatePayload({
          settings,
          eligibility: gathered.eligibility,
          trial: grantOut.trial,
          now,
        }),
      };
    }

    if (gathered.trial && isTerminalTrialStatus(gathered.trial.status)) {
      await insertEvent(client, {
        freelancerUserId,
        trialId: gathered.trial.id,
        eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATION_BLOCKED,
        metadata: { reason: "already_used", status: gathered.trial.status },
      });
      throw createAppError("This freelancer already used the one-time trial.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.ALREADY_USED,
      });
    }

    if (!isEligibleToActivate({ settings, eligibility: gathered.eligibility })) {
      await insertEvent(client, {
        freelancerUserId,
        trialId: gathered.trial?.id || null,
        eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATION_BLOCKED,
        metadata: { reason: "not_eligible", eligibility: gathered.eligibility },
      });
      throw createAppError("Freelancer is not eligible to start the trial.", 403, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.NOT_ELIGIBLE,
        meta: { eligibility: gathered.eligibility },
      });
    }

    const startedAt = now;
    const durationDays = settings.trialDurationDays;
    const endsAt = new Date(startedAt.getTime() + durationDays * 86400000);
    const sourceMembershipId =
      gathered.paid.currentTierCode === "starter" ? gathered.paid.currentMembershipId : null;

    let trialRow;
    if (gathered.trial && (gathered.trial.status === "not_started" || gathered.trial.status === "eligible")) {
      const { rows } = await client.query(
        `UPDATE freelancer_activation_trials SET
           status = 'trial_active',
           source_membership_id = COALESCE($2, source_membership_id),
           started_at = $3,
           ends_at = $4,
           trial_bid_limit = $5,
           daily_bid_limit = $6,
           trial_duration_days = $7,
           successful_work_cap = $8,
           updated_at = NOW()
         WHERE freelancer_user_id = $1
         RETURNING *`,
        [
          freelancerUserId,
          sourceMembershipId,
          startedAt.toISOString(),
          endsAt.toISOString(),
          settings.trialBids,
          settings.dailyBidLimit,
          durationDays,
          settings.successfulWorkCap,
        ],
      );
      trialRow = rows[0];
    } else {
      const { rows } = await client.query(
        `INSERT INTO freelancer_activation_trials (
           freelancer_user_id, status, source_membership_id,
           started_at, ends_at,
           trial_bid_limit, daily_bid_limit, trial_duration_days, successful_work_cap
         ) VALUES ($1, 'trial_active', $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          freelancerUserId,
          sourceMembershipId,
          startedAt.toISOString(),
          endsAt.toISOString(),
          settings.trialBids,
          settings.dailyBidLimit,
          durationDays,
          settings.successfulWorkCap,
        ],
      );
      trialRow = rows[0];
    }

    const trialCreated = mapTrialRow(trialRow);
    await insertEvent(client, {
      freelancerUserId,
      trialId: trialCreated.id,
      eventType: FREELANCER_ACTIVATION_EVENT_TYPES.TRIAL_ACTIVATED,
      metadata: {
        actorUserId: actor.actorUserId || actor.userId || null,
        trialBidLimit: settings.trialBids,
        dailyBidLimit: settings.dailyBidLimit,
        trialDurationDays: durationDays,
        successfulWorkCap: settings.successfulWorkCap,
        sourceMembershipId,
      },
    });
    const grantOut = await grantTrialBidCreditsOnce({
      client,
      trial: trialCreated,
      freelancerUserId,
      actor,
      now,
    });
    const trial = grantOut.trial;

    if (own) await client.query("COMMIT");
    const eligibility = {
      ...gathered.eligibility,
      alreadyUsedTrial: true,
    };
    return {
      created: true,
      idempotent: false,
      trial,
      state: buildStatePayload({ settings, eligibility, trial, now }),
    };
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (isMissingSchema(err)) {
      throw createAppError("Freelancer activation schema is not applied.", 503, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SCHEMA_MISSING,
      });
    }
    if (err?.code === "23505") {
      throw createAppError("This freelancer already used the one-time trial.", 409, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.ALREADY_USED,
      });
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function updateActivationEngineSettings(patch = {}, { client: externalClient = null, actorUserId = null } = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");
    const current = await getActivationEngineSettings(client);
    const next = { ...current };
    if (patch.engineEnabled !== undefined) next.engineEnabled = Boolean(patch.engineEnabled);
    if (patch.trialDurationDays !== undefined) next.trialDurationDays = toInt(patch.trialDurationDays, current.trialDurationDays);
    if (patch.trialBids !== undefined) next.trialBids = toInt(patch.trialBids, current.trialBids);
    if (patch.dailyBidLimit !== undefined) next.dailyBidLimit = toInt(patch.dailyBidLimit, current.dailyBidLimit);
    if (patch.successfulWorkCap !== undefined) next.successfulWorkCap = toInt(patch.successfulWorkCap, current.successfulWorkCap);
    if (patch.requiresTraining !== undefined) next.requiresTraining = Boolean(patch.requiresTraining);
    if (patch.requiresVerification !== undefined) next.requiresVerification = Boolean(patch.requiresVerification);
    if (patch.silverPlanCode !== undefined) next.silverPlanCode = normalizeSilverPlanCode(patch.silverPlanCode);
    if (patch.archiveAfterDays !== undefined) next.archiveAfterDays = toInt(patch.archiveAfterDays, current.archiveAfterDays);
    if (patch.workInventoryEnabled !== undefined) next.workInventoryEnabled = Boolean(patch.workInventoryEnabled);
    if (patch.workInventoryPercentage !== undefined) {
      const n = Number(patch.workInventoryPercentage);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw createAppError("Work inventory percentage must be between 0 and 100.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_WORK_INVENTORY_PERCENTAGE",
        });
      }
      next.workInventoryPercentage = n;
    }

    try {
      await client.query(
        `UPDATE marketplace_economy_settings SET
           freelancer_activation_engine_enabled = $2,
           freelancer_activation_trial_duration_days = $3,
           freelancer_activation_trial_bids = $4,
           freelancer_activation_daily_bid_limit = $5,
           freelancer_activation_successful_work_cap = $6,
           freelancer_activation_requires_training = $7,
           freelancer_activation_requires_verification = $8,
           freelancer_activation_silver_plan_code = $9,
           freelancer_activation_archive_after_days = $10,
           freelancer_activation_work_inventory_enabled = $11,
           freelancer_activation_work_inventory_percentage = $12,
           updated_at = NOW()
         WHERE id = $1`,
        [
          1,
          next.engineEnabled,
          next.trialDurationDays,
          next.trialBids,
          next.dailyBidLimit,
          next.successfulWorkCap,
          next.requiresTraining,
          next.requiresVerification,
          next.silverPlanCode,
          next.archiveAfterDays,
          next.workInventoryEnabled,
          next.workInventoryPercentage,
        ],
      );
    } catch (err) {
      if (err?.code !== "42703") throw err;
      if (
        patch.workInventoryEnabled !== undefined ||
        patch.workInventoryPercentage !== undefined
      ) {
        throw createAppError(
          "Work Inventory Reserve settings require migration 172.",
          503,
          {
            exposeToClient: true,
            publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SCHEMA_MISSING,
          },
        );
      }
      await client.query(
        `UPDATE marketplace_economy_settings SET
           freelancer_activation_engine_enabled = $2,
           freelancer_activation_trial_duration_days = $3,
           freelancer_activation_trial_bids = $4,
           freelancer_activation_daily_bid_limit = $5,
           freelancer_activation_successful_work_cap = $6,
           freelancer_activation_requires_training = $7,
           freelancer_activation_requires_verification = $8,
           freelancer_activation_silver_plan_code = $9,
           freelancer_activation_archive_after_days = $10,
           updated_at = NOW()
         WHERE id = $1`,
        [
          1,
          next.engineEnabled,
          next.trialDurationDays,
          next.trialBids,
          next.dailyBidLimit,
          next.successfulWorkCap,
          next.requiresTraining,
          next.requiresVerification,
          next.silverPlanCode,
          next.archiveAfterDays,
        ],
      );
    }
    if (own) await client.query("COMMIT");
    return getActivationEngineSettings(client);
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (isMissingSchema(err)) {
      throw createAppError("Freelancer activation schema is not applied.", 503, {
        exposeToClient: true,
        publicCode: FREELANCER_ACTIVATION_ERROR_CODES.SCHEMA_MISSING,
      });
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

async function getSuperAdminActivationOverview({ client = null, recentLimit = 25 } = {}) {
  const runner = client || pool;
  const settings = await getActivationEngineSettings(runner);
  const limit = Math.min(Math.max(Number(recentLimit) || 25, 1), 100);
  const conversionService = require("./freelancerActivationConversionService");
  try {
    const [counts, recent, conversion] = await Promise.all([
      runner.query(
        `SELECT status, COUNT(*)::int AS count
           FROM freelancer_activation_trials
          GROUP BY status`,
      ),
      runner.query(
        `SELECT t.*, u.email
           FROM freelancer_activation_trials t
           JOIN users u ON u.id = t.freelancer_user_id
          ORDER BY t.updated_at DESC
          LIMIT $1`,
        [limit],
      ),
      conversionService.getSuperAdminConversionCounters({ client: runner }),
    ]);
    const byStatus = {};
    for (const row of counts.rows) {
      byStatus[row.status] = Number(row.count) || 0;
    }
    return {
      settings: { engineEnabled: settings.engineEnabled, ...settings },
      countsByStatus: byStatus,
      conversion,
      recentTrials: recent.rows.map((row) => ({
        ...mapTrialRow(row),
        email: row.email || null,
      })),
    };
  } catch (err) {
    if (isMissingSchema(err)) {
      return {
        settings: { engineEnabled: false, ...FREELANCER_ACTIVATION_SETTINGS_DEFAULTS },
        countsByStatus: {},
        conversion: {
          ctaShownCount: 0,
          paymentStartedCount: 0,
          paidActiveCount: 0,
          trialToSilverRate: null,
        },
        recentTrials: [],
        schemaReady: false,
      };
    }
    throw err;
  }
}

module.exports = {
  getActivationEngineSettings,
  getFreelancerActivationTrialState,
  activateFreelancerTrialIfEligible,
  grantTrialBidCreditsOnce,
  trialBidGrantIdempotencyKey,
  getSuperAdminActivationOverview,
  updateActivationEngineSettings,
  evaluateTrialMiniArticleApplyGate,
  assertTrialEligibleForMiniArticleApply,
  countTrialUsageFromRows,
  countTrialBidUsage,
  expireTrialIfNeeded,
  applicationCountsTowardTrialBid,
  markTrialFirstBidIfNeeded,
  syncTrialWorkCountsAfterApproval,
  emptyTrialUsage,
  mapSettingsRow,
  mapTrialRow,
  computeDaysRemaining,
  isEligibleToActivate,
  resolveNextRequiredAction,
  userFacingMessage,
  buildStatePayload,
  loadPaidMembership,
  loadTrialRow,
  insertEvent,
  FREELANCER_ACTIVATION_SETTINGS_DEFAULTS,
};
