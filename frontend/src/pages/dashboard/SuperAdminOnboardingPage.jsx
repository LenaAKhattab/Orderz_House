import { useCallback, useEffect, useRef, useState } from "react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useToast } from "../../components/ui/toastContext";
import {
  adminCreateOnboardingItemRequest,
  adminDisableOnboardingItemRequest,
  adminEnableOnboardingItemRequest,
  adminListOnboardingItemsRequest,
  adminUpdateOnboardingItemRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { resolveSafeInternalNavPath } from "../../utils/safeInternalNavPath";

const CONDITIONS = [
  "freelancer_new",
  "profile_incomplete",
  "verification_incomplete",
  "training_incomplete",
  "activation_not_requested",
  "activation_pending_review",
  "activation_rejected",
  "activated",
  "mini_bid_intro",
  "article_mini_bid_intro",
];

const emptyForm = {
  key: "",
  title: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  conditionKey: "mini_bid_intro",
  itemType: "informational",
  placement: "getting_started",
  sortOrder: 0,
  isDismissible: true,
};

export default function SuperAdminOnboardingPage() {
  const { push } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const togglingIdRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await adminListOnboardingItemsRequest();
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل عناصر الإرشاد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (item) => {
    setEditingId(item.id);
    setForm({
      key: item.key,
      title: item.title,
      body: item.body,
      ctaLabel: item.ctaLabel || "",
      ctaUrl: item.ctaUrl || "",
      conditionKey: item.conditionKey,
      itemType: item.itemType,
      placement: item.placement,
      sortOrder: item.sortOrder,
      isDismissible: item.isDismissible,
    });
  };

  const save = async (e) => {
    e.preventDefault();
    if (saving || savingRef.current) return;
    const ctaRaw = String(form.ctaUrl || "").trim();
    let ctaUrl = null;
    if (ctaRaw) {
      ctaUrl = resolveSafeInternalNavPath(ctaRaw, "");
      if (!ctaUrl) {
        push("مسار الزر يجب أن يكون مساراً داخلياً يبدأ بـ /", "error");
        return;
      }
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        ...form,
        sortOrder: Number(form.sortOrder) || 0,
        ctaLabel: form.ctaLabel || null,
        ctaUrl,
      };
      if (editingId) {
        await adminUpdateOnboardingItemRequest(editingId, payload);
        push("تم حفظ العنصر.", "success");
      } else {
        await adminCreateOnboardingItemRequest(payload);
        push("تم إنشاء العنصر.", "success");
      }
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      push(getSafeApiErrorMessage(err) || "تعذر الحفظ. إن لم تُطبَّق الهجرة بعد فهذا متوقع.", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const toggleEnabled = async (item) => {
    if (togglingIdRef.current) return;
    togglingIdRef.current = item.id;
    try {
      if (item.isEnabled) await adminDisableOnboardingItemRequest(item.id);
      else await adminEnableOnboardingItemRequest(item.id);
      await load();
    } catch (err) {
      push(getSafeApiErrorMessage(err) || "تعذر تحديث الحالة.", "error");
    } finally {
      togglingIdRef.current = null;
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="محتوى إرشاد المستقلين"
        description="عناوين ونصوص وأزرار إرشاد ما قبل التفعيل ومركز البداية. الشروط مفاتيح آمنة وليست كودًا."
        breadcrumbs={superAdminBreadcrumbs(["dashboard.breadcrumbs.onboarding"])}
      />
      <DashboardSection title="عنصر">
        <form onSubmit={save} className="dash-ui-form" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
          {!editingId ? (
            <label>
              المفتاح
              <input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} required={!editingId} />
            </label>
          ) : (
            <p>تعديل: {form.key}</p>
          )}
          <label>
            العنوان
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
          </label>
          <label>
            النص
            <textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />
          </label>
          <label>
            نص الزر
            <input value={form.ctaLabel} onChange={(e) => setForm((f) => ({ ...f, ctaLabel: e.target.value }))} />
          </label>
          <label>
            مسار الزر (داخلي)
            <input value={form.ctaUrl} onChange={(e) => setForm((f) => ({ ...f, ctaUrl: e.target.value }))} placeholder="/dashboard/freelancer/..." />
          </label>
          <label>
            الشرط
            <select value={form.conditionKey} onChange={(e) => setForm((f) => ({ ...f, conditionKey: e.target.value }))}>
              {CONDITIONS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
          <label>
            النوع
            <select value={form.itemType} onChange={(e) => setForm((f) => ({ ...f, itemType: e.target.value }))}>
              <option value="informational">informational</option>
              <option value="required">required</option>
            </select>
          </label>
          <label>
            الموضع
            <select value={form.placement} onChange={(e) => setForm((f) => ({ ...f, placement: e.target.value }))}>
              <option value="dashboard_banner">dashboard_banner</option>
              <option value="getting_started">getting_started</option>
              <option value="inline_help">inline_help</option>
              <option value="modal">modal</option>
            </select>
          </label>
          <label>
            الترتيب
            <input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.isDismissible}
              onChange={(e) => setForm((f) => ({ ...f, isDismissible: e.target.checked }))}
            />{" "}
            قابل للإخفاء
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "جارٍ الحفظ…" : editingId ? "حفظ التعديل" : "إنشاء"}
          </button>
        </form>
      </DashboardSection>
      <DashboardSection title="العناصر والإحصاءات">
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={load} /> : null}
        {!loading && !error ? (
          <div className="table-wrap max-w-full overflow-x-auto">
            <table className="dash-ui-table">
              <thead>
                <tr>
                  <th>المفتاح</th>
                  <th>العنوان</th>
                  <th>شرط</th>
                  <th>موضع</th>
                  <th>مفعّل</th>
                  <th>مشاهدات</th>
                  <th>نقرات</th>
                  <th>إخفاء</th>
                  <th>إكمال</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.key}</td>
                    <td>{item.title}</td>
                    <td>{item.conditionKey}</td>
                    <td>{item.placement}</td>
                    <td>{item.isEnabled ? "نعم" : "لا"}</td>
                    <td>{item.stats?.views ?? 0}</td>
                    <td>{item.stats?.ctaClicks ?? 0}</td>
                    <td>{item.stats?.dismissals ?? 0}</td>
                    <td>{item.stats?.completions ?? 0}</td>
                    <td>
                      <button type="button" onClick={() => startEdit(item)}>
                        تعديل
                      </button>{" "}
                      {item.isEnabled ? (
                        <button type="button" onClick={() => void toggleEnabled(item)}>
                          إيقاف
                        </button>
                      ) : (
                        <button type="button" onClick={() => void toggleEnabled(item)}>
                          تشغيل
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
