import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Bell,
  BookOpen,
  ChevronLeft,
  IdCard,
  Package,
  RefreshCw,
  ShoppingBasket,
  MessageSquareWarning,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import { getAdminActionCenterSummaryRequest } from "../../services/api";
import { ADMIN_ACTION_ROUTES } from "../../lib/staff/staffDashboardPaths";
import {
  EMPTY_ACTION_CENTER_COUNTS,
  mapActionCenterSummary,
} from "../../lib/staff/adminActionCenterSummary";
import {
  readActionCenterCountsCache,
  writeActionCenterCountsCache,
} from "../../lib/staff/adminActionCenterCountsCache";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";
import "../../styles/adminControlCenter.css";

const ACTION_CARD_DEFS = [
  {
    id: "identity",
    to: ADMIN_ACTION_ROUTES.identity,
    icon: IdCard,
    countKey: "identity",
  },
  {
    id: "packages",
    to: ADMIN_ACTION_ROUTES.packageAssignment,
    icon: Package,
    countKey: null,
  },
  {
    id: "pantry",
    to: ADMIN_ACTION_ROUTES.pantry,
    icon: ShoppingBasket,
    countKey: "pantry",
  },
  {
    id: "articles",
    to: ADMIN_ACTION_ROUTES.articles,
    icon: BookOpen,
    countKey: "articles",
  },
  {
    id: "feedback",
    to: ADMIN_ACTION_ROUTES.feedback,
    icon: MessageSquareWarning,
    countKey: "feedback",
  },
  {
    id: "notifications",
    to: ADMIN_ACTION_ROUTES.notifications,
    icon: Bell,
    countKey: "notifications",
  },
];

const SUMMARY_TIMEOUT_MS = 15000;

function ActionCard({ card, count, loading }) {
  const { t } = useTranslation();
  const Icon = card.icon;
  const showCount = card.countKey != null;
  const display = count == null ? 0 : count;
  return (
    <NavLink to={card.to} className="acc-action-card" data-testid={`admin-action-${card.id}`}>
      <span className="acc-action-card__icon" aria-hidden>
        <Icon size={16} strokeWidth={2} />
      </span>
      <span className="acc-action-card__label">{card.label}</span>
      <span className="acc-action-card__desc">{card.description}</span>
      {showCount ? (
        loading ? (
          <span className="acc-kpi-card__value-skeleton" aria-hidden data-testid="admin-action-count-skeleton" />
        ) : (
          <strong className="acc-action-card__count" aria-label={t("opsAdmin.common.countAria", { count: display })}>
            {display}
          </strong>
        )
      ) : null}
      <span className="acc-action-card__chevron" aria-hidden>
        <ChevronLeft size={14} strokeWidth={2.25} />
      </span>
    </NavLink>
  );
}

/**
 * Web Admin Action Center — mirrors Flutter Super Admin مركز المهام.
 */
export default function AdminDashboardHome() {
  const { t } = useTranslation();
  const cached = typeof window !== "undefined" ? readActionCenterCountsCache() : null;
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [softNote, setSoftNote] = useState("");
  const hasLoadedOnceRef = useRef(Boolean(cached));
  const countsReadyRef = useRef(Boolean(cached));
  const [counts, setCounts] = useState(() =>
    cached ? { ...cached.counts } : { ...EMPTY_ACTION_CENTER_COUNTS },
  );
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  const actionCards = useMemo(
    () =>
      ACTION_CARD_DEFS.map((def) => ({
        ...def,
        label: t(`opsAdmin.adminHome.cards.${def.id}.label`),
        description: t(`opsAdmin.adminHome.cards.${def.id}.description`),
      })),
    [t],
  );

  const load = useCallback(async ({ isRefresh = false } = {}) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    if (isRefresh || countsReadyRef.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await getAdminActionCenterSummaryRequest({
        timeout: SUMMARY_TIMEOUT_MS,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;

      const mapped = mapActionCenterSummary(res);
      setCounts((prev) => {
        const next = { ...mapped.counts };
        if (countsReadyRef.current && mapped.partialErrors.length) {
          for (const key of mapped.partialErrors) {
            if (prev[key] != null) next[key] = prev[key];
          }
        }
        writeActionCenterCountsCache(next);
        return next;
      });
      countsReadyRef.current = true;
      if (mapped.partialErrors.length) {
        setSoftNote(t("opsAdmin.adminHome.softNotePartial"));
      } else {
        setSoftNote("");
      }
    } catch (err) {
      if (!mountedRef.current || controller.signal.aborted || err?.code === "ERR_CANCELED") {
        return;
      }
      if (countsReadyRef.current) {
        setSoftNote(t("opsAdmin.adminHome.softNoteTimeout"));
      } else {
        setCounts({ ...EMPTY_ACTION_CENTER_COUNTS });
        setSoftNote(t("opsAdmin.adminHome.softNoteTimeout"));
      }
    } finally {
      if (!mountedRef.current) return;
      hasLoadedOnceRef.current = true;
      setRefreshing(false);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    void load({ isRefresh: countsReadyRef.current });
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  const metricLoading = () => loading && !refreshing && !countsReadyRef.current;

  return (
    <DashboardShell className="admin-ops-home" data-testid="admin-action-center">
      <div className="acc-page">
        <section className="acc-section" aria-labelledby="admin-action-cards-heading">
          <div className="acc-section__head">
            <h2 id="admin-action-cards-heading" className="acc-section__title">
              {t("opsAdmin.adminHome.tasksTitle")}
            </h2>
            <div className="acc-section__head-actions">
              {softNote ? (
                <p className="acc-counts-soft-note" role="status" data-testid="admin-action-partial-note">
                  {softNote}
                  <button
                    type="button"
                    className="acc-counts-soft-note__btn"
                    onClick={() => void load({ isRefresh: true })}
                    disabled={refreshing}
                  >
                    {t("opsAdmin.common.retry")}
                  </button>
                </p>
              ) : null}
              <button
                type="button"
                className={`btn btn-secondary acc-section__refresh${refreshing ? " acc-btn--refreshing" : ""}`}
                onClick={() => void load({ isRefresh: true })}
                disabled={loading && !hasLoadedOnceRef.current}
                data-testid="admin-action-refresh"
              >
                <RefreshCw
                  size={16}
                  strokeWidth={2}
                  className={refreshing ? "acc-spin" : undefined}
                  style={{ verticalAlign: "middle", marginInlineEnd: 4 }}
                  aria-hidden
                />
                {refreshing ? t("opsAdmin.adminHome.refreshing") : t("opsAdmin.adminHome.refresh")}
              </button>
            </div>
          </div>
          <div className="acc-actions-grid acc-actions-grid--admin-center">
            {actionCards.map((card) => (
              <ActionCard
                key={card.id}
                card={card}
                count={card.countKey ? counts[card.countKey] : null}
                loading={card.countKey ? metricLoading() : false}
              />
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
