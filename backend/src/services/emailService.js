const { Resend } = require("resend");
const { createAppError } = require("../utils/AppError");
const { normalizeOtpEmailLocale, DEFAULT_OTP_EMAIL_LOCALE } = require("../utils/requestLocale");

/** User-facing copy when OTP email cannot be delivered (never forward vendor text). */
const SAFE_OTP_EMAIL_AR = "تعذر إرسال رسالة رمز التحقق. يمكنك إعادة إرسال الرمز من نفس الصفحة.";

const OTP_STRONG = 'font-size: 1.25rem; letter-spacing: 0.2em;';

/** @type {Record<string, { subject: string; dir: "rtl"|"ltr"; lines: (otp: string) => string[] }>} */
const REGISTER_OTP_COPY = {
  ar: {
    subject: "رمز تأكيد الحساب — Orderz House",
    dir: "rtl",
    lines: (otp) => [
      "أهلاً بك في Orderz House",
      `رمز التحقق الخاص بك هو: <strong style="${OTP_STRONG}">${otp}</strong>`,
      "صالح لمدة 10 دقائق.",
    ],
  },
  en: {
    subject: "Your Orderz House verification code",
    dir: "ltr",
    lines: (otp) => [
      "Welcome to Orderz House",
      `Your verification code is: <strong style="${OTP_STRONG}">${otp}</strong>`,
      "It is valid for 10 minutes.",
    ],
  },
  de: {
    subject: "Ihr Bestätigungscode für Orderz House",
    dir: "ltr",
    lines: (otp) => [
      "Willkommen bei Orderz House",
      `Ihr Bestätigungscode lautet: <strong style="${OTP_STRONG}">${otp}</strong>`,
      "Er ist 10 Minuten gültig.",
    ],
  },
  nl: {
    subject: "Uw verificatiecode voor Orderz House",
    dir: "ltr",
    lines: (otp) => [
      "Welkom bij Orderz House",
      `Uw verificatiecode is: <strong style="${OTP_STRONG}">${otp}</strong>`,
      "De code is 10 minuten geldig.",
    ],
  },
  ro: {
    subject: "Codul dvs. de verificare Orderz House",
    dir: "ltr",
    lines: (otp) => [
      "Bun venit la Orderz House",
      `Codul dvs. de verificare este: <strong style="${OTP_STRONG}">${otp}</strong>`,
      "Este valabil 10 minute.",
    ],
  },
};

/** @type {Record<string, { subject: string; dir: "rtl"|"ltr"; lines: (otp: string) => string[] }>} */
const FORGOT_OTP_COPY = {
  ar: {
    subject: "رمز إعادة تعيين كلمة المرور — Orderz House",
    dir: "rtl",
    lines: (otp) => [
      "استخدم هذا الرمز لإعادة تعيين كلمة المرور:",
      `<strong style="${OTP_STRONG}">${otp}</strong>`,
      "صالح لمدة 10 دقائق.",
      "إذا لم تطلب ذلك، تجاهل الرسالة.",
    ],
  },
  en: {
    subject: "Your Orderz House password reset code",
    dir: "ltr",
    lines: (otp) => [
      "Use this code to reset your password:",
      `<strong style="${OTP_STRONG}">${otp}</strong>`,
      "It is valid for 10 minutes.",
      "If you did not request this, you can ignore this email.",
    ],
  },
  de: {
    subject: "Ihr Code zum Zurücksetzen des Passworts — Orderz House",
    dir: "ltr",
    lines: (otp) => [
      "Verwenden Sie diesen Code, um Ihr Passwort zurückzusetzen:",
      `<strong style="${OTP_STRONG}">${otp}</strong>`,
      "Er ist 10 Minuten gültig.",
      "Wenn Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail.",
    ],
  },
  nl: {
    subject: "Uw code voor het resetten van uw wachtwoord — Orderz House",
    dir: "ltr",
    lines: (otp) => [
      "Gebruik deze code om uw wachtwoord te resetten:",
      `<strong style="${OTP_STRONG}">${otp}</strong>`,
      "De code is 10 minuten geldig.",
      "Als u dit niet heeft aangevraagd, kunt u deze e-mail negeren.",
    ],
  },
  ro: {
    subject: "Codul dvs. pentru resetarea parolei — Orderz House",
    dir: "ltr",
    lines: (otp) => [
      "Utilizați acest cod pentru a vă reseta parola:",
      `<strong style="${OTP_STRONG}">${otp}</strong>`,
      "Este valabil 10 minute.",
      "Dacă nu ați solicitat acest lucru, ignorați acest e-mail.",
    ],
  },
};

function buildOtpEmailHtml(copy, otpPlain) {
  const paragraphs = copy.lines(String(otpPlain))
    .map((line) => `<p>${line}</p>`)
    .join("\n        ");
  return `
      <div dir="${copy.dir}" style="font-family: system-ui, sans-serif; line-height: 1.6;">
        ${paragraphs}
      </div>
    `;
}

function resolveOtpCopy(map, locale) {
  const loc = normalizeOtpEmailLocale(locale) || DEFAULT_OTP_EMAIL_LOCALE;
  return map[loc] || map[DEFAULT_OTP_EMAIL_LOCALE];
}

const EMAIL_SEND_TIMEOUT_MS = Number(process.env.EMAIL_SEND_TIMEOUT_MS || 12000);

/**
 * Explicit local mock email delivery.
 * Production can never mock — even if EMAIL_DELIVERY_MODE=mock is mis-set.
 * Also activates in development when RESEND_API_KEY is unset (legacy local path).
 * Does NOT activate merely because Resend returns an error.
 */
function isMockEmailDeliveryEnabled() {
  if (process.env.NODE_ENV === "production") return false;

  const mode = String(process.env.EMAIL_DELIVERY_MODE || "")
    .trim()
    .toLowerCase();
  if (mode === "mock") {
    return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  }

  if (process.env.NODE_ENV === "development" && !process.env.RESEND_API_KEY) {
    return true;
  }
  return false;
}

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

/**
 * Development-only mock: log OTP to the local backend console (never in production).
 * @returns {boolean} true when mock handled the send
 */
function mockSendOtp(kind, email, otpPlain) {
  if (!isMockEmailDeliveryEnabled()) return false;
  // eslint-disable-next-line no-console
  console.warn(
    `[email:dev-mock] DEVELOPMENT ONLY — no Resend call | kind=${kind} | to=${email} | otp=${otpPlain}`,
  );
  return true;
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
 * @param {string} [locale] ar | en | de | nl | ro (default ar)
 */
async function sendRegisterOtpEmail(email, otpPlain, locale = DEFAULT_OTP_EMAIL_LOCALE) {
  if (mockSendOtp("register", email, otpPlain)) {
    return { id: "dev_console" };
  }
  const copy = resolveOtpCopy(REGISTER_OTP_COPY, locale);
  const resend = getResend();
  try {
    const { data, error } = await withEmailSendTimeout(
      resend.emails.send({
        from: fromAddress(),
        to: [email],
        subject: copy.subject,
        html: buildOtpEmailHtml(copy, otpPlain),
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
 * @param {string} [locale] ar | en | de | nl | ro (default ar)
 */
async function sendForgotPasswordOtpEmail(email, otpPlain, locale = DEFAULT_OTP_EMAIL_LOCALE) {
  if (mockSendOtp("forgot_password", email, otpPlain)) {
    return { id: "dev_console" };
  }
  const copy = resolveOtpCopy(FORGOT_OTP_COPY, locale);
  const resend = getResend();
  try {
    const { data, error } = await withEmailSendTimeout(
      resend.emails.send({
        from: fromAddress(),
        to: [email],
        subject: copy.subject,
        html: buildOtpEmailHtml(copy, otpPlain),
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
 * In development mock mode, logs a safe summary to the console instead of sending.
 * @param {{ to: string, subject: string, html: string }} params
 */
async function sendPaidSubscriptionAdminEmail({ to, subject, html } = {}) {
  const recipient = String(to || "").trim();
  if (!recipient) {
    throw createAppError("Missing admin notification recipient.", 400, {
      publicCode: "MISSING_ADMIN_NOTIFICATION_RECIPIENT",
    });
  }

  if (isMockEmailDeliveryEnabled()) {
    // eslint-disable-next-line no-console
    console.warn(
      `[email:dev-mock] DEVELOPMENT ONLY — no Resend call | kind=paid_subscription_admin_notification | to=${recipient} | subject=${subject}`,
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
  isMockEmailDeliveryEnabled,
};
