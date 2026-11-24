import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import { adminFinancePoliciesRequest, adminFinancePolicyHistoryRequest, adminSetFinancePolicyRequest } from "../../../services/api";
import { FinanceNotice, StatusBadge } from "../../../components/orders/smart/FinanceBits";
import {
  FINANCE_POLICY_KEYS,
  LOCKED_ACTIVE_POLICY_KEYS,
  POLICY_CONFIG_FIELDS,
  buildPolicyConfig,
  policyNeedsApproval,
  validatePolicyDraft,
} from "../../../components/orders/smart/financeUtils";

const configText = (config) =>
  Object.entries(config || {})
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");

function draftFrom(policy) {
  const config = {};
  for (const fd of POLICY_CONFIG_FIELDS[policy?.key] || []) {
    if (fd.fixed === undefined) config[fd.name] = policy?.config?.[fd.name] != null ? String(policy.config[fd.name]) : "";
  }
  return { status: policy?.active ? "active" : "disabled", config, approvalReference: "", note: "" };
}

/** Versioned finance policies. Gated (money-changing) policies need a management approval reference to activate. */
export default function FinancePoliciesTab({ canChange }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [policies, setPolicies] = useState(null);
  const [editing, setEditing] = useState(null); // policy key
  const [draft, setDraft] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState({}); // key → rows

  const load = useCallback(async () => {
    try {
      const res = await adminFinancePoliciesRequest();
      setPolicies(res?.data || {});
    } catch (e) {
      push({ type: "error", title: f("policies.failed"), message: getSafeApiErrorMessage(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleHistory = async (key) => {
    if (history[key]) {
      setHistory((h) => ({ ...h, [key]: undefined }));
      return;
    }
    try {
      const res = await adminFinancePolicyHistoryRequest(key);
      setHistory((h) => ({ ...h, [key]: Array.isArray(res?.data) ? res.data : [] }));
    } catch (e) {
      push({ type: "error", title: f("policies.failed"), message: getSafeApiErrorMessage(e) });
    }
  };

  const startEdit = (p) => {
    setEditing(p.key);
    setDraft(draftFrom(p));
    setShowErrors(false);
  };

  const error = editing && draft ? validatePolicyDraft(editing, draft) : null;

  const submit = async () => {
    setShowErrors(true);
    if (error) return;
    setBusy(true);
    try {
      await adminSetFinancePolicyRequest(editing, {
        status: draft.status,
        config: buildPolicyConfig(editing, draft.config),
        approvalReference: draft.approvalReference.trim() || null,
        note: draft.note.trim() || null,
      });
      push({ type: "success", title: f("common.saved") });
      setHistory((h) => ({ ...h, [editing]: undefined }));
      setEditing(null);
      setDraft(null);
      await load();
    } catch (e) {
      push({ type: "error", title: f("policies.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const dt = (v) => (v ? formatLocaleDateTime(v, locale) : "—");

  return (
    <div className="fin-tab" data-testid="finance-policies">
      <FinanceNotice tone="warning" testId="finance-policies-gated-notice">
        <strong>{f("policies.noticeTitle")}</strong>
        <span>{f("policies.noticeGated")}</span>
        <span>{f("policies.noticeBaseCurrency")}</span>
      </FinanceNotice>
      {!policies ? <p className="help">{f("common.loading")}</p> : null}
      {policies
        ? FINANCE_POLICY_KEYS.filter((k) => policies[k]).map((key) => {
            const p = policies[key];
            return (
              <section key={key} className="fin-card" data-testid={`finance-policy-${key}`}>
                <div className="fin-card__head">
                  <h3>{f(`policies.keys.${key}`)}</h3>
                  <div className="fin-card__badges">
                    <StatusBadge tone={p.active ? "success" : "neutral"} testId={`finance-policy-status-${key}`}>
                      {p.active ? f("policies.active") : f("policies.disabled")}
                    </StatusBadge>
                    <span className="oh-mini-chip">{f("policies.version", { version: p.version })}</span>
                    {p.gated ? <StatusBadge tone="warning">{f("policies.gated")}</StatusBadge> : null}
                  </div>
                </div>
                <p className="help">{f(`policies.descriptions.${key}`)}</p>
                <div className="smart-panel__row">
                  <span className="smart-panel__label">{f("policies.config")}</span>
                  <code className="smart-panel__value" dir="ltr">
                    {configText(p.config)}
                  </code>
                </div>
                <div className="smart-panel__row">
                  <span className="smart-panel__label">{f("policies.approvalReference")}</span>
                  <span className="smart-panel__value" dir="auto">
                    {p.approvalReference || "—"}
                  </span>
                </div>
                {p.note ? (
                  <div className="smart-panel__row">
                    <span className="smart-panel__label">{f("policies.note")}</span>
                    <span className="smart-panel__value" dir="auto">
                      {p.note}
                    </span>
                  </div>
                ) : null}
                <div className="smart-panel__row">
                  <span className="smart-panel__label">{f("policies.effectiveFrom")}</span>
                  <span className="smart-panel__value">{dt(p.effectiveFrom)}</span>
                </div>
                <div className="smart-panel__inline">
                  {canChange && key !== "base_currency" ? (
                    <button type="button" className="btn btn-secondary" onClick={() => startEdit(p)} data-testid={`finance-policy-edit-${key}`}>
                      {f("policies.newVersion")}
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-secondary" onClick={() => void toggleHistory(key)}>
                    {history[key] ? f("policies.hideHistory") : f("policies.history")}
                  </button>
                </div>

                {editing === key && draft ? (
                  <form
                    className="fin-form"
                    data-testid={`finance-policy-form-${key}`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <div className="smart-editor-grid">
                      <label className="field">
                        <span className="label">{f("policies.status")}</span>
                        <select
                          className="input"
                          value={draft.status}
                          onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                          disabled={LOCKED_ACTIVE_POLICY_KEYS.includes(key)}
                        >
                          <option value="active">{f("policies.active")}</option>
                          <option value="disabled">{f("policies.disabled")}</option>
                        </select>
                      </label>
                      {(POLICY_CONFIG_FIELDS[key] || []).map((fd) =>
                        fd.fixed !== undefined ? (
                          <div className="field" key={fd.name}>
                            <span className="label">{f(`policies.fields.${fd.name}`)}</span>
                            <code dir="ltr">{String(fd.fixed)}</code>
                          </div>
                        ) : (
                          <label className="field" key={fd.name}>
                            <span className="label">{f(`policies.fields.${fd.name}`)}</span>
                            <input
                              className="input"
                              dir="ltr"
                              inputMode={fd.type === "currency" ? "text" : "decimal"}
                              value={draft.config[fd.name] ?? ""}
                              onChange={(e) => setDraft({ ...draft, config: { ...draft.config, [fd.name]: e.target.value } })}
                              data-testid={`finance-policy-field-${fd.name}`}
                            />
                          </label>
                        ),
                      )}
                    </div>
                    <label className="field">
                      <span className="label">
                        {f("policies.approvalReference")}
                        {policyNeedsApproval(key, draft.status) ? <span className="smart-req"> *</span> : null}
                      </span>
                      <input
                        className="input"
                        dir="auto"
                        maxLength={300}
                        value={draft.approvalReference}
                        aria-invalid={showErrors && error === "approvalRequired" ? true : undefined}
                        onChange={(e) => setDraft({ ...draft, approvalReference: e.target.value })}
                        data-testid="finance-policy-approval"
                      />
                      {policyNeedsApproval(key, draft.status) ? <span className="help">{f("policies.approvalHint")}</span> : null}
                    </label>
                    <label className="field">
                      <span className="label">{f("policies.note")}</span>
                      <textarea className="input" rows={2} maxLength={500} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </label>
                    {showErrors && error ? (
                      <p className="oh-inline-alert" role="alert" data-testid="finance-policy-error">
                        {f(`policies.errors.${error}`)}
                      </p>
                    ) : null}
                    <div className="smart-panel__inline">
                      <button type="submit" className="btn btn-primary" disabled={busy} data-testid="finance-policy-submit">
                        {f("policies.save")}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditing(null);
                          setDraft(null);
                        }}
                      >
                        {f("common.cancel")}
                      </button>
                    </div>
                  </form>
                ) : null}

                {history[key] ? (
                  <ul className="smart-events" data-testid={`finance-policy-history-${key}`}>
                    {history[key].map((h) => (
                      <li key={h.version}>
                        <span dir="auto">
                          {f("policies.version", { version: h.version })} · {h.status === "active" ? f("policies.active") : f("policies.disabled")} ·{" "}
                          <code dir="ltr">{configText(h.config)}</code>
                          {h.approvalReference ? ` · ${h.approvalReference}` : ""}
                          {h.note ? ` · ${h.note}` : ""}
                        </span>
                        <span className="help">
                          {dt(h.createdAt)}
                          {h.createdBy ? ` · ${h.createdBy}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })
        : null}
    </div>
  );
}
