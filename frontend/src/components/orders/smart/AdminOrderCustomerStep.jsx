import { useEffect, useRef, useState } from "react";
import { Building2, Search, UserCheck, UserPlus, UserX } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import {
  adminCheckCustomerPhoneRequest,
  adminListAccountManagersRequest,
  adminSearchCustomerAccountsRequest,
} from "../../../services/api";
import {
  ADMIN_ORDER_CHANNELS,
  CUSTOMER_MODE_OPTIONS,
  CUSTOMER_PRICE_CURRENCIES,
  GUEST_CONSENT_OPTIONS,
  GUEST_CONTACT_CHANNELS,
  normalizePhoneE164,
} from "./customerDraft";

const MODE_ICONS = { internal: Building2, existing: UserCheck, new_account: UserPlus, guest: UserX };

function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="field-error" role="alert">
      {message}
    </div>
  );
}

/**
 * Step 1 of the Admin create-order wizard: explicit customer mode. One shared form — the rest of the
 * order (service, quantity, files, deadline, assignment) is the existing canonical wizard.
 */
export default function AdminOrderCustomerStep({ value, onChange, errors = {}, showErrors = false, disabled = false }) {
  const { t } = useTranslation();
  const set = (patch) => onChange({ ...value, ...patch });
  const [managers, setManagers] = useState([]);
  const [meId, setMeId] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [phoneMatch, setPhoneMatch] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    adminListAccountManagersRequest()
      .then((res) => {
        if (cancelled) return;
        setManagers(res?.data?.managers || []);
        setMeId(String(res?.data?.currentUserId || ""));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (value.mode !== "existing") return undefined;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return undefined;
    }
    const seq = ++searchSeq.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await adminSearchCustomerAccountsRequest(q);
        if (seq === searchSeq.current) setResults(res?.data?.customers || []);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, value.mode]);

  // New-account path: warn (never auto-link) when a verified account already uses the number.
  useEffect(() => {
    setPhoneMatch(false);
    if (value.mode !== "new_account") return undefined;
    const phone = normalizePhoneE164(value.phone);
    if (!phone) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      adminCheckCustomerPhoneRequest(phone)
        .then((res) => {
          if (!cancelled) setPhoneMatch(Boolean(res?.data?.matchesExistingAccount));
        })
        .catch(() => {});
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value.mode, value.phone]);

  const err = (k) => (showErrors ? errors[k] : "");
  const isCustomerMode = value.mode && value.mode !== "internal";

  return (
    <div className="smart-customer-step" data-testid="smart-orders-customer-step">
      <h2 style={{ marginBottom: 4 }}>{t("smartOrders.customerStep.title")}</h2>
      <p className="help" style={{ marginBottom: 12 }}>
        {t("smartOrders.customerStep.subtitle")}
      </p>

      <div className="smart-mode-grid" role="radiogroup" aria-label={t("smartOrders.customerStep.title")}>
        {CUSTOMER_MODE_OPTIONS.map((mode) => {
          const Icon = MODE_ICONS[mode];
          const active = value.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              data-mode={mode}
              className={`smart-mode-card${active ? " smart-mode-card--active" : ""}`}
              onClick={() => set({ mode, customer: mode === "existing" ? value.customer : null })}
              disabled={disabled}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="smart-mode-card__title">{t(`smartOrders.customerStep.modes.${mode}.title`)}</span>
              <span className="smart-mode-card__desc">{t(`smartOrders.customerStep.modes.${mode}.desc`)}</span>
            </button>
          );
        })}
      </div>
      <FieldError message={err("mode")} />

      {value.mode === "existing" ? (
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="smart-customer-search">{t("smartOrders.fields.searchCustomer")}</label>
          {value.customer ? (
            <div className="smart-selected">
              <div>
                <strong>{value.customer.fullName || value.customer.accountId}</strong>
                <div className="help" dir="ltr">
                  {value.customer.accountId} · {value.customer.maskedEmail} · {value.customer.maskedPhone}
                </div>
              </div>
              <button type="button" className="btn btn-secondary" onClick={() => set({ customer: null })} disabled={disabled}>
                {t("smartOrders.fields.change")}
              </button>
            </div>
          ) : (
            <>
              <div className="smart-search">
                <Search size={16} aria-hidden="true" />
                <input
                  id="smart-customer-search"
                  className="input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("smartOrders.fields.searchPlaceholder")}
                  autoComplete="off"
                  disabled={disabled}
                />
              </div>
              <div className="help">{t("smartOrders.fields.searchHint")}</div>
              {searching ? <div className="help">{t("smartOrders.fields.searching")}</div> : null}
              {!searching && query.trim().length >= 3 && results.length === 0 ? (
                <div className="help">{t("smartOrders.fields.noResults")}</div>
              ) : null}
              <ul className="smart-results">
                {results.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="smart-results__item" onClick={() => set({ customer: c })}>
                      <strong>{c.fullName || c.accountId}</strong>
                      <span className="help" dir="ltr">
                        {c.accountId} · {c.maskedEmail} · {c.maskedPhone}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <FieldError message={err("customer")} />
        </div>
      ) : null}

      {value.mode === "new_account" ? (
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="smart-new-phone">{t("smartOrders.fields.phone")}</label>
          <input
            id="smart-new-phone"
            className="input"
            dir="ltr"
            inputMode="tel"
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder={t("smartOrders.fields.phonePlaceholder")}
            disabled={disabled}
          />
          <div className="help">{t("smartOrders.fields.phoneHint")}</div>
          {phoneMatch ? (
            <div className="oh-inline-alert" role="status">
              {t("smartOrders.fields.phoneMatchWarning")}
            </div>
          ) : null}
          <FieldError message={err("phone")} />
        </div>
      ) : null}

      {value.mode === "guest" ? (
        <div className="admin-co-fields" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="smart-guest-ref">{t("smartOrders.fields.referenceName")}</label>
            <input
              id="smart-guest-ref"
              className="input"
              maxLength={120}
              value={value.referenceName}
              onChange={(e) => set({ referenceName: e.target.value })}
              disabled={disabled}
            />
            <div className="help">{t("smartOrders.fields.referenceNameHint")}</div>
          </div>
          <div className="field">
            <label htmlFor="smart-guest-channel">{t("smartOrders.fields.contactChannel")}</label>
            <select
              id="smart-guest-channel"
              className="input"
              value={value.contactChannel}
              onChange={(e) => set({ contactChannel: e.target.value })}
              disabled={disabled}
            >
              {GUEST_CONTACT_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`smartOrders.fields.contactOptions.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="smart-guest-phone">
              {value.contactChannel === "whatsapp" || value.contactChannel === "phone"
                ? t("smartOrders.fields.contactPhone")
                : t("smartOrders.fields.contactPhoneOptional")}
            </label>
            <input
              id="smart-guest-phone"
              className="input"
              dir="ltr"
              inputMode="tel"
              value={value.phone}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder={t("smartOrders.fields.phonePlaceholder")}
              disabled={disabled}
            />
            <FieldError message={err("phone")} />
          </div>
          <div className="field">
            <label htmlFor="smart-guest-consent">{t("smartOrders.fields.consent")}</label>
            <select
              id="smart-guest-consent"
              className="input"
              value={value.consentStatus}
              onChange={(e) => set({ consentStatus: e.target.value })}
              disabled={disabled}
            >
              {GUEST_CONSENT_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`smartOrders.fields.consentOptions.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <label className="field smart-check admin-co-fields__span2">
            <input
              type="checkbox"
              checked={Boolean(value.whatsappOnly)}
              onChange={(e) => set({ whatsappOnly: e.target.checked })}
              disabled={disabled}
            />
            <span>{t("smartOrders.fields.whatsappOnly")}</span>
          </label>
          <div className="field admin-co-fields__span2">
            <label htmlFor="smart-guest-note">{t("smartOrders.fields.note")}</label>
            <textarea
              id="smart-guest-note"
              className="input"
              rows={2}
              maxLength={500}
              value={value.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder={t("smartOrders.fields.notePlaceholder")}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}

      {isCustomerMode ? (
        <div className="admin-co-fields" style={{ marginTop: 16 }}>
          <div className="field">
            <label htmlFor="smart-channel">{t("smartOrders.fields.channel")}</label>
            <select
              id="smart-channel"
              className="input"
              value={value.channel}
              onChange={(e) => set({ channel: e.target.value })}
              disabled={disabled}
            >
              {ADMIN_ORDER_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`smartOrders.fields.channelOptions.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="smart-manager">{t("smartOrders.fields.accountManager")}</label>
            <select
              id="smart-manager"
              className="input"
              value={value.accountManagerAdminId || meId}
              onChange={(e) => set({ accountManagerAdminId: e.target.value })}
              disabled={disabled}
            >
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === meId ? `${m.fullName || m.id} (${t("smartOrders.fields.accountManagerMe")})` : m.fullName || m.id}
                </option>
              ))}
            </select>
            <div className="help">{t("smartOrders.fields.accountManagerHint")}</div>
          </div>
          <div className="field">
            <label htmlFor="smart-price">{t("smartOrders.fields.priceAmount")}</label>
            <input
              id="smart-price"
              className="input"
              dir="ltr"
              inputMode="decimal"
              value={value.priceAmount}
              onChange={(e) => set({ priceAmount: e.target.value })}
              disabled={disabled}
            />
            <div className="help">
              {t("smartOrders.fields.pricePendingHint")} {t("smartOrders.fields.priceSeparateHint")}
            </div>
            <FieldError message={err("priceAmount")} />
          </div>
          <div className="field">
            <label htmlFor="smart-currency">{t("smartOrders.fields.priceCurrency")}</label>
            <select
              id="smart-currency"
              className="input"
              value={value.priceCurrency}
              onChange={(e) => set({ priceCurrency: e.target.value })}
              disabled={disabled}
            >
              {CUSTOMER_PRICE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}
