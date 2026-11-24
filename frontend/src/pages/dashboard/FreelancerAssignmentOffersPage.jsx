import { useCallback, useEffect, useState } from "react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/smartOrdersResources";
import "../../styles/smartOrders.css";
import { formatLocaleDateTime } from "../../i18n/formatLocale";
import { useToast } from "../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  freelancerAcceptAssignmentOfferRequest,
  freelancerListAssignmentOffersRequest,
  freelancerRejectAssignmentOfferRequest,
  freelancerRespondToChangeRequest,
} from "../../services/api";
import ServiceFormSnapshotView from "../../components/orders/smart/ServiceFormSnapshotView";
import { pluralDurationUnit } from "../../components/orders/durationUnitLabel";

const REASONS = ["unavailable", "outside_skills", "deadline_too_short", "compensation", "other"];

/** Freelancer: assignment offers (task + pay + deadline only — no customer identity), accept / reject, terms. */
export default function FreelancerAssignmentOffersPage() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const k = (key, v) => t(`smartOrders.offers.${key}`, v);
  const [offers, setOffers] = useState(null);
  const [busy, setBusy] = useState("");
  const [reasons, setReasons] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await freelancerListAssignmentOffersRequest();
      setOffers(res?.data?.offers || []);
    } catch (e) {
      push({ type: "error", title: t("smartOrders.commercial.failed"), message: getSafeApiErrorMessage(e) });
      setOffers([]);
    }
  }, [push, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id, fn, okKey) => {
    setBusy(id);
    try {
      await fn();
      push({ type: "success", title: k(okKey) });
    } catch (e) {
      push({ type: "error", title: t("smartOrders.commercial.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy("");
      await load();
    }
  };

  return (
    <DashboardShell className="smart-offers-page">
      <DashboardPageHeader title={k("title")} description={k("description")} />
      <DashboardSection>
        {offers === null ? <p className="help">{t("smartOrders.commercial.loading")}</p> : null}
        {offers && offers.length === 0 ? <p className="help">{k("empty")}</p> : null}
        {(offers || []).map((o) => (
          <article key={o.id} className="smart-offer" data-testid={`offer-${o.id}`} data-status={o.status}>
            <header className="smart-quote__head">
              <div>
                <strong dir="auto">{o.title}</strong>
                <div className="help" dir="ltr">
                  {o.orderCode}
                </div>
              </div>
              <span className={`oh-badge oh-badge--${o.status === "pending" ? "warning" : o.status === "accepted" ? "success" : "neutral"}`}>
                {t(`smartOrders.commercial.assign.status.${o.status}`)}
              </span>
            </header>
            <p dir="auto" className="smart-offer__desc">
              {o.description}
            </p>
            <dl className="smart-quote__lines">
              <div>
                <dt>{k("pay")}</dt>
                <dd dir="ltr" data-testid="offer-pay">
                  {(o.terms?.compensationAmount || o.compensationAmount)} {o.currency}
                </dd>
              </div>
              <div>
                <dt>{k("duration")}</dt>
                <dd>{`${o.durationValue} ${pluralDurationUnit(t, locale, o.durationUnit, o.durationValue)}`}</dd>
              </div>
            </dl>
            {o.service ? <ServiceFormSnapshotView serviceForm={o.service} /> : null}
            {o.status === "pending" ? (
              <>
                <p className="help">{k("respondBy", { date: formatLocaleDateTime(o.expiresAt, locale) })}</p>
                <div className="smart-panel__inline">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy === o.id}
                    data-testid="offer-accept"
                    onClick={() => act(o.id, () => freelancerAcceptAssignmentOfferRequest(o.id), "accepted")}
                  >
                    {k("accept")}
                  </button>
                  <label className="field" style={{ minInlineSize: 180 }}>
                    <span className="help">{k("rejectReason")}</span>
                    <select className="input" value={reasons[o.id] || "unavailable"} onChange={(e) => setReasons({ ...reasons, [o.id]: e.target.value })}>
                      {REASONS.map((r) => (
                        <option key={r} value={r}>
                          {k(`reasons.${r}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy === o.id}
                    data-testid="offer-reject"
                    onClick={() => act(o.id, () => freelancerRejectAssignmentOfferRequest(o.id, reasons[o.id] || "unavailable"), "rejected")}
                  >
                    {k("reject")}
                  </button>
                </div>
              </>
            ) : null}
            {o.status === "accepted" && o.terms ? (
              <p className="help" data-testid="offer-terms">
                {k("acceptedTerms")}: <span dir="ltr">{o.terms.compensationAmount} JOD</span> ·{" "}
                {t("smartOrders.commercial.terms.version", { version: o.terms.termsVersion })}
              </p>
            ) : null}
            {o.pendingChange ? (
              <div className="smart-panel__section" data-testid="offer-pending-change">
                <strong>{k("pendingChange")}</strong>
                <p dir="auto">
                  <span dir="ltr">
                    {o.pendingChange.oldAmount} → {o.pendingChange.newAmount} JOD
                  </span>
                  {" — "}
                  {o.pendingChange.reason}
                </p>
                <div className="smart-panel__inline">
                  <button type="button" className="btn btn-primary" disabled={busy === o.id} onClick={() => act(o.id, () => freelancerRespondToChangeRequest(o.pendingChange.id, true), "accepted")}>
                    {k("approveChange")}
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={busy === o.id} onClick={() => act(o.id, () => freelancerRespondToChangeRequest(o.pendingChange.id, false), "rejected")}>
                    {k("rejectChange")}
                  </button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </DashboardSection>
    </DashboardShell>
  );
}
