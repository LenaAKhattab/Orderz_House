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
import { useToast } from "../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  listSuperAdminBildazoAuthorLinksRequest,
  manualLinkSuperAdminBildazoAuthorRequest,
  updateSuperAdminBildazoAuthorLinkStatusRequest,
} from "../../services/api";
import SuperAdminFreelancerBildazoIntegrationPanel from "../../components/admin/SuperAdminFreelancerBildazoIntegrationPanel";
import {
  BILDAZO_ADMIN_REVIEW_STATUSES,
  BILDAZO_ADMIN_STATUS_FILTERS,
  bildazoAdminStatusLabel,
  bildazoAdminStatusTone,
  canSubmitManualLink,
} from "../../constants/bildazoAuthorAdmin";

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

const emptyLinkForm = {
  bildazoUserId: "",
  bildazoPublicId: "",
  bildazoProfileUrl: "",
  manualReviewReason: "",
  confirmVerified: false,
};

export default function SuperAdminBildazoAuthorLinksPage() {
  const { push } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [schemaReady, setSchemaReady] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [dialogRow, setDialogRow] = useState(null);
  const [form, setForm] = useState(emptyLinkForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminBildazoAuthorLinksRequest({
        status: status === "all" ? undefined : status,
        search: search || undefined,
      });
      setSchemaReady(res?.schemaReady !== false);
      setItems(res?.data?.items || []);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === "BILDAZO_AUTHOR_GATE_SCHEMA_MISSING") {
        setSchemaReady(false);
        setItems([]);
        setError(getSafeApiErrorMessage(err) || "جدول ربط Bildazo غير جاهز.");
      } else {
        setError(getSafeApiErrorMessage(err) || "تعذر تحميل طلبات الربط.");
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  const canSubmit = useMemo(
    () =>
      canSubmitManualLink({
        bildazoPublicId: form.bildazoPublicId,
        bildazoProfileUrl: form.bildazoProfileUrl,
        confirmVerified: form.confirmVerified,
      }),
    [form.bildazoPublicId, form.bildazoProfileUrl, form.confirmVerified],
  );

  function openManualLink(row) {
    setDialogRow(row);
    setFormError("");
    setForm({
      bildazoUserId: row.bildazoUserId || "",
      bildazoPublicId: row.bildazoPublicId || row.existingBildazoPublicId || "",
      bildazoProfileUrl: row.bildazoProfileUrl || row.existingBildazoProfileUrl || "",
      manualReviewReason: row.manualReviewReason || "",
      confirmVerified: false,
    });
  }

  async function handleManualLink(event) {
    event.preventDefault();
    if (!dialogRow || !canSubmit) return;
    setSaving(true);
    setFormError("");
    try {
      await manualLinkSuperAdminBildazoAuthorRequest(dialogRow.id, {
        bildazoUserId: form.bildazoUserId.trim() || undefined,
        bildazoPublicId: form.bildazoPublicId.trim() || undefined,
        bildazoProfileUrl: form.bildazoProfileUrl.trim() || undefined,
        manualReviewReason: form.manualReviewReason.trim() || undefined,
        confirmVerified: true,
      });
      push({ type: "success", message: "تم حفظ الربط اليدوي لحساب الكاتب." });
      setDialogRow(null);
      await load();
    } catch (err) {
      setFormError(getSafeApiErrorMessage(err) || "تعذر حفظ الربط اليدوي.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(row, nextStatus) {
    const needsReason = nextStatus === "failed" || nextStatus === "blocked";
    let reason = row.manualReviewReason || "";
    if (needsReason) {
      const typed = window.prompt("سبب المراجعة (مطلوب):", reason);
      if (typed == null) return;
      reason = String(typed).trim();
      if (!reason) {
        push({ type: "error", message: "سبب المراجعة مطلوب لحالة الفشل أو الإيقاف." });
        return;
      }
    }
    setStatusBusyId(row.id);
    try {
      await updateSuperAdminBildazoAuthorLinkStatusRequest(row.id, {
        status: nextStatus,
        manualReviewReason: reason || undefined,
      });
      push({ type: "success", message: "تم تحديث حالة الطلب." });
      await load();
    } catch (err) {
      push({ type: "error", message: getSafeApiErrorMessage(err) || "تعذر تحديث الحالة." });
    } finally {
      setStatusBusyId(null);
    }
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="ربط حسابات Bildazo"
        description="مراجعة طلبات ربط حساب الكاتب وتمييز الطلبات بعد التحقق اليدوي. لا يتم إنشاء حساب Bildazo من هنا."
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.bildazoAuthorLinks")}
      />

      {schemaReady === false ? (
        <p className="mb-4 rounded-[10px] border border-[color:var(--dash-warning-border,#f0d4a8)] bg-[color:var(--dash-warning-bg,#fff6e8)] px-3 py-2 text-[0.92rem]">
          جدول الربط غير جاهز بعد (الترحيل 164). يمكن فتح الصفحة لكن لا يمكن الربط حتى يُطبَّق الترحيل.
        </p>
      ) : (
        <p className="mb-4 text-[0.88rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
          لا توجد صفحة ملف مستقل منفصلة في Super Admin — يظهر ملخص تكامل Bildazo لكل مستقل ضمن هذه الصفحة.
        </p>
      )}

      <DashboardSection>
        <form
          className="mb-4 flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
          }}
        >
          <label className="grid min-w-[220px] flex-1 gap-1">
            <span className="text-[0.85rem] font-bold">بحث</span>
            <input
              className="rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] bg-white p-2.5 font-inherit"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="اسم / بريد / معرّف عام"
              data-testid="bildazo-admin-search"
            />
          </label>
          <Button type="submit" variant="secondary">
            بحث
          </Button>
        </form>

        <div className="mb-4 flex flex-wrap gap-2" data-testid="bildazo-admin-filters" role="tablist">
          {BILDAZO_ADMIN_STATUS_FILTERS.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={status === item.value ? "primary" : "secondary"}
              onClick={() => setStatus(item.value)}
            >
              {item.labelAr}
            </Button>
          ))}
        </div>

        {loading ? <DashboardLoadingState /> : null}
        {error ? <DashboardErrorState message={error} onRetry={load} /> : null}
        {!loading && !error && items.length === 0 ? (
          <DashboardEmptyState title="لا توجد طلبات" description="لا توجد طلبات ربط مطابقة للتصفية الحالية." />
        ) : null}

        <div className="grid gap-3">
          {items.map((row) => (
            <article
              key={row.id}
              className="dash-ui-surface--soft rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] p-4"
              data-testid={`bildazo-admin-row-${row.id}`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-[1.02rem] font-extrabold">
                  {row.freelancerDisplayName || row.fullName || `مستقل #${row.freelancerUserId}`}
                </h2>
                <StatusBadge tone={bildazoAdminStatusTone(row.status)}>
                  {row.status === "linked" ? "حساب الكاتب مرتبط" : bildazoAdminStatusLabel(row.status)}
                </StatusBadge>
              </div>
              <p className="m-0 text-[0.9rem] text-[color:var(--dash-text-secondary,#4b5563)]">
                {row.orderzVerifiedEmail}
                {row.emailMatchesOrderz ? " — البريد يطابق OrderzHouse" : ""}
              </p>
              <p className="mb-0 mt-1 text-[0.88rem]">
                التدفق: {row.linkFlow === "new_account" ? "حساب جديد" : "حساب موجود"} · الشروط:{" "}
                {row.acceptedTermsVersion || "—"} · {formatJoDateTime(row.acceptedAt)}
              </p>
              {row.existingBildazoEmail || row.existingBildazoPublicId || row.existingBildazoProfileUrl ? (
                <p className="mb-0 mt-1 text-[0.88rem]">
                  حساب موجود: {row.existingBildazoEmail || "—"} / {row.existingBildazoPublicId || "—"} /{" "}
                  {row.existingBildazoProfileUrl || "—"}
                </p>
              ) : null}
              {row.status === "linked" ? (
                <p className="mb-0 mt-2 text-[0.9rem]" data-testid="bildazo-admin-linked-summary">
                  Public ID: <strong>{row.bildazoPublicId || "—"}</strong>
                  {row.bildazoProfileUrl ? (
                    <>
                      {" · "}
                      <a href={row.bildazoProfileUrl} target="_blank" rel="noreferrer">
                        {row.bildazoProfileUrl}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}

              <SuperAdminFreelancerBildazoIntegrationPanel freelancerUserId={row.freelancerUserId} />

              <div className="mt-3 flex flex-wrap gap-2">
                {row.status !== "blocked" ? (
                  <Button type="button" onClick={() => openManualLink(row)}>
                    ربط الحساب
                  </Button>
                ) : null}
                {row.status !== "linked"
                  ? BILDAZO_ADMIN_REVIEW_STATUSES.filter((s) => s !== row.status).map((nextStatus) => (
                      <Button
                        key={nextStatus}
                        type="button"
                        variant="secondary"
                        disabled={statusBusyId === row.id}
                        onClick={() => handleStatus(row, nextStatus)}
                      >
                        {bildazoAdminStatusLabel(nextStatus)}
                      </Button>
                    ))
                  : null}
              </div>
            </article>
          ))}
        </div>
      </DashboardSection>

      {dialogRow ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          data-testid="bildazo-manual-link-dialog"
        >
          <form
            className="grid w-full max-w-[520px] gap-3 rounded-[12px] bg-white p-4"
            onSubmit={handleManualLink}
          >
            <h2 className="m-0 text-[1.1rem] font-extrabold">ربط الحساب</h2>
            <p className="m-0 text-[0.9rem] text-[color:var(--dash-text-secondary,#4b5563)]">
              هذا ربط يدوي داخل OrderzHouse بعد التحقق الخارجي. لا يتم إنشاء حساب Bildazo من هذه الصفحة.
            </p>
            <label className="grid gap-1 text-[0.9rem]">
              Bildazo User ID (اختياري)
              <input
                className="rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                value={form.bildazoUserId}
                onChange={(e) => setForm((f) => ({ ...f, bildazoUserId: e.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-[0.9rem]">
              Bildazo Public ID
              <input
                className="rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                value={form.bildazoPublicId}
                onChange={(e) => setForm((f) => ({ ...f, bildazoPublicId: e.target.value }))}
                data-testid="bildazo-manual-public-id"
              />
            </label>
            <label className="grid gap-1 text-[0.9rem]">
              Bildazo Profile URL
              <input
                className="rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                value={form.bildazoProfileUrl}
                onChange={(e) => setForm((f) => ({ ...f, bildazoProfileUrl: e.target.value }))}
                placeholder="https://bildazo.com/..."
                data-testid="bildazo-manual-profile-url"
              />
            </label>
            <label className="grid gap-1 text-[0.9rem]">
              ملاحظة المراجعة (اختياري)
              <textarea
                className="rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                rows={3}
                value={form.manualReviewReason}
                onChange={(e) => setForm((f) => ({ ...f, manualReviewReason: e.target.value }))}
              />
            </label>
            <label className="flex items-start gap-2 text-[0.9rem]">
              <input
                type="checkbox"
                checked={form.confirmVerified}
                onChange={(e) => setForm((f) => ({ ...f, confirmVerified: e.target.checked }))}
                data-testid="bildazo-manual-confirm"
              />
              <span>أؤكد أنني تحققت من ملكية حساب Bildazo قبل الربط.</span>
            </label>
            {formError ? (
              <p className="m-0 text-[0.9rem] text-[color:var(--dash-danger,#c03535)]">{formError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDialogRow(null)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={!canSubmit || saving} data-testid="bildazo-manual-submit">
                ربط الحساب
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </DashboardShell>
  );
}
