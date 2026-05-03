const { Resend } = require("resend");
const { createAppError } = require("../utils/AppError");

/** User-facing copy for any email send failure (never forward vendor text). */
const SAFE_OTP_EMAIL_AR = "تعذر إرسال رمز التحقق، حاول لاحقاً";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw createAppError(SAFE_OTP_EMAIL_AR, 503, {
      exposeToClient: true,
      publicCode: "EMAIL_SERVICE_UNAVAILABLE",
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
 * @param {string} email
 * @param {string} otpPlain six digits
 */
async function sendRegisterOtpEmail(email, otpPlain) {
  if (devLogOtp("register", email)) {
    return { id: "dev_console" };
  }
  const resend = getResend();
  const { data, error } = await resend.emails.send({
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
  });
  if (error) {
    // Never forward Resend / vendor messages to clients
    // eslint-disable-next-line no-console
    console.error("[Resend] sendRegisterOtpEmail failed", { email, error });
    throw createAppError(SAFE_OTP_EMAIL_AR, 503, {
      exposeToClient: true,
      publicCode: "FAILED_TO_SEND_OTP",
      cause: error,
    });
  }
  return data;
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
  const { data, error } = await resend.emails.send({
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
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[Resend] sendForgotPasswordOtpEmail failed", { email, error });
    throw createAppError(SAFE_OTP_EMAIL_AR, 503, {
      exposeToClient: true,
      publicCode: "FAILED_TO_SEND_OTP",
      cause: error,
    });
  }
  return data;
}

module.exports = {
  sendRegisterOtpEmail,
  sendForgotPasswordOtpEmail,
};
