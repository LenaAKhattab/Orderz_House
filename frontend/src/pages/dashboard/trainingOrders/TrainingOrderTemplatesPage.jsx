import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminCreateTrainingFakeOrderRequest,
  adminDeleteTrainingFakeOrderRequest,
  adminListTrainingFakeOrdersRequest,
  adminPatchTrainingFakeOrderRequest,
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
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import "../../../styles/createOrderModal.css";
import "./trainingOrdersAdmin.css";

function errMsg(e) {
  return getSafeApiErrorMessage(e);
}

function fakeOrderToWizardInitial(row) {
  if (!row) return {};
  const minB = Number(row.bidBudgetMin ?? row.budget);
  const maxB = Number(row.bidBudgetMax ?? row.budget);
  const fixed = row.projectType === "fixed" || minB === maxB;
  const base = {
    title: row.title || "",
    description: row.description || "",
    categoryId: String(row.categoryId || ""),
    subSubcategoryId: String(row.subSubcategoryId || ""),
    durationUnit: row.durationUnit || "days",
    preferredSkills: [],
    isActiveTemplate: row.isActive !== false,
  };
  if (fixed) {
    return {
      ...base,
      projectType: "fixed",
      budget: String(minB),
      bidBudgetMin: "",
      bidBudgetMax: "",
      durationValue: String(row.durationValue),
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
    durationMin: String(row.durationValue),
    durationMax: String(row.durationValue),
  };
}

export default function TrainingOrderTemplatesPage() {
  const { t, locale, dir } = useTranslation();
  const durationLabels = buildDurationLabels(t);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [visibleFilter, setVisibleFilter] = useState("");

  const [categories, setCategories] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [wizardReset, setWizardReset] = useState(0);

  const loadList = useCallback(
    async ({ signal } = {}) => {
      setError("");
      setLoading(true);
      try {
        const params = {
          page,
          limit: 20,
          q: appliedQ.trim() || undefined,
          categoryId: categoryFilter || undefined,
          isActive: statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined,
          visibleNow: visibleFilter === "visible" ? true : visibleFilter === "hidden" ? false : undefined,
        };
        const res = await adminListTrainingFakeOrdersRequest(params);
        if (signal?.aborted) return;
        const payload = res?.data ?? res;
        setRows(payload?.fakeOrders || []);
        setPagination(payload?.pagination || { page: 1, totalPages: 1, total: 0 });
      } catch (e) {
        if (signal?.aborted) return;
        setError(errMsg(e));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, appliedQ, categoryFilter, statusFilter, visibleFilter],
  );

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
    const controller = new AbortController();
    void loadList({ signal: controller.signal });
    return () => controller.abort();
  }, [loadList]);

  const search = () => {
    setPage(1);
    setAppliedQ(q);
  };

  const wizardInitial = useMemo(() => fakeOrderToWizardInitial(editingRow), [editingRow]);

  const openCreate = () => {
    setEditingId(null);
    setEditingRow(null);
    setWizardReset((x) => x + 1);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setEditingRow(row);
    setWizardReset((x) => x + 1);
    setModalOpen(true);
  };

  const submitFakeOrder = async (payload) => {
    if (editingId) {
      await adminPatchTrainingFakeOrderRequest(editingId, payload);
    } else {
      await adminCreateTrainingFakeOrderRequest(payload);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(t("trainingOrders.pool.deleteConfirm"))) return;
    setError("");
    try {
      await adminDeleteTrainingFakeOrderRequest(row.id);
      await loadList();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const toggleActive = async (row) => {
    setError("");
    try {
      await adminPatchTrainingFakeOrderRequest(row.id, { isActive: !row.isActive });
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
        title={t("trainingOrders.pool.title")}
        description={t("trainingOrders.pool.description")}
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            + {t("trainingOrders.pool.addOrder")}
          </button>
        }
      >
        <p className="help oh-training-pool__intro">{t("trainingOrders.pool.helper")}</p>
        {error ? <p className="auth-form-error">{error}</p> : null}
        <DashboardToolbar className="oh-training-filters">
          <label>
            {t("trainingOrders.pool.colTitle")}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("trainingOrders.pool.searchPlaceholder")}
            />
          </label>
          <label>
            {t("trainingOrders.pool.category")}
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">{t("trainingOrders.pool.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {getLocalizedField(c, "name", locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("trainingOrders.pool.status")}
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t("trainingOrders.pool.all")}</option>
              <option value="active">{t("trainingOrders.pool.active")}</option>
              <option value="inactive">{t("trainingOrders.pool.inactive")}</option>
            </select>
          </label>
          <label>
            {t("trainingOrders.pool.visibility")}
            <select value={visibleFilter} onChange={(e) => setVisibleFilter(e.target.value)}>
              <option value="">{t("trainingOrders.pool.all")}</option>
              <option value="visible">{t("trainingOrders.pool.visibleNow")}</option>
              <option value="hidden">{t("trainingOrders.pool.notVisibleNow")}</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={search}>
            {t("trainingOrders.pool.apply")}
          </button>
        </DashboardToolbar>

        {loading ? (
          <DashboardLoadingState label={t("trainingOrders.pool.loading")} />
        ) : rows.length === 0 ? (
          <DashboardEmptyState
            title={t("trainingOrders.pool.empty")}
            actions={
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                + {t("trainingOrders.pool.addOrder")}
              </button>
            }
          />
        ) : (
          <div className="oh-training-table-wrap">
            <table className="oh-training-table">
              <thead>
                <tr>
                  <th>{t("trainingOrders.pool.colTitle")}</th>
                  <th>{t("trainingOrders.pool.colCategory")}</th>
                  <th>{t("trainingOrders.pool.colBudget")}</th>
                  <th>{t("trainingOrders.pool.colDuration")}</th>
                  <th>{t("trainingOrders.pool.colVisibility")}</th>
                  <th>{t("trainingOrders.pool.colStatus")}</th>
                  <th>{t("trainingOrders.pool.colApplicants")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const title = getLocalizedOrderTitle(row, locale);
                  const description = getLocalizedOrderDescription(row, locale);
                  const minB = row.bidBudgetMin ?? row.budget;
                  const maxB = row.bidBudgetMax ?? row.budget;
                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{title}</strong>
                        <div className="help" style={{ marginTop: 4 }}>
                          #{row.id} — {description.slice(0, 60)}
                          {description.length > 60 ? "…" : ""}
                        </div>
                      </td>
                      <td>{row.categoryName || "—"}</td>
                      <td dir="ltr">
                        {minB} – {maxB} JOD
                      </td>
                      <td dir="ltr">
                        {row.durationValue} {row.durationUnit}
                      </td>
                      <td>
                        {row.visibleNow ? (
                          <StatusBadge tone="success">{t("trainingOrders.pool.visibleNow")}</StatusBadge>
                        ) : (
                          <StatusBadge tone="inactive">{t("trainingOrders.pool.notVisibleNow")}</StatusBadge>
                        )}
                        {row.currentRoundId ? (
                          <div className="help" dir="ltr" style={{ marginTop: 4 }}>
                            {t("trainingOrders.pool.round")} #{row.currentRoundId}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {row.isActive ? (
                          <StatusBadge tone="active">{t("trainingOrders.pool.active")}</StatusBadge>
                        ) : (
                          <StatusBadge tone="inactive">{t("trainingOrders.pool.inactive")}</StatusBadge>
                        )}
                      </td>
                      <td dir="ltr">{row.applicantsCount ?? 0}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="btn btn-secondary" style={{ marginLeft: 6 }} onClick={() => openEdit(row)}>
                          {t("trainingOrders.pool.edit")}
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ marginLeft: 6 }} onClick={() => toggleActive(row)}>
                          {row.isActive ? t("trainingOrders.pool.disable") : t("trainingOrders.pool.enable")}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => remove(row)}>
                          {t("trainingOrders.pool.delete")}
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
            {t("trainingOrders.pool.prev")}
          </button>
          <span className="help">
            {t("trainingOrders.pool.pageOf", { page, totalPages, total: pagination?.total ?? 0 })}
          </span>
          <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            {t("trainingOrders.pool.next")}
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
            aria-labelledby="training-pool-wizard-title"
            dir={dir}
            lang={locale}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="client-order-modal__head">
              <div>
                <h2 id="training-pool-wizard-title" className="client-order-modal__title">
                  {editingId ? t("trainingOrders.poolWizard.modalEditTitle") : t("trainingOrders.poolWizard.modalCreateTitle")}
                </h2>
              </div>
              <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => setModalOpen(false)}>
                {t("trainingOrders.poolWizard.modalClose")}
              </button>
            </header>
            <div className="client-order-modal__body client-order-modal__body--admin-wizard">
              <AdminInternalOrderWizard
                variant="modal"
                mode="fake-order"
                fakeOrderIsEdit={Boolean(editingId)}
                resetToken={wizardReset}
                initialValues={wizardInitial}
                onSubmitFakeOrder={submitFakeOrder}
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
