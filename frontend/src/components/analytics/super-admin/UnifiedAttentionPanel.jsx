import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { resolveSuperAdminDashboardHomeLink } from "./superAdminHomeDataUtils";
import { formatInt } from "./superAdminHomeBundleUi";
import { AttentionTypeIcon } from "./attentionIcons";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./registerAnalysisLocale";

const SEVERITY = { urgent: 3, medium: 2, info: 1 };

function resolveItemText(t, item) {
  if (item.textKey) {
    const params = { ...(item.textParams || {}) };
    if (params.count != null && typeof params.count === "number") params.count = formatInt(params.count);
    return t(item.textKey, params);
  }
  return item.text || "";
}

function resolveItemDescription(t, item) {
  if (item.descriptionKey) {
    const params = { ...(item.descriptionParams || {}) };
    if (params.count != null && typeof params.count === "number") params.count = formatInt(params.count);
    return t(item.descriptionKey, params);
  }
  return item.description || "";
}

function resolveDisplayCount(item) {
  if (item.count != null && !Number.isNaN(Number(item.count))) return Number(item.count);
  const match = String(item.text || "").match(/^([\d\u0660-\u0669][\d\u0660-\u0669,.\s]*)/);
  if (match) {
    const digits = match[1].replace(/[^\d]/g, "");
    const n = Number(digits);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

function countSuffix(t, count, item) {
  const id = String(item.id || "");
  if (id.includes("order") || id.includes("stale-orders")) {
    return count === 1 ? t("analysis.attention.suffixOrder") : t("analysis.attention.suffixOrders");
  }
  if (id.includes("payment")) {
    return count === 1 ? t("analysis.attention.suffixPayment") : t("analysis.attention.suffixPayments");
  }
  if (id.includes("claim")) {
    return count === 1 ? t("analysis.attention.suffixClaim") : t("analysis.attention.suffixClaims");
  }
  if (id.includes("course")) {
    return count === 1 ? t("analysis.attention.suffixCourse") : t("analysis.attention.suffixCourses");
  }
  if (id.includes("notification")) {
    return count === 1 ? t("analysis.attention.suffixNotification") : t("analysis.attention.suffixNotifications");
  }
  if (id.includes("freelancer") || id.includes("activation") || id.includes("subscription")) {
    return count === 1 ? t("analysis.attention.suffixTask") : t("analysis.attention.suffixTasks");
  }
  return count === 1 ? t("analysis.attention.suffixItem") : t("analysis.attention.suffixItems");
}

function AttentionCard({ item, group }) {
  const { t } = useTranslation();
  const count = resolveDisplayCount(item);
  const tone = item.severity === SEVERITY.urgent ? "urgent" : item.severity === SEVERITY.medium ? "medium" : "info";
  const suffix = countSuffix(t, count, item);
  const safeTo = resolveSuperAdminDashboardHomeLink(item.to);
  const title = resolveItemText(t, item);
  const description = resolveItemDescription(t, item);

  const inner = (
    <>
      <span className={`sa-attention-card__icon-wrap sa-attention-card__icon-wrap--${tone}`}>
        <AttentionTypeIcon itemId={item.id} className="sa-attention-card__icon" />
      </span>
      <span className="sa-attention-card__body">
        <span className="sa-attention-card__title">{title}</span>
        {description ? <span className="sa-attention-card__desc">{description}</span> : null}
      </span>
      <span className="sa-attention-card__aside">
        <span className={`sa-attention-card__priority sa-attention-card__priority--${tone}`}>{group.priorityLabel}</span>
        <span className="sa-attention-card__count">
          {formatInt(count)} {suffix}
        </span>
        {safeTo ? (
          <span className="sa-attention-card__chevron" aria-hidden>
            ‹
          </span>
        ) : null}
      </span>
    </>
  );

  const className = `sa-attention-card sa-attention-card--${tone}`;

  if (safeTo) {
    return (
      <li className="sa-attention-panel__item">
        <NavLink to={safeTo} className={className}>
          {inner}
        </NavLink>
      </li>
    );
  }

  return (
    <li className="sa-attention-panel__item">
      <div className={className}>{inner}</div>
    </li>
  );
}

function AttentionSkeleton() {
  return (
    <div className="sa-attention-panel sa-attention-panel--loading" aria-hidden>
      <div className="sa-attention-panel__summary-skel" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="sa-attention-panel__group-skel">
          <div className="sa-attention-panel__group-head-skel" />
          <div className="sa-attention-card-skel" />
          <div className="sa-attention-card-skel" />
        </div>
      ))}
    </div>
  );
}

function AttentionEmpty() {
  const { t } = useTranslation();
  return (
    <div className="sa-attention-panel__empty" role="status">
      <span className="sa-attention-panel__empty-icon" aria-hidden>
        ✓
      </span>
      <p className="sa-attention-panel__empty-title m-0">{t("analysis.attention.emptyTitle")}</p>
      <p className="sa-attention-panel__empty-desc m-0">{t("analysis.attention.emptyDesc")}</p>
    </div>
  );
}

function groupItems(items, t) {
  const groups = [
    { key: SEVERITY.urgent, title: t("analysis.attention.groupUrgent"), tone: "urgent", priorityLabel: t("analysis.attention.priorityHigh") },
    { key: SEVERITY.medium, title: t("analysis.attention.groupMedium"), tone: "medium", priorityLabel: t("analysis.attention.priorityMedium") },
    { key: SEVERITY.info, title: t("analysis.attention.groupInfo"), tone: "info", priorityLabel: t("analysis.attention.priorityInfo") },
  ];
  const buckets = {
    [SEVERITY.urgent]: [],
    [SEVERITY.medium]: [],
    [SEVERITY.info]: [],
  };
  for (const item of items || []) {
    const sev = item.severity ?? SEVERITY.medium;
    if (buckets[sev]) buckets[sev].push(item);
  }
  return groups
    .map((g) => ({
      ...g,
      items: buckets[g.key] || [],
      total: (buckets[g.key] || []).reduce((sum, it) => sum + resolveDisplayCount(it), 0),
    }))
    .filter((g) => g.items.length > 0);
}

function AttentionGrouped({ items, showFooter = true }) {
  const { t } = useTranslation();
  const grouped = useMemo(() => groupItems(items, t), [items, t]);
  return (
    <div className="sa-attention-panel sa-attention-panel--stack">
      {grouped.map((group) => (
        <section key={group.key} className={`sa-attention-panel__group sa-attention-panel__group--${group.tone}`}>
          <header className="sa-attention-panel__group-head">
            <span className={`sa-attention-panel__group-dot sa-attention-panel__group-dot--${group.tone}`} aria-hidden />
            <h3 className="sa-attention-panel__group-title m-0">{group.title}</h3>
            <span className="sa-attention-panel__group-count">{formatInt(group.items.length)}</span>
          </header>
          <ul className="sa-attention-panel__list">
            {group.items.map((item) => (
              <AttentionCard key={item.id} item={item} group={group} />
            ))}
          </ul>
        </section>
      ))}
      {showFooter ? <p className="sa-attention-panel__footer m-0">{t("analysis.attention.footer")}</p> : null}
    </div>
  );
}

/**
 * @param {{ items: Array<Record<string, unknown>>; loading?: boolean; showFooter?: boolean }} props
 */
export function UnifiedAttentionPanel({ items, loading, showFooter = true }) {
  if (loading) return <AttentionSkeleton />;
  if (!items?.length) return <AttentionEmpty />;

  return <AttentionGrouped items={items} showFooter={showFooter} />;
}

/** Total weight for summary badge — same items as displayed list. */
export function computeAttentionTotalCount(items) {
  if (!items?.length) return 0;
  return items.reduce((sum, item) => sum + resolveDisplayCount(item), 0);
}

/**
 * Compact summary for section header (bell + total, or count-only badge).
 * @param {{ total: number; loading?: boolean; compact?: boolean }} props
 */
export function AttentionSummaryBadge({ total, loading, compact = false }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div
        className={`sa-attention-summary sa-attention-summary--loading${compact ? " sa-attention-summary--compact" : ""}`}
        aria-hidden
      />
    );
  }
  if (compact) {
    return (
      <span
        className="sa-attention-summary sa-attention-summary--compact"
        aria-label={t("analysis.attention.itemCount", { count: formatInt(total) })}
      >
        {formatInt(total)}
      </span>
    );
  }
  return (
    <div className="sa-attention-summary" aria-label={t("analysis.attention.attentionPoints", { count: formatInt(total) })}>
      <span className="sa-attention-summary__icon" aria-hidden>
        🔔
      </span>
      <div className="sa-attention-summary__copy">
        <span className="sa-attention-summary__label">{t("analysis.attention.needsAttention")}</span>
        <strong className="sa-attention-summary__value">{formatInt(total)}</strong>
      </div>
    </div>
  );
}
