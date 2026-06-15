import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getLocalizedField } from "../../../lib/i18n/getLocalizedField";
import {
  getLocalizedOrderDescription,
  getLocalizedOrderTitle,
} from "../../../lib/i18n/getLocalizedMarketplaceOrderText";
import { buildDurationLabels, formatDurationRange } from "../../../lib/orders/orderDisplayFormatters";
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

export default function TrainingOrderTemplatesPage() {
  const { t, locale } = useTranslation();
  const durationLabels = buildDurationLabels(t);
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

  const loadList = useCallback(async () => {
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
  }, [page, q, categoryFilter, statusFilter]);

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
    void loadList();
  }, [loadList]);

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

  const toggleActive = async (template) => {
    setError("");
    try {
      await adminPatchTrainingTemplateRequest(template.id, { isActive: !template.isActive });
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
        title={t("trainingOrders.templates.title")}
        description={t("trainingOrders.templates.description")}
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + {t("trainingOrders.templates.colTitle")}
          </button>
        }
      >
        {error ? <p className="auth-form-error">{error}</p> : null}
        <DashboardToolbar className="oh-training-filters">
          <label>
            {t("trainingOrders.templates.colTitle")}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("trainingOrders.templates.searchPlaceholder")}
            />
          </label>
          <label>
            {t("trainingOrders.templates.category")}
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">{t("trainingOrders.templates.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {getLocalizedField(c, "name", locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("trainingOrders.templates.status")}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("trainingOrders.templates.all")}</option>
              <option value="active">{t("trainingOrders.templates.active")}</option>
              <option value="inactive">{t("trainingOrders.templates.inactive")}</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={search}>
            {t("trainingOrders.templates.apply")}
          </button>
        </DashboardToolbar>

        {loading ? (
          <DashboardLoadingState label={t("trainingOrders.templates.loading")} />
        ) : templates.length === 0 ? (
          <DashboardEmptyState title={t("trainingOrders.templates.empty")} />
        ) : (
          <div className="oh-training-table-wrap">
            <table className="oh-training-table">
              <thead>
                <tr>
                  <th>{t("trainingOrders.templates.colTitle")}</th>
                  <th>{t("trainingOrders.templates.colCategory")}</th>
                  <th>{t("trainingOrders.templates.colBudget")}</th>
                  <th>{t("trainingOrders.templates.colDuration")}</th>
                  <th>{t("trainingOrders.templates.colStatus")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => {
                  const title = getLocalizedOrderTitle(template, locale);
                  const description = getLocalizedOrderDescription(template, locale);
                  return (
                  <tr key={template.id}>
                    <td>
                      <strong>{title}</strong>
                      <div className="help" style={{ marginTop: 4 }}>
                        {description.slice(0, 80)}
                        {description.length > 80 ? "…" : ""}
                      </div>
                    </td>
                    <td>{template.categoryName || "—"}</td>
                    <td dir="ltr">
                      {template.minBudget} – {template.maxBudget} JOD
                    </td>
                    <td dir="ltr">
                      {formatDurationRange(template.minDuration, template.maxDuration, template.durationUnit, locale, durationLabels)}
                    </td>
                    <td>
                      {template.isActive ? (
                        <StatusBadge tone="active">{t("trainingOrders.templates.active")}</StatusBadge>
                      ) : (
                        <StatusBadge tone="inactive">{t("trainingOrders.templates.inactive")}</StatusBadge>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button type="button" className="btn btn-secondary" style={{ marginLeft: 6 }} onClick={() => openEdit(template)}>
                        {t("trainingOrders.templates.edit")}
                      </button>
                      <button type="button" className="btn btn-secondary" style={{ marginLeft: 6 }} onClick={() => toggleActive(template)}>
                        {template.isActive ? t("trainingOrders.templates.disable") : t("trainingOrders.templates.enable")}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => remove(template)}>
                        {t("trainingOrders.templates.delete")}
                      </button>
                    </td>
                  </tr>
                  );
                })}
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
