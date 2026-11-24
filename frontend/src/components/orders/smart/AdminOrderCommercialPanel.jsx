import { useCallback, useEffect, useState } from "react";
import DashboardModal from "../../dashboard/DashboardModal";
import AdminFreelancerSelector from "../AdminFreelancerSelector";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import { useToast } from "../../ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import {
  adminAuthorizeWorkRequest,
  adminCancelAssignmentOfferRequest,
  adminCancelQuoteRequest,
  adminCreateAssignmentOfferRequest,
  adminGetOrderCommercialRequest,
  adminGuestQuoteLinkRequest,
  adminIssueQuoteRequest,
  adminRecordQuoteAcceptanceRequest,
  adminRequestCompensationChangeRequest,
} from "../../../services/api";
import { copyText } from "./customerMessages";

const TAX = ["not_applicable", "taxable", "zero_rated", "exempt", "out_of_scope"];

function centsOf(v) {
  const s = String(v ?? "").trim().replace(/,/g, ".");
  if (!/^-?\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const c = Number(i) * 100 + Number((f + "00").slice(0, 2));
  return neg ? -c : c;
}
const fmt = (c) => (c == null ? "—" : `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`);

/** Admin: quote versions, guest link, approval record, offers, agreed terms, pay changes, work override, audit. */
export default function AdminOrderCommercialPanel({ orderId, open, onClose, onChanged }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const k = (key, v) => t(`smartOrders.commercial.${key}`, v);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState({ baseAmount: "", currency: "JOD", adjustments: [], validDays: "7", taxTreatment: "not_applicable", termsNote: "" });
  const [guestLink, setGuestLink] = useState(null);
  const [evidence, setEvidence] = useState("");
  const [offer, setOffer] = useState({ freelancer: null, compensationAmount: "", deadlineHours: "24" });
  const [change, setChange] = useState({ newAmount: "", newDueAt: "", reason: "" });
  const [overrideReason, setOverrideReason] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await adminGetOrderCommercialRequest(orderId);
      setData(res?.data || null);
    } catch (e) {
      push({ type: "error", title: k("failed"), message: getSafeApiErrorMessage(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, push]);

  useEffect(() => {
    if (!open) return;
    setGuestLink(null);
    void load();
  }, [open, load]);

  const run = async (fn, after) => {
    setBusy(true);
    try {
      const res = await fn();
      push({ type: "success", title: k("saved") });
      if (typeof after === "function") after(res);
      await load();
      onChanged?.();
    } catch (e) {
      push({ type: "error", title: k("failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const live = data?.quotes?.find((q) => q.status === "issued" || q.status === "accepted") || null;
  const pendingOffer = data?.offers?.find((o) => o.status === "pending") || null;
  const acceptedOffer = data?.offers?.find((o) => o.status === "accepted") || null;
  const totalCents = (centsOf(quote.baseAmount) || 0) + quote.adjustments.reduce((s, a) => s + (centsOf(a.amount) || 0), 0);
  const isGuest = data?.customerMode === "guest";
  const dt = (v) => (v ? formatLocaleDateTime(v, locale) : "—");

  return (
    <DashboardModal
      open={open}
      title={data ? k("title", { orderCode: data.orderCode }) : k("open")}
      onClose={onClose}
      closeDisabled={busy}
      panelClassName="smart-panel-modal"
    >
      <div className="smart-panel" data-testid="smart-orders-commercial-panel">
        {!data ? <p className="help">{k("loading")}</p> : null}
        {data && !data.applicable ? <p className="help">{k("notApplicable")}</p> : null}
        {data && data.applicable ? (
          <>
            <div className="smart-panel__section">
              <div className="smart-panel__row">
                <span className="smart-panel__label">{k("readiness")}</span>
                <span className="smart-panel__value" data-testid="commercial-readiness" data-ready={data.readiness.ready}>
                  <span className={`oh-badge oh-badge--${data.readiness.ready ? "success" : "warning"}`}>
                    {data.readiness.paid ? k("readyPaid") : data.readiness.authorized ? k("readyAuthorized") : k("notReady")}
                  </span>
                </span>
              </div>
              <div className="smart-panel__row">
                <span className="smart-panel__label">{k("freelancerPay")}</span>
                <span className="smart-panel__value" dir="ltr">
                  {data.freelancerBudget ? `${data.freelancerBudget} JOD` : "—"}
                </span>
              </div>
            </div>

            {/* ---------------- Quote ---------------- */}
            <div className="smart-panel__section" data-testid="commercial-quote-section">
              <h3>{k("quote.heading")}</h3>
              {live ? (
                <div className="smart-panel__row">
                  <span className="smart-panel__label">v{live.version}</span>
                  <span className="smart-panel__value" data-testid="commercial-live-quote">
                    <strong dir="ltr">
                      {live.totalAmount} {live.currency}
                    </strong>{" "}
                    · {k(`quote.status.${live.status}`)} · {k(`quote.payment.${live.paymentStatus}`)} · {dt(live.expiresAt)}
                  </span>
                </div>
              ) : (
                <p className="help">{k("quote.none")}</p>
              )}
              <div className="smart-editor-grid">
                <label className="field">
                  <span className="label">{k("quote.base")}</span>
                  <input className="input" dir="ltr" inputMode="decimal" value={quote.baseAmount} onChange={(e) => setQuote({ ...quote, baseAmount: e.target.value })} data-testid="quote-base" />
                </label>
                <label className="field">
                  <span className="label">{k("quote.currency")}</span>
                  <select className="input" value={quote.currency} onChange={(e) => setQuote({ ...quote, currency: e.target.value })}>
                    <option value="JOD">JOD</option>
                    <option value="AED">AED</option>
                  </select>
                </label>
                <label className="field">
                  <span className="label">{k("quote.validDays")}</span>
                  <input className="input" dir="ltr" inputMode="numeric" value={quote.validDays} onChange={(e) => setQuote({ ...quote, validDays: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">{k("quote.tax")}</span>
                  <select className="input" value={quote.taxTreatment} onChange={(e) => setQuote({ ...quote, taxTreatment: e.target.value })}>
                    {TAX.map((x) => (
                      <option key={x} value={x}>
                        {k(`quote.taxOptions.${x}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="field">
                <legend className="label">{k("quote.adjustments")}</legend>
                {quote.adjustments.map((a, i) => (
                  <div className="smart-panel__inline" key={i}>
                    <input
                      className="input"
                      aria-label={k("quote.adjLabel")}
                      placeholder={k("quote.adjLabel")}
                      value={a.label}
                      onChange={(e) => setQuote({ ...quote, adjustments: quote.adjustments.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    />
                    <input
                      className="input"
                      dir="ltr"
                      aria-label={k("quote.adjAmount")}
                      placeholder={k("quote.adjAmount")}
                      value={a.amount}
                      onChange={(e) => setQuote({ ...quote, adjustments: quote.adjustments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })}
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuote({ ...quote, adjustments: quote.adjustments.filter((_, j) => j !== i) })}>
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuote({ ...quote, adjustments: [...quote.adjustments, { label: "", amount: "" }] })}>
                  {k("quote.addAdjustment")}
                </button>
              </fieldset>
              <label className="field">
                <span className="label">{k("quote.terms")}</span>
                <textarea className="input" rows={2} maxLength={1000} value={quote.termsNote} onChange={(e) => setQuote({ ...quote, termsNote: e.target.value })} />
              </label>
              <p>
                {k("quote.total")}:{" "}
                <strong dir="ltr" data-testid="quote-total-preview">
                  {fmt(totalCents)} {quote.currency}
                </strong>
              </p>
              {live ? <p className="help">{k("quote.reviseHint")}</p> : null}
              <div className="smart-panel__inline">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !(totalCents > 0)}
                  data-testid="quote-issue"
                  onClick={() =>
                    run(
                      () =>
                        adminIssueQuoteRequest(orderId, {
                          ...quote,
                          adjustments: quote.adjustments.filter((a) => a.label.trim() && String(a.amount).trim()),
                        }),
                      (res) => setGuestLink(res?.data?.guestLink || null),
                    )
                  }
                >
                  {live ? k("quote.revise") : k("quote.issue")}
                </button>
                {live && live.paymentStatus === "unpaid" ? (
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => adminCancelQuoteRequest(orderId, ""))}>
                    {k("quote.cancel")}
                  </button>
                ) : null}
                {isGuest && live ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    data-testid="quote-new-guest-link"
                    onClick={() => run(() => adminGuestQuoteLinkRequest(orderId), (res) => setGuestLink(res?.data || null))}
                  >
                    {k("quote.newGuestLink")}
                  </button>
                ) : null}
              </div>
              {guestLink?.url ? (
                <div className="field">
                  <span className="label">{k("quote.guestLink")}</span>
                  <div className="smart-panel__inline">
                    <input className="input" dir="ltr" readOnly value={guestLink.url} data-testid="quote-guest-link" />
                    <button type="button" className="btn btn-secondary" onClick={() => copyText(guestLink.url)}>
                      {t("smartOrders.created.copyLink")}
                    </button>
                  </div>
                  <span className="help">{k("quote.linkOnce")}</span>
                </div>
              ) : null}
              {live && live.status === "issued" ? (
                <div className="smart-panel__inline">
                  <input className="input" placeholder={k("quote.evidence")} aria-label={k("quote.evidence")} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
                  <button type="button" className="btn btn-secondary" disabled={busy || evidence.trim().length < 3} onClick={() => run(() => adminRecordQuoteAcceptanceRequest(orderId, evidence.trim()))}>
                    {k("quote.recordAcceptance")}
                  </button>
                </div>
              ) : null}
              {data.quotes.length ? (
                <details>
                  <summary>{k("quote.history")}</summary>
                  <ul className="smart-events" data-testid="quote-history">
                    {data.quotes.map((q) => (
                      <li key={q.id}>
                        <span dir="auto">
                          v{q.version} · <span dir="ltr">{q.totalAmount} {q.currency}</span> · {k(`quote.status.${q.status}`)} · {k(`quote.payment.${q.paymentStatus}`)}
                        </span>
                        <span className="help">{dt(q.issuedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>

            {/* ---------------- Assignment ---------------- */}
            <div className="smart-panel__section" data-testid="commercial-assign-section">
              <h3>{k("assign.heading")}</h3>
              {(data.offers || []).length ? (
                <ul className="smart-events" data-testid="offer-history">
                  {data.offers.map((o) => (
                    <li key={o.id} data-status={o.status}>
                      <span>
                        {o.freelancer.name} · <span dir="ltr">{o.compensationAmount} JOD</span> · {k(`assign.status.${o.status}`)}
                      </span>
                      <span className="help">{dt(o.status === "pending" ? o.expiresAt : o.respondedAt || o.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {pendingOffer ? (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run(() => adminCancelAssignmentOfferRequest(orderId, ""))}>
                  {k("assign.cancelOffer")}
                </button>
              ) : null}
              {!pendingOffer && !acceptedOffer ? (
                <>
                  <AdminFreelancerSelector
                    active={open}
                    value={offer.freelancer?.id || ""}
                    selectedFreelancer={offer.freelancer}
                    disabled={busy}
                    onChange={({ assignedFreelancerId, assignedFreelancer }) =>
                      setOffer({ ...offer, freelancer: assignedFreelancerId ? { ...assignedFreelancer, id: assignedFreelancerId } : null })
                    }
                  />
                  <div className="smart-editor-grid">
                    <label className="field">
                      <span className="label">{k("assign.compensation")}</span>
                      <input
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        placeholder={data.freelancerBudget || ""}
                        value={offer.compensationAmount}
                        onChange={(e) => setOffer({ ...offer, compensationAmount: e.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="label">{k("assign.deadline")}</span>
                      <input className="input" dir="ltr" inputMode="numeric" value={offer.deadlineHours} onChange={(e) => setOffer({ ...offer, deadlineHours: e.target.value })} />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !offer.freelancer}
                    data-testid="offer-send"
                    onClick={() =>
                      run(() =>
                        adminCreateAssignmentOfferRequest(orderId, {
                          freelancerUserId: offer.freelancer.id,
                          compensationAmount: offer.compensationAmount || null,
                          deadlineHours: Number(offer.deadlineHours) || 24,
                        }),
                      )
                    }
                  >
                    {k("assign.offer")}
                  </button>
                </>
              ) : null}
            </div>

            {/* ---------------- Terms + changes ---------------- */}
            {data.terms.length ? (
              <div className="smart-panel__section" data-testid="commercial-terms-section">
                <h3>{k("terms.heading")}</h3>
                <ul className="smart-events">
                  {data.terms.map((tm) => (
                    <li key={tm.termsVersion}>
                      <span>
                        {k("terms.version", { version: tm.termsVersion })} · <span dir="ltr">{tm.compensationAmount} {tm.currency}</span>
                      </span>
                      <span className="help">{dt(tm.acceptedAt)}</span>
                    </li>
                  ))}
                </ul>
                <p className="help">{k("terms.immutable")}</p>
                <div className="smart-editor-grid">
                  <label className="field">
                    <span className="label">{k("terms.newAmount")}</span>
                    <input className="input" dir="ltr" inputMode="decimal" value={change.newAmount} onChange={(e) => setChange({ ...change, newAmount: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="label">{k("terms.newDue")}</span>
                    <input className="input" type="datetime-local" value={change.newDueAt} onChange={(e) => setChange({ ...change, newDueAt: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="label">{k("terms.reason")}</span>
                    <input className="input" value={change.reason} onChange={(e) => setChange({ ...change, reason: e.target.value })} />
                  </label>
                </div>
                <p className="help">{k("terms.changeHint")}</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !change.newAmount || change.reason.trim().length < 5}
                  onClick={() =>
                    run(
                      () =>
                        adminRequestCompensationChangeRequest(orderId, {
                          newAmount: change.newAmount,
                          newDueAt: change.newDueAt ? new Date(change.newDueAt).toISOString() : null,
                          reason: change.reason.trim(),
                        }),
                      () => setChange({ newAmount: "", newDueAt: "", reason: "" }),
                    )
                  }
                >
                  {k("terms.change")}
                </button>
                {data.changes.length ? (
                  <ul className="smart-events">
                    {data.changes.map((c) => (
                      <li key={c.id}>
                        <span dir="auto">
                          <span dir="ltr">
                            {c.oldAmount} → {c.newAmount} JOD
                          </span>{" "}
                          · {k(`terms.changeStatus.${c.status}`)}
                        </span>
                        <span className="help">{dt(c.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {/* ---------------- Work authorization ---------------- */}
            {!data.readiness.ready ? (
              <div className="smart-panel__section">
                <h3>{k("override.heading")}</h3>
                <p className="help">{k("override.hint")}</p>
                <div className="smart-panel__inline">
                  <input className="input" aria-label={k("override.reason")} placeholder={k("override.reason")} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy || overrideReason.trim().length < 5}
                    data-testid="work-authorize"
                    onClick={() => run(() => adminAuthorizeWorkRequest(orderId, overrideReason.trim()), () => setOverrideReason(""))}
                  >
                    {k("override.submit")}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="smart-panel__section">
              <h3>{k("history")}</h3>
              <ul className="smart-events" data-testid="commercial-events">
                {data.events.map((e, i) => (
                  <li key={i}>
                    <span>{k(`events.${e.action}`)}</span>
                    <span className="help">{dt(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </DashboardModal>
  );
}
