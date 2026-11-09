import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import Button from "../../components/ui/Button";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import { submitExternalOrderIntakeRequest, listMyExternalOrderIntakesRequest } from "../../services/api";
import { localizedApiErrorMessage } from "../../utils/apiErrorMessage";
import { getOrderStatusLabel } from "../../utils/orderFlowUi";
import { formatJodMoney } from "../../utils/formatJodMoney";
import { formatJoDateMedium } from "../../utils/freelancerDashboardData";
import {
  cleanExternalOrderIdInput,
  externalIntakeStatusTone,
  freelancerOrderPath,
  isPlausibleExternalOrderId,
} from "../../constants/externalOrderIntakes";
import "./whatsappOrders.css";

const NS = "dashboard.whatsappOrders";

/**
 * Freelancer: register an external (WhatsApp) Order ID — the ONLY input — and follow its review.
 * The real order appears in "My orders" only after Admin approval and pricing.
 */
export default function FreelancerWhatsappOrdersPage() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef(null);
  const submittingRef = useRef(false);

  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadHistory = useCallback(
    async (targetPage, signal) => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await listMyExternalOrderIntakesRequest({ page: targetPage }, { signal });
        setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
        setTotalPages(Math.max(1, Number(res?.data?.pagination?.totalPages) || 1));
      } catch (err) {
        if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        setLoadError(localizedApiErrorMessage(err, locale));
      } finally {
        setLoading(false);
      }
    },
    [locale],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    loadHistory(page, ctrl.signal);
    return () => ctrl.abort();
  }, [page, loadHistory]);

  const onSubmit = async (ev) => {
    ev.preventDefault();
    if (submittingRef.current) return;
    const cleaned = cleanExternalOrderIdInput(value);
    if (!cleaned) {
      setFieldError(t(`${NS}.form.required`));
      inputRef.current?.focus();
      return;
    }
    if (!isPlausibleExternalOrderId(cleaned)) {
      setFieldError(t(`${NS}.form.invalid`));
      inputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setFieldError("");
    setResult(null);
    try {
      const res = await submitExternalOrderIntakeRequest(cleaned);
      const intake = res?.data?.intake || null;
      setResult({ intake, created: Boolean(res?.data?.created) });
      setValue("");
      if (page === 1) loadHistory(1);
      else setPage(1);
    } catch (err) {
      setFieldError(localizedApiErrorMessage(err, locale));
      inputRef.current?.focus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const statusLabel = (status) => t(`${NS}.status.${status}`);
  const priceText = (row) => (row.status === "approved" && row.price != null ? formatJodMoney(row.price, { locale }) : "—");
  const orderStatusText = (row) => (row.orderId ? getOrderStatusLabel(row.orderStatus, t) : "—");
  const reasonText = (row) =>
    row.status === "rejected" && row.rejectionReasonCode ? t(`${NS}.reasons.${row.rejectionReasonCode}`) : "";

  const openOrderLink = (row, compact = false) =>
    row.orderId ? (
      <Link
        to={freelancerOrderPath(row.orderId)}
        className={`btn btn-primary wa-open-order${compact ? " wa-open-order--block" : ""}`}
        aria-label={t(`${NS}.actions.openOrderAria`, { id: row.externalOrderId })}
      >
        <ExternalLink size={14} aria-hidden />
        <span>{t(`${NS}.actions.openOrder`)}</span>
      </Link>
    ) : (
      <span className="wa-muted">—</span>
    );

  return (
    <DashboardShell>
      <div className="wa-page">
        <DashboardPageHeader
          className="wa-page__header"
          title={t(`${NS}.title`)}
          description={t(`${NS}.intro`)}
          breadcrumbs={[breadcrumbHomeCrumb(user), { label: t(`${NS}.title`) }]}
        />

        <section className="wa-card wa-entry" aria-labelledby={`${inputId}-title`}>
          <div className="wa-entry__icon" aria-hidden>
            <MessageCircle size={22} strokeWidth={1.8} />
          </div>
          <div className="wa-entry__body">
            <h2 id={`${inputId}-title`} className="wa-card__title">
              {t(`${NS}.form.title`)}
            </h2>
            <form className="wa-entry__form" onSubmit={onSubmit} noValidate>
              <label className="wa-label" htmlFor={inputId}>
                {t(`${NS}.form.idLabel`)}
              </label>
              <div className="wa-entry__row">
                <input
                  ref={inputRef}
                  id={inputId}
                  name="externalOrderId"
                  className={`input wa-entry__input${fieldError ? " wa-input--invalid" : ""}`}
                  type="text"
                  dir={value ? "ltr" : undefined}
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={80}
                  placeholder={t(`${NS}.form.idPlaceholder`)}
                  value={value}
                  onChange={(ev) => {
                    setValue(ev.target.value);
                    if (fieldError) setFieldError("");
                  }}
                  aria-required="true"
                  aria-invalid={fieldError ? "true" : "false"}
                  aria-describedby={fieldError ? `${errorId} ${hintId}` : hintId}
                  disabled={submitting}
                />
                <Button type="submit" variant="primary" className="wa-entry__submit" disabled={submitting} aria-busy={submitting}>
                  {submitting ? t(`${NS}.form.submitting`) : t(`${NS}.form.submit`)}
                </Button>
              </div>
              <p id={hintId} className="wa-hint">
                {t(`${NS}.form.idHint`)}
              </p>
              {fieldError ? (
                <p id={errorId} className="wa-error" role="alert">
                  {fieldError}
                </p>
              ) : null}
            </form>

            {result?.intake ? (
              <div className="wa-success" role="status" aria-live="polite">
                <CheckCircle2 className="wa-success__icon" size={20} aria-hidden />
                <div>
                  <p className="wa-success__title">
                    {result.created ? t(`${NS}.success.title`) : t(`${NS}.success.alreadyTitle`)}
                  </p>
                  <p className="wa-success__text">
                    {result.intake.status === "pending_review"
                      ? t(`${NS}.success.body`)
                      : t(`${NS}.success.currentStatus`, { status: statusLabel(result.intake.status) })}
                  </p>
                  <p className="wa-success__id">
                    <span>{t(`${NS}.columns.id`)}:</span>{" "}
                    <bdi dir="ltr" className="wa-id">
                      {result.intake.externalOrderId}
                    </bdi>{" "}
                    <StatusBadge tone={externalIntakeStatusTone(result.intake.status)}>
                      {statusLabel(result.intake.status)}
                    </StatusBadge>
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="wa-card wa-list wa-list--fl" aria-labelledby={`${inputId}-history`}>
          <div className="wa-card__head">
            <h2 id={`${inputId}-history`} className="wa-card__title">
              {t(`${NS}.history.title`)}
            </h2>
            <Button
              type="button"
              variant="secondary"
              className="wa-icon-btn"
              onClick={() => loadHistory(page)}
              disabled={loading}
              aria-label={t(`${NS}.history.refresh`)}
              title={t(`${NS}.history.refresh`)}
            >
              <RefreshCw size={15} aria-hidden className={loading ? "wa-spin" : ""} />
            </Button>
          </div>

          {loadError ? (
            <div className="wa-error-box" role="alert">
              <p>{loadError}</p>
              <Button type="button" variant="secondary" onClick={() => loadHistory(page)}>
                {t(`${NS}.history.retry`)}
              </Button>
            </div>
          ) : null}

          {!loadError && loading && items.length === 0 ? (
            <p className="wa-muted" role="status">
              {t(`${NS}.history.loading`)}
            </p>
          ) : null}

          {!loadError && !loading && items.length === 0 ? (
            <p className="wa-empty">{t(`${NS}.history.empty`)}</p>
          ) : null}

          {items.length > 0 ? (
            <>
              <div className="wa-table-wrap" aria-busy={loading}>
                <table className="wa-table">
                  <caption className="sr-only">{t(`${NS}.history.title`)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t(`${NS}.columns.id`)}</th>
                      <th scope="col">{t(`${NS}.columns.status`)}</th>
                      <th scope="col">{t(`${NS}.columns.price`)}</th>
                      <th scope="col">{t(`${NS}.columns.orderStatus`)}</th>
                      <th scope="col">{t(`${NS}.columns.date`)}</th>
                      <th scope="col">
                        <span className="sr-only">{t(`${NS}.columns.action`)}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <bdi dir="ltr" className="wa-id">
                            {row.externalOrderId}
                          </bdi>
                        </td>
                        <td>
                          <StatusBadge tone={externalIntakeStatusTone(row.status)} className="wa-nowrap">
                            {statusLabel(row.status)}
                          </StatusBadge>
                          {reasonText(row) ? <span className="wa-reason">{reasonText(row)}</span> : null}
                        </td>
                        <td className="wa-num">{priceText(row)}</td>
                        <td>{orderStatusText(row)}</td>
                        <td className="wa-nowrap">{formatJoDateMedium(row.submittedAt, locale)}</td>
                        <td className="wa-actions-cell">{openOrderLink(row)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="wa-cards" aria-busy={loading}>
                {items.map((row) => (
                  <li key={row.id} className="wa-item">
                    <div className="wa-item__top">
                      <bdi dir="ltr" className="wa-id wa-id--lg">
                        {row.externalOrderId}
                      </bdi>
                      <StatusBadge tone={externalIntakeStatusTone(row.status)}>{statusLabel(row.status)}</StatusBadge>
                    </div>
                    {reasonText(row) ? <p className="wa-reason">{reasonText(row)}</p> : null}
                    <dl className="wa-item__meta">
                      <div>
                        <dt>{t(`${NS}.columns.price`)}</dt>
                        <dd className="wa-num">{priceText(row)}</dd>
                      </div>
                      <div>
                        <dt>{t(`${NS}.columns.orderStatus`)}</dt>
                        <dd>{orderStatusText(row)}</dd>
                      </div>
                      <div>
                        <dt>{t(`${NS}.columns.date`)}</dt>
                        <dd>{formatJoDateMedium(row.submittedAt, locale)}</dd>
                      </div>
                    </dl>
                    {row.orderId ? openOrderLink(row, true) : null}
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
    </DashboardShell>
  );
}
