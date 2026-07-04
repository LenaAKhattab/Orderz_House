const subscriptionsService = require("./subscriptionsService");
const emailService = require("./emailService");
const systemSettingsService = require("./systemSettingsService");

/**
 * Internal admin notification for a newly-paid freelancer subscription.
 *
 * Recipient is resolved in priority order:
 *   1. the `paid_subscription_notification_email` system setting (editable from the dashboard);
 *   2. the SUBSCRIPTION_ADMIN_EMAIL env variable (fallback);
 *   3. otherwise a warning is logged and sending is skipped.
 * Never hardcoded. Best-effort by design: a missing recipient or a send failure only logs a
 * warning and never breaks the payment/subscription flow. Callers additionally wrap this in
 * `safeNotify` and only invoke it once per genuine paid transition
 * (see `fulfillFreelancerSubscriptionStripePayment`).
 */

const ADMIN_EMAIL_ENV = "SUBSCRIPTION_ADMIN_EMAIL";
const PAID_NOTIFICATION_EMAIL_KEY = "paid_subscription_notification_email";
const AMMAN_TZ = "Asia/Amman";
const NA = "غير متوفر";

const PAYMENT_STATUS_AR = {
  not_required: "غير مطلوب",
  pending: "قيد الانتظار",
  paid: "مدفوع",
  failed: "فشل الدفع",
  cancelled: "ملغى",
};

const SUBSCRIPTION_STATUS_AR = {
  assigned_not_started: "مُسند — لم يبدأ",
  active: "نشط",
  expired: "منتهٍ",
  inactive: "غير نشط",
  cancelled: "ملغى",
};

const ACTIVATION_STATUS_AR = {
  company_pending: "بانتظار تفعيل الشركة",
  company_approved: "تم تفعيل الشركة",
  company_rejected: "مرفوض من الشركة",
};

const SOURCE_AR = {
  admin: "الإدارة",
  manual: "يدوي",
  stripe: "Stripe",
};

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(value) {
  const str = value == null ? "" : String(value).trim();
  return str === "" ? NA : str;
}

function labelFrom(map, value) {
  const key = String(value == null ? "" : value).trim().toLowerCase();
  if (key === "") return NA;
  return map[key] || safeText(value);
}

function formatDateTime(value) {
  if (value == null || value === "") return NA;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return NA;
  try {
    return new Intl.DateTimeFormat("ar", {
      timeZone: AMMAN_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatMoney(priceJod) {
  if (priceJod == null) return NA;
  const num = Number(priceJod);
  if (!Number.isFinite(num)) return NA;
  return `${num.toFixed(2)} د.أ`;
}

function formatDurationDays(days) {
  if (days == null) return NA;
  const num = Number(days);
  if (!Number.isFinite(num)) return NA;
  return `${num} يوم`;
}

function formatBool(value) {
  if (value === true) return "نعم";
  if (value === false) return "لا";
  return NA;
}

function buildFullName(freelancer) {
  if (!freelancer) return NA;
  const parts = [freelancer.firstName, freelancer.fatherName, freelancer.familyName]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : NA;
}

function buildSubject(sub) {
  const name = buildFullName(sub.freelancer);
  const planTitle = safeText(sub.plan?.title || sub.plan?.name);
  return `اشتراك مدفوع جديد - ${name} - ${planTitle}`;
}

function section(title, rows) {
  const body = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;font-weight:600;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;color:#0f172a;">${escapeHtml(title)}</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tbody>${body}</tbody>
    </table>`;
}

/**
 * Pure builder: turns a mapped subscription (with freelancer + plan) into an Arabic HTML email.
 * @returns {{ subject: string, html: string }}
 */
function buildPaidSubscriptionAdminEmail(sub) {
  const freelancer = sub.freelancer || {};
  const plan = sub.plan || {};
  const fullName = buildFullName(freelancer);

  const summary = section("ملخص", [
    ["الحدث", "تم إتمام اشتراك مدفوع جديد"],
    ["التاريخ والوقت", formatDateTime(sub.paidAt || sub.createdAt || new Date())],
    ["رقم الاشتراك", safeText(sub.id)],
  ]);

  const userDetails = section("بيانات المستقل", [
    ["الاسم الكامل", fullName],
    ["البريد الإلكتروني", safeText(freelancer.email)],
    ["رقم الهاتف", safeText(freelancer.phone)],
    ["رقم واتساب", safeText(freelancer.whatsapp)],
    ["رقم الحساب (Account ID)", safeText(freelancer.accountId)],
    ["معرّف المستخدم (User ID)", safeText(sub.freelancerUserId)],
    ["الدولة", safeText(freelancer.country)],
  ]);

  const subscriptionDetails = section("تفاصيل الاشتراك", [
    ["رقم الاشتراك", safeText(sub.id)],
    ["حالة الدفع", labelFrom(PAYMENT_STATUS_AR, sub.paymentStatus)],
    ["حالة الاشتراك", labelFrom(SUBSCRIPTION_STATUS_AR, sub.status)],
    ["حالة التفعيل", labelFrom(ACTIVATION_STATUS_AR, sub.activationStatus)],
    ["تاريخ الإنشاء/الإسناد", formatDateTime(sub.assignedAt || sub.createdAt)],
    ["تاريخ بدء التفعيل", formatDateTime(sub.actualStartDate)],
    ["تاريخ الانتهاء", formatDateTime(sub.expiryDate)],
    ["تاريخ أول طلب", formatDateTime(sub.firstOrderDate)],
    ["المصدر", labelFrom(SOURCE_AR, sub.source)],
  ]);

  const planDetails = section("تفاصيل الباقة", [
    ["معرّف الباقة", safeText(plan.id)],
    ["اسم الباقة", safeText(plan.title || plan.name)],
    ["المدة", formatDurationDays(plan.durationDays)],
    ["السعر", formatMoney(plan.priceJod)],
    ["تتطلب زيارة الشركة", formatBool(plan.requiresCompanyVisit)],
    ["الوصف", safeText(plan.description)],
  ]);

  const paymentDetails = section("تفاصيل الدفع", [
    ["المبلغ المدفوع", formatMoney(plan.priceJod)],
    ["العملة", "JOD (دينار أردني)"],
    ["تاريخ الدفع", formatDateTime(sub.paidAt)],
    ["معرّف جلسة Stripe", safeText(sub.stripeSessionId)],
    ["معرّف عملية الدفع (Payment Intent)", safeText(sub.stripePaymentIntentId)],
    ["مزوّد الدفع", labelFrom(SOURCE_AR, sub.source)],
  ]);

  const html = `
  <div dir="rtl" style="font-family:system-ui,'Segoe UI',Tahoma,sans-serif;line-height:1.7;color:#0f172a;max-width:640px;margin:0 auto;padding:16px;">
    <h2 style="margin:0 0 4px;font-size:20px;color:#0f172a;">اشتراك مدفوع جديد</h2>
    <p style="margin:0 0 8px;color:#475569;">
      قام <strong>${escapeHtml(fullName)}</strong> بإتمام اشتراك مدفوع في باقة
      <strong>${escapeHtml(safeText(plan.title || plan.name))}</strong>.
    </p>
    ${summary}
    ${userDetails}
    ${subscriptionDetails}
    ${planDetails}
    ${paymentDetails}
    <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;">إشعار داخلي تلقائي — أوردرز هاوس.</p>
  </div>`;

  return { subject: buildSubject(sub), html };
}

/**
 * Resolves the recipient: dashboard setting first, then the env fallback. Never throws.
 * @returns {Promise<string>} a trimmed email, or "" when none is configured
 */
async function resolveAdminRecipientEmail() {
  try {
    const dbEmail = await systemSettingsService.getSetting(PAID_NOTIFICATION_EMAIL_KEY);
    const trimmed = String(dbEmail || "").trim();
    if (trimmed) return trimmed;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[subscription-notify] Failed to read ${PAID_NOTIFICATION_EMAIL_KEY} setting — falling back to ${ADMIN_EMAIL_ENV}:`,
      err?.message || err,
    );
  }
  return String(process.env[ADMIN_EMAIL_ENV] || "").trim();
}

/**
 * Loads a paid subscription and emails the internal admin notification.
 * Never throws: returns a status object and logs warnings so the payment flow is never blocked.
 * @param {number|string} subscriptionId
 */
async function sendPaidSubscriptionAdminNotification(subscriptionId) {
  const adminEmail = await resolveAdminRecipientEmail();
  if (!adminEmail) {
    // eslint-disable-next-line no-console
    console.warn(
      `[subscription-notify] No recipient configured (${PAID_NOTIFICATION_EMAIL_KEY} setting and ${ADMIN_EMAIL_ENV} both empty) — skipping paid-subscription admin email for subscription ${subscriptionId}.`,
    );
    return { skipped: true, reason: "missing_admin_email" };
  }

  try {
    const sub = await subscriptionsService.getSubscriptionWithDetailsById(subscriptionId);
    if (!sub) {
      // eslint-disable-next-line no-console
      console.warn(`[subscription-notify] Subscription ${subscriptionId} not found — skipping admin email.`);
      return { skipped: true, reason: "subscription_not_found" };
    }
    const { subject, html } = buildPaidSubscriptionAdminEmail(sub);
    await emailService.sendPaidSubscriptionAdminEmail({ to: adminEmail, subject, html });
    return { sent: true, subscriptionId: String(sub.id) };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[subscription-notify] Failed to send paid-subscription admin email for subscription ${subscriptionId}:`,
      err?.message || err,
    );
    return { skipped: true, reason: "send_failed" };
  }
}

module.exports = {
  sendPaidSubscriptionAdminNotification,
  buildPaidSubscriptionAdminEmail,
  resolveAdminRecipientEmail,
  ADMIN_EMAIL_ENV,
  PAID_NOTIFICATION_EMAIL_KEY,
};
