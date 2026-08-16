import { useNavigate } from "react-router-dom";
import {
  categoryChips,
  formatOrderDuration,
} from "../../../lib/orders/orderDisplayFormatters";
import {
  getLocalizedOrderDescription,
  getLocalizedOrderTitle,
  resolveUserContentDir,
} from "../../../lib/i18n/getLocalizedMarketplaceOrderText";
import { shortDescription } from "../../open-orders/openOrdersFormatters";
import { DurationValue } from "../../open-orders/OrderNumericValue";
import { JodOrderBudgetDisplay } from "../../money/JodMoneyDisplay";
import { orderStatusDisplayBadge } from "../../../utils/orderFlowUi";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { fdashBadgeClassFromOh } from "./orderBadgeUi";

function formatJoDate(value, locale) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const intlLocale = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium" }).format(d);
}

function deadlineHint(order, t, locale) {
  const status = String(order?.orderStatus || "");
  if (status === "completed") return { text: t("orders.card.completed"), className: "fmo-order-row__stat-value--ok" };
  if (status === "cancelled") return { text: t("orders.card.cancelled"), className: "fmo-order-row__stat-value--muted" };
  const due = order?.revisionDeadlineAt || order?.dueAt;
  const label = formatJoDate(due, locale);
  if (!label) return { text: "—", className: "fmo-order-row__stat-value--muted" };
  const end = new Date(due);
  if (!Number.isFinite(end.getTime())) return { text: label, className: "" };
  const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `${label} · ${t("orders.card.overdue")}`, className: "fmo-order-row__stat-value--urgent" };
  const daysLabel = t(days === 1 ? "orders.card.daysLeft" : "orders.card.daysLeft_plural", { count: days });
  if (days <= 3) return { text: `${label} · ${daysLabel}`, className: "fmo-order-row__stat-value--urgent" };
  return { text: `${label} · ${daysLabel}`, className: "" };
}

function primaryCtaLabel(order, t) {
  const status = String(order?.orderStatus || "");
  const hasRevision = Boolean(order?.clientRevisionNote);
  if (
    hasRevision &&
    (status === "in_progress" || status === "ready_for_work" || status === "pending_client_review")
  ) {
    return t("orders.card.ctaRevision");
  }
  if (status === "pending_client_review") return t("orders.card.ctaPendingReview");
  if (status === "completed") return t("orders.card.ctaViewOrder");
  if (status === "cancelled") return t("orders.card.ctaViewDetails");
  return t("orders.card.ctaContinue");
}

function actionBtnModifier(order) {
  const status = String(order?.orderStatus || "");
  if (order?.clientRevisionNote && (status === "in_progress" || status === "ready_for_work")) {
    return " fmo-order-row__action-btn--revision";
  }
  if (status === "pending_client_review") return " fmo-order-row__action-btn--review";
  if (status === "completed") return " fmo-order-row__action-btn--done";
  if (status === "cancelled") return " fmo-order-row__action-btn--muted";
  return "";
}

export default function MyOrderCard({ order, detailsPath }) {
  const navigate = useNavigate();
  const { t, locale, dir } = useTranslation();
  const badge = orderStatusDisplayBadge(order, t);
  const badgeClass = fdashBadgeClassFromOh(badge.className);
  const hasRevision = Boolean(order?.clientRevisionNote);
  const status = String(order?.orderStatus || "");
  const deadline = deadlineHint(order, t, locale);
  const path = detailsPath || `/dashboard/freelancer/my-orders/${order.id}`;
  const chips = categoryChips(order, locale);
  const filesCount = Number(order?.filesCount || 0);
  const updatedLabel = formatJoDate(order?.updatedAt || order?.createdAt, locale);
  const codeLabel = order?.orderCode ? `#${order.orderCode}` : `#${order.id}`;
  const ctaLabel = primaryCtaLabel(order, t);
  const title = getLocalizedOrderTitle(order, locale);
  const description = getLocalizedOrderDescription(order, locale);
  const titleDir = resolveUserContentDir(title, dir);
  const descriptionDir = resolveUserContentDir(description, dir);
  const filesLabel =
    filesCount > 0
      ? t(filesCount === 1 ? "orders.card.files" : "orders.card.files_plural", { count: filesCount })
      : t("orders.card.noAttachments");

  const openDetails = () => navigate(path);

  return (
    <article
      className={[
        "fmo-order-row fdash-surface-3d fdash-surface-3d--soft",
        hasRevision ? "fmo-order-row--revision" : "",
        status === "completed" ? "fmo-order-row--completed" : "",
        status === "cancelled" ? "fmo-order-row--cancelled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="fmo-order-row__surface"
        role="button"
        tabIndex={0}
        dir={dir}
        onClick={openDetails}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openDetails();
          }
        }}
        aria-label={`${ctaLabel} — ${title}`}
      >
        <div className="fmo-order-row__stats">
          <span className={badgeClass}>{badge.label}</span>
          <div className="fmo-order-row__stat">
            <span className="fmo-order-row__stat-label">{t("orders.card.value")}</span>
            <strong className="fmo-order-row__stat-value fmo-order-row__stat-value--price">
              <JodOrderBudgetDisplay order={order} compact />
            </strong>
          </div>
          <div className="fmo-order-row__stat">
            <span className="fmo-order-row__stat-label">{t("orders.card.deadline")}</span>
            <strong className={`fmo-order-row__stat-value ${deadline.className}`.trim()}>{deadline.text}</strong>
          </div>
          <div className="fmo-order-row__stat">
            <span className="fmo-order-row__stat-label">{t("orders.card.deliveryDuration")}</span>
            <strong className="fmo-order-row__stat-value">
              <DurationValue>{formatOrderDuration(order, locale, t)}</DurationValue>
            </strong>
          </div>
        </div>

        <div className="fmo-order-row__divider" aria-hidden />

        <div className="fmo-order-row__center text-start">
          <div className="fmo-order-row__head">
            <h3 className="fmo-order-row__title text-start" dir={titleDir}>
              {title}
            </h3>
            <span className="fmo-order-row__code">{codeLabel}</span>
          </div>
          <p className="fmo-order-row__summary text-start" dir={descriptionDir}>
            {shortDescription(description, 120, { emptyLabel: t("orders.marketplace.card.noDescription") })}
          </p>
          {chips.length ? (
            <div className="fmo-order-row__chips">
              {chips.map((chip) => (
                <span key={chip} className="fmo-order-row__chip">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
          <div className="fmo-order-row__meta-line">
            {updatedLabel ? (
              <span>
                {t("orders.card.lastUpdated")}: {updatedLabel}
              </span>
            ) : null}
            <span>{filesLabel}</span>
          </div>
          {hasRevision ? (
            <p className="fmo-order-row__revision" role="status">
              {t("orders.card.revisionNote")}
            </p>
          ) : null}
        </div>

        <div className="fmo-order-row__divider" aria-hidden />

        <div className="fmo-order-row__side">
          <button
            type="button"
            className={`fmo-order-row__action-btn${actionBtnModifier(order)}`}
            onClick={(e) => {
              e.stopPropagation();
              openDetails();
            }}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
