import { useCallback, useEffect, useState } from "react";
import { Eye, Link2, ShieldCheck } from "lucide-react";
import DashboardModal from "../../dashboard/DashboardModal";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { formatLocaleDateTime, formatLocaleDate } from "../../../i18n/formatLocale";
import { useToast } from "../../ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import {
  adminCreateGuestConversionLinkRequest,
  adminGetOrderCustomerRequest,
  adminListAccountManagersRequest,
  adminRegenerateActivationLinkRequest,
  adminRevealGuestContactRequest,
  adminRevokeCustomerLinkRequest,
  adminSetOrderAccountManagerRequest,
  adminSetOrderCustomerPricingRequest,
} from "../../../services/api";
import CustomerWhatsappMessage from "./CustomerWhatsappMessage";
import { CUSTOMER_PRICE_CURRENCIES, isValidPriceText } from "./customerDraft";
import CustomerModeBadge from "./CustomerModeBadge";

function Row({ label, children }) {
  return (
    <div className="smart-panel__row">
      <span className="smart-panel__label">{label}</span>
      <span className="smart-panel__value">{children}</span>
    </div>
  );
}

/** Admin customer panel for one order: linkage, guest contact (masked), links, price, history. */
export default function AdminOrderCustomerPanel({ orderId, open, onClose, onChanged }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [managers, setManagers] = useState([]);
  const [managerId, setManagerId] = useState("");
  const [price, setPrice] = useState({ amount: "", currency: "JOD" });
  const [revealedPhone, setRevealedPhone] = useState(null);
  const [freshLink, setFreshLink] = useState(null);
  const [evidence, setEvidence] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await adminGetOrderCustomerRequest(orderId);
      const c = res?.data?.customer || null;
      setData(c);
      setManagerId(c?.accountManager?.id || "");
      setPrice({ amount: c?.pricing?.amount || "", currency: c?.pricing?.currency || "JOD" });
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!open) return;
    setRevealedPhone(null);
    setFreshLink(null);
    setEvidence("");
    void load();
    adminListAccountManagersRequest()
      .then((res) => setManagers(res?.data?.managers || []))
      .catch(() => {});
  }, [open, load]);

  const run = async (fn, { reload = true } = {}) => {
    setBusy(true);
    try {
      const out = await fn();
      if (out?.data?.customer) setData(out.data.customer);
      else if (reload) await load();
      if (typeof onChanged === "function") onChanged();
      return out;
    } catch (e) {
      push({ type: "error", title: t("smartOrders.panel.loadFailed"), message: getSafeApiErrorMessage(e) });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const title = data ? t("smartOrders.panel.title", { orderCode: data.orderCode }) : t("smartOrders.panel.open");
  const inv = data?.invitation || null;

  return (
    <DashboardModal open={open} title={title} onClose={onClose} closeDisabled={busy} panelClassName="smart-panel-modal">
      <div className="smart-panel" data-testid="smart-orders-customer-panel">
        {loading && !data ? <p className="help">{t("smartOrders.panel.loading")}</p> : null}
        {failed ? <p className="oh-inline-alert">{t("smartOrders.panel.loadFailed")}</p> : null}
        {data && !data.mode ? <p className="help">{t("smartOrders.panel.noCustomer")}</p> : null}
        {data && data.mode ? (
          <>
            <div className="smart-panel__section">
              <Row label={t("smartOrders.panel.mode")}>
                <CustomerModeBadge summary={{ mode: data.mode, accountLinked: Boolean(data.account), awaitingActivation: data.awaitingActivation }} />
              </Row>
              <Row label={t("smartOrders.panel.channel")}>
                {data.channel ? t(`smartOrders.fields.channelOptions.${data.channel}`) : "—"}
              </Row>
              <Row label={t("smartOrders.panel.createdBy")}>{data.createdBy?.fullName || "—"}</Row>
              <div className="smart-panel__inline">
                <label className="field" style={{ flex: 1 }}>
                  <span className="label">{t("smartOrders.panel.manager")}</span>
                  <select className="input" value={managerId} onChange={(e) => setManagerId(e.target.value)} disabled={busy}>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName || m.id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !managerId || managerId === data.accountManager?.id}
                  onClick={() => run(() => adminSetOrderAccountManagerRequest(orderId, managerId))}
                >
                  {t("smartOrders.panel.save")}
                </button>
              </div>
            </div>

            <div className="smart-panel__section">
              <h3>{t("smartOrders.panel.pricing")}</h3>
              <div className="smart-panel__inline">
                <input
                  className="input"
                  dir="ltr"
                  inputMode="decimal"
                  aria-label={t("smartOrders.fields.priceAmount")}
                  value={price.amount}
                  onChange={(e) => setPrice((p) => ({ ...p, amount: e.target.value }))}
                  disabled={busy}
                  placeholder={t("smartOrders.review.pricePending")}
                />
                <select
                  className="input"
                  aria-label={t("smartOrders.fields.priceCurrency")}
                  value={price.currency}
                  onChange={(e) => setPrice((p) => ({ ...p, currency: e.target.value }))}
                  disabled={busy}
                >
                  {CUSTOMER_PRICE_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || (String(price.amount).trim() !== "" && !isValidPriceText(price.amount))}
                  onClick={() =>
                    run(() =>
                      adminSetOrderCustomerPricingRequest(orderId, {
                        priceAmount: String(price.amount).trim() || null,
                        priceCurrency: String(price.amount).trim() ? price.currency : null,
                      }),
                    )
                  }
                >
                  {t("smartOrders.panel.updatePrice")}
                </button>
              </div>
              <div className="help">{t("smartOrders.fields.priceSeparateHint")}</div>
            </div>

            {data.account ? (
              <div className="smart-panel__section">
                <h3>{t("smartOrders.panel.account")}</h3>
                <Row label={t("smartOrders.review.customer")}>
                  {data.account.fullName || data.account.accountId}{" "}
                  <span className="help" dir="ltr">
                    {data.account.accountId} · {data.account.maskedEmail}
                  </span>
                </Row>
                {data.account.linkedAt ? (
                  <div className="help">{t("smartOrders.panel.linkedAt", { date: formatLocaleDateTime(data.account.linkedAt, locale) })}</div>
                ) : null}
              </div>
            ) : null}
            {data.awaitingActivation ? <p className="help">{t("smartOrders.panel.awaitingActivation")}</p> : null}

            {data.guest ? (
              <div className="smart-panel__section">
                <h3>{t("smartOrders.panel.guest")}</h3>
                <Row label={t("smartOrders.panel.referenceName")}>{data.guest.referenceName || "—"}</Row>
                <Row label={t("smartOrders.panel.contact")}>
                  {t(`smartOrders.fields.contactOptions.${data.guest.contactChannel}`)}
                  {data.guest.whatsappOnly ? ` · ${t("smartOrders.panel.whatsappOnly")}` : ""}
                </Row>
                <Row label={t("smartOrders.panel.consent")}>{t(`smartOrders.fields.consentOptions.${data.guest.consentStatus}`)}</Row>
                <Row label={t("smartOrders.panel.phone")}>
                  {data.guest.hasPhone ? (
                    <>
                      <span dir="ltr" data-testid="smart-orders-guest-phone">
                        {revealedPhone || data.guest.maskedPhone}
                      </span>{" "}
                      {!revealedPhone ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy}
                          onClick={async () => {
                            const out = await run(() => adminRevealGuestContactRequest(orderId), { reload: false });
                            if (out?.data?.phone) setRevealedPhone(out.data.phone);
                          }}
                        >
                          <Eye size={14} aria-hidden="true" /> {t("smartOrders.panel.reveal")}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    t("smartOrders.panel.noPhone")
                  )}
                </Row>
                <div className="help">{t("smartOrders.panel.revealNote")}</div>
                {data.guest.note ? <Row label={t("smartOrders.fields.note")}>{data.guest.note}</Row> : null}
                {data.guest.retainUntil ? (
                  <div className="help">{t("smartOrders.panel.retention", { date: formatLocaleDate(data.guest.retainUntil, locale) })}</div>
                ) : null}
                <p className="help">
                  <ShieldCheck size={14} aria-hidden="true" /> {t("smartOrders.panel.privacyNote")}
                </p>
              </div>
            ) : null}

            {(data.mode === "guest" || data.mode === "new_account") && !data.account ? (
              <div className="smart-panel__section">
                <h3>
                  <Link2 size={16} aria-hidden="true" /> {t("smartOrders.panel.invitation")}
                </h3>
                {inv ? (
                  <Row label={t(`smartOrders.panel.invitationPurpose.${inv.purpose}`)}>
                    {t(`smartOrders.panel.invitationStatus.${inv.status}`)} · {formatLocaleDateTime(inv.expiresAt, locale)}
                  </Row>
                ) : null}
                {data.mode === "new_account" ? (
                  <div className="smart-panel__inline">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={async () => {
                        const out = await run(() => adminRegenerateActivationLinkRequest(orderId), { reload: false });
                        if (out?.data?.customerLink) setFreshLink({ kind: "account", ...out.data.customerLink });
                      }}
                    >
                      {t("smartOrders.panel.regenerate")}
                    </button>
                  </div>
                ) : (
                  <div className="field">
                    <span className="label">{t("smartOrders.panel.conversion")}</span>
                    <div className="help">{t("smartOrders.panel.conversionHint")}</div>
                    <label className="field">
                      <span className="help">{t("smartOrders.panel.evidence")}</span>
                      <input
                        className="input"
                        maxLength={500}
                        value={evidence}
                        onChange={(e) => setEvidence(e.target.value)}
                        placeholder={t("smartOrders.panel.evidencePlaceholder")}
                        disabled={busy}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || evidence.trim().length < 3}
                      onClick={async () => {
                        const out = await run(() => adminCreateGuestConversionLinkRequest(orderId, evidence.trim()), { reload: false });
                        if (out?.data?.customerLink) setFreshLink({ kind: "conversion", ...out.data.customerLink });
                      }}
                    >
                      {t("smartOrders.panel.createConversion")}
                    </button>
                  </div>
                )}
                {inv?.status === "pending" ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => run(() => adminRevokeCustomerLinkRequest(orderId))}
                  >
                    {t("smartOrders.panel.revoke")}
                  </button>
                ) : null}
                {freshLink ? (
                  <div className="field" style={{ marginTop: 8 }}>
                    <span className="label">{t("smartOrders.created.linkLabel")}</span>
                    <input className="input" dir="ltr" readOnly value={freshLink.claimUrl} data-testid="smart-orders-claim-link" />
                  </div>
                ) : null}
              </div>
            ) : null}

            {data.mode === "guest" || data.mode === "new_account" || freshLink ? (
              <div className="smart-panel__section">
                <CustomerWhatsappMessage
                  kind={freshLink?.kind || (data.mode === "guest" ? "guest" : "account")}
                  customer={data}
                  link={freshLink?.claimUrl || null}
                />
              </div>
            ) : null}

            <div className="smart-panel__section">
              <h3>{t("smartOrders.panel.events")}</h3>
              {data.events?.length ? (
                <ul className="smart-events">
                  {data.events.map((e) => (
                    <li key={e.id}>
                      <span>{t(`smartOrders.panel.eventActions.${e.action}`)}</span>
                      <span className="help">
                        {e.actorName ? `${e.actorName} · ` : ""}
                        {formatLocaleDateTime(e.createdAt, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">{t("smartOrders.panel.noEvents")}</p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </DashboardModal>
  );
}
