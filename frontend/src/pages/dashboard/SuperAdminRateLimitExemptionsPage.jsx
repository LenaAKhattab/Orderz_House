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
import "./superAdminRateLimitExemptionsPage.css";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
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

function statusLabel(status) {
  if (status === "active") return "نشط";
  if (status === "expired") return "منتهٍ";
  if (status === "revoked") return "ملغى";
  return status;
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
  }, [includeInactive]);

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
    const t = setTimeout(async () => {
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
      clearTimeout(t);
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
      setFormError("اختر مستخدمًا من نتائج البحث.");
      return;
    }
    if (!isAllowedRateLimitExemptionScope(form.scope)) {
      setFormError("النطاق غير مسموح.");
      return;
    }
    if (!form.reason.trim() || form.reason.trim().length < 5) {
      setFormError("السبب مطلوب (5 أحرف على الأقل).");
      return;
    }
    if (!form.expiresAt && !form.confirmPermanent) {
      setFormError("حدد تاريخ انتهاء أو أكّد الاستثناء الدائم.");
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
    if (!window.confirm("إلغاء هذا الاستثناء؟ سيعود المستخدم للحدود العادية فورًا (مع تأخير كاش قصير).")) {
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
        title="استثناءات Rate Limit"
        description="للمستخدمين الموثوقين فقط — حدود أعلى أو تجاوز scoped. لا يشمل تسجيل الدخول أو استعادة كلمة المرور."
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.rateLimitExemptions")}
        actions={
          <Button type="button" onClick={() => { setForm(emptyForm); setFormError(""); setModalOpen(true); }}>
            إضافة استثناء
          </Button>
        }
      />

      <div className="oh-rle-warning" role="note">
        هذه الخاصية للمستخدمين الموثوقين فقط. لا تشمل تسجيل الدخول أو استعادة كلمة المرور أو OTP أو الدفع.
        الاستثناء مربوط بـ <strong>userId</strong> وليس IP.
      </div>

      <DashboardSection
        title={`الاستثناءات (${activeCount} نشط)`}
        actions={
          <label className="oh-rle-toggle">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            إظهار الملغاة/السابقة
          </label>
        }
      >
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={load} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <DashboardEmptyState title="لا توجد استثناءات" description="أضف استثناءً لمستخدم موثوق عند الحاجة." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="oh-rle-table-wrap">
            <table className="oh-rle-table">
              <thead>
                <tr>
                  <th>المستخدم</th>
                  <th>النطاق</th>
                  <th>الوضع</th>
                  <th>الانتهاء</th>
                  <th>الحالة</th>
                  <th>السبب</th>
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
                      <td>{row.expiresAt ? formatJoDateTime(row.expiresAt) : "دائم"}</td>
                      <td>
                        <StatusBadge tone={statusTone(status)}>{statusLabel(status)}</StatusBadge>
                      </td>
                      <td className="oh-rle-reason">{row.reason}</td>
                      <td>
                        {status === "active" ? (
                          <Button type="button" variant="ghost" onClick={() => handleRevoke(row.id)}>
                            إلغاء
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
            <h2>إضافة استثناء</h2>
            <p className="oh-rle-modal__hint">
              مثال عملي: صديق يُدخل طلبات تدريب بكثافة → scope = <code>fake_order_create</code> أو{" "}
              <code>training_bulk</code> بوضع bypass وحد زمني واضح.
            </p>

            <label className="oh-rle-field">
              بحث المستخدم (اسم / إيميل / id)
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="اكتب حرفين على الأقل…"
                autoComplete="off"
              />
            </label>
            {searchingUsers ? <div className="oh-rle-muted">جاري البحث…</div> : null}
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
              <div className="oh-rle-selected">المحدد: {form.userLabel || form.userId}</div>
            ) : null}

            <label className="oh-rle-field">
              النطاق
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              >
                {RATE_LIMIT_EXEMPTION_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="oh-rle-field">
              الوضع
              <select
                value={form.mode}
                onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
              >
                {RATE_LIMIT_EXEMPTION_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            {form.mode === "increased_limit" ? (
              <div className="oh-rle-row">
                <label className="oh-rle-field">
                  max / دقيقة
                  <input
                    type="number"
                    min="1"
                    value={form.maxPerMinute}
                    onChange={(e) => setForm((f) => ({ ...f, maxPerMinute: e.target.value }))}
                  />
                </label>
                <label className="oh-rle-field">
                  max / ساعة
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
              ينتهي في
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
              استثناء دائم بدون تاريخ انتهاء (غير مُفضّل)
            </label>

            <label className="oh-rle-field">
              السبب (مطلوب)
              <textarea
                required
                rows={3}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="مثال: موثوق لإدخال طلبات تدريب عبر أدوات مساعدة"
              />
            </label>
            <label className="oh-rle-field">
              ملاحظات
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>

            {formError ? <div className="oh-rle-form-error">{formError}</div> : null}

            <div className="oh-rle-modal__actions">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "جارٍ الحفظ…" : "حفظ"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
}
