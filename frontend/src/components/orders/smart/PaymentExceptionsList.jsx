import { useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import { adminResolvePaymentExceptionRequest } from "../../../services/api";
import { Money, StatusBadge } from "./FinanceBits";
import { EXCEPTION_RESOLUTIONS, REASON_MIN } from "./financeUtils";

/**
 * Payment exceptions list + resolve form. Shared by the finance page and the per-order panel (`rows` given →
 * no fetching, the parent reloads via `onChanged`).
 */
export default function PaymentExceptionsList({ rows, canResolve, onChanged, showOrder = true }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [resolving, setResolving] = useState(null);
  const [form, setForm] = useState({ resolution: "no_action_required", note: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (id) => {
    setBusy(true);
    try {
      await adminResolvePaymentExceptionRequest(id, { resolution: form.resolution, note: form.note.trim() });
      push({ type: "success", title: f("common.saved") });
      setResolving(null);
      setForm({ resolution: "no_action_required", note: "" });
      await onChanged?.();
    } catch (e) {
      push({ type: "error", title: f("exceptions.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!rows.length) return <p className="help">{f("common.none")}</p>;
  return (
    <ul className="fin-rows" data-testid="finance-exceptions-list">
      {rows.map((x) => (
        <li key={x.id} className="fin-row" data-status={x.status}>
          <div className="fin-row__main">
            <strong>{f(`exceptions.kinds.${x.kind}`)}</strong>
            <StatusBadge tone={x.status === "open" ? "warning" : "success"}>{f(`exceptions.statuses.${x.status}`)}</StatusBadge>
            {showOrder && x.orderCode ? (
              <span className="oh-mini-chip" dir="ltr">
                {x.orderCode}
              </span>
            ) : null}
            {x.quoteVersion != null ? <span className="oh-mini-chip">{f("exceptions.quoteVersion", { version: x.quoteVersion })}</span> : null}
            <Money amount={x.amount} currency={x.currency} />
            <span className="help">{formatLocaleDateTime(x.createdAt, locale)}</span>
          </div>
          {x.detail ? (
            <p className="help" dir="auto">
              {typeof x.detail === "string" ? x.detail : JSON.stringify(x.detail)}
            </p>
          ) : null}
          {x.status !== "open" ? (
            <p className="help" dir="auto">
              {f(`exceptions.resolutions.${x.resolution}`)} · {x.resolutionNote} · {x.resolvedAt ? formatLocaleDateTime(x.resolvedAt, locale) : ""}
            </p>
          ) : null}
          {x.status === "open" && canResolve ? (
            resolving === x.id ? (
              <form
                className="fin-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(x.id);
                }}
              >
                <div className="smart-editor-grid">
                  <label className="field">
                    <span className="label">{f("exceptions.resolution")}</span>
                    <select className="input" value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })}>
                      {EXCEPTION_RESOLUTIONS.map((r) => (
                        <option key={r} value={r}>
                          {f(`exceptions.resolutions.${r}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">{f("exceptions.note")} *</span>
                    <input
                      className="input"
                      dir="auto"
                      maxLength={1000}
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      data-testid="finance-exception-note"
                    />
                  </label>
                </div>
                <div className="smart-panel__inline">
                  <button type="submit" className="btn btn-primary" disabled={busy || form.note.trim().length < REASON_MIN} data-testid="finance-exception-submit">
                    {f("exceptions.recordDecision")}
                  </button>
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setResolving(null)}>
                    {f("common.cancel")}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setResolving(x.id)} data-testid={`finance-exception-resolve-${x.id}`}>
                  {f("exceptions.resolve")}
                </button>
              </div>
            )
          ) : null}
        </li>
      ))}
    </ul>
  );
}
