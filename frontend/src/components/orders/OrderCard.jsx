import { useEffect, useMemo, useState } from "react";
import OrderApplicantsCount from "./OrderApplicantsCount";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  formatOrderBudget,
  formatOrderDuration,
  formatOrderProjectType,
  formatMoney,
  categoryLine,
  shortDescription,
} from "../../lib/orders/orderDisplayFormatters";
import { MoneyValue, DurationValue } from "../open-orders/OrderNumericValue";
import {
  getLocalizedOrderDescription,
  getLocalizedOrderTitle,
} from "../../lib/i18n/getLocalizedMarketplaceOrderText";
import {
  getOrderStatusBadgeClass,
  getOrderStatusLabel,
  poolMarketplaceStatusBadge,
} from "../../utils/orderFlowUi";
import { orderHasAssignment } from "../../utils/orderPrivacyUi";

function priceLabel(order, locale) {
  if (order?.projectType === "bidding" && (order?.paymentAmount != null || order?.paymentCurrency)) {
    const paid = order?.paymentAmount != null ? formatMoney(order.paymentAmount) : "—";
    const cur = locale === "en" ? " JOD" : " د.أ";
    return `${paid}${cur}`.trim();
  }
  return formatOrderBudget(order, locale);
}

function shortText(text, max = 140, emptyLabel = "—") {
  return shortDescription(text, max, { emptyLabel });
}

function typeLabel(projectType, t) {
  return formatOrderProjectType(projectType, t);
}

function showValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function yn(v, t) {
  if (v === true) return t("orders.card.yes");
  if (v === false) return t("orders.card.no");
  return "—";
}

/** Admin table/card badge using shared status labels. */
function adminStatusBadge(order, t) {
  if (order?.isArchived) {
    return { label: t("orders.status.archived"), className: "oh-badge oh-badge--neutral" };
  }
  const s = order?.orderStatus != null ? String(order.orderStatus).trim() : "";
  if (!s) return { label: "—", className: "oh-badge oh-badge--neutral" };
  return { label: getOrderStatusLabel(s, t), className: getOrderStatusBadgeClass(s) };
}

function assignmentBadge(order, t) {
  if (orderHasAssignment(order)) {
    return { label: t("orders.card.assignedToFreelancer"), className: "oh-pill oh-pill--assigned" };
  }
  return { label: t("orders.card.inPool"), className: "oh-pill oh-pill--pool" };
}

function bidderDisplayName(bidUser) {
  if (bidUser?.displayName) return bidUser.displayName;
  const u = bidUser?.user || {};
  const full = [u.firstName, u.fatherName, u.familyName].filter(Boolean).join(" ").trim();
  return full || "—";
}

function timeLeftLabel(order) {
  const due = order?.dueAt ? new Date(order.dueAt) : null;
  if (!due || !Number.isFinite(due.getTime())) return null;

  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return "انتهت مدة المشروع.";

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const nf = new Intl.NumberFormat("en-US");
  const parts = [];
  if (days > 0) parts.push(`${nf.format(days)} يوم`);
  if (hours > 0 || days > 0) parts.push(`${nf.format(hours)} ساعة`);
  parts.push(`${nf.format(minutes)} دقيقة`);
  return `متبقي ${parts.join(" و ")}.`;
}

export default function OrderCard({
  order,
  footer,
  /** أزرار بجانب «عرض التفاصيل» (مثل استلام الطلب في صفحة الطلبات). */
  footerInline,
  showOrderCode = false,
  showAssignmentBadge = true,
  showAdminBadge = true,
  /** لوحة الإدارة: يظهر العنوان + السعر + مدة التسليم فقط حتى فتح «عرض التفاصيل». */
  compactSummary = false,
}) {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const isAuthenticated = Boolean(user);
  const localizedTitle = getLocalizedOrderTitle(order, locale);
  const localizedDescription = getLocalizedOrderDescription(order, locale);
  const [expanded, setExpanded] = useState(false);
  const showFull = !compactSummary || expanded;
  const badge = useMemo(
    () => (showAdminBadge ? adminStatusBadge(order, t) : poolMarketplaceStatusBadge(order, t)),
    [order, showAdminBadge, t],
  );
  const assign = useMemo(() => assignmentBadge(order, t), [order, t]);
  const skills = Array.isArray(order?.preferredSkills) ? order.preferredSkills : [];
  const skillsClean = skills.filter((s) => s != null);
  const extraCats = Array.isArray(order?.extraCategories) ? order.extraCategories : [];
  const [nowMs, setNowMs] = useState(() => Date.now());

  const categoryText = categoryLine(order, locale);
  const filesCount =
    Array.isArray(order?.files) && order.files.length
      ? order.files.length
      : Number(order?.filesCount ?? 0) || 0;
  const bidUsers = Array.isArray(order?.bidUsers) ? order.bidUsers : [];
  const applicantPoolCount =
    Number(order?.applicantsCount ?? order?.bidsCount ?? 0) ||
    (bidUsers.length ? bidUsers.length : 0);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    void nowMs;
    return timeLeftLabel(order);
  }, [order, nowMs]);

  const priceChipBody = formatOrderBudget(order, locale);

  return (
    <article className={`oh-pool-card oh-pool-card--static${compactSummary ? " oh-pool-card--compact-summary" : ""}`.trim()}>
      {showFull ? (
        <header className="oh-pool-card__head">
          <div className="oh-pool-card__title-wrap">
            <div className="oh-pool-card__title">{localizedTitle}</div>
            <div className="oh-pool-card__sub">
              {showOrderCode && order?.orderCode ? (
                <span className="oh-code" title={order.orderCode}>
                  {order.orderCode}
                </span>
              ) : null}
              {showAssignmentBadge ? <span className={assign.className}>{assign.label}</span> : null}
            </div>
          </div>
          <div className="oh-pool-card__badges">
            <span className={badge.className}>{badge.label}</span>
            {showAdminBadge ? <span className="oh-badge oh-badge--primary">{t("orders.card.adminBadge")}</span> : null}
          </div>
        </header>
      ) : (
        <header className="oh-pool-card__head oh-pool-card__head--summary">
          <div className="oh-pool-card__title-wrap">
            <div className="oh-pool-card__title">{localizedTitle}</div>
          </div>
        </header>
      )}

      {showFull ? (
        <div className="oh-pool-card__meta">
          <span className="oh-mini-chip">{categoryText}</span>
          <span className="oh-mini-chip">
            {t("orders.card.type")}: {typeLabel(order?.projectType, t)}
          </span>
          <span className="oh-mini-chip">
            {t("orders.card.price")}: <MoneyValue>{priceChipBody}</MoneyValue>
          </span>
          <span className="oh-mini-chip">
            {t("orders.card.deliveryDuration")}: <DurationValue>{formatOrderDuration(order, locale, t)}</DurationValue>
          </span>
          <span className="oh-mini-chip">
            {t("orders.card.filesLabel")}: {filesCount ? String(filesCount) : t("orders.card.noFiles")}
          </span>
          {order?.projectType === "bidding" ? (
            <span className="oh-mini-chip">
              {t("orders.card.applicants")}:{" "}
              {showAdminBadge && bidUsers.length ? (
                <>
                  {bidUsers.slice(0, 2).map((b) => bidderDisplayName(b)).join("، ")}
                  {bidUsers.length > 2 ? ` +${bidUsers.length - 2}` : ""}
                </>
              ) : (
                <OrderApplicantsCount
                  count={applicantPoolCount}
                  isAuthenticated={showAdminBadge ? true : isAuthenticated}
                  variant="value"
                />
              )}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <div className="oh-pool-card__meta oh-pool-card__meta--keyonly" aria-label="ملخص الطلب">
            <span className="oh-mini-chip oh-mini-chip--emph">
              {t("orders.card.price")}: <MoneyValue>{priceChipBody}</MoneyValue>
            </span>
            <span className="oh-mini-chip oh-mini-chip--emph">
              {t("orders.card.deliveryDuration")}: <DurationValue>{formatOrderDuration(order, locale, t)}</DurationValue>
            </span>
          </div>
          <p className="oh-pool-card__desc oh-pool-card__desc--compact-preview">
            {shortText(localizedDescription, 220, t("orders.marketplace.card.noDescription"))}
          </p>
        </>
      )}

      {showFull ? (
        <p className={`oh-pool-card__desc${expanded ? " oh-pool-card__desc--expanded" : ""}`.trim()}>
          {expanded ? showValue(localizedDescription) : shortText(localizedDescription, 140, t("orders.marketplace.card.noDescription"))}
        </p>
      ) : null}

      {showFull && remaining ? (
        <p className="help" style={{ margin: 0 }}>
          {remaining}
        </p>
      ) : null}

      {showFull && skillsClean.length ? (
        <div className="oh-pool-card__meta" aria-label="المهارات">
          {skillsClean.slice(0, 8).map((s, idx) => (
            <span className="oh-mini-chip" key={s?.id || s?.name || String(idx)}>
              {typeof s === "string" ? s : s?.name || "—"}
            </span>
          ))}
          {skillsClean.length > 8 ? <span className="oh-mini-chip">+{skillsClean.length - 8}</span> : null}
        </div>
      ) : null}

      {expanded ? (
        <>
          <section className="oh-order-card__meta" style={{ marginTop: 2 }}>
            <div className="oh-meta">
              <div className="oh-meta__label">السعر (ملخص)</div>
              <div className="oh-meta__value oh-meta__value--strong">
                <MoneyValue>{priceLabel(order, locale)}</MoneyValue>
              </div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">الحالة التقنية</div>
              <div className="oh-meta__value">{showValue(order?.orderStatus)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">منشور</div>
              <div className="oh-meta__value">{yn(order?.isPublished, t)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">{t("orders.card.inPool")}</div>
              <div className="oh-meta__value">{yn(order?.isOpenForPool, t)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">مؤرشف</div>
              <div className="oh-meta__value">{yn(order?.isArchived)}</div>
            </div>
            {showAdminBadge ? (
              <>
                <div className="oh-meta">
                  <div className="oh-meta__label">createdByUserId</div>
                  <div className="oh-meta__value">{showValue(order?.createdByUserId)}</div>
                </div>
                <div className="oh-meta">
                  <div className="oh-meta__label">assignedFreelancerId</div>
                  <div className="oh-meta__value">{showValue(order?.assignedFreelancerId)}</div>
                </div>
              </>
            ) : null}
            <div className="oh-meta">
              <div className="oh-meta__label">updatedAt</div>
              <div className="oh-meta__value">{showValue(order?.updatedAt)}</div>
            </div>
          </section>

          {extraCats.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 950, color: "#1b2341" }}>تصنيفات إضافية</div>
              <div className="chips">
                {extraCats.map((x, idx) => {
                  const c = x?.category?.name || "—";
                  const ss = x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : "";
                  return (
                    <span className="chip" key={`${x?.category?.id || idx}`}>
                      {c}
                      {ss}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <footer className="oh-pool-card__foot">
        <div className="oh-pool-card__actions">
          <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
          </button>
          {footerInline}
        </div>
        {footer}
      </footer>
    </article>
  );
}
