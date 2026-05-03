const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const { pool } = require("../config/db");
const emailService = require("./emailService");
const { createAppError } = require("../utils/AppError");
const { createPublicApiError } = require("../utils/publicApiError");
const { GENERIC_5XX_AR } = require("../constants/apiErrors");

const PURPOSE_REGISTER = "register";
const PURPOSE_FORGOT = "forgot_password";

const BCRYPT_OTP_ROUNDS = 10;
const BCRYPT_RESET_ROUNDS = 10;

const OTP_REGISTER_TTL_MIN = 10;
const OTP_FORGOT_TTL_MIN = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_OTP_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MIN = 15;

function normalizeEmail(e) {
  return String(e || "")
    .trim()
    .toLowerCase();
}

function generateSixDigitOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Enumeration-safe delay (mirrors forgot-password unknown-email path; timing normalization). */
async function sleepEnumerationSafeJitterMs() {
  const ms = crypto.randomInt(90, 181);
  await new Promise((r) => setTimeout(r, ms));
}

async function invalidateOpenOtps(client, emailNorm, purpose) {
  await client.query(
    `UPDATE auth_otps
     SET consumed_at = NOW(), updated_at = NOW()
     WHERE lower(email::text) = lower($1::text) AND purpose = $2::text AND consumed_at IS NULL`,
    [String(emailNorm), String(purpose)],
  );
}

/**
 * @param {import("pg").PoolClient} [client]
 */
async function insertRegistrationOtp({ userId, email }, client = null) {
  const emailNorm = normalizeEmail(email);
  const otpPlain = generateSixDigitOtp();
  const otpHash = await bcrypt.hash(otpPlain, BCRYPT_OTP_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_REGISTER_TTL_MIN * 60 * 1000);
  const now = new Date();

  const run = async (c) => {
    await invalidateOpenOtps(c, emailNorm, PURPOSE_REGISTER);
    await c.query(
      `INSERT INTO auth_otps (
        email, user_id, purpose, otp_hash, expires_at, last_sent_at, created_at, updated_at
      ) VALUES (lower($1::text), $2::bigint, $3::text, $4::text, $5::timestamptz, $6::timestamptz, $6::timestamptz, $6::timestamptz)`,
      [String(emailNorm), Number(userId), PURPOSE_REGISTER, otpHash, expiresAt, now],
    );
    await emailService.sendRegisterOtpEmail(emailNorm, otpPlain);
  };

  if (client) {
    await run(client);
  } else {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await run(c);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}

async function verifyRegistrationOtp(emailRaw, otpPlain) {
  const emailNorm = normalizeEmail(emailRaw);
  const otp = String(otpPlain || "").trim();
  if (!/^\d{6}$/.test(otp)) {
    throw createPublicApiError("رمز التحقق غير صحيح.", 400, "INVALID_OTP");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM auth_otps
       WHERE lower(email::text) = lower($1::text) AND purpose = $2::text AND consumed_at IS NULL
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [String(emailNorm), String(PURPOSE_REGISTER)],
    );
    const row = rows[0];
    if (!row || !row.otp_hash) {
      await client.query("ROLLBACK");
      throw createPublicApiError("انتهت صلاحية رمز التحقق.", 400, "OTP_EXPIRED");
    }
    if (new Date(row.expires_at) <= new Date()) {
      await client.query(
        `UPDATE auth_otps SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1::bigint`,
        [Number(row.id)],
      );
      await client.query("COMMIT");
      throw createPublicApiError("انتهت صلاحية رمز التحقق.", 400, "OTP_EXPIRED");
    }
    if (row.attempts_count >= MAX_OTP_ATTEMPTS) {
      await client.query("ROLLBACK");
      throw createPublicApiError("تم تجاوز عدد المحاولات.", 429, "OTP_ATTEMPTS_EXCEEDED");
    }

    const match = await bcrypt.compare(otp, row.otp_hash);
    if (!match) {
      const nextAttempts = row.attempts_count + 1;
      const updates =
        nextAttempts >= MAX_OTP_ATTEMPTS
          ? `attempts_count = $2::int, consumed_at = NOW(), updated_at = NOW()`
          : `attempts_count = $2::int, updated_at = NOW()`;
      await client.query(`UPDATE auth_otps SET ${updates} WHERE id = $1::bigint`, [
        Number(row.id),
        Number(nextAttempts),
      ]);
      await client.query("COMMIT");
      throw createPublicApiError("رمز التحقق غير صحيح.", 400, "INVALID_OTP");
    }

    await client.query(`UPDATE auth_otps SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1::bigint`, [
      Number(row.id),
    ]);
    await client.query(`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1::bigint`, [
      Number(row.user_id),
    ]);
    await client.query("COMMIT");
    return Number(row.user_id);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    if (typeof e.statusCode === "number") {
      throw e;
    }
    // eslint-disable-next-line no-console
    console.error("[verifyRegistrationOtp] unexpected error", e);
    throw createAppError(GENERIC_5XX_AR, 500, {
      exposeToClient: true,
      publicCode: "OTP_VERIFY_FAILED",
      cause: e,
    });
  } finally {
    client.release();
  }
}

/**
 * Resend registration OTP: enumeration-safe for unknown emails and already-verified emails.
 * - Unknown email: no OTP sent; optional jitter; returns void (caller sends generic 200).
 * - Verified email: same as unknown (does not reveal registration state).
 * - Unverified email: cooldown from last register OTP send; then send via Resend (same as before).
 */
async function resendRegistrationOtp(emailRaw) {
  const emailNorm = normalizeEmail(emailRaw);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: uRows } = await client.query(
      `SELECT id, email_verified FROM users WHERE lower(email::text) = lower($1::text) LIMIT 1 FOR UPDATE`,
      [String(emailNorm)],
    );
    const user = uRows[0];
    if (!user) {
      await client.query("ROLLBACK");
      await sleepEnumerationSafeJitterMs();
      return;
    }
    if (user.email_verified) {
      await client.query("ROLLBACK");
      await sleepEnumerationSafeJitterMs();
      return;
    }

    const { rows: lastRows } = await client.query(
      `SELECT last_sent_at FROM auth_otps
       WHERE lower(email::text) = lower($1::text) AND purpose = $2::text
       ORDER BY id DESC
       LIMIT 1`,
      [String(emailNorm), String(PURPOSE_REGISTER)],
    );
    const last = lastRows[0];
    if (last && new Date(last.last_sent_at).getTime() + RESEND_COOLDOWN_SEC * 1000 > Date.now()) {
      await client.query("ROLLBACK");
      throw createPublicApiError(`يرجى الانتظار ${RESEND_COOLDOWN_SEC} ثانية قبل إعادة الإرسال.`, 429, "RATE_LIMITED");
    }

    const otpPlain = generateSixDigitOtp();
    const otpHash = await bcrypt.hash(otpPlain, BCRYPT_OTP_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_REGISTER_TTL_MIN * 60 * 1000);
    const now = new Date();

    await invalidateOpenOtps(client, emailNorm, PURPOSE_REGISTER);
    await client.query(
      `INSERT INTO auth_otps (
        email, user_id, purpose, otp_hash, expires_at, last_sent_at, created_at, updated_at
      ) VALUES (lower($1::text), $2::bigint, $3::text, $4::text, $5::timestamptz, $6::timestamptz, $6::timestamptz, $6::timestamptz)`,
      [String(emailNorm), Number(user.id), PURPOSE_REGISTER, otpHash, expiresAt, now],
    );
    await emailService.sendRegisterOtpEmail(emailNorm, otpPlain);
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Forgot-password request: never reveals whether the email is registered.
 * - Unknown email: no email sent; `sleepEnumerationSafeJitterMs` (enumeration + timing).
 * - Known email: cooldown 60s from last forgot OTP send; then hash OTP, invalidate old rows, send via Resend.
 */
async function requestForgotPasswordOtp(emailRaw) {
  const emailNorm = normalizeEmail(emailRaw);
  const { rows: uRows } = await pool.query(
    `SELECT id FROM users WHERE lower(email::text) = lower($1::text) AND is_active = TRUE LIMIT 1`,
    [String(emailNorm)],
  );
  const user = uRows[0];
  if (!user) {
    await sleepEnumerationSafeJitterMs();
    return;
  }

  const { rows: lastForgotRows } = await pool.query(
    `SELECT last_sent_at FROM auth_otps
     WHERE lower(email::text) = lower($1::text) AND purpose = $2::text
     ORDER BY id DESC
     LIMIT 1`,
    [String(emailNorm), String(PURPOSE_FORGOT)],
  );
  const lastForgot = lastForgotRows[0];
  if (lastForgot && new Date(lastForgot.last_sent_at).getTime() + RESEND_COOLDOWN_SEC * 1000 > Date.now()) {
    throw createPublicApiError("يرجى الانتظار قبل طلب رمز جديد", 429, "RATE_LIMITED");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const otpPlain = generateSixDigitOtp();
    const otpHash = await bcrypt.hash(otpPlain, BCRYPT_OTP_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_FORGOT_TTL_MIN * 60 * 1000);
    const now = new Date();

    await invalidateOpenOtps(client, emailNorm, PURPOSE_FORGOT);
    await client.query(
      `INSERT INTO auth_otps (
        email, user_id, purpose, otp_hash, expires_at, last_sent_at, created_at, updated_at
      ) VALUES (lower($1::text), $2::bigint, $3::text, $4::text, $5::timestamptz, $6::timestamptz, $6::timestamptz, $6::timestamptz)`,
      [String(emailNorm), Number(user.id), PURPOSE_FORGOT, otpHash, expiresAt, now],
    );
    await emailService.sendForgotPasswordOtpEmail(emailNorm, otpPlain);
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    if (e && typeof e.statusCode === "number" && e.exposeToClient === true) {
      throw e;
    }
    // eslint-disable-next-line no-console
    console.error("[requestForgotPasswordOtp] unexpected error", e);
    throw createAppError(GENERIC_5XX_AR, 500, {
      exposeToClient: true,
      publicCode: "FAILED_TO_SEND_OTP",
      cause: e,
    });
  } finally {
    client.release();
  }
}

async function verifyForgotPasswordOtp(emailRaw, otpPlain) {
  const emailNorm = normalizeEmail(emailRaw);
  const otp = String(otpPlain || "").trim();
  if (!/^\d{6}$/.test(otp)) {
    throw createPublicApiError("رمز التحقق غير صحيح.", 400, "INVALID_OTP");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM auth_otps
       WHERE lower(email::text) = lower($1::text) AND purpose = $2::text AND consumed_at IS NULL AND otp_hash IS NOT NULL
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [String(emailNorm), String(PURPOSE_FORGOT)],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      throw createPublicApiError("انتهت صلاحية رمز التحقق.", 400, "OTP_EXPIRED");
    }
    if (new Date(row.expires_at) <= new Date()) {
      await client.query(
        `UPDATE auth_otps SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1::bigint`,
        [Number(row.id)],
      );
      await client.query("COMMIT");
      throw createPublicApiError("انتهت صلاحية رمز التحقق.", 400, "OTP_EXPIRED");
    }
    if (row.attempts_count >= MAX_OTP_ATTEMPTS) {
      await client.query("ROLLBACK");
      throw createPublicApiError("تم تجاوز عدد المحاولات.", 429, "OTP_ATTEMPTS_EXCEEDED");
    }

    const match = await bcrypt.compare(otp, row.otp_hash);
    if (!match) {
      const nextAttempts = row.attempts_count + 1;
      const updates =
        nextAttempts >= MAX_OTP_ATTEMPTS
          ? `attempts_count = $2::int, consumed_at = NOW(), updated_at = NOW()`
          : `attempts_count = $2::int, updated_at = NOW()`;
      await client.query(`UPDATE auth_otps SET ${updates} WHERE id = $1::bigint`, [
        Number(row.id),
        Number(nextAttempts),
      ]);
      await client.query("COMMIT");
      throw createPublicApiError("رمز التحقق غير صحيح.", 400, "INVALID_OTP");
    }

    const resetTokenPlain = generateResetToken();
    const resetHash = await bcrypt.hash(resetTokenPlain, BCRYPT_RESET_ROUNDS);
    const resetExp = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

    await client.query(
      `UPDATE auth_otps
       SET otp_hash = NULL,
           reset_token_hash = $2::text,
           reset_token_expires_at = $3::timestamptz,
           updated_at = NOW()
       WHERE id = $1::bigint`,
      [Number(row.id), resetHash, resetExp],
    );
    await client.query("COMMIT");
    return { resetToken: resetTokenPlain };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    if (typeof e.statusCode === "number") {
      throw e;
    }
    // eslint-disable-next-line no-console
    console.error("[verifyForgotPasswordOtp] unexpected error", e);
    throw createAppError(GENERIC_5XX_AR, 500, {
      exposeToClient: true,
      publicCode: "OTP_VERIFY_FAILED",
      cause: e,
    });
  } finally {
    client.release();
  }
}

async function resetPasswordWithToken(emailRaw, resetTokenPlain, newPassword) {
  const bcryptMod = require("bcrypt");
  const BCRYPT_ROUNDS = 12;
  const emailNorm = normalizeEmail(emailRaw);
  const token = String(resetTokenPlain || "").trim();
  if (token.length < 10) {
    throw createPublicApiError("رمز إعادة التعيين غير صالح أو منتهٍ.", 400, "RESET_TOKEN_INVALID");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM auth_otps
       WHERE lower(email::text) = lower($1::text) AND purpose = $2::text AND consumed_at IS NULL
         AND otp_hash IS NULL AND reset_token_hash IS NOT NULL
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [String(emailNorm), String(PURPOSE_FORGOT)],
    );
    const row = rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      throw createPublicApiError("رمز إعادة التعيين غير صالح أو منتهٍ.", 400, "RESET_TOKEN_INVALID");
    }
    if (!row.reset_token_expires_at || new Date(row.reset_token_expires_at) <= new Date()) {
      await client.query(
        `UPDATE auth_otps SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1::bigint`,
        [Number(row.id)],
      );
      await client.query("COMMIT");
      throw createPublicApiError("رمز إعادة التعيين غير صالح أو منتهٍ.", 400, "RESET_TOKEN_INVALID");
    }

    const tokenOk = await bcrypt.compare(token, row.reset_token_hash);
    if (!tokenOk) {
      await client.query("ROLLBACK");
      throw createPublicApiError("رمز إعادة التعيين غير صالح أو منتهٍ.", 400, "RESET_TOKEN_INVALID");
    }

    const { rows: uRows } = await client.query(
      `SELECT id FROM users WHERE lower(email::text) = lower($1::text) LIMIT 1 FOR UPDATE`,
      [String(emailNorm)],
    );
    const uid = uRows[0]?.id;
    if (!uid || Number(uid) !== Number(row.user_id)) {
      await client.query("ROLLBACK");
      throw createPublicApiError("رمز إعادة التعيين غير صالح أو منتهٍ.", 400, "RESET_TOKEN_INVALID");
    }

    const passwordHash = await bcryptMod.hash(newPassword, BCRYPT_ROUNDS);
    await client.query(
      `UPDATE users SET password_hash = $1::text, updated_at = NOW() WHERE id = $2::bigint`,
      [passwordHash, Number(uid)],
    );
    await client.query(`UPDATE auth_otps SET consumed_at = NOW(), updated_at = NOW() WHERE id = $1::bigint`, [
      Number(row.id),
    ]);
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    if (typeof e.statusCode === "number") {
      throw e;
    }
    // eslint-disable-next-line no-console
    console.error("[resetPasswordWithToken] unexpected error", e);
    throw createAppError(GENERIC_5XX_AR, 500, {
      exposeToClient: true,
      publicCode: "PASSWORD_RESET_FAILED",
      cause: e,
    });
  } finally {
    client.release();
  }
}

module.exports = {
  insertRegistrationOtp,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  requestForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPasswordWithToken,
  PURPOSE_REGISTER,
  PURPOSE_FORGOT,
};
