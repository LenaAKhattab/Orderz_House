import { useCallback, useEffect, useState } from "react";
import { MessageCircleWarning } from "lucide-react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import Button from "../../components/ui/Button";
import { breadcrumbHomeCrumb } from "../../components/dashboard/dashboardBreadcrumbs";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  createFeedbackRequest,
  listFeedbackCategoriesRequest,
  listFeedbackTopicsRequest,
  listMyFeedbackRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  nextTopicIdOnCategoryChange,
  shouldShowFeedbackTopicDropdown,
} from "../../utils/feedbackTopicUi";
import {
  FEEDBACK_TYPES,
  feedbackCategoryDisplayLabel,
  feedbackStatusLabel,
  feedbackStatusTone,
  formatFeedbackDate,
} from "../../constants/feedback";
import "./problemsSuggestionsPage.css";

const PAGE_SIZE = 8;

/** Pre-133: categories API may return [] until migration is applied. */
function toLegacyCategoryOptions() {
  return FEEDBACK_TYPES.map((opt) => ({
    id: opt.value,
    key: opt.value,
    label: opt.ar,
    labelEn: opt.en,
    isLegacyType: true,
  }));
}

/** Shared Client / Freelancer Problems & Suggestions page. */
export default function ProblemsSuggestionsPage() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const { push } = useToast();

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");
  const [useLegacyTypes, setUseLegacyTypes] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const res = await listFeedbackCategoriesRequest();
      const list = Array.isArray(res?.data?.items) ? res.data.items : [];
      if (list.length > 0) {
        setUseLegacyTypes(false);
        setCategories(list);
        setCategoryId((prev) => {
          if (prev && list.some((c) => String(c.id) === String(prev))) return prev;
          return list[0] ? String(list[0].id) : "";
        });
      } else {
        // Compatibility until migration 133 seeds categories.
        const legacy = toLegacyCategoryOptions();
        setUseLegacyTypes(true);
        setCategories(legacy);
        setCategoryId((prev) => {
          if (prev && legacy.some((c) => String(c.id) === String(prev))) return prev;
          return legacy[0] ? String(legacy[0].id) : "";
        });
      }
    } catch (err) {
      // Soft fallback: keep form usable with legacy types even if categories endpoint fails.
      const legacy = toLegacyCategoryOptions();
      setUseLegacyTypes(true);
      setCategories(legacy);
      setCategoryId(legacy[0] ? String(legacy[0].id) : "");
      setCategoriesError("");
      void err;
    } finally {
      setCategoriesLoading(false);
    }
  }, [t]);

  const loadList = useCallback(
    async (targetPage = page) => {
      setLoadingList(true);
      setListError("");
      try {
        const res = await listMyFeedbackRequest({ page: targetPage, limit: PAGE_SIZE });
        setItems(res?.data?.items || []);
        setPagination(res?.data?.pagination || { page: targetPage, limit: PAGE_SIZE, total: 0, totalPages: 1 });
      } catch (err) {
        setListError(getSafeApiErrorMessage(err) || t("dashboard.feedback.loadError"));
        setItems([]);
      } finally {
        setLoadingList(false);
      }
    },
    [page, t],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadList(page);
  }, [loadList, page]);

  useEffect(() => {
    let cancelled = false;
    setTopicId("");
    setTopics([]);
    setTopicsError("");
    if (!categoryId) return undefined;

    setTopicsLoading(true);
    const params = useLegacyTypes ? { type: categoryId } : { categoryId };
    void listFeedbackTopicsRequest(params)
      .then((res) => {
        if (cancelled) return;
        setTopics(Array.isArray(res?.data?.items) ? res.data.items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setTopics([]);
        setTopicsError(getSafeApiErrorMessage(err) || t("dashboard.feedback.topicLoadError"));
      })
      .finally(() => {
        if (!cancelled) setTopicsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId, useLegacyTypes, t]);

  const resetForm = () => {
    setCategoryId(categories[0] ? String(categories[0].id) : "");
    setTopicId("");
    setSubject("");
    setDescription("");
    setFormError("");
  };

  const onCategoryChange = (nextId) => {
    setCategoryId(String(nextId));
    setTopicId(nextTopicIdOnCategoryChange(nextId));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!categoryId) {
      setFormError(t("dashboard.feedback.categoryEmpty"));
      return;
    }

    const subjectTrim = subject.trim();
    const descriptionTrim = description.trim();
    if (subjectTrim.length < 2) {
      setFormError(t("dashboard.feedback.validationSubject"));
      return;
    }
    if (descriptionTrim.length < 10) {
      setFormError(t("dashboard.feedback.validationDescription"));
      return;
    }

    setSubmitting(true);
    setFormError("");
    setSuccessMessage("");
    try {
      const payload = {
        subject: subjectTrim,
        description: descriptionTrim,
      };
      if (useLegacyTypes) {
        payload.type = categoryId;
      } else {
        payload.categoryId = Number(categoryId);
      }
      if (topicId) {
        payload.topicId = Number(topicId);
      }
      await createFeedbackRequest(payload);
      resetForm();
      setSuccessMessage(t("dashboard.feedback.successMessage"));
      push({ type: "success", message: t("dashboard.feedback.successMessage") });
      if (page !== 1) setPage(1);
      else await loadList(1);
    } catch (err) {
      const msg = getSafeApiErrorMessage(err) || t("dashboard.feedback.submitError");
      setFormError(msg);
      push({ type: "error", message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  const formErrorId = "ps-feedback-form-error";
  const topicIdField = "ps-feedback-topic";
  const subjectId = "ps-feedback-subject";
  const descriptionId = "ps-feedback-description";
  const descriptionHintId = "ps-feedback-description-hint";
  const showTopicDropdown = shouldShowFeedbackTopicDropdown({
    categoryId,
    topicsLoading,
    topics,
  });

  return (
    <DashboardShell>
      <div className="ps-feedback-page">
        <DashboardPageHeader
          className="ps-feedback-page__header !mb-1"
          title={t("dashboard.feedback.title")}
          description={t("dashboard.feedback.intro")}
          breadcrumbs={[
            breadcrumbHomeCrumb(user),
            { label: t("dashboard.feedback.title") },
          ]}
        />

        <DashboardSection
          title={t("dashboard.feedback.formTitle")}
          className="ps-feedback-form-section !mb-[0.35rem] !p-[1.15rem_1.2rem_1.25rem] sm:!p-[1.35rem_1.5rem_1.45rem]"
        >
          <form className="ps-feedback-form" onSubmit={onSubmit} noValidate>
            {successMessage ? (
              <div className="ps-feedback-success" role="status">
                {successMessage}
              </div>
            ) : null}

            <fieldset className="ps-feedback-fieldset" disabled={submitting || categoriesLoading}>
              <legend className="ps-feedback-label">{t("dashboard.feedback.typeLabel")} *</legend>
              {categoriesLoading ? (
                <p className="ps-feedback-hint">{t("dashboard.feedback.topicsSaving")}</p>
              ) : null}
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
              {!categoriesLoading && !categoriesError && categories.length === 0 ? (
                <p className="ps-feedback-hint" role="status">
                  {t("dashboard.feedback.categoryEmpty")}
                </p>
              ) : null}
              {!categoriesLoading && !categoriesError && categories.length > 0 ? (
                <div className="ps-feedback-type-grid" role="radiogroup" aria-label={t("dashboard.feedback.typeLabel")}>
                  {categories.map((cat) => (
                    <label
                      key={cat.id}
                      className={`ps-feedback-type-option${String(categoryId) === String(cat.id) ? " is-selected" : ""}`}
                    >
                      <input
                        className="ps-feedback-type-option__input"
                        type="radio"
                        name="feedback-category"
                        value={String(cat.id)}
                        checked={String(categoryId) === String(cat.id)}
                        onChange={() => onCategoryChange(cat.id)}
                      />
                      <span className="ps-feedback-type-option__text">
                        {useLegacyTypes && locale === "en" && cat.labelEn ? cat.labelEn : cat.label}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}
            </fieldset>

            {showTopicDropdown ? (
              <label className="ps-feedback-field" htmlFor={topicIdField}>
                <span className="ps-feedback-label">{t("dashboard.feedback.topicLabel")}</span>
                <select
                  id={topicIdField}
                  className="input"
                  value={topicId}
                  onChange={(ev) => setTopicId(ev.target.value)}
                  disabled={submitting}
                >
                  <option value="">{t("dashboard.feedback.topicPlaceholder")}</option>
                  {topics.map((topic) => (
                    <option key={topic.id} value={String(topic.id)}>
                      {topic.label}
                    </option>
                  ))}
                </select>
                <span className="ps-feedback-hint">{t("dashboard.feedback.topicHint")}</span>
              </label>
            ) : null}

            {categoryId && topicsError ? (
              <p className="ps-feedback-hint ps-feedback-hint--topics-error" role="status">
                {t("dashboard.feedback.topicLoadFallback")}
              </p>
            ) : null}

            <p className="ps-feedback-manual-hint">{t("dashboard.feedback.manualFieldsHint")}</p>

            <label className="ps-feedback-field" htmlFor={subjectId}>
              <span className="ps-feedback-label">{t("dashboard.feedback.subjectLabel")} *</span>
              <input
                id={subjectId}
                className="input"
                value={subject}
                onChange={(ev) => setSubject(ev.target.value)}
                maxLength={200}
                required
                disabled={submitting}
                placeholder={t("dashboard.feedback.subjectPlaceholder")}
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? formErrorId : undefined}
              />
            </label>

            <label className="ps-feedback-field" htmlFor={descriptionId}>
              <span className="ps-feedback-label">{t("dashboard.feedback.descriptionLabel")} *</span>
              <textarea
                id={descriptionId}
                className="input ps-feedback-textarea"
                value={description}
                onChange={(ev) => setDescription(ev.target.value)}
                maxLength={5000}
                required
                disabled={submitting}
                rows={7}
                placeholder={t("dashboard.feedback.descriptionPlaceholder")}
                aria-invalid={Boolean(formError)}
                aria-describedby={`${descriptionHintId}${formError ? ` ${formErrorId}` : ""}`}
              />
              <span id={descriptionHintId} className="ps-feedback-hint">
                {description.trim().length}/5000
              </span>
            </label>

            {formError ? (
              <p id={formErrorId} className="ps-feedback-error" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="ps-feedback-actions">
              <Button type="submit" className="ps-feedback-submit" disabled={submitting || !categoryId}>
                {submitting ? t("dashboard.feedback.submitting") : t("dashboard.feedback.submit")}
              </Button>
            </div>
          </form>
        </DashboardSection>

        <DashboardSection
          title={t("dashboard.feedback.mySubmissionsTitle")}
          className={`ps-feedback-list-section !mb-0${!loadingList && !listError && items.length === 0 ? " ps-feedback-list-section--empty !pb-4 sm:!pb-4" : ""}`}
        >
          {loadingList ? <DashboardLoadingState /> : null}
          {!loadingList && listError ? (
            <DashboardErrorState
              message={listError}
              actions={
                <Button type="button" variant="secondary" onClick={() => loadList(page)}>
                  {t("dashboard.feedback.retry")}
                </Button>
              }
            />
          ) : null}
          {!loadingList && !listError && items.length === 0 ? (
            <DashboardEmptyState
              className="ps-feedback-empty !border-0 !bg-transparent !shadow-none !px-2 !py-3 sm:!px-3 sm:!py-3.5"
              icon={<MessageCircleWarning size={26} strokeWidth={1.6} aria-hidden />}
              title={t("dashboard.feedback.emptyTitle")}
              description={t("dashboard.feedback.emptyDescription")}
            />
          ) : null}
          {!loadingList && !listError && items.length > 0 ? (
            <div className="ps-feedback-list">
              {items.map((item) => {
                const open = expandedId === item.id;
                return (
                  <article key={item.id} className="ps-feedback-item">
                    <div className="ps-feedback-item__top">
                      <div className="ps-feedback-item__meta">
                        <StatusBadge tone="admin_assigned">
                          {feedbackCategoryDisplayLabel(item, locale)}
                        </StatusBadge>
                        <StatusBadge tone={feedbackStatusTone(item.status)}>
                          {feedbackStatusLabel(item.status, locale)}
                        </StatusBadge>
                      </div>
                      <time className="ps-feedback-item__date" dateTime={item.createdAt}>
                        {formatFeedbackDate(item.createdAt, locale)}
                      </time>
                    </div>
                    {item.topicLabel ? (
                      <p className="ps-feedback-item__topic">
                        <span className="ps-feedback-item__topic-label">{t("dashboard.feedback.colTopic")}:</span>{" "}
                        {item.topicLabel}
                      </p>
                    ) : null}
                    <h3 className="ps-feedback-item__subject">{item.subject}</h3>
                    <button
                      type="button"
                      className="ps-feedback-item__toggle"
                      onClick={() => setExpandedId(open ? null : item.id)}
                      aria-expanded={open}
                    >
                      {open ? t("dashboard.feedback.hideDetails") : t("dashboard.feedback.showDetails")}
                    </button>
                    {open ? <p className="ps-feedback-item__description">{item.description}</p> : null}
                  </article>
                );
              })}
              {pagination.totalPages > 1 ? (
                <Pagination
                  currentPage={pagination.page}
                  totalPages={pagination.totalPages}
                  onPageChange={setPage}
                  isLoading={loadingList}
                />
              ) : null}
            </div>
          ) : null}
        </DashboardSection>
      </div>
    </DashboardShell>
  );
}
