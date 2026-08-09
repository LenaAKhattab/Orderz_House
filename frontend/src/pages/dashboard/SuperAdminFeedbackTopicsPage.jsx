import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  createSuperAdminFeedbackCategoryRequest,
  createSuperAdminFeedbackTopicRequest,
  deleteSuperAdminFeedbackCategoryRequest,
  deleteSuperAdminFeedbackTopicRequest,
  listSuperAdminFeedbackCategoriesRequest,
  listSuperAdminFeedbackTopicsRequest,
  reorderSuperAdminFeedbackCategoriesRequest,
  reorderSuperAdminFeedbackTopicsRequest,
  updateSuperAdminFeedbackCategoryRequest,
  updateSuperAdminFeedbackTopicRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import "./superAdminEditWebsitePage.css";
import "./superAdminFeedbackPage.css";

function CategoryFormModal({ mode, open, initial, onClose, onSaved, t }) {
  const isEdit = mode === "edit";
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label || "");
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const text = label.trim();
    if (!text) {
      setError(t("dashboard.feedback.categoriesValidationLabel"));
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSuperAdminFeedbackCategoryRequest(initial.id, { label: text });
      } else {
        await createSuperAdminFeedbackCategoryRequest({ label: text, isActive: true });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("dashboard.feedback.categoriesSaveError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="oh-website-faq-modal__backdrop"
        aria-label={t("dashboard.feedback.topicsCancel")}
        onClick={onClose}
      />
      <div className="oh-website-faq-modal__panel">
        <div className="oh-website-faq-modal__header">
          <h2>{isEdit ? t("dashboard.feedback.categoriesEdit") : t("dashboard.feedback.categoriesAdd")}</h2>
          <button type="button" className="oh-website-faq-modal__close" aria-label={t("dashboard.feedback.topicsCancel")} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="oh-website-faq-form" onSubmit={handleSubmit}>
          <label>
            {t("dashboard.feedback.categoriesLabel")} *
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={submitting}
              maxLength={200}
              placeholder={t("dashboard.feedback.categoriesLabelPlaceholder")}
            />
          </label>
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("dashboard.feedback.topicsCancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("dashboard.feedback.topicsSaving")
                : isEdit
                  ? t("dashboard.feedback.save")
                  : t("dashboard.feedback.categoriesAdd")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TopicFormModal({ mode, open, categoryLabel, initial, onClose, onSaved, t }) {
  const isEdit = mode === "edit";
  const [label, setLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label || "");
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const text = label.trim();
    if (!text) {
      setError(t("dashboard.feedback.topicsValidationLabel"));
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSuperAdminFeedbackTopicRequest(initial.id, { label: text });
      } else {
        await createSuperAdminFeedbackTopicRequest({
          categoryId: initial?.categoryId,
          label: text,
          isActive: true,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("dashboard.feedback.topicsSaveError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="oh-website-faq-modal__backdrop"
        aria-label={t("dashboard.feedback.topicsCancel")}
        onClick={onClose}
      />
      <div className="oh-website-faq-modal__panel">
        <div className="oh-website-faq-modal__header">
          <h2>{isEdit ? t("dashboard.feedback.topicsEdit") : t("dashboard.feedback.topicsAdd")}</h2>
          <button type="button" className="oh-website-faq-modal__close" aria-label={t("dashboard.feedback.topicsCancel")} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="oh-website-faq-form" onSubmit={handleSubmit}>
          {!isEdit && categoryLabel ? (
            <p className="sa-feedback-topic-modal-type">
              {t("dashboard.feedback.categoriesSelected")}: {categoryLabel}
            </p>
          ) : null}
          <label>
            {t("dashboard.feedback.topicsLabel")}
            <textarea
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={submitting}
              rows={3}
              maxLength={200}
              placeholder={t("dashboard.feedback.topicsLabelPlaceholder")}
            />
          </label>
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("dashboard.feedback.topicsCancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("dashboard.feedback.topicsSaving")
                : isEdit
                  ? t("dashboard.feedback.save")
                  : t("dashboard.feedback.topicsAdd")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  open,
  title,
  copy,
  label,
  submitting,
  error,
  confirmLabel,
  submittingLabel,
  onClose,
  onConfirm,
  t,
}) {
  if (!open) return null;

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="oh-website-faq-modal__backdrop"
        aria-label={t("dashboard.feedback.topicsCancel")}
        onClick={onClose}
        disabled={submitting}
      />
      <div className="oh-website-faq-modal__panel">
        <div className="oh-website-faq-modal__header">
          <h2>{title}</h2>
          <button
            type="button"
            className="oh-website-faq-modal__close"
            aria-label={t("dashboard.feedback.topicsCancel")}
            onClick={onClose}
            disabled={submitting}
          >
            ×
          </button>
        </div>
        <div className="oh-website-faq-form">
          <p className="sa-feedback-topic-delete-copy">{copy}</p>
          {label ? <p className="sa-feedback-topic-delete-label">«{label}»</p> : null}
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("dashboard.feedback.topicsCancel")}
            </Button>
            <Button type="button" variant="danger" onClick={onConfirm} disabled={submitting}>
              {submitting ? submittingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminFeedbackTopicsPage() {
  const { t } = useTranslation();
  const { push } = useToast();

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [busyCategoryId, setBusyCategoryId] = useState(null);

  const [categoryModal, setCategoryModal] = useState({ open: false, mode: "create", item: null });
  const [topicModal, setTopicModal] = useState({ open: false, mode: "create", item: null });
  const [deleteTopicModal, setDeleteTopicModal] = useState({ open: false, item: null });
  const [deleteCategoryModal, setDeleteCategoryModal] = useState({ open: false, item: null });
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const activeCategory = categories.find((c) => Number(c.id) === Number(activeCategoryId)) || null;

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const res = await listSuperAdminFeedbackCategoriesRequest();
      const list = Array.isArray(res?.data?.items) ? res.data.items : [];
      setCategories(list);
      setActiveCategoryId((prev) => {
        if (prev && list.some((c) => Number(c.id) === Number(prev))) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setCategories([]);
      setActiveCategoryId(null);
      setCategoriesError(getSafeApiErrorMessage(err) || t("dashboard.feedback.categoriesLoadError"));
    } finally {
      setCategoriesLoading(false);
    }
  }, [t]);

  const loadItems = useCallback(async () => {
    if (!activeCategoryId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminFeedbackTopicsRequest({ categoryId: activeCategoryId });
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("dashboard.feedback.topicsLoadError"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategoryId, t]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const toggleTopicActive = async (item) => {
    setBusyId(item.id);
    try {
      await updateSuperAdminFeedbackTopicRequest(item.id, { isActive: !item.isActive });
      push({ type: "success", message: t("dashboard.feedback.topicsSaved") });
      await loadItems();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("dashboard.feedback.topicsSaveError"),
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleCategoryActive = async (item) => {
    setBusyCategoryId(item.id);
    try {
      await updateSuperAdminFeedbackCategoryRequest(item.id, { isActive: !item.isActive });
      push({ type: "success", message: t("dashboard.feedback.categoriesSaved") });
      await loadCategories();
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("dashboard.feedback.categoriesSaveError"),
      });
    } finally {
      setBusyCategoryId(null);
    }
  };

  const moveTopic = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length || !activeCategoryId) return;
    const next = [...items];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    setBusyId(removed.id);
    try {
      const res = await reorderSuperAdminFeedbackTopicsRequest({
        categoryId: activeCategoryId,
        orderedIds: next.map((x) => x.id),
      });
      setItems(Array.isArray(res?.data?.items) ? res.data.items : next);
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("dashboard.feedback.topicsReorderError"),
      });
    } finally {
      setBusyId(null);
    }
  };

  const moveCategory = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const next = [...categories];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    setBusyCategoryId(removed.id);
    try {
      const res = await reorderSuperAdminFeedbackCategoriesRequest({
        orderedIds: next.map((x) => x.id),
      });
      setCategories(Array.isArray(res?.data?.items) ? res.data.items : next);
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("dashboard.feedback.categoriesReorderError"),
      });
    } finally {
      setBusyCategoryId(null);
    }
  };

  const confirmDeleteTopic = async () => {
    const item = deleteTopicModal.item;
    if (!item || deleteSubmitting) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    setBusyId(item.id);
    try {
      await deleteSuperAdminFeedbackTopicRequest(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setDeleteTopicModal({ open: false, item: null });
      push({ type: "success", message: t("dashboard.feedback.topicsDeleted") });
    } catch (err) {
      const msg = getSafeApiErrorMessage(err) || t("dashboard.feedback.topicsDeleteError");
      setDeleteError(msg);
      push({ type: "error", message: msg });
    } finally {
      setDeleteSubmitting(false);
      setBusyId(null);
    }
  };

  const confirmDeleteCategory = async () => {
    const item = deleteCategoryModal.item;
    if (!item || deleteSubmitting) return;
    setDeleteSubmitting(true);
    setDeleteError("");
    setBusyCategoryId(item.id);
    try {
      await deleteSuperAdminFeedbackCategoryRequest(item.id);
      setDeleteCategoryModal({ open: false, item: null });
      push({ type: "success", message: t("dashboard.feedback.categoriesDeleted") });
      await loadCategories();
    } catch (err) {
      const code = err?.response?.data?.code || err?.publicCode;
      const msg =
        code === "CATEGORY_HAS_TOPICS" || code === "CATEGORY_HAS_FEEDBACK"
          ? t("dashboard.feedback.categoriesDeleteBlocked")
          : getSafeApiErrorMessage(err) || t("dashboard.feedback.categoriesDeleteError");
      setDeleteError(msg);
      push({ type: "error", message: msg });
    } finally {
      setDeleteSubmitting(false);
      setBusyCategoryId(null);
    }
  };

  const breadcrumbs = [
    ...superAdminBreadcrumbs("dashboard.breadcrumbs.problemsSuggestions").slice(0, -1),
    {
      labelKey: "dashboard.breadcrumbs.problemsSuggestions",
      href: "/dashboard/super-admin/feedback",
    },
    { labelKey: "dashboard.breadcrumbs.feedbackTopics" },
  ];

  const activeCategoryIndex = categories.findIndex((c) => Number(c.id) === Number(activeCategoryId));

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.feedback.topicsTitle")}
        description={t("dashboard.feedback.topicsIntro")}
        breadcrumbs={breadcrumbs}
        actions={
          <Link className="sa-feedback-link" to="/dashboard/super-admin/feedback">
            {t("dashboard.feedback.backToFeedback")}
          </Link>
        }
      />

      <DashboardSection title={t("dashboard.feedback.topicsTitle")}>
        <p className="oh-website-faq-toolbar__hint">{t("dashboard.feedback.categoriesIntro")}</p>

        {categoriesLoading ? <DashboardLoadingState /> : null}
        {!categoriesLoading && categoriesError ? (
          <DashboardErrorState
            message={categoriesError}
            actions={
              <Button type="button" variant="secondary" onClick={loadCategories}>
                {t("dashboard.feedback.retry")}
              </Button>
            }
          />
        ) : null}

        {!categoriesLoading && !categoriesError ? (
          <>
            <div className="sa-feedback-topic-tabs" role="tablist" aria-label={t("dashboard.feedback.typeLabel")}>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={Number(activeCategoryId) === Number(cat.id)}
                  className={`sa-feedback-topic-tab${Number(activeCategoryId) === Number(cat.id) ? " is-active" : ""}${cat.isActive ? "" : " is-topic-hidden"}`}
                  onClick={() => setActiveCategoryId(cat.id)}
                >
                  {cat.label}
                  {!cat.isActive ? ` (${t("dashboard.feedback.topicsHidden")})` : ""}
                </button>
              ))}
              <button
                type="button"
                className="sa-feedback-topic-tab sa-feedback-topic-tab--add"
                onClick={() => setCategoryModal({ open: true, mode: "create", item: null })}
              >
                + {t("dashboard.feedback.categoriesAdd")}
              </button>
            </div>

            {activeCategory ? (
              <div className="sa-feedback-category-actions">
                <p className="sa-feedback-category-actions__label">
                  {t("dashboard.feedback.categoriesSelected")}: <strong>{activeCategory.label}</strong>
                </p>
                <div className="sa-feedback-category-actions__buttons">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyCategoryId === activeCategory.id}
                    onClick={() => setCategoryModal({ open: true, mode: "edit", item: activeCategory })}
                  >
                    {t("dashboard.feedback.categoriesEdit")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyCategoryId === activeCategory.id}
                    onClick={() => toggleCategoryActive(activeCategory)}
                  >
                    {activeCategory.isActive
                      ? t("dashboard.feedback.categoriesHide")
                      : t("dashboard.feedback.categoriesShow")}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busyCategoryId === activeCategory.id}
                    onClick={() => {
                      setDeleteError("");
                      setDeleteCategoryModal({ open: true, item: activeCategory });
                    }}
                  >
                    {t("dashboard.feedback.categoriesDelete")}
                  </Button>
                  <button
                    type="button"
                    className="sa-feedback-reorder-btn"
                    aria-label={t("dashboard.feedback.categoriesMoveUp")}
                    disabled={activeCategoryIndex <= 0 || busyCategoryId === activeCategory.id}
                    onClick={() => moveCategory(activeCategoryIndex, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="sa-feedback-reorder-btn"
                    aria-label={t("dashboard.feedback.categoriesMoveDown")}
                    disabled={
                      activeCategoryIndex < 0 ||
                      activeCategoryIndex >= categories.length - 1 ||
                      busyCategoryId === activeCategory.id
                    }
                    onClick={() => moveCategory(activeCategoryIndex, 1)}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DashboardSection>

      {activeCategory ? (
        <DashboardSection title={`${t("dashboard.feedback.categoriesTopicsHeading")} «${activeCategory.label}»`}>
          <div className="oh-website-faq-toolbar">
            <p className="oh-website-faq-toolbar__hint">{t("dashboard.feedback.topicsToolbarHint")}</p>
            <Button
              type="button"
              onClick={() =>
                setTopicModal({
                  open: true,
                  mode: "create",
                  item: { categoryId: activeCategory.id },
                })
              }
            >
              {t("dashboard.feedback.topicsAdd")}
            </Button>
          </div>

          {loading ? <DashboardLoadingState /> : null}
          {!loading && error ? (
            <DashboardErrorState
              message={error}
              actions={
                <Button type="button" variant="secondary" onClick={loadItems}>
                  {t("dashboard.feedback.retry")}
                </Button>
              }
            />
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <DashboardEmptyState
              title={t("dashboard.feedback.topicsEmptyTitle")}
              description={t("dashboard.feedback.topicsEmptyDescription")}
              actions={
                <Button
                  type="button"
                  onClick={() =>
                    setTopicModal({
                      open: true,
                      mode: "create",
                      item: { categoryId: activeCategory.id },
                    })
                  }
                >
                  {t("dashboard.feedback.topicsAdd")}
                </Button>
              }
            />
          ) : null}

          {!loading && !error && items.length > 0 ? (
            <div className="oh-website-faq-list">
              {items.map((item, index) => (
                <article
                  key={item.id}
                  className={`oh-website-faq-item${item.isActive ? "" : " is-topic-hidden"}`}
                >
                  <div className="oh-website-faq-item__head">
                    <span className="oh-website-faq-item__order">{index + 1}</span>
                    <div className="oh-website-faq-item__body">
                      <p className="oh-website-faq-item__question">{item.label}</p>
                      <div className="sa-feedback-topic-status-row">
                        <StatusBadge tone={item.isActive ? "success" : "inactive"}>
                          {item.isActive
                            ? t("dashboard.feedback.topicsActive")
                            : t("dashboard.feedback.topicsHidden")}
                        </StatusBadge>
                      </div>
                      <div className="oh-website-faq-item__actions">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyId === item.id}
                          onClick={() => setTopicModal({ open: true, mode: "edit", item })}
                        >
                          {t("dashboard.feedback.topicsEdit")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyId === item.id}
                          onClick={() => toggleTopicActive(item)}
                        >
                          {item.isActive
                            ? t("dashboard.feedback.topicsHide")
                            : t("dashboard.feedback.topicsShow")}
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busyId === item.id}
                          onClick={() => {
                            setDeleteError("");
                            setDeleteTopicModal({ open: true, item });
                          }}
                        >
                          {t("dashboard.feedback.topicsDelete")}
                        </Button>
                      </div>
                    </div>
                    <div className="oh-website-faq-item__reorder">
                      <button
                        type="button"
                        aria-label={t("dashboard.feedback.topicsMoveUp")}
                        disabled={index === 0 || busyId === item.id}
                        onClick={() => moveTopic(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={t("dashboard.feedback.topicsMoveDown")}
                        disabled={index === items.length - 1 || busyId === item.id}
                        onClick={() => moveTopic(index, 1)}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </DashboardSection>
      ) : null}

      <CategoryFormModal
        mode={categoryModal.mode}
        open={categoryModal.open}
        initial={categoryModal.item}
        onClose={() => setCategoryModal({ open: false, mode: "create", item: null })}
        onSaved={() => {
          push({ type: "success", message: t("dashboard.feedback.categoriesSaved") });
          void loadCategories();
        }}
        t={t}
      />

      <TopicFormModal
        mode={topicModal.mode}
        open={topicModal.open}
        categoryLabel={activeCategory?.label}
        initial={topicModal.item}
        onClose={() => setTopicModal({ open: false, mode: "create", item: null })}
        onSaved={() => {
          push({ type: "success", message: t("dashboard.feedback.topicsSaved") });
          void loadItems();
        }}
        t={t}
      />

      <ConfirmDeleteModal
        open={deleteTopicModal.open}
        title={t("dashboard.feedback.topicsDeleteTitle")}
        copy={t("dashboard.feedback.topicsDeleteConfirm")}
        label={deleteTopicModal.item?.label}
        submitting={deleteSubmitting}
        error={deleteError}
        confirmLabel={t("dashboard.feedback.topicsDeleteConfirmBtn")}
        submittingLabel={t("dashboard.feedback.topicsDeleting")}
        onClose={() => {
          if (deleteSubmitting) return;
          setDeleteTopicModal({ open: false, item: null });
          setDeleteError("");
        }}
        onConfirm={confirmDeleteTopic}
        t={t}
      />

      <ConfirmDeleteModal
        open={deleteCategoryModal.open}
        title={t("dashboard.feedback.categoriesDeleteTitle")}
        copy={t("dashboard.feedback.categoriesDeleteConfirm")}
        label={deleteCategoryModal.item?.label}
        submitting={deleteSubmitting}
        error={deleteError}
        confirmLabel={t("dashboard.feedback.categoriesDeleteConfirmBtn")}
        submittingLabel={t("dashboard.feedback.categoriesDeleting")}
        onClose={() => {
          if (deleteSubmitting) return;
          setDeleteCategoryModal({ open: false, item: null });
          setDeleteError("");
        }}
        onConfirm={confirmDeleteCategory}
        t={t}
      />
    </DashboardShell>
  );
}
