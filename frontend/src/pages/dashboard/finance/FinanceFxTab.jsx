import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import { adminCreateFxSnapshotRequest, adminListFxSnapshotsRequest } from "../../../services/api";
import { FinanceNotice, FinanceTable } from "../../../components/orders/smart/FinanceBits";
import { FX_QUOTE_CURRENCIES, isValidFxRate } from "../../../components/orders/smart/financeUtils";

const EMPTY = { quoteCurrency: "AED", rate: "", source: "", rateAt: "", note: "" };

/** Manually entered FX snapshots (quote units per 1 JOD). Never fetched automatically. */
export default function FinanceFxTab({ canCreate }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminListFxSnapshotsRequest(filter);
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      push({ type: "error", title: f("fx.failed"), message: getSafeApiErrorMessage(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, push]);

  useEffect(() => {
    void load();
  }, [load]);

  const errors = {
    quoteCurrency: !/^[A-Z]{3}$/.test(form.quoteCurrency) || form.quoteCurrency === "JOD",
    rate: !isValidFxRate(form.rate),
    source: form.source.trim().length < 3,
    rateAt: !form.rateAt,
  };
  const hasError = Object.values(errors).some(Boolean);

  const submit = async () => {
    setShowErrors(true);
    if (hasError) return;
    setBusy(true);
    try {
      await adminCreateFxSnapshotRequest({
        baseCurrency: "JOD",
        quoteCurrency: form.quoteCurrency,
        rate: form.rate.trim(),
        source: form.source.trim(),
        rateAt: new Date(form.rateAt).toISOString(),
        note: form.note.trim() || null,
      });
      push({ type: "success", title: f("common.saved") });
      setForm(EMPTY);
      setShowErrors(false);
      await load();
    } catch (e) {
      push({ type: "error", title: f("fx.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const err = (k) => (showErrors && errors[k] ? <span className="fin-field-error">{f(`fx.errors.${k}`)}</span> : null);

  return (
    <div className="fin-tab" data-testid="finance-fx">
      <FinanceNotice tone="info">{f("fx.manualNotice")}</FinanceNotice>
      {canCreate ? (
        <form
          className="fin-card fin-form"
          data-testid="finance-fx-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h3>{f("fx.add")}</h3>
          <div className="smart-editor-grid">
            <label className="field">
              <span className="label">{f("fx.quoteCurrency")}</span>
              <select className="input" value={form.quoteCurrency} onChange={(e) => setForm({ ...form, quoteCurrency: e.target.value })}>
                {FX_QUOTE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {err("quoteCurrency")}
            </label>
            <label className="field">
              <span className="label">{f("fx.rate")}</span>
              <input
                className="input"
                dir="ltr"
                inputMode="decimal"
                value={form.rate}
                aria-invalid={showErrors && errors.rate ? true : undefined}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                data-testid="finance-fx-rate"
              />
              <span className="help">{f("fx.rateHint", { currency: form.quoteCurrency })}</span>
              {err("rate")}
            </label>
            <label className="field">
              <span className="label">{f("fx.source")} *</span>
              <input
                className="input"
                dir="auto"
                maxLength={120}
                value={form.source}
                aria-invalid={showErrors && errors.source ? true : undefined}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                data-testid="finance-fx-source"
              />
              {err("source")}
            </label>
            <label className="field">
              <span className="label">{f("fx.rateAt")} *</span>
              <input
                className="input"
                type="datetime-local"
                value={form.rateAt}
                aria-invalid={showErrors && errors.rateAt ? true : undefined}
                onChange={(e) => setForm({ ...form, rateAt: e.target.value })}
                data-testid="finance-fx-rate-at"
              />
              {err("rateAt")}
            </label>
          </div>
          <label className="field">
            <span className="label">{f("fx.note")}</span>
            <input className="input" dir="auto" maxLength={300} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy} data-testid="finance-fx-submit">
              {f("fx.save")}
            </button>
          </div>
        </form>
      ) : null}

      <section className="fin-card">
        <div className="fin-card__head">
          <h3>{f("fx.list")}</h3>
          <label className="field fin-inline-field">
            <span className="label">{f("fx.filter")}</span>
            <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">{f("fx.allCurrencies")}</option>
              {FX_QUOTE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!rows ? <p className="help">{f("common.loading")}</p> : null}
        {rows && !rows.length ? <p className="help">{f("common.none")}</p> : null}
        {rows && rows.length ? (
          <FinanceTable caption={f("fx.list")} testId="finance-fx-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{f("fx.pair")}</th>
                <th scope="col">{f("fx.rate")}</th>
                <th scope="col">{f("fx.source")}</th>
                <th scope="col">{f("fx.rateAt")}</th>
                <th scope="col">{f("fx.note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td dir="ltr">{r.id}</td>
                  <td dir="ltr">
                    1 {r.baseCurrency} = {r.quoteCurrency}
                  </td>
                  <td dir="ltr">{r.rate}</td>
                  <td dir="auto">{r.source}</td>
                  <td>{formatLocaleDateTime(r.rateAt, locale)}</td>
                  <td dir="auto">{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </FinanceTable>
        ) : null}
      </section>
    </div>
  );
}
