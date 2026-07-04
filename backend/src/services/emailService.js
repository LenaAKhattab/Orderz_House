const { Resend } = require("resend");
const { createAppError } = require("../utils/AppError");

/** User-facing copy when OTP email cannot be delivered (never forward vendor text). */
const SAFE_OTP_EMAIL_AR = "تعذر إرسال رسالة رمز التحقق. يمكنك إعادة إرسال الرمز من نفس الصفحة.";

const EMAIL_SEND_TIMEOUT_MS = Number(process.env.EMAIL_SEND_TIMEOUT_MS || 12000);

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw createAppError(SAFE_OTP_EMAIL_AR, 503, {
      exposeToClient: true,
      publicCode: "EMAIL_SERVICE_UNAVAILABLE",
      otpPersisted: true,
    });
  }
  return new Resend(key);
}

function fromAddress() {
  return process.env.EMAIL_FROM || "noreply@orderzhouse.com";
}

function devLogOtp(kind, email) {
  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(`[email:dev] ${kind} → ${email} | OTP redacted (set RESEND_API_KEY to send real mail)`);
    return true;
  }
  return false;
}

/**
 * Fail fast when the email provider hangs — never block the API indefinitely.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 */
function withEmailSendTimeout(promise, ms = EMAIL_SEND_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        createAppError(SAFE_OTP_EMAIL_AR, 503, {
          exposeToClient: true,
          publicCode: "FAILED_TO_SEND_OTP",
          otpPersisted: true,
        }),
      );
    }, ms);
    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function wrapOtpEmailError(error) {
  if (error && typeof error.statusCode === "number" && error.exposeToClient === true) {
    if (error.publicCode === "FAILED_TO_SEND_OTP" || error.publicCode === "EMAIL_SERVICE_UNAVAILABLE") {
      error.otpPersisted = true;
    }
    return error;
  }
  return createAppError(SAFE_OTP_EMAIL_AR, 503, {
    exposeToClient: true,
    publicCode: "FAILED_TO_SEND_OTP",
    otpPersisted: true,
    cause: error,
  });
}

/**
 * @param {string} email
 * @param {string} otpPlain six digits
 */
async function sendRegisterOtpEmail(email, otpPlain) {
  if (devLogOtp("register", email)) {
    return { id: "dev_console" };
  }
  const resend = getResend();
  try {
    const { data, error } = await withEmailSendTimeout(
      resend.emails.send({
        from: fromAddress(),
        to: [email],
        subject: "رمز تأكيد الحساب",
        html: `
      <div dir="rtl" style="font-family: system-ui, sans-serif; line-height: 1.6;">
        <p>أهلاً بك في أوردرز هاوس</p>
        <p>رمز التحقق الخاص بك هو: <strong style="font-size: 1.25rem; letter-spacing: 0.2em;">${otpPlain}</strong></p>
        <p>صالح لمدة 10 دقائق.</p>
      </div>
    `,
      }),
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[Resend] sendRegisterOtpEmail failed", { email, error });
      throw wrapOtpEmailError(error);
    }
    return data;
  } catch (err) {
    throw wrapOtpEmailError(err);
  }
}

/**
 * @param {string} email
 * @param {string} otpPlain six digits
 */
async function sendForgotPasswordOtpEmail(email, otpPlain) {
  if (devLogOtp("forgot_password", email)) {
    return { id: "dev_console" };
  }
  const resend = getResend();
  try {
    const { data, error } = await withEmailSendTimeout(
      resend.emails.send({
        from: fromAddress(),
        to: [email],
        subject: "رمز إعادة تعيين كلمة المرور",
        html: `
      <div dir="rtl" style="font-family: system-ui, sans-serif; line-height: 1.6;">
        <p>استخدم هذا الرمز لإعادة تعيين كلمة المرور:</p>
        <p><strong style="font-size: 1.25rem; letter-spacing: 0.2em;">${otpPlain}</strong></p>
        <p>صالح لمدة 10 دقائق.</p>
        <p>إذا لم تطلب ذلك، تجاهل الرسالة.</p>
      </div>
    `,
      }),
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.error("[Resend] sendForgotPasswordOtpEmail failed", { email, error });
      throw wrapOtpEmailError(error);
    }
    return data;
  } catch (err) {
    throw wrapOtpEmailError(err);
  }
}

/**
 * Sends an internal admin notification email (HTML) for a newly-paid subscription.
 * Best-effort: callers wrap this in try/catch (safeNotify) so a delivery failure never breaks the payment flow.
 * In development without RESEND_API_KEY, logs a safe summary to the console instead of sending.
 * @param {{ to: string, subject: string, html: string }} params
 */
async function sendPaidSubscriptionAdminEmail({ to, subject, html } = {}) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw createAppError("Missing admin notification recipient.", 400, {
      publicCode: "MISSING_ADMIN_NOTIFICATION_RECIPIENT",
    });
  }

  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email:dev] paid_subscription_admin_notification → ${recipient} | ${subject} (set RESEND_API_KEY to send real mail)`,
    );
    return { id: "dev_console" };
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw createAppError("Email service is not configured (RESEND_API_KEY missing).", 503, {
      publicCode: "EMAIL_SERVICE_UNAVAILABLE",
    });
  }

  const resend = new Resend(key);
  const { data, error } = await withEmailSendTimeout(
    resend.emails.send({
      from: fromAddress(),
      to: [recipient],
      subject,
      html,
    }),
  );
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Resend] sendPaidSubscriptionAdminEmail failed", { to: recipient, error });
    throw createAppError("Failed to send admin subscription notification email.", 503, {
      publicCode: "FAILED_TO_SEND_ADMIN_SUBSCRIPTION_EMAIL",
      cause: error,
    });
  }
  return data;
}

module.exports = {
  sendRegisterOtpEmail,
  sendForgotPasswordOtpEmail,
  sendPaidSubscriptionAdminEmail,
  EMAIL_SEND_TIMEOUT_MS,
};
