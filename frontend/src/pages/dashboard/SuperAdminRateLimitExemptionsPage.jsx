import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import {
  createRateLimitExemptionRequest,
  listRateLimitExemptionsRequest,
  revokeRateLimitExemptionRequest,
  searchRateLimitExemptionUsersRequest,
} from "../../services/api";
import {
  RATE_LIMIT_EXEMPTION_MODES,
  RATE_LIMIT_EXEMPTION_SCOPES,
  exemptionStatus,
  isAllowedRateLimitExemptionScope,
} from "../../constants/rateLimitExemptions";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";
import "./superAdminRateLimitExemptionsPage.css";

function formatJoDateTime(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const tag = locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(tag, {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "expired") return "warning";
  if (status === "revoked") return "danger";
  return "neutral";
}

const emptyForm = {
  userId: "",
  userLabel: "",
  scope: "fake_order_create",
  mode: "bypass",
  expiresAt: "",
  confirmPermanent: false,
  reason: "",
  notes: "",
  maxPerMinute: "",
  maxPerHour: "",
};

export default function SuperAdminRateLimitExemptionsPage() {
  const { t, locale } = useTranslation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const errorMessage = useCallback(
    (err) => err?.response?.data?.message || t("opsAdmin.common.genericError"),
    [t],
  );

  const statusLabel = useCallback(
    (status) => {
      if (status === "active") return t("opsAdmin.rateLimit.statusActive");
      if (status === "expired") return t("opsAdmin.rateLimit.statusExpired");
      if (status === "revoked") return t("opsAdmin.rateLimit.statusRevoked");
      return status;
    },
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listRateLimitExemptionsRequest({ includeInactive });
      setRows(res?.data?.exemptions || []);
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [includeInactive, errorMessage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const q = userQuery.trim();
    if (q.length < 2) {
      setUserResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await searchRateLimitExemptionUsersRequest(q);
        if (!cancelled) setUserResults(res?.data?.users || []);
      } catch {
        if (!cancelled) setUserResults([]);
      } finally {
        if (!cancelled) setSearchingUsers(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userQuery, modalOpen]);

  const activeCount = useMemo(
    () => rows.filter((r) => exemptionStatus(r) === "active").length,
    [rows],
  );

  async function handleCreate(e) {
    e.preventDefault();
    setFormError("");
    if (!form.userId) {
      setFormError(t("opsAdmin.rateLimit.errPickUser"));
      return;
    }
    if (!isAllowedRateLimitExemptionScope(form.scope)) {
      setFormError(t("opsAdmin.rateLimit.errScope"));
      return;
    }
    if (!form.reason.trim() || form.reason.trim().length < 5) {
      setFormError(t("opsAdmin.rateLimit.errReason"));
      return;
    }
    if (!form.expiresAt && !form.confirmPermanent) {
      setFormError(t("opsAdmin.rateLimit.errExpiry"));
      return;
    }
    setSaving(true);
    try {
      await createRateLimitExemptionRequest({
        userId: form.userId,
        scope: form.scope,
        mode: form.mode,
        reason: form.reason.trim(),
        notes: form.notes.trim() || undefined,
        expiresAt: form.expiresAt
          ? new Date(form.expiresAt).toISOString()
          : undefined,
        confirmPermanent: form.confirmPermanent,
        maxPerMinute: form.maxPerMinute || undefined,
        maxPerHour: form.maxPerHour || undefined,
      });
      setModalOpen(false);
      setForm(emptyForm);
      setUserQuery("");
      await load();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm(t("opsAdmin.rateLimit.revokeConfirm"))) {
      return;
    }
    try {
      await revokeRateLimitExemptionRequest(id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("opsAdmin.rateLimit.title")}
        description={t("opsAdmin.rateLimit.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.rateLimitExemptions")}
        actions={
          <Button type="button" onClick={() => { setForm(emptyForm); setFormError(""); setModalOpen(true); }}>
            {t("opsAdmin.rateLimit.addExemption")}
          </Button>
        }
      />

      <div className="oh-rle-warning" role="note">
        {t("opsAdmin.rateLimit.warningLine1")}{" "}
        {t("opsAdmin.rateLimit.warningLine2Prefix")}
        <strong>userId</strong>
        {t("opsAdmin.rateLimit.warningLine2Suffix")}
      </div>

      <DashboardSection
        title={t("opsAdmin.rateLimit.sectionTitle", { count: activeCount })}
        actions={
          <label className="oh-rle-toggle">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            {t("opsAdmin.rateLimit.showInactive")}
          </label>
        }
      >
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={load} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <DashboardEmptyState
            title={t("opsAdmin.rateLimit.emptyTitle")}
            description={t("opsAdmin.rateLimit.emptyDescription")}
          />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="oh-rle-table-wrap">
            <table className="oh-rle-table">
              <thead>
                <tr>
                  <th>{t("opsAdmin.rateLimit.colUser")}</th>
                  <th>{t("opsAdmin.rateLimit.colScope")}</th>
                  <th>{t("opsAdmin.rateLimit.colMode")}</th>
                  <th>{t("opsAdmin.rateLimit.colExpires")}</th>
                  <th>{t("opsAdmin.rateLimit.colStatus")}</th>
                  <th>{t("opsAdmin.rateLimit.colReason")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const status = exemptionStatus(row);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="oh-rle-user">
                          <span>{row.userDisplayName || row.userEmail || row.userId}</span>
                          <small>{row.userEmail}</small>
                        </div>
                      </td>
                      <td>
                        <code>{row.scope}</code>
                      </td>
                      <td>{row.mode}</td>
                      <td>
                        {row.expiresAt
                          ? formatJoDateTime(row.expiresAt, locale)
                          : t("opsAdmin.rateLimit.permanent")}
                      </td>
                      <td>
                        <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
                      </td>
                      <td className="oh-rle-reason">{row.reason}</td>
                      <td>
                        {status === "active" ? (
                          <Button type="button" variant="ghost" onClick={() => handleRevoke(row.id)}>
                            {t("opsAdmin.rateLimit.revoke")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </DashboardSection>

      {modalOpen ? (
        <div className="oh-rle-modal-backdrop" role="dialog" aria-modal="true">
          <form className="oh-rle-modal" onSubmit={handleCreate}>
            <h2>{t("opsAdmin.rateLimit.modalTitle")}</h2>
            <p className="oh-rle-modal__hint">{t("opsAdmin.rateLimit.modalHint")}</p>

            <label className="oh-rle-field">
              {t("opsAdmin.rateLimit.userSearchLabel")}
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder={t("opsAdmin.rateLimit.userSearchPlaceholder")}
                autoComplete="off"
              />
            </label>
            {searchingUsers ? <div className="oh-rle-muted">{t("opsAdmin.rateLimit.searching")}</div> : null}
            {userResults.length > 0 ? (
              <ul className="oh-rle-user-results">
                {userResults.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className={form.userId === u.id ? "is-selected" : ""}
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          userId: u.id,
                          userLabel: `${u.displayName} <${u.email}>`,
                        }));
                      }}
                    >
                      {u.displayName} — {u.email} (#{u.id})
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {form.userId ? (
              <div className="oh-rle-selected">
                {t("opsAdmin.rateLimit.selectedUser", { label: form.userLabel || form.userId })}
              </div>
            ) : null}

            <label className="oh-rle-field">
              {t("opsAdmin.rateLimit.scopeLabel")}
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              >
                {RATE_LIMIT_EXEMPTION_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(`opsAdmin.rateLimit.scopes.${s.value}`)}
                  </option>
                ))}
              </select>
            </label>

            <label className="oh-rle-field">
              {t("opsAdmin.rateLimit.modeLabel")}
              <select
                value={form.mode}
                onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
              >
                {RATE_LIMIT_EXEMPTION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(`opsAdmin.rateLimit.modes.${m.value}`)}
                  </option>
                ))}
              </select>
            </label>

            {form.mode === "increased_limit" ? (
              <div className="oh-rle-row">
                <label className="oh-rle-field">
                  {t("opsAdmin.rateLimit.maxPerMinute")}
                  <input
                    type="number"
                    min="1"
                    value={form.maxPerMinute}
                    onChange={(e) => setForm((f) => ({ ...f, maxPerMinute: e.target.value }))}
                  />
                </label>
                <label className="oh-rle-field">
                  {t("opsAdmin.rateLimit.maxPerHour")}
                  <input
                    type="number"
                    min="1"
                    value={form.maxPerHour}
                    onChange={(e) => setForm((f) => ({ ...f, maxPerHour: e.target.value }))}
                  />
                </label>
              </div>
            ) : null}

            <label className="oh-rle-field">
              {t("opsAdmin.rateLimit.expiresAt")}
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expiresAt: e.target.value, confirmPermanent: false }))
                }
              />
            </label>
            <label className="oh-rle-toggle">
              <input
                type="checkbox"
                checked={form.confirmPermanent}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    confirmPermanent: e.target.checked,
                    expiresAt: e.target.checked ? "" : f.expiresAt,
                  }))
                }
              />
              {t("opsAdmin.rateLimit.confirmPermanent")}
            </label>

            <label className="oh-rle-field">
              {t("opsAdmin.rateLimit.reasonRequired")}
              <textarea
                required
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={t("opsAdmin.rateLimit.reasonPlaceholder")}
              />
            </label>
            <label className="oh-rle-field">
              {t("opsAdmin.rateLimit.notes")}
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>

            {formError ? <div className="oh-rle-form-error">{formError}</div> : null}

            <div className="oh-rle-modal__actions">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                {t("opsAdmin.common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t("opsAdmin.common.saving") : t("opsAdmin.common.save")}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
}
