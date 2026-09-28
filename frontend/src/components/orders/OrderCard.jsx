import { useEffect, useMemo, useState } from "react";
import OrderApplicantsCount from "./OrderApplicantsCount";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/ordersAdminResources";
import {
  formatOrderBudget,
  formatOrderDuration,
  formatOrderProjectType,
  formatMoney,
  categoryLine,
  shortDescription,
} from "../../lib/orders/orderDisplayFormatters";
import { MoneyValue, DurationValue } from "../open-orders/OrderNumericValue";
import { JodOrderBudgetDisplay } from "../money/JodMoneyDisplay";
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

function priceLabel(order, locale, t) {
  if (order?.projectType === "bidding" && (order?.paymentAmount != null || order?.paymentCurrency)) {
    const paid = order?.paymentAmount != null ? formatMoney(order.paymentAmount) : "—";
    const cur = t("ordersAdmin.orderCard.paidCurrencySuffix");
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

function timeLeftLabel(order, t, locale) {
  const due = order?.dueAt ? new Date(order.dueAt) : null;
  if (!due || !Number.isFinite(due.getTime())) return null;

  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return t("ordersAdmin.orderCard.timeExpired");

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const nf = new Intl.NumberFormat(locale === "en" ? "en-US" : "ar");
  const du = "ordersAdmin.wizard.durationUnits";
  const part = (n, unit) => {
    if (locale === "en") {
      const label = unit === "days" ? (n === 1 ? t(`${du}.day`) : t(`${du}.days`)) : unit === "hours" ? (n === 1 ? t(`${du}.hour`) : t(`${du}.hours`)) : n === 1 ? t(`${du}.minute`) : t(`${du}.minutes`);
      return `${nf.format(n)} ${label}`;
    }
    const label =
      unit === "days"
        ? n >= 3 && n <= 10
          ? t(`${du}.days`)
          : n === 2
            ? t(`${du}.dayTwo`)
            : t(`${du}.day`)
        : unit === "hours"
          ? n >= 3 && n <= 10
            ? t(`${du}.hours`)
            : n === 2
              ? t(`${du}.hourTwo`)
              : t(`${du}.hour`)
          : n >= 3 && n <= 10
            ? t(`${du}.minutes`)
            : n === 2
              ? t(`${du}.minuteTwo`)
              : t(`${du}.minute`);
    return `${nf.format(n)} ${label}`;
  };

  const parts = [];
  if (days > 0) parts.push(part(days, "days"));
  if (hours > 0 || days > 0) parts.push(part(hours, "hours"));
  parts.push(part(minutes, "minutes"));
  const joiner = t("ordersAdmin.orderCard.timePartJoiner");
  const span = parts.join(joiner);
  return t("ordersAdmin.orderCard.timeRemaining", { span });
}

export default function OrderCard({
  order,
  footer,
  footerInline,
  showOrderCode = false,
  showAssignmentBadge = true,
  showAdminBadge = true,
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
  const applicantJoiner = locale === "ar" ? "، " : ", ";

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    void nowMs;
    return timeLeftLabel(order, t, locale);
  }, [order, nowMs, t, locale]);

  const priceChipBody = showAdminBadge ? (
    <MoneyValue>{formatOrderBudget(order, locale)}</MoneyValue>
  ) : (
    <JodOrderBudgetDisplay order={order} compact />
  );

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
            {t("orders.card.price")}: {priceChipBody}
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
                  {bidUsers.slice(0, 2).map((b) => bidderDisplayName(b)).join(applicantJoiner)}
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
          <div className="oh-pool-card__meta oh-pool-card__meta--keyonly" aria-label={t("ordersAdmin.orderCard.summaryAria")}>
            <span className="oh-mini-chip oh-mini-chip--emph">
              {t("orders.card.price")}: {priceChipBody}
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
        <div className="oh-pool-card__meta" aria-label={t("ordersAdmin.orderCard.skillsAria")}>
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
              <div className="oh-meta__label">{t("ordersAdmin.orderCard.priceSummary")}</div>
              <div className="oh-meta__value oh-meta__value--strong">
                <MoneyValue>
                  {showAdminBadge ? priceLabel(order, locale, t) : <JodOrderBudgetDisplay order={order} compact />}
                </MoneyValue>
              </div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">{t("ordersAdmin.orderCard.technicalStatus")}</div>
              <div className="oh-meta__value">{showValue(order?.orderStatus)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">{t("ordersAdmin.orderCard.published")}</div>
              <div className="oh-meta__value">{yn(order?.isPublished, t)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">{t("orders.card.inPool")}</div>
              <div className="oh-meta__value">{yn(order?.isOpenForPool, t)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">{t("ordersAdmin.orderCard.archived")}</div>
              <div className="oh-meta__value">{yn(order?.isArchived, t)}</div>
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
              <div style={{ fontWeight: 950, color: "#1b2341" }}>{t("ordersAdmin.orderCard.extraCategories")}</div>
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
            {expanded ? t("ordersAdmin.orderCard.hideDetails") : t("ordersAdmin.orderCard.showDetails")}
          </button>
          {footerInline}
        </div>
        {footer}
      </footer>
    </article>
  );
}
