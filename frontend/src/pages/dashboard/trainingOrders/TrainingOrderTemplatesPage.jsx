import { useEffect, useMemo, useState } from "react";
import {
  adminCreateTrainingTemplateRequest,
  adminDeleteTrainingTemplateRequest,
  adminListTrainingTemplatesRequest,
  adminPatchTrainingTemplateRequest,
  getCategoriesRequest,
} from "../../../services/api";
import AdminInternalOrderWizard from "../../../components/orders/AdminInternalOrderWizard";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import "./trainingOrdersAdmin.css";

function errMsg(e) {
  return e?.response?.data?.message || e?.message || "حدث خطأ.";
}

/** Map API template row → AdminInternalOrderWizard initialValues (mode=fake-template). */
function templateToWizardInitial(t) {
  if (!t) return {};
  const minB = Number(t.minBudget);
  const maxB = Number(t.maxBudget);
  const minD = Number(t.minDuration);
  const maxD = Number(t.maxDuration);
  const budgetFixed = minB === maxB;
  const base = {
    title: t.title || "",
    description: t.description || "",
    categoryId: String(t.categoryId || ""),
    subSubcategoryId: String(t.subSubcategoryId || ""),
    durationUnit: t.durationUnit || "days",
    preferredSkills: Array.isArray(t.skills) ? t.skills : [],
    isActiveTemplate: t.isActive !== false,
  };
  if (budgetFixed) {
    return {
      ...base,
      projectType: "fixed",
      budget: String(minB),
      bidBudgetMin: "",
      bidBudgetMax: "",
      durationValue: String(minD),
      durationMin: "",
      durationMax: "",
    };
  }
  return {
    ...base,
    projectType: "bidding",
    budget: "",
    bidBudgetMin: String(minB),
    bidBudgetMax: String(maxB),
    durationValue: "",
    durationMin: String(minD),
    durationMax: String(maxD),
  };
}

function formatDuration(minDuration, maxDuration, durationUnit) {
  const min = Number(minDuration);
  const max = Number(maxDuration);
  const unit = durationUnit || "days";
  if (Number.isFinite(min) && Number.isFinite(max) && min === max) {
    return `${min} ${unit}`;
  }
  return `${minDuration}–${maxDuration} ${unit}`;
}

export default function TrainingOrderTemplatesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [categories, setCategories] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [wizardReset, setWizardReset] = useState(0);

  const loadList = async () => {
    setError("");
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        q: q.trim() || undefined,
        categoryId: categoryFilter || undefined,
        isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
      };
      const res = await adminListTrainingTemplatesRequest(params);
      const payload = res?.data ?? res;
      setTemplates(payload?.templates || []);
      setPagination(payload?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategoriesRequest();
        const body = res?.data ?? res;
        const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        if (!cancelled) setCategories(list);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadList();
  }, [page, categoryFilter, statusFilter]);

  const search = () => {
    setPage(1);
    loadList();
  };

  const wizardInitial = useMemo(() => templateToWizardInitial(editingTemplate), [editingTemplate]);

  const openCreate = () => {
    setEditingId(null);
    setEditingTemplate(null);
    setWizardReset((x) => x + 1);
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setEditingTemplate(t);
    setWizardReset((x) => x + 1);
    setModalOpen(true);
  };

  const submitFakeTemplate = async (payload) => {
    if (editingId) {
      await adminPatchTrainingTemplateRequest(editingId, payload);
    } else {
      await adminCreateTrainingTemplateRequest(payload);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`حذف القالب «${t.title}»؟`)) return;
    setError("");
    try {
      await adminDeleteTrainingTemplateRequest(t.id);
      await loadList();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const toggleActive = async (t) => {
    setError("");
    try {
      await adminPatchTrainingTemplateRequest(t.id, { isActive: !t.isActive });
      await loadList();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const totalPages = useMemo(() => Math.max(1, pagination?.totalPages || 1), [pagination]);

  return (
    <>
      <DashboardSection
        className="oh-training-page-section"
        title="قوالب الطلبات التجريبية"
        description="القوالب تُستخدم لتوليد طلبات وهمية في الجولات — لا تُحفظ في جدول الطلبات الحقيقية."
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + قالب جديد
          </button>
        }
      >
        {error ? <p className="auth-form-error">{error}</p> : null}
        <DashboardToolbar className="oh-training-filters">
          <label>
            بحث بالعنوان
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="عنوان أو وصف" />
          </label>
          <label>
            التصنيف
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">الكل</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            الحالة
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={search}>
            تطبيق
          </button>
        </DashboardToolbar>

        {loading ? (
          <DashboardLoadingState label="جاري التحميل…" />
        ) : templates.length === 0 ? (
          <DashboardEmptyState title="لا توجد قوالب." />
        ) : (
          <div className="oh-training-table-wrap">
            <table className="oh-training-table">
              <thead>
                <tr>
                  <th>العنوان</th>
                  <th>التصنيف</th>
                  <th>الميزانية</th>
                  <th>المدة</th>
                  <th>الحالة</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.title}</strong>
                      <div className="help" style={{ marginTop: 4 }}>
                        {(t.description || "").slice(0, 80)}
                        {(t.description || "").length > 80 ? "…" : ""}
                      </div>
                    </td>
                    <td>{t.categoryName || "—"}</td>
                    <td dir="ltr">
                      {t.minBudget} – {t.maxBudget} JOD
                    </td>
                    <td dir="ltr">{formatDuration(t.minDuration, t.maxDuration, t.durationUnit)}</td>
                    <td>
                      {t.isActive ? (
                        <StatusBadge tone="active">نشط</StatusBadge>
                      ) : (
                        <StatusBadge tone="inactive">معطّل</StatusBadge>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-secondary" style={{ marginLeft: 6 }} onClick={() => openEdit(t)}>
                        تعديل
                      </button>
                      <button type="button" className="btn btn-secondary" style={{ marginLeft: 6 }} onClick={() => toggleActive(t)}>
                        {t.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => remove(t)}>
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DashboardToolbar className="oh-training-pagination">
          <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            السابق
          </button>
          <span className="help">
            صفحة {page} من {totalPages} — إجمالي {pagination?.total ?? 0}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </button>
        </DashboardToolbar>
      </DashboardSection>

      {modalOpen ? (
        <div
          className="client-order-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="client-order-modal client-order-modal--admin-wizard"
            role="dialog"
            aria-labelledby="training-template-wizard-title"
            dir="rtl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="client-order-modal__head">
              <div>
                <h2 id="training-template-wizard-title" className="client-order-modal__title">
                  {editingId ? "تعديل قالب طلب تجريبي" : "قالب طلب تجريبي جديد"}
                </h2>
              </div>
              <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => setModalOpen(false)}>
                إغلاق
              </button>
            </header>
            <div className="client-order-modal__body client-order-modal__body--admin-wizard">
              <AdminInternalOrderWizard
                variant="modal"
                mode="fake-template"
                resetToken={wizardReset}
                initialValues={wizardInitial}
                onSubmitFakeTemplate={submitFakeTemplate}
                onCreated={() => {
                  setModalOpen(false);
                  loadList();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
