import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Archive,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Coins,
  Hourglass,
  Package,
  PackageOpen,
  PauseCircle,
  PlayCircle,
  Send,
  Wallet,
} from "lucide-react";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import InstitutionalCreateOrderModal from "./InstitutionalCreateOrderModal";
import { superAdminBreadcrumbs } from "../../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import {
  adminArchiveInstitutionalOrderRequest,
  adminCancelInstitutionalBatchRequest,
  adminCreateInstitutionalStorageOrderRequest,
  adminGenerateInstitutionalScheduleRequest,
  adminGetInstitutionalScheduleRequest,
  adminGetInstitutionalSchedulerHealthRequest,
  adminGetInstitutionalStorageRequest,
  adminListInstitutionalBatchOrdersRequest,
  adminListInstitutionalReleaseLogsRequest,
  adminListInstitutionalStorageOrdersRequest,
  adminMoveInstitutionalOrderToBatchRequest,
  adminRemoveInstitutionalOrderFromBatchRequest,
  adminRetryInstitutionalBatchRequest,
  adminSubmitInstitutionalOrderRequest,
  adminTransitionInstitutionalStorageStatusRequest,
  adminUpdateInstitutionalBatchRequest,
} from "../../../services/api";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import "./institutionalStorageDetail.css";

const BASE = "/dashboard/super-admin/institutional-order-storage";
const INSTITUTIONS_BASE = "/dashboard/super-admin/institutions";

const EMPTY_ORDER_COUNTS = {
  totalOrdersCount: 0,
  availableOrdersCount: 0,
  distributedOrdersCount: 0,
  completedOrdersCount: 0,
};

const STATUS_ACTIONS = {
  draft: ["active", "archived"],
  active: ["paused", "archived"],
  paused: ["active", "archived"],
  archived: [],
};

const TABS = ["overview", "orders", "schedule", "scheduler"];

function statusLabel(status, t) {
  const key = `dashboard.institutionalOrderStorage.status_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function batchStatusLabel(status, t) {
  const key = `dashboard.institutionalOrderStorage.batch_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function lifecycleLabel(status, t) {
  const key = `dashboard.institutionalOrderStorage.lifecycle_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function releaseStatusLabel(status, t) {
  const key = `dashboard.institutionalOrderStorage.release_${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function liveOrderStatusLabel(status, t) {
  if (!status) return "—";
  const key = `orders.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

function releaseLogEventLabel(event, t) {
  if (!event) return "—";
  const key = `dashboard.institutionalOrderStorage.logEvent_${event}`;
  const translated = t(key);
  return translated === key ? String(event).replace(/_/g, " ") : translated;
}

function looksTechnicalLabel(value) {
  const s = String(value || "").trim();
  if (!s) return true;
  if (/^(storage|inst)\s*rel\b/i.test(s)) return true;
  if (/\brel\s+\d{3,}/i.test(s)) return true;
  if (/^(storage|institution)Id$/i.test(s)) return true;
  return false;
}

function storageDisplayName(storage, t) {
  const name = String(storage?.name || "").trim();
  if (name && !looksTechnicalLabel(name)) return name;
  const institutionNames = (storage?.institutions || [])
    .map((i) => String(i?.name || "").trim())
    .filter((n) => n && !looksTechnicalLabel(n));
  if (institutionNames.length === 1) return institutionNames[0];
  if (institutionNames.length > 1) {
    return t("dashboard.institutionalOrderStorage.storageWithInstitutions", {
      count: institutionNames.length,
      names: institutionNames.slice(0, 2).join(t("dashboard.institutionalOrderStorage.nameJoin")),
    });
  }
  return t("dashboard.institutionalOrderStorage.title");
}

function storageDisplayDescription(storage, t) {
  const desc = String(storage?.description || "").trim();
  if (desc && !looksTechnicalLabel(desc)) return desc;
  const institutionNames = (storage?.institutions || [])
    .map((i) => String(i?.name || "").trim())
    .filter((n) => n && !looksTechnicalLabel(n));
  if (institutionNames.length) {
    return t("dashboard.institutionalOrderStorage.descriptionWithInstitutions", {
      names: institutionNames.join(t("dashboard.institutionalOrderStorage.nameJoin")),
    });
  }
  return t("dashboard.institutionalOrderStorage.description");
}

function institutionDisplayName(inst, t) {
  const name = String(inst?.name || "").trim();
  if (name && !looksTechnicalLabel(name)) return name;
  return t("dashboard.institutionalOrderStorage.linkedInstitutionFallback");
}

function institutionStatusLabel(status, t) {
  if (status === "active") return t("dashboard.institutions.active");
  if (status === "frozen") return t("dashboard.institutions.frozen");
  if (status === "inactive") return t("dashboard.institutions.inactive");
  return String(status || "—");
}

function formatMoney(value, t) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t("dashboard.institutionalOrderStorage.currencyJod")}`;
}

function formatDate(value, locale) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(locale === "en" ? "en-GB" : "ar-JO");
  } catch {
    return String(value);
  }
}

function formatDateTime(value, locale) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale === "en" ? "en-GB" : "ar-JO");
  } catch {
    return String(value);
  }
}

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StorageStatusBadge({ status, t }) {
  const tone =
    status === "active"
      ? "oh-ios-detail__status--active"
      : status === "paused"
        ? "oh-ios-detail__status--paused"
        : status === "archived"
          ? "oh-ios-detail__status--archived"
          : "oh-ios-detail__status--draft";
  return <span className={`oh-ios-detail__status ${tone}`}>{statusLabel(status, t)}</span>;
}

function KpiCard({ label, value, Icon, hint }) {
  return (
    <article className="oh-ios-detail__kpi">
      <span className="oh-ios-detail__kpi-icon" aria-hidden>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="oh-ios-detail__kpi-label">{label}</p>
        <p className="oh-ios-detail__kpi-value">{value}</p>
        {hint ? <p className="oh-ios-detail__kpi-hint">{hint}</p> : null}
      </div>
    </article>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="oh-ios-detail__dl-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function actionButtonClass(action) {
  if (action === "active") return "btn btn-primary";
  if (action === "paused") return "btn btn-secondary oh-ios-detail__btn-warn";
  if (action === "archived") return "btn btn-secondary oh-ios-detail__btn-archive";
  return "btn btn-secondary";
}

function actionIcon(action) {
  if (action === "active") return PlayCircle;
  if (action === "paused") return PauseCircle;
  if (action === "archived") return Archive;
  return null;
}

function actionLabel(action, currentStatus, t) {
  if (action === "active" && currentStatus === "paused") {
    return t("dashboard.institutionalOrderStorage.action_resume");
  }
  return t(`dashboard.institutionalOrderStorage.action_${action}`);
}

export default function InstitutionalOrderStorageDetailPage() {
  const { storageId } = useParams();
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [tab, setTab] = useState("overview");
  const [storage, setStorage] = useState(null);
  const [orders, setOrders] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [releaseLogs, setReleaseLogs] = useState([]);
  const [schedulerHealth, setSchedulerHealth] = useState(null);
  const [batchOrders, setBatchOrders] = useState({});
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const createOrderBtnRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [moveTarget, setMoveTarget] = useState({ orderId: "", batchId: "" });
  const [editDates, setEditDates] = useState({});
  const [overviewError, setOverviewError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setOverviewError(null);
    try {
      const [sRes, oRes, schRes, logsRes, healthRes] = await Promise.all([
        adminGetInstitutionalStorageRequest(storageId),
        adminListInstitutionalStorageOrdersRequest(storageId, { limit: 100 }),
        adminGetInstitutionalScheduleRequest(storageId).catch(() => null),
        adminListInstitutionalReleaseLogsRequest(storageId, { limit: 40 }).catch(() => null),
        adminGetInstitutionalSchedulerHealthRequest().catch(() => null),
      ]);
      setStorage(sRes?.data?.storage || null);
      setOrders(oRes?.data?.orders || []);
      setSchedule(schRes?.data?.schedule || null);
      setReleaseLogs(logsRes?.data?.logs || []);
      setSchedulerHealth(healthRes?.data?.health || null);
    } catch (e) {
      setOverviewError(getSafeApiErrorMessage(e));
      push({ type: "error", message: getSafeApiErrorMessage(e) });
    } finally {
      setLoading(false);
    }
  }, [storageId, push]);

  const orderCounts = useMemo(() => {
    if (!storage) return EMPTY_ORDER_COUNTS;
    return {
      totalOrdersCount: Number(storage.totalOrdersCount ?? 0),
      availableOrdersCount: Number(storage.availableOrdersCount ?? 0),
      distributedOrdersCount: Number(storage.distributedOrdersCount ?? 0),
      completedOrdersCount: Number(storage.completedOrdersCount ?? 0),
    };
  }, [storage]);

  const usedAmountJod = useMemo(() => {
    const limit = Number(storage?.financialLimitJod);
    const remaining = Number(storage?.remainingJod);
    if (!Number.isFinite(limit) || !Number.isFinite(remaining)) return null;
    return Math.max(0, limit - remaining);
  }, [storage]);

  const institutions = storage?.institutions || [];

  useEffect(() => {
    void load();
  }, [load]);

  const futureBatches = useMemo(() => {
    const batches = [];
    for (const m of schedule?.months || []) {
      for (const b of m.batches || []) {
        if (!["RELEASED", "CANCELLED", "PROCESSING"].includes(b.status)) {
          batches.push(b);
        }
      }
    }
    return batches;
  }, [schedule]);

  const onSubmitFormData = async (fd) => adminCreateInstitutionalStorageOrderRequest(storageId, fd);

  const onCreateOrderSuccess = async () => {
    setShowWizard(false);
    await load();
  };

  const runStatusTransition = async (nextStatus, { confirmPastBatches = false } = {}) => {
    setBusy(true);
    try {
      await adminTransitionInstitutionalStorageStatusRequest(storageId, {
        status: nextStatus,
        confirmPastBatches,
        allowPastBatches: confirmPastBatches,
      });
      push({ type: "success", message: t("dashboard.institutionalOrderStorage.statusUpdated") });
      setConfirm(null);
      await load();
    } catch (e) {
      const code = e?.response?.data?.code;
      if (code === "PAST_RELEASE_DATES" && nextStatus === "active") {
        setConfirm({
          type: "activate_past",
          title: t("dashboard.institutionalOrderStorage.confirmActivatePastTitle"),
          body: getSafeApiErrorMessage(e),
          onConfirm: () => void runStatusTransition("active", { confirmPastBatches: true }),
        });
      } else {
        push({ type: "error", message: getSafeApiErrorMessage(e) });
      }
    } finally {
      setBusy(false);
    }
  };

  const requestStatus = (nextStatus) => {
    const messages = {
      active: {
        title: t("dashboard.institutionalOrderStorage.confirmActivateTitle"),
        body: t("dashboard.institutionalOrderStorage.confirmActivateBody"),
      },
      paused: {
        title: t("dashboard.institutionalOrderStorage.confirmPauseTitle"),
        body: t("dashboard.institutionalOrderStorage.confirmPauseBody"),
      },
      archived: {
        title: t("dashboard.institutionalOrderStorage.confirmArchiveStorageTitle"),
        body: t("dashboard.institutionalOrderStorage.confirmArchiveStorageBody"),
      },
    };
    const msg = messages[nextStatus] || {
      title: t("dashboard.institutionalOrderStorage.confirmStatusTitle"),
      body: t("dashboard.institutionalOrderStorage.confirmStatusBody"),
    };
    setConfirm({
      type: "status",
      title: msg.title,
      body: msg.body,
      onConfirm: () => void runStatusTransition(nextStatus),
    });
  };

  const loadBatchOrders = async (batchId) => {
    try {
      const res = await adminListInstitutionalBatchOrdersRequest(batchId);
      setBatchOrders((prev) => ({ ...prev, [batchId]: res?.data?.orders || [] }));
    } catch (e) {
      push({ type: "error", message: getSafeApiErrorMessage(e) });
    }
  };

  const archiveOrder = (order) => {
    const released = order.lifecycleStatus === "released" || order.releasedOrderId;
    setConfirm({
      type: "archive_order",
      title: t("dashboard.institutionalOrderStorage.confirmArchiveOrderTitle"),
      body: released
        ? t("dashboard.institutionalOrderStorage.confirmArchiveAfterRelease")
        : t("dashboard.institutionalOrderStorage.confirmArchiveBeforeRelease"),
      onConfirm: async () => {
        setBusy(true);
        try {
          await adminArchiveInstitutionalOrderRequest(order.id);
          push({ type: "success", message: t("dashboard.institutionalOrderStorage.archive") });
          setConfirm(null);
          await load();
        } catch (e) {
          push({ type: "error", message: getSafeApiErrorMessage(e) });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  if (loading && !storage) {
    return (
      <DashboardShell>
        <DashboardLoadingState label={t("dashboard.institutionalOrderStorage.loading")} />
      </DashboardShell>
    );
  }

  const allowedActions = STATUS_ACTIONS[storage?.status] || [];
  const storageTitle = storage ? storageDisplayName(storage, t) : t("dashboard.institutionalOrderStorage.title");
  const storageDesc = storage ? storageDisplayDescription(storage, t) : t("dashboard.institutionalOrderStorage.description");

  const orderActionButtons = (o) => (
    <div className="oh-ios-detail__order-actions">
      {o.lifecycleStatus === "draft" || o.lifecycleStatus === "rejected" ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await adminSubmitInstitutionalOrderRequest(o.id);
              await load();
            } catch (e) {
              push({ type: "error", message: getSafeApiErrorMessage(e) });
            }
          }}
        >
          {t("dashboard.institutionalOrderStorage.submitApproval")}
        </button>
      ) : null}
      {["approved_unscheduled", "scheduled", "pending_super_admin_approval", "draft", "released"].includes(
        o.lifecycleStatus,
      ) ? (
        <button type="button" className="btn btn-secondary" onClick={() => archiveOrder(o)}>
          {t("dashboard.institutionalOrderStorage.archive")}
        </button>
      ) : null}
    </div>
  );

  return (
    <DashboardShell>
      <div className="oh-ios-detail">
        <DashboardPageHeader
          breadcrumbs={superAdminBreadcrumbs("dashboard.nav.superAdmin.institutionalOrderStorage")}
          title={storageTitle}
          description={storageDesc}
          statusBadge={storage ? <StorageStatusBadge status={storage.status} t={t} /> : null}
          actions={
            <Link to={BASE} className="btn btn-secondary">
              {t("dashboard.institutionalOrderStorage.backToList")}
            </Link>
          }
          secondaryActions={
            storage && allowedActions.length ? (
              <div
                className="oh-ios-detail__hero-actions"
                role="toolbar"
                aria-label={t("dashboard.institutionalOrderStorage.actionsToolbar")}
              >
                {allowedActions.map((action) => {
                  const Icon = actionIcon(action);
                  return (
                    <button
                      key={action}
                      type="button"
                      className={actionButtonClass(action)}
                      disabled={busy}
                      onClick={() => requestStatus(action)}
                    >
                      {Icon ? <Icon size={16} strokeWidth={1.9} aria-hidden /> : null}
                      {actionLabel(action, storage.status, t)}
                    </button>
                  );
                })}
              </div>
            ) : null
          }
        />

        {storage ? (
          <div className="oh-ios-detail__meta-bar" aria-label={t("dashboard.institutionalOrderStorage.overview")}>
            <StorageStatusBadge status={storage.status} t={t} />
            <span className="oh-ios-detail__meta-chip">
              <Building2 size={14} strokeWidth={1.85} aria-hidden />
              {t("dashboard.institutionalOrderStorage.linkedInstitutionsCount", {
                count: institutions.length,
              })}
            </span>
            <span className="oh-ios-detail__meta-chip">
              <CalendarClock size={14} strokeWidth={1.85} aria-hidden />
              {t("dashboard.institutionalOrderStorage.createdAtLabel")}: {formatDate(storage.createdAt, locale)}
            </span>
          </div>
        ) : null}

        {overviewError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
            <p className="m-0">{overviewError}</p>
            <button type="button" className="btn btn-secondary mt-2" onClick={() => void load()}>
              {t("dashboard.institutionalOrderStorage.retry")}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="oh-ios-detail__kpi-stack" aria-busy="true" aria-label={t("dashboard.institutionalOrderStorage.kpiLoading")}>
            <div className="oh-ios-detail__kpi-grid">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="oh-ios-detail__kpi animate-pulse bg-slate-100" />
              ))}
            </div>
          </div>
        ) : storage ? (
          <div className="oh-ios-detail__kpi-stack">
            <section aria-label={t("dashboard.institutionalOrderStorage.kpiOrdersGroup")}>
              <h2 className="oh-ios-detail__kpi-heading">{t("dashboard.institutionalOrderStorage.kpiOrdersGroup")}</h2>
              <div className="oh-ios-detail__kpi-grid">
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.kpiTotalOrders")}
                  value={orderCounts.totalOrdersCount}
                  Icon={ClipboardList}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.kpiAvailableOrders")}
                  value={orderCounts.availableOrdersCount}
                  Icon={PackageOpen}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.kpiDistributedOrders")}
                  value={orderCounts.distributedOrdersCount}
                  Icon={Send}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.kpiCompletedOrders")}
                  value={orderCounts.completedOrdersCount}
                  Icon={CheckCircle2}
                />
              </div>
            </section>
            <section aria-label={t("dashboard.institutionalOrderStorage.kpiFinancialGroup")}>
              <h2 className="oh-ios-detail__kpi-heading">{t("dashboard.institutionalOrderStorage.kpiFinancialGroup")}</h2>
              <div className="oh-ios-detail__kpi-grid oh-ios-detail__kpi-grid--finance">
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.financialLimit")}
                  value={formatMoney(storage.financialLimitJod, t)}
                  Icon={Wallet}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.remaining")}
                  value={formatMoney(storage.remainingJod, t)}
                  Icon={Coins}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.pendingValue")}
                  value={formatMoney(storage.pendingValueJod, t)}
                  Icon={Hourglass}
                  hint={t("dashboard.institutionalOrderStorage.pendingValueHint")}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.usedAmount")}
                  value={usedAmountJod == null ? "—" : formatMoney(usedAmountJod, t)}
                  Icon={Coins}
                />
                <KpiCard
                  label={t("dashboard.institutionalOrderStorage.linkedInstitutions")}
                  value={institutions.length}
                  Icon={Building2}
                />
              </div>
            </section>
          </div>
        ) : null}

        <div className="oh-ios-detail__tabs" role="tablist" aria-label={t("dashboard.institutionalOrderStorage.tabsLabel")}>
          {TABS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`ios-tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`ios-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              className={`oh-ios-detail__tab${tab === key ? " oh-ios-detail__tab--active" : ""}`}
              onClick={() => setTab(key)}
              onKeyDown={(e) => {
                const idx = TABS.indexOf(key);
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  const dir = e.key === "ArrowRight" ? 1 : -1;
                  const next = TABS[(idx + dir + TABS.length) % TABS.length];
                  setTab(next);
                  requestAnimationFrame(() => document.getElementById(`ios-tab-${next}`)?.focus());
                } else if (e.key === "Home") {
                  e.preventDefault();
                  setTab(TABS[0]);
                  requestAnimationFrame(() => document.getElementById(`ios-tab-${TABS[0]}`)?.focus());
                } else if (e.key === "End") {
                  e.preventDefault();
                  const last = TABS[TABS.length - 1];
                  setTab(last);
                  requestAnimationFrame(() => document.getElementById(`ios-tab-${last}`)?.focus());
                }
              }}
            >
              {t(`dashboard.institutionalOrderStorage.tab_${key}`)}
            </button>
          ))}
        </div>

        {tab === "overview" && storage ? (
          <div
            className="oh-ios-detail__panel"
            role="tabpanel"
            id="ios-panel-overview"
            aria-labelledby="ios-tab-overview"
          >
            <div className="oh-ios-detail__cards">
              <section className="oh-ios-detail__info-card">
                <h3>{t("dashboard.institutionalOrderStorage.infoStorageTitle")}</h3>
                <dl className="oh-ios-detail__dl">
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.status")}
                    value={<StorageStatusBadge status={storage.status} t={t} />}
                  />
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.createdAtLabel")}
                    value={formatDateTime(storage.createdAt, locale)}
                  />
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.updatedAtLabel")}
                    value={formatDateTime(storage.updatedAt, locale)}
                  />
                </dl>
              </section>

              <section className="oh-ios-detail__info-card">
                <h3>{t("dashboard.institutionalOrderStorage.infoFinancialTitle")}</h3>
                <dl className="oh-ios-detail__dl">
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.financialLimit")}
                    value={formatMoney(storage.financialLimitJod, t)}
                  />
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.remaining")}
                    value={formatMoney(storage.remainingJod, t)}
                  />
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.pendingValue")}
                    value={formatMoney(storage.pendingValueJod, t)}
                  />
                  <InfoRow
                    label={t("dashboard.institutionalOrderStorage.usedAmount")}
                    value={usedAmountJod == null ? "—" : formatMoney(usedAmountJod, t)}
                  />
                </dl>
              </section>
            </div>

            <section className="oh-ios-detail__info-card oh-ios-detail__cards--institutions">
              <h3>{t("dashboard.institutionalOrderStorage.infoInstitutionsTitle")}</h3>
              {institutions.length === 0 ? (
                <DashboardEmptyState title={t("dashboard.institutionalOrderStorage.institutionsEmpty")} />
              ) : (
                <ul className="oh-ios-detail__inst-list">
                  {institutions.map((inst) => (
                    <li key={inst.id} className="oh-ios-detail__inst-row">
                      <div className="min-w-0">
                        <Link to={`${INSTITUTIONS_BASE}/${inst.id}`} className="oh-ios-detail__inst-name">
                          {institutionDisplayName(inst, t)}
                        </Link>
                        <div className="mt-1">
                          <span className="oh-ios-detail__lifecycle">{institutionStatusLabel(inst.status, t)}</span>
                        </div>
                      </div>
                      <Link to={`${INSTITUTIONS_BASE}/${inst.id}`} className="btn btn-secondary">
                        {t("dashboard.institutionalOrderStorage.viewInstitution")}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === "orders" ? (
          <div className="oh-ios-detail__panel" role="tabpanel" id="ios-panel-orders" aria-labelledby="ios-tab-orders">
            <DashboardSection
              title={t("dashboard.institutionalOrderStorage.orders")}
              actions={
                <button
                  ref={createOrderBtnRef}
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setShowWizard(true)}
                >
                  {t("dashboard.institutionalOrderStorage.createOrder")}
                </button>
              }
            >
              <InstitutionalCreateOrderModal
                open={showWizard}
                onClose={() => setShowWizard(false)}
                onSubmitFormData={onSubmitFormData}
                onSuccess={onCreateOrderSuccess}
                storageName={storageTitle}
                triggerRef={createOrderBtnRef}
              />
              {orders.length === 0 ? (
                <DashboardEmptyState
                  title={t("dashboard.institutionalOrderStorage.ordersEmpty")}
                  icon={<Package size={40} strokeWidth={1.5} aria-hidden />}
                />
              ) : (
                <>
                  <div className="oh-ios-detail__orders-desktop dash-ui-table-wrap">
                    <table className="dash-ui-table w-full border-collapse text-[0.88rem]">
                      <thead>
                        <tr>
                          <th>{t("dashboard.institutionalOrderStorage.orderTitle")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.storedStatus")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.liveStatus")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.price")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.createdAtLabel")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <tr key={o.id}>
                            <td className="max-w-[14rem] break-words font-semibold">{o.title}</td>
                            <td>
                              <span className="oh-ios-detail__lifecycle">{lifecycleLabel(o.lifecycleStatus, t)}</span>
                            </td>
                            <td>{liveOrderStatusLabel(o.liveOrder?.orderStatus, t)}</td>
                            <td className="tabular-nums whitespace-nowrap">{formatMoney(o.orderPriceJod, t)}</td>
                            <td className="whitespace-nowrap">{formatDate(o.createdAt || o.approvedAt, locale)}</td>
                            <td>{orderActionButtons(o)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul className="oh-ios-detail__orders-mobile">
                    {orders.map((o) => (
                      <li key={`m-${o.id}`} className="oh-ios-detail__order-card">
                        <h4 className="oh-ios-detail__order-card-title">{o.title}</h4>
                        <div className="oh-ios-detail__order-card-meta">
                          <span className="oh-ios-detail__lifecycle">{lifecycleLabel(o.lifecycleStatus, t)}</span>
                          <span>{formatMoney(o.orderPriceJod, t)}</span>
                          <span>{formatDate(o.createdAt || o.approvedAt, locale)}</span>
                          {o.liveOrder?.orderStatus ? (
                            <span>
                              {t("dashboard.institutionalOrderStorage.liveStatus")}:{" "}
                              {liveOrderStatusLabel(o.liveOrder.orderStatus, t)}
                            </span>
                          ) : null}
                        </div>
                        {orderActionButtons(o)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </DashboardSection>
          </div>
        ) : null}

        {tab === "schedule" ? (
          <div
            className="oh-ios-detail__panel"
            role="tabpanel"
            id="ios-panel-schedule"
            aria-labelledby="ios-tab-schedule"
          >
            <DashboardSection
              title={t("dashboard.institutionalOrderStorage.schedule")}
              actions={
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await adminGenerateInstitutionalScheduleRequest(storageId, { regenerate: false });
                      await load();
                      push({ type: "success", message: t("dashboard.institutionalOrderStorage.generateSchedule") });
                    } catch (e) {
                      push({ type: "error", message: getSafeApiErrorMessage(e) });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {t("dashboard.institutionalOrderStorage.generateSchedule")}
                </button>
              }
            >
              <DashboardSection title={t("dashboard.institutionalOrderStorage.unscheduledSection")}>
                {(schedule?.unscheduledOrders || []).length === 0 ? (
                  <p className="m-0 text-sm text-slate-600">{t("dashboard.institutionalOrderStorage.unscheduledEmpty")}</p>
                ) : (
                  <div className="dash-ui-table-wrap">
                    <table className="dash-ui-table w-full border-collapse text-[0.88rem]">
                      <thead>
                        <tr>
                          <th>{t("dashboard.institutionalOrderStorage.orderTitle")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.price")}</th>
                          <th>{t("dashboard.institutionalOrderStorage.moveToBatch")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(schedule?.unscheduledOrders || []).map((o) => (
                          <tr key={o.id}>
                            <td className="break-words font-semibold">{o.title}</td>
                            <td>{formatMoney(o.orderPriceJod, t)}</td>
                            <td>
                              <div className="oh-ios-detail__batch-tools">
                                <select
                                  className="input"
                                  value={moveTarget.orderId === o.id ? moveTarget.batchId : ""}
                                  onChange={(e) => setMoveTarget({ orderId: o.id, batchId: e.target.value })}
                                  aria-label={t("dashboard.institutionalOrderStorage.moveToBatch")}
                                >
                                  <option value="">{t("dashboard.institutionalOrderStorage.selectBatch")}</option>
                                  {futureBatches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {formatDateTime(b.scheduledReleaseAt, locale)} — {batchStatusLabel(b.status, t)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={!moveTarget.batchId || moveTarget.orderId !== o.id}
                                  onClick={async () => {
                                    try {
                                      await adminMoveInstitutionalOrderToBatchRequest(o.id, {
                                        targetBatchId: moveTarget.batchId,
                                      });
                                      setMoveTarget({ orderId: "", batchId: "" });
                                      await load();
                                    } catch (e) {
                                      push({ type: "error", message: getSafeApiErrorMessage(e) });
                                    }
                                  }}
                                >
                                  {t("dashboard.institutionalOrderStorage.assignToBatch")}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </DashboardSection>

              {(schedule?.months || []).length === 0 ? (
                <DashboardEmptyState title={t("dashboard.institutionalOrderStorage.scheduleEmpty")} />
              ) : (
                (schedule?.months || []).map((m) => (
                  <div key={m.id} className="mb-4">
                    <h4 className="oh-ios-detail__month-title">
                      {t("dashboard.institutionalOrderStorage.monthLabel", { n: m.monthSequence })}: {m.periodStartDate} →{" "}
                      {m.periodEndDate} ({m.targetOrderCount})
                    </h4>
                    {(m.batches || []).map((b) => {
                      const immutable = ["RELEASED", "PROCESSING"].includes(b.status);
                      const ordersForBatch = batchOrders[b.id];
                      return (
                        <div key={b.id} className="oh-ios-detail__batch-card">
                          <div className="oh-ios-detail__batch-head">
                            <span className="oh-ios-detail__lifecycle">{batchStatusLabel(b.status, t)}</span>
                            <span className="text-sm text-slate-600">
                              {t("dashboard.institutionalOrderStorage.releaseAt")}:{" "}
                              {formatDateTime(b.scheduledReleaseAt, locale)}
                            </span>
                            <span className="text-sm text-slate-600">
                              {t("dashboard.institutionalOrderStorage.assigned")}: {b.assignedOrderCount} /{" "}
                              {t("dashboard.institutionalOrderStorage.released")}: {b.releasedCount}
                            </span>
                            {b.failureReason ? (
                              <span role="alert" className="text-sm text-amber-800">
                                {t("dashboard.institutionalOrderStorage.failureReason")}:{" "}
                                {/^[a-z0-9_]+$/i.test(String(b.failureReason))
                                  ? t("dashboard.institutionalOrderStorage.failureReasonGeneric")
                                  : b.failureReason}
                              </span>
                            ) : null}
                          </div>
                          {!immutable ? (
                            <div className="oh-ios-detail__batch-tools">
                              <label className="dash-ui-stack grid gap-1 text-sm">
                                {t("dashboard.institutionalOrderStorage.editReleaseAt")}
                                <input
                                  type="datetime-local"
                                  className="input"
                                  value={editDates[b.id] ?? toLocalInputValue(b.scheduledReleaseAt)}
                                  onChange={(e) => setEditDates((prev) => ({ ...prev, [b.id]: e.target.value }))}
                                />
                              </label>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={async () => {
                                  const raw = editDates[b.id] ?? toLocalInputValue(b.scheduledReleaseAt);
                                  try {
                                    await adminUpdateInstitutionalBatchRequest(b.id, {
                                      scheduledReleaseAt: new Date(raw).toISOString(),
                                    });
                                    await load();
                                  } catch (e) {
                                    push({ type: "error", message: getSafeApiErrorMessage(e) });
                                  }
                                }}
                              >
                                {t("dashboard.institutionalOrderStorage.saveReleaseAt")}
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() =>
                                  setConfirm({
                                    type: "cancel_batch",
                                    title: t("dashboard.institutionalOrderStorage.confirmCancelBatchTitle"),
                                    body: t("dashboard.institutionalOrderStorage.confirmCancelBatchBody"),
                                    onConfirm: async () => {
                                      try {
                                        await adminCancelInstitutionalBatchRequest(b.id);
                                        setConfirm(null);
                                        await load();
                                      } catch (e) {
                                        push({ type: "error", message: getSafeApiErrorMessage(e) });
                                      }
                                    },
                                  })
                                }
                              >
                                {t("dashboard.institutionalOrderStorage.cancelBatch")}
                              </button>
                            </div>
                          ) : null}
                          {["FAILED", "PARTIALLY_RELEASED"].includes(b.status) ? (
                            <button
                              type="button"
                              className="btn btn-secondary mt-2"
                              onClick={async () => {
                                try {
                                  await adminRetryInstitutionalBatchRequest(b.id);
                                  await load();
                                } catch (e) {
                                  push({ type: "error", message: getSafeApiErrorMessage(e) });
                                }
                              }}
                            >
                              {t("dashboard.institutionalOrderStorage.retryBatch")}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-secondary mt-2"
                            onClick={() => void loadBatchOrders(b.id)}
                          >
                            {t("dashboard.institutionalOrderStorage.showBatchOrders")}
                          </button>
                          {ordersForBatch ? (
                            <ul className="mt-2 grid list-none gap-2 p-0">
                              {ordersForBatch.length === 0 ? (
                                <li className="text-sm text-slate-600">
                                  {t("dashboard.institutionalOrderStorage.batchOrdersEmpty")}
                                </li>
                              ) : (
                                ordersForBatch.map((bo) => (
                                  <li key={bo.storedOrderId} className="oh-ios-detail__inst-row">
                                    <span className="text-sm">
                                      <strong className="text-slate-900">{bo.title}</strong>
                                      {" · "}
                                      {lifecycleLabel(bo.lifecycleStatus, t)}
                                      {" · "}
                                      {releaseStatusLabel(bo.releaseStatus, t)}
                                    </span>
                                    {!immutable && bo.releaseStatus === "pending" ? (
                                      <div className="oh-ios-detail__batch-tools">
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          onClick={async () => {
                                            try {
                                              await adminRemoveInstitutionalOrderFromBatchRequest(b.id, bo.storedOrderId);
                                              await loadBatchOrders(b.id);
                                              await load();
                                            } catch (e) {
                                              push({ type: "error", message: getSafeApiErrorMessage(e) });
                                            }
                                          }}
                                        >
                                          {t("dashboard.institutionalOrderStorage.removeFromBatch")}
                                        </button>
                                        <select
                                          className="input"
                                          defaultValue=""
                                          onChange={async (e) => {
                                            const target = e.target.value;
                                            if (!target) return;
                                            try {
                                              await adminMoveInstitutionalOrderToBatchRequest(bo.storedOrderId, {
                                                targetBatchId: target,
                                              });
                                              await load();
                                              await loadBatchOrders(b.id);
                                            } catch (err) {
                                              push({ type: "error", message: getSafeApiErrorMessage(err) });
                                            }
                                          }}
                                          aria-label={t("dashboard.institutionalOrderStorage.moveToBatch")}
                                        >
                                          <option value="">{t("dashboard.institutionalOrderStorage.moveToBatch")}</option>
                                          {futureBatches
                                            .filter((fb) => fb.id !== b.id)
                                            .map((fb) => (
                                              <option key={fb.id} value={fb.id}>
                                                {formatDateTime(fb.scheduledReleaseAt, locale)}
                                              </option>
                                            ))}
                                        </select>
                                      </div>
                                    ) : null}
                                  </li>
                                ))
                              )}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </DashboardSection>

            <DashboardSection title={t("dashboard.institutionalOrderStorage.releaseLogs")}>
              {releaseLogs.length === 0 ? (
                <p className="m-0 text-sm text-slate-600">{t("dashboard.institutionalOrderStorage.releaseLogsEmpty")}</p>
              ) : (
                <div className="dash-ui-table-wrap">
                  <table className="dash-ui-table w-full border-collapse text-[0.88rem]">
                    <thead>
                      <tr>
                        <th>{t("dashboard.institutionalOrderStorage.logTime")}</th>
                        <th>{t("dashboard.institutionalOrderStorage.logEvent")}</th>
                        <th>{t("dashboard.institutionalOrderStorage.logResult")}</th>
                        <th>{t("dashboard.institutionalOrderStorage.logMessage")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {releaseLogs.map((log) => (
                        <tr key={log.id}>
                          <td>{formatDateTime(log.createdAt, locale)}</td>
                          <td>{releaseLogEventLabel(log.event, t)}</td>
                          <td>
                            {log.success
                              ? t("dashboard.institutionalOrderStorage.logSuccess")
                              : t("dashboard.institutionalOrderStorage.logFailure")}
                          </td>
                          <td>{log.message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </DashboardSection>
          </div>
        ) : null}

        {tab === "scheduler" ? (
          <div
            className="oh-ios-detail__panel"
            role="tabpanel"
            id="ios-panel-scheduler"
            aria-labelledby="ios-tab-scheduler"
          >
            <DashboardSection title={t("dashboard.institutionalOrderStorage.scheduler")}>
              {!schedulerHealth ? (
                <DashboardLoadingState label={t("dashboard.institutionalOrderStorage.loading")} />
              ) : (
                <>
                  {(schedulerHealth.warnings || []).length > 0 ? (
                    <ul className="oh-ios-detail__warn-list" role="alert">
                      {schedulerHealth.warnings.map((w) => (
                        <li key={w.code}>{w.messageAr || w.code}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="oh-ios-detail__scheduler-grid">
                    {[
                      {
                        label: t("dashboard.institutionalOrderStorage.schedulerMode"),
                        value:
                          schedulerHealth.schedulerMode === "in-process"
                            ? t("dashboard.institutionalOrderStorage.modeInProcess")
                            : schedulerHealth.schedulerMode === "external_cron_expected"
                              ? t("dashboard.institutionalOrderStorage.modeExternalCron")
                              : t("dashboard.institutionalOrderStorage.modeDisabled"),
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.schedulerProcess"),
                        value: schedulerHealth.processSchedulerEnabled
                          ? t("dashboard.institutionalOrderStorage.enabled")
                          : t("dashboard.institutionalOrderStorage.disabled"),
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.processRunning"),
                        value: schedulerHealth.processCurrentlyRunning
                          ? t("dashboard.institutionalOrderStorage.running")
                          : t("dashboard.institutionalOrderStorage.notRunning"),
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.schedulerTickMs"),
                        value: schedulerHealth.tickMs,
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.schedulerEnv"),
                        value: schedulerHealth.environmentMode,
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.lastSuccess"),
                        value: formatDateTime(schedulerHealth.lastSuccessAt, locale),
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.lastFailure"),
                        value: formatDateTime(schedulerHealth.lastFailureAt, locale),
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.lastError"),
                        value: schedulerHealth.lastTickError || "—",
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.nextDueBatch"),
                        value: schedulerHealth.nextDueBatch
                          ? `${
                              looksTechnicalLabel(schedulerHealth.nextDueBatch.storageName)
                                ? t("dashboard.institutionalOrderStorage.title")
                                : schedulerHealth.nextDueBatch.storageName
                            } · ${formatDateTime(
                              schedulerHealth.nextDueBatch.scheduledReleaseAt,
                              locale,
                            )}`
                          : "—",
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.overdueCount"),
                        value: schedulerHealth.overdueBatchCount,
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.processingCount"),
                        value: schedulerHealth.processingBatchCount ?? 0,
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.failedBatchCount"),
                        value: schedulerHealth.failedBatchCount ?? 0,
                      },
                      {
                        label: t("dashboard.institutionalOrderStorage.manualExecution"),
                        value: schedulerHealth.manualExecutionAvailable
                          ? t("dashboard.institutionalOrderStorage.available")
                          : t("dashboard.institutionalOrderStorage.unavailable"),
                      },
                    ].map((item) => (
                      <div key={item.label} className="oh-ios-detail__scheduler-item">
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </DashboardSection>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ""}
        body={confirm?.body || ""}
        confirmLabel={t("dashboard.institutionalOrderStorage.confirm")}
        cancelLabel={t("dashboard.institutionalOrderStorage.cancel")}
        confirmBusy={busy}
        confirmVariant={confirm?.type === "cancel_batch" || confirm?.type === "archive_order" ? "danger" : "primary"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm?.()}
      />
    </DashboardShell>
  );
}
