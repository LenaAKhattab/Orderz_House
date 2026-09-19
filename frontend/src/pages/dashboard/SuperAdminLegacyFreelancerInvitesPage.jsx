import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createLegacyFreelancerInviteRequest,
  listLegacyFreelancerInvitesRequest,
  listLegacyFreelancerInviteRedemptionsRequest,
  revokeLegacyFreelancerInviteRequest,
  regenerateLegacyFreelancerInviteTokenRequest,
  updateLegacyFreelancerInviteRequest,
  getCategoriesRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { useAuth } from "../../context/useAuth";
import { ROLE } from "../../constants/authRoutes";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../components/dashboard/DashboardToolbar";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../components/dashboard/StatusBadge";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function defaultExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const EMPTY_FORM = {
  name: "",
  slug: "",
  maxRedemptions: 100,
  expiresAt: defaultExpiresAt(),
  defaultPlanCode: "orderzhouse_free",
  defaultTrustLevel: "APPROVED",
  defaultCategoryId: "",
  notes: "",
  isActive: true,
};

export default function SuperAdminLegacyFreelancerInvitesPage() {
  const { pushToast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = String(user?.role || user?.primaryRole || "") === ROLE.SUPER_ADMIN;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lastCreatedLink, setLastCreatedLink] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLegacyFreelancerInvitesRequest();
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل الحملات") });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
    getCategoriesRequest()
      .then((res) => setCategories(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setCategories([]));
  }, [load]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const loadRedemptions = useCallback(
    async (campaignId) => {
      if (!campaignId) {
        setRedemptions([]);
        return;
      }
      try {
        const res = await listLegacyFreelancerInviteRedemptionsRequest(campaignId);
        setRedemptions(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل المسجلين") });
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (selectedId) loadRedemptions(selectedId);
  }, [selectedId, loadRedemptions]);

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createLegacyFreelancerInviteRequest({
        name: form.name,
        slug: form.slug || undefined,
        maxRedemptions: Number(form.maxRedemptions),
        expiresAt: new Date(form.expiresAt).toISOString(),
        defaultPlanCode: form.defaultPlanCode,
        defaultTrustLevel: form.defaultTrustLevel,
        defaultCategoryId: form.defaultCategoryId ? Number(form.defaultCategoryId) : null,
        notes: form.notes || null,
        isActive: Boolean(form.isActive),
      });
      const created = res?.data;
      setLastCreatedLink(created?.joinUrl || null);
      setForm(EMPTY_FORM);
      pushToast({ type: "success", message: "تم إنشاء رابط الدعوة المشترك" });
      await load();
      if (created?.id) setSelectedId(String(created.id));
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إنشاء الحملة") });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ type: "success", message: "تم نسخ الرابط" });
    } catch {
      pushToast({ type: "error", message: "تعذر النسخ — انسخ الرابط يدوياً" });
    }
  };

  const onRevoke = async (id) => {
    setBusyId(id);
    try {
      await revokeLegacyFreelancerInviteRequest(id);
      pushToast({ type: "success", message: "تم إيقاف الرابط" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إيقاف الرابط") });
    } finally {
      setBusyId(null);
    }
  };

  const onRegenerate = async (id) => {
    setBusyId(id);
    try {
      const res = await regenerateLegacyFreelancerInviteTokenRequest(id);
      setLastCreatedLink(res?.data?.joinUrl || null);
      pushToast({ type: "success", message: "تم إعادة توليد الرمز — الرابط القديم باطل" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إعادة التوليد") });
    } finally {
      setBusyId(null);
    }
  };

  const onToggleActive = async (row) => {
    setBusyId(row.id);
    try {
      await updateLegacyFreelancerInviteRequest(row.id, { isActive: !row.isActive });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر التحديث") });
    } finally {
      setBusyId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <DashboardShell>
        <DashboardEmptyState title="غير مصرح" description="هذه الصفحة لمدير النظام فقط." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="دعوات الفريلانسرز القدامى"
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.legacyFreelancerInvites")}
        description="رابط دعوة مشترك واحد لكل حملة — بدون إنشاء حسابات يدوياً أو كلمات مرور."
      />

      {lastCreatedLink ? (
        <DashboardSection title="الرابط المشترك">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              readOnly
              value={lastCreatedLink}
              dir="ltr"
            />
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
              onClick={() => copyLink(lastCreatedLink)}
            >
              نسخ الرابط
            </button>
          </div>
          <p className="mt-2 text-sm text-slate-600">احفظ هذا الرابط الآن — الرمز يظهر مرة واحدة فقط بعد الإنشاء أو إعادة التوليد.</p>
        </DashboardSection>
      ) : null}

      <DashboardSection title="إنشاء حملة جديدة">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <label className="flex flex-col gap-1 text-sm">
            اسم الحملة
            <input
              required
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            رابط الحملة / slug
            <input
              className="rounded-lg border border-slate-200 px-3 py-2"
              dir="ltr"
              placeholder="company-freelancers-2026"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            عدد المقاعد المسموح
            <input
              type="number"
              min={1}
              required
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.maxRedemptions}
              onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            تاريخ انتهاء الرابط
            <input
              type="datetime-local"
              required
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الخطة الافتراضية
            <input
              className="rounded-lg border border-slate-200 px-3 py-2"
              dir="ltr"
              value={form.defaultPlanCode}
              onChange={(e) => setForm((f) => ({ ...f, defaultPlanCode: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            مستوى الثقة الافتراضي
            <select
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.defaultTrustLevel}
              onChange={(e) => setForm((f) => ({ ...f, defaultTrustLevel: e.target.value }))}
            >
              <option value="APPROVED">APPROVED</option>
              <option value="TRUSTED">TRUSTED</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            التصنيف الافتراضي (اختياري)
            <select
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.defaultCategoryId}
              onChange={(e) => setForm((f) => ({ ...f, defaultCategoryId: e.target.value }))}
            >
              <option value="">— بدون —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.slug}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            ملاحظات داخلية
            <textarea
              className="rounded-lg border border-slate-200 px-3 py-2"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            تفعيل الرابط
          </label>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {creating ? "جاري الإنشاء…" : "إنشاء رابط مشترك"}
            </button>
          </div>
        </form>
      </DashboardSection>

      <DashboardSection title="الحملات">
        <DashboardToolbar>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={load}>
            تحديث
          </button>
        </DashboardToolbar>
        {loading ? (
          <DashboardLoadingState />
        ) : rows.length === 0 ? (
          <DashboardEmptyState title="لا توجد حملات" description="أنشئ حملة لعرض رابط دعوة مشترك." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-right text-slate-500">
                  <th className="px-2 py-2">الاسم</th>
                  <th className="px-2 py-2">Slug</th>
                  <th className="px-2 py-2">المسجلون / المقاعد</th>
                  <th className="px-2 py-2">الانتهاء</th>
                  <th className="px-2 py-2">الحالة</th>
                  <th className="px-2 py-2">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{row.name}</td>
                    <td className="px-2 py-2" dir="ltr">
                      {row.slug}
                    </td>
                    <td className="px-2 py-2">
                      {row.usedCount} / {row.maxRedemptions}
                    </td>
                    <td className="px-2 py-2">{formatDate(row.expiresAt)}</td>
                    <td className="px-2 py-2">
                      <StatusBadge tone={row.isActive ? "success" : "danger"}>
                        {row.isActive ? "نشط" : "متوقف"}
                      </StatusBadge>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => setSelectedId(row.id)}
                        >
                          المسجلون
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          disabled={busyId === row.id}
                          onClick={() => onToggleActive(row)}
                        >
                          {row.isActive ? "إيقاف" : "تفعيل"}
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          disabled={busyId === row.id}
                          onClick={() => onRegenerate(row.id)}
                        >
                          إعادة توليد token
                        </button>
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                          disabled={busyId === row.id}
                          onClick={() => onRevoke(row.id)}
                        >
                          إبطال
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSection>

      {selected ? (
        <DashboardSection title={`المسجلون — ${selected.name}`}>
          <p className="mb-2 text-sm text-slate-600">
            {selected.usedCount} / {selected.maxRedemptions} مقعد
          </p>
          {redemptions.length === 0 ? (
            <DashboardEmptyState title="لا مسجلين بعد" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-slate-500">
                    <th className="px-2 py-2">الاسم</th>
                    <th className="px-2 py-2">البريد</th>
                    <th className="px-2 py-2">الهاتف</th>
                    <th className="px-2 py-2">مرجع</th>
                    <th className="px-2 py-2">تاريخ التسجيل</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100">
                      <td className="px-2 py-2">{r.fullName}</td>
                      <td className="px-2 py-2" dir="ltr">
                        {r.emailMasked}
                      </td>
                      <td className="px-2 py-2" dir="ltr">
                        {r.phoneMasked || "—"}
                      </td>
                      <td className="px-2 py-2">{r.internalReference || r.identityLast4 || "—"}</td>
                      <td className="px-2 py-2">{formatDate(r.redeemedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <a
            className="mt-3 inline-block text-sm text-emerald-800 underline"
            href={`/api/super-admin/legacy-freelancer-invites/${selected.id}/redemptions.csv`}
          >
            تصدير CSV
          </a>
        </DashboardSection>
      ) : null}
    </DashboardShell>
  );
}
