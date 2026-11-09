import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, Search, X } from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardModal from "../../components/dashboard/DashboardModal";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import Button from "../../components/ui/Button";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useToast } from "../../components/ui/toastContext";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  approveAdminExternalOrderIntakeRequest,
  getAdminExternalOrderIntakeRequest,
  getCategoriesRequest,
  listAdminExternalOrderIntakesRequest,
  rejectAdminExternalOrderIntakeRequest,
} from "../../services/api";
import { localizedApiErrorMessage } from "../../utils/apiErrorMessage";
import { getOrderStatusLabel } from "../../utils/orderFlowUi";
import { formatJodMoney } from "../../utils/formatJodMoney";
import { localizeCategoryName } from "../../lib/i18n/platformContentLocale";
import {
  EXTERNAL_INTAKES_CHANGED_EVENT,
  EXTERNAL_INTAKE_REJECTION_REASONS,
  EXTERNAL_INTAKE_STATUSES,
  externalIntakeStatusTone,
  isValidApprovalPriceInput,
  staffOrderPath,
} from "../../constants/externalOrderIntakes";
import "./whatsappOrders.css";

const NS = "dashboard.whatsappOrdersAdmin";
const SEARCH_DEBOUNCE_MS = 400;
const AUTO_NEXT_STORAGE_KEY = "orderz.whatsappOrders.autoNext";

function readAutoNext() {
  try {
    return window.localStorage.getItem(AUTO_NEXT_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

function formatDateTime(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const tag = locale === "ar" ? "ar-JO-u-nu-latn" : locale === "en" ? "en-GB" : locale;
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function notifyIntakesChanged() {
  try {
    window.dispatchEvent(new CustomEvent(EXTERNAL_INTAKES_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Admin / Super Admin queue: verify the external Order ID, set the price, approve (or reject). */
export default function AdminWhatsappOrdersPage() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const { pathname } = useLocation();
  const isSuperShell = pathname.startsWith("/dashboard/super-admin");
  const uid = useId();

  const [qInput, setQInput] = useState("");
  const [freelancerInput, setFreelancerInput] = useState("");
  const [status, setStatus] = useState("pending_review");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useDebounced(qInput.trim(), SEARCH_DEBOUNCE_MS);
  const freelancer = useDebounced(freelancerInput.trim(), SEARCH_DEBOUNCE_MS);
  // Changing any filter returns to page 1 (derived, no effect).
  const filterKey = JSON.stringify([q, freelancer, status, from, to]);
  const [pageState, setPageState] = useState({ key: filterKey, page: 1 });
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (p) => setPageState({ key: filterKey, page: p });

  const [reloadTick, setReloadTick] = useState(0);
  const requestKey = `${filterKey}|${page}|${reloadTick}`;
  // Last completed response; `loading` is derived from whether it matches the current request.
  const [result, setResult] = useState({ key: null, items: [], totalPages: 1, total: 0, error: "" });
  const [pendingCount, setPendingCount] = useState(null);
  const loading = result.key !== requestKey;
  const items = result.items;
  const { totalPages, total } = result;
  const loadError = loading ? "" : result.error;

  const [activeId, setActiveId] = useState(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const params = { page };
    if (status) params.status = status;
    if (q) params.q = q;
    if (freelancer) params.freelancer = freelancer;
    if (from) params.from = from;
    if (to) params.to = to;
    listAdminExternalOrderIntakesRequest(params, { signal: ctrl.signal })
      .then((res) => {
        const data = res?.data || {};
        setResult({
          key: requestKey,
          items: Array.isArray(data.items) ? data.items : [],
          totalPages: Math.max(1, Number(data.pagination?.totalPages) || 1),
          total: Number(data.pagination?.total) || 0,
          error: "",
        });
        if (data.pendingCount != null) setPendingCount(Number(data.pendingCount) || 0);
      })
      .catch((err) => {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        setResult((prev) => ({ ...prev, key: requestKey, error: localizedApiErrorMessage(err, locale) }));
      });
    return () => ctrl.abort();
  }, [requestKey, page, status, q, freelancer, from, to, locale]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);
  const hasFilters = Boolean(qInput || freelancerInput || from || to || status !== "pending_review");
  const clearFilters = () => {
    setQInput("");
    setFreelancerInput("");
    setFrom("");
    setTo("");
    setStatus("pending_review");
  };

  const statusLabel = (s) => t(`dashboard.whatsappOrders.status.${s}`);
  const freelancerLabel = (fl) => fl?.name || fl?.email || `#${fl?.id}`;
  const priceText = (row) => (row.price != null ? formatJodMoney(row.price, { locale }) : "—");

  const openReview = (row, ev) => {
    triggerRef.current = ev?.currentTarget || null;
    setActiveId(row.id);
  };

  const pendingIdsInView = useMemo(
    () => items.filter((r) => r.status === "pending_review").map((r) => r.id),
    [items],
  );

  const onProcessed = (processedId, { goNext }) => {
    notifyIntakesChanged();
    const idx = items.findIndex((r) => r.id === processedId);
    const next = goNext
      ? items.slice(idx + 1).find((r) => r.status === "pending_review" && r.id !== processedId)
      : null;
    setActiveId(next ? next.id : null);
    if (!next && goNext) push({ type: "info", message: t(`${NS}.review.noMorePending`) });
    reload();
  };

  const actionsCell = (row) => (
    <div className="wa-row-actions">
      <Button
        type="button"
        variant={row.status === "pending_review" ? "primary" : "secondary"}
        className="wa-btn-sm"
        onClick={(ev) => openReview(row, ev)}
        aria-label={t(`${NS}.actions.reviewAria`, { id: row.externalOrderId })}
      >
        {row.status === "pending_review" ? t(`${NS}.actions.review`) : t(`${NS}.actions.details`)}
      </Button>
    </div>
  );

  const orderCell = (row) =>
    row.order ? (
      <Link to={staffOrderPath(row.order.id, isSuperShell)} className="wa-link">
        <bdi dir="ltr">{row.order.orderCode || `#${row.order.id}`}</bdi>
        <span className="wa-sub">{getOrderStatusLabel(row.order.status, t)}</span>
      </Link>
    ) : (
      <span className="wa-muted">—</span>
    );

  return (
    <DashboardShell>
      <div className="wa-page wa-page--admin">
        <DashboardPageHeader
          className="wa-page__header"
          title={t(`${NS}.title`)}
          description={t(`${NS}.intro`)}
          breadcrumbs={[breadcrumbHomeCrumb(user), { label: t(`${NS}.title`) }]}
          statusBadge={
            pendingCount != null ? (
              <StatusBadge tone={pendingCount > 0 ? "pending" : "success"}>
                {t(`${NS}.pendingCount`, { count: pendingCount })}
              </StatusBadge>
            ) : null
          }
        />

        <section className="wa-card wa-filters" aria-label={t(`${NS}.filters.aria`)}>
          <div className="wa-filters__grid">
            <label className="wa-field" htmlFor={`${uid}-q`}>
              <span className="wa-label">{t(`${NS}.filters.id`)}</span>
              <span className="wa-input-icon">
                <Search size={15} aria-hidden />
                <input
                  id={`${uid}-q`}
                  className="input"
                  type="search"
                  dir={qInput ? "ltr" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder={t(`${NS}.filters.idPlaceholder`)}
                />
              </span>
            </label>
            <label className="wa-field" htmlFor={`${uid}-fl`}>
              <span className="wa-label">{t(`${NS}.filters.freelancer`)}</span>
              <input
                id={`${uid}-fl`}
                className="input"
                type="search"
                autoComplete="off"
                value={freelancerInput}
                onChange={(e) => setFreelancerInput(e.target.value)}
                placeholder={t(`${NS}.filters.freelancerPlaceholder`)}
              />
            </label>
            <label className="wa-field" htmlFor={`${uid}-st`}>
              <span className="wa-label">{t(`${NS}.filters.status`)}</span>
              <select id={`${uid}-st`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{t(`${NS}.filters.statusAll`)}</option>
                {EXTERNAL_INTAKE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="wa-field" htmlFor={`${uid}-from`}>
              <span className="wa-label">{t(`${NS}.filters.from`)}</span>
              <input id={`${uid}-from`} className="input" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="wa-field" htmlFor={`${uid}-to`}>
              <span className="wa-label">{t(`${NS}.filters.to`)}</span>
              <input id={`${uid}-to`} className="input" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            <div className="wa-filters__actions">
              <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasFilters}>
                {t(`${NS}.filters.clear`)}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="wa-icon-btn"
                onClick={reload}
                disabled={loading}
                aria-label={t(`${NS}.filters.refresh`)}
                title={t(`${NS}.filters.refresh`)}
              >
                <RefreshCw size={15} aria-hidden className={loading ? "wa-spin" : ""} />
              </Button>
            </div>
          </div>
        </section>

        <section className="wa-card wa-list wa-list--admin" aria-labelledby={`${uid}-list`} aria-busy={loading}>
          <div className="wa-card__head">
            <h2 id={`${uid}-list`} className="wa-card__title">
              {t(`${NS}.list.title`)}
            </h2>
            <span className="wa-muted" role="status">
              {loading ? t(`${NS}.list.loading`) : t(`${NS}.list.total`, { count: total })}
            </span>
          </div>

          {loadError ? (
            <div className="wa-error-box" role="alert">
              <p>{loadError}</p>
              <Button type="button" variant="secondary" onClick={reload}>
                {t(`${NS}.list.retry`)}
              </Button>
            </div>
          ) : null}

          {!loadError && !loading && items.length === 0 ? <p className="wa-empty">{t(`${NS}.list.empty`)}</p> : null}

          {items.length > 0 ? (
            <>
              <div className="wa-table-wrap">
                <table className="wa-table wa-table--admin">
                  <caption className="sr-only">{t(`${NS}.list.title`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t(`${NS}.columns.id`)}</th>
                      <th scope="col">{t(`${NS}.columns.freelancer`)}</th>
                      <th scope="col">{t(`${NS}.columns.submitted`)}</th>
                      <th scope="col">{t(`${NS}.columns.status`)}</th>
                      <th scope="col">{t(`${NS}.columns.price`)}</th>
                      <th scope="col">{t(`${NS}.columns.order`)}</th>
                      <th scope="col">
                        <span className="sr-only">{t(`${NS}.columns.actions`)}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id} className={row.id === activeId ? "is-active" : undefined}>
                        <td>
                          <bdi dir="ltr" className="wa-id">
                            {row.externalOrderId}
                          </bdi>
                        </td>
                        <td>
                          <span className="wa-ellipsis" dir="auto">
                            {freelancerLabel(row.freelancer)}
                          </span>
                          {row.freelancer?.accountId ? (
                            <bdi dir="ltr" className="wa-sub">
                              {row.freelancer.accountId}
                            </bdi>
                          ) : null}
                        </td>
                        <td className="wa-nowrap">{formatDateTime(row.submittedAt, locale)}</td>
                        <td>
                          <StatusBadge tone={externalIntakeStatusTone(row.status)} className="wa-nowrap">
                            {statusLabel(row.status)}
                          </StatusBadge>
                        </td>
                        <td className="wa-num">{priceText(row)}</td>
                        <td>{orderCell(row)}</td>
                        <td className="wa-actions-cell">{actionsCell(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="wa-cards">
                {items.map((row) => (
                  <li key={row.id} className="wa-item">
                    <div className="wa-item__top">
                      <bdi dir="ltr" className="wa-id wa-id--lg">
                        {row.externalOrderId}
                      </bdi>
                      <StatusBadge tone={externalIntakeStatusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                    </div>
                    <dl className="wa-item__meta">
                      <div>
                        <dt>{t(`${NS}.columns.freelancer`)}</dt>
                        <dd dir="auto">{freelancerLabel(row.freelancer)}</dd>
                      </div>
                      <div>
                        <dt>{t(`${NS}.columns.submitted`)}</dt>
                        <dd>{formatDateTime(row.submittedAt, locale)}</dd>
                      </div>
                      <div>
                        <dt>{t(`${NS}.columns.price`)}</dt>
                        <dd className="wa-num">{priceText(row)}</dd>
                      </div>
                      {row.order ? (
                        <div>
                          <dt>{t(`${NS}.columns.order`)}</dt>
                          <dd>{orderCell(row)}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {actionsCell(row)}
                  </li>
                ))}
              </ul>

              {totalPages > 1 ? (
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={loading} />
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      {activeId ? (
        <IntakeReviewDialog
          key={activeId}
          intakeId={activeId}
          triggerRef={triggerRef}
          isSuperShell={isSuperShell}
          pendingIdsInView={pendingIdsInView}
          onNavigate={setActiveId}
          onClose={() => setActiveId(null)}
          onProcessed={onProcessed}
        />
      ) : null}
    </DashboardShell>
  );
}

function IntakeReviewDialog({ intakeId, triggerRef, isSuperShell, pendingIdsInView, onNavigate, onClose, onProcessed }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const uid = useId();
  const priceRef = useRef(null);
  const busyRef = useRef(false);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [price, setPrice] = useState("");
  const [priceError, setPriceError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [durationValue, setDurationValue] = useState("7");
  const [durationUnit, setDurationUnit] = useState("days");
  const [internalNote, setInternalNote] = useState("");
  const [mode, setMode] = useState("approve");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [autoNext, setAutoNext] = useState(readAutoNext);

  useEffect(() => {
    const ctrl = new AbortController();
    getAdminExternalOrderIntakeRequest(intakeId, { signal: ctrl.signal })
      .then((res) => {
        setDetail(res?.data || null);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        setLoadError(localizedApiErrorMessage(err, locale));
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [intakeId, locale]);

  const intake = detail?.intake || null;
  const isPending = intake?.status === "pending_review";

  useEffect(() => {
    if (!isPending || mode !== "approve") return undefined;
    const id = window.setTimeout(() => priceRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [isPending, mode]);

  useEffect(() => {
    if (!showMore || categories.length) return;
    getCategoriesRequest()
      .then((res) => setCategories(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setCategories([]));
  }, [showMore, categories.length]);

  const setAutoNextPersist = (v) => {
    setAutoNext(v);
    try {
      window.localStorage.setItem(AUTO_NEXT_STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const idx = pendingIdsInView.indexOf(intakeId);
  const prevId = idx > 0 ? pendingIdsInView[idx - 1] : null;
  const nextId = idx >= 0 && idx < pendingIdsInView.length - 1 ? pendingIdsInView[idx + 1] : null;

  const approve = async (ev) => {
    ev?.preventDefault();
    if (busyRef.current) return;
    const p = String(price).trim().replace(",", ".");
    if (!isValidApprovalPriceInput(p)) {
      setPriceError(t(`${NS}.review.priceInvalid`));
      priceRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    try {
      const payload = { price: p };
      if (categoryId) payload.categoryId = Number(categoryId);
      if (showMore && durationValue) {
        payload.durationValue = Number(durationValue);
        payload.durationUnit = durationUnit;
      }
      if (internalNote.trim()) payload.internalNote = internalNote.trim();
      await approveAdminExternalOrderIntakeRequest(intakeId, payload);
      push({ type: "success", message: t(`${NS}.review.approvedToast`, { id: intake.externalOrderId }) });
      onProcessed(intakeId, { goNext: autoNext });
    } catch (err) {
      const code = err?.response?.data?.code;
      setActionError(localizedApiErrorMessage(err, locale));
      if (code === "EXTERNAL_ORDER_ALREADY_PROCESSED") {
        onProcessed(intakeId, { goNext: false });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const reject = async (ev) => {
    ev?.preventDefault();
    if (busyRef.current) return;
    if (!reasonCode) {
      setReasonError(t(`${NS}.review.reasonRequired`));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setActionError("");
    try {
      const payload = { reasonCode };
      if (internalNote.trim()) payload.internalNote = internalNote.trim();
      await rejectAdminExternalOrderIntakeRequest(intakeId, payload);
      push({ type: "success", message: t(`${NS}.review.rejectedToast`, { id: intake.externalOrderId }) });
      onProcessed(intakeId, { goNext: autoNext });
    } catch (err) {
      setActionError(localizedApiErrorMessage(err, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const statusLabel = (s) => t(`dashboard.whatsappOrders.status.${s}`);
  const eligibility = detail?.freelancerEligibility;

  const footer = isPending ? (
    <div className="wa-dialog__footer">
      <label className="wa-check">
        <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNextPersist(e.target.checked)} />
        <span>{t(`${NS}.review.autoNext`)}</span>
      </label>
      <div className="wa-dialog__footer-actions">
        {mode === "approve" ? (
          <>
            <Button type="button" variant="secondary" onClick={() => setMode("reject")} disabled={busy}>
              {t(`${NS}.review.rejectMode`)}
            </Button>
            <Button type="submit" form={`${uid}-approve`} variant="primary" disabled={busy} aria-busy={busy}>
              {busy ? t(`${NS}.review.approving`) : t(`${NS}.review.approve`)}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={() => setMode("approve")} disabled={busy}>
              {t(`${NS}.review.back`)}
            </Button>
            <Button type="submit" form={`${uid}-reject`} variant="danger" disabled={busy} aria-busy={busy}>
              {busy ? t(`${NS}.review.rejecting`) : t(`${NS}.review.reject`)}
            </Button>
          </>
        )}
      </div>
    </div>
  ) : null;

  return (
    <DashboardModal
      open
      title={t(`${NS}.review.title`)}
      subtitle={intake ? <bdi dir="ltr">{intake.externalOrderId}</bdi> : null}
      onClose={onClose}
      closeDisabled={busy}
      triggerRef={triggerRef}
      panelClassName="wa-dialog"
      footer={footer}
    >
      {loading ? (
        <p className="wa-muted" role="status">
          {t(`${NS}.list.loading`)}
        </p>
      ) : null}
      {loadError ? (
        <p className="wa-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {intake ? (
        <div className="wa-dialog__body">
          <div className="wa-dialog__nav">
            <Button type="button" variant="secondary" className="wa-btn-sm" onClick={() => onNavigate(prevId)} disabled={!prevId || busy}>
              {locale === "ar" ? <ChevronRight size={15} aria-hidden /> : <ChevronLeft size={15} aria-hidden />}
              <span>{t(`${NS}.review.previous`)}</span>
            </Button>
            <Button type="button" variant="secondary" className="wa-btn-sm" onClick={() => onNavigate(nextId)} disabled={!nextId || busy}>
              <span>{t(`${NS}.review.next`)}</span>
              {locale === "ar" ? <ChevronLeft size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
            </Button>
          </div>

          <dl className="wa-facts">
            <div>
              <dt>{t(`${NS}.columns.id`)}</dt>
              <dd>
                <bdi dir="ltr" className="wa-id wa-id--lg">
                  {intake.externalOrderId}
                </bdi>
              </dd>
            </div>
            <div>
              <dt>{t(`${NS}.columns.freelancer`)}</dt>
              <dd>
                <span dir="auto">{intake.freelancer?.name || intake.freelancer?.email}</span>
                {intake.freelancer?.accountId ? (
                  <bdi dir="ltr" className="wa-sub">
                    {intake.freelancer.accountId}
                  </bdi>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>{t(`${NS}.columns.submitted`)}</dt>
              <dd>{formatDateTime(intake.submittedAt, locale)}</dd>
            </div>
            <div>
              <dt>{t(`${NS}.columns.status`)}</dt>
              <dd>
                <StatusBadge tone={externalIntakeStatusTone(intake.status)}>{statusLabel(intake.status)}</StatusBadge>
              </dd>
            </div>
            {intake.price != null ? (
              <div>
                <dt>{t(`${NS}.columns.price`)}</dt>
                <dd className="wa-num">{formatJodMoney(intake.price, { locale })}</dd>
              </div>
            ) : null}
            {intake.order ? (
              <div>
                <dt>{t(`${NS}.columns.order`)}</dt>
                <dd>
                  <Link to={staffOrderPath(intake.order.id, isSuperShell)} className="wa-link">
                    <ExternalLink size={14} aria-hidden />
                    <bdi dir="ltr">{intake.order.orderCode || `#${intake.order.id}`}</bdi>
                    <span className="wa-sub">{getOrderStatusLabel(intake.order.status, t)}</span>
                  </Link>
                </dd>
              </div>
            ) : null}
            {intake.rejectionReasonCode ? (
              <div>
                <dt>{t(`${NS}.review.reason`)}</dt>
                <dd>{t(`dashboard.whatsappOrders.reasons.${intake.rejectionReasonCode}`)}</dd>
              </div>
            ) : null}
            {intake.reviewer ? (
              <div>
                <dt>{t(`${NS}.review.reviewedBy`)}</dt>
                <dd dir="auto">{intake.reviewer.name || `#${intake.reviewer.id}`}</dd>
              </div>
            ) : null}
            {intake.internalNote ? (
              <div className="wa-facts__wide">
                <dt>{t(`${NS}.review.internalNote`)}</dt>
                <dd dir="auto" className="wa-note">
                  {intake.internalNote}
                </dd>
              </div>
            ) : null}
          </dl>

          {isPending && eligibility && eligibility.eligible === false ? (
            <p className="wa-warning" role="note">
              {t(`${NS}.review.notEligible`)}
            </p>
          ) : null}

          {detail.sameIdHistory?.length ? (
            <div className="wa-history">
              <p className="wa-label">{t(`${NS}.review.sameIdHistory`)}</p>
              <ul>
                {detail.sameIdHistory.map((h) => (
                  <li key={h.id}>
                    <StatusBadge tone={externalIntakeStatusTone(h.status)}>{statusLabel(h.status)}</StatusBadge>{" "}
                    <span dir="auto">{h.freelancer?.name || `#${h.freelancer?.id}`}</span>{" "}
                    <span className="wa-sub">{formatDateTime(h.submittedAt, locale)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {isPending && mode === "approve" ? (
            <form id={`${uid}-approve`} className="wa-review-form" onSubmit={approve} noValidate>
              <label className="wa-label wa-label--strong" htmlFor={`${uid}-price`}>
                {t(`${NS}.review.price`)}
              </label>
              <div className="wa-price">
                <input
                  ref={priceRef}
                  id={`${uid}-price`}
                  className={`input wa-price__input${priceError ? " wa-input--invalid" : ""}`}
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  autoComplete="off"
                  value={price}
                  onChange={(e) => {
                    setPrice(e.target.value);
                    if (priceError) setPriceError("");
                  }}
                  placeholder="0.00"
                  aria-required="true"
                  aria-invalid={priceError ? "true" : "false"}
                  aria-describedby={`${uid}-price-hint${priceError ? ` ${uid}-price-err` : ""}`}
                  disabled={busy}
                />
                <span className="wa-price__currency" aria-hidden>
                  {t(`${NS}.review.currency`)}
                </span>
              </div>
              <p id={`${uid}-price-hint`} className="wa-hint">
                {t(`${NS}.review.priceHint`)}
              </p>
              {priceError ? (
                <p id={`${uid}-price-err`} className="wa-error" role="alert">
                  {priceError}
                </p>
              ) : null}

              <button
                type="button"
                className="wa-disclosure"
                aria-expanded={showMore}
                aria-controls={`${uid}-more`}
                onClick={() => setShowMore((v) => !v)}
              >
                {showMore ? t(`${NS}.review.lessOptions`) : t(`${NS}.review.moreOptions`)}
              </button>
              {showMore ? (
                <div id={`${uid}-more`} className="wa-more">
                  <label className="wa-field" htmlFor={`${uid}-cat`}>
                    <span className="wa-label">{t(`${NS}.review.category`)}</span>
                    <select id={`${uid}-cat`} className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={busy}>
                      <option value="">{t(`${NS}.review.categoryDefault`)}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {localizeCategoryName(c, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="wa-field">
                    <span className="wa-label" id={`${uid}-dur-l`}>
                      {t(`${NS}.review.duration`)}
                    </span>
                    <div className="wa-duration" role="group" aria-labelledby={`${uid}-dur-l`}>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={durationUnit === "hours" ? 720 : 365}
                        dir="ltr"
                        value={durationValue}
                        onChange={(e) => setDurationValue(e.target.value)}
                        aria-label={t(`${NS}.review.durationValue`)}
                        disabled={busy}
                      />
                      <select
                        className="input"
                        value={durationUnit}
                        onChange={(e) => setDurationUnit(e.target.value)}
                        aria-label={t(`${NS}.review.durationUnit`)}
                        disabled={busy}
                      >
                        <option value="days">{t(`${NS}.review.days`)}</option>
                        <option value="hours">{t(`${NS}.review.hours`)}</option>
                      </select>
                    </div>
                  </div>
                  <label className="wa-field wa-field--wide" htmlFor={`${uid}-note`}>
                    <span className="wa-label">{t(`${NS}.review.internalNote`)}</span>
                    <textarea
                      id={`${uid}-note`}
                      className="input"
                      rows={2}
                      maxLength={1000}
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
              ) : null}
            </form>
          ) : null}

          {isPending && mode === "reject" ? (
            <form id={`${uid}-reject`} className="wa-review-form" onSubmit={reject} noValidate>
              <label className="wa-label wa-label--strong" htmlFor={`${uid}-reason`}>
                {t(`${NS}.review.reason`)}
              </label>
              <select
                id={`${uid}-reason`}
                className={`input${reasonError ? " wa-input--invalid" : ""}`}
                value={reasonCode}
                onChange={(e) => {
                  setReasonCode(e.target.value);
                  setReasonError("");
                }}
                aria-required="true"
                aria-invalid={reasonError ? "true" : "false"}
                aria-describedby={`${uid}-reason-hint${reasonError ? ` ${uid}-reason-err` : ""}`}
                disabled={busy}
              >
                <option value="">{t(`${NS}.review.reasonPlaceholder`)}</option>
                {EXTERNAL_INTAKE_REJECTION_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`dashboard.whatsappOrders.reasons.${r}`)}
                  </option>
                ))}
              </select>
              <p id={`${uid}-reason-hint`} className="wa-hint">
                {t(`${NS}.review.reasonHint`)}
              </p>
              {reasonError ? (
                <p id={`${uid}-reason-err`} className="wa-error" role="alert">
                  {reasonError}
                </p>
              ) : null}
              <label className="wa-field wa-field--wide" htmlFor={`${uid}-rnote`}>
                <span className="wa-label">{t(`${NS}.review.internalNote`)}</span>
                <textarea
                  id={`${uid}-rnote`}
                  className="input"
                  rows={2}
                  maxLength={1000}
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  disabled={busy}
                />
              </label>
            </form>
          ) : null}

          {actionError ? (
            <p className="wa-error" role="alert">
              {actionError}
            </p>
          ) : null}

          {!isPending ? (
            <div className="wa-dialog__done">
              <Button type="button" variant="secondary" onClick={onClose}>
                <X size={15} aria-hidden />
                <span>{t(`${NS}.review.close`)}</span>
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </DashboardModal>
  );
}
