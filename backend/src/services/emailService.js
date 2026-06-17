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

module.exports = {
  sendRegisterOtpEmail,
  sendForgotPasswordOtpEmail,
  EMAIL_SEND_TIMEOUT_MS,
};
