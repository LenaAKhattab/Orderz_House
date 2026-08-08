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
import { createFeedbackRequest, listMyFeedbackRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  FEEDBACK_TYPES,
  feedbackStatusLabel,
  feedbackStatusTone,
  feedbackTypeLabel,
  formatFeedbackDate,
} from "../../constants/feedback";
import "./problemsSuggestionsPage.css";

const PAGE_SIZE = 8;

/** Shared Client / Freelancer Problems & Suggestions page. */
export default function ProblemsSuggestionsPage() {
  const { user } = useAuth();
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const isEn = locale === "en";

  const [type, setType] = useState("problem");
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
    void loadList(page);
  }, [loadList, page]);

  const resetForm = () => {
    setType("problem");
    setSubject("");
    setDescription("");
    setFormError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

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
      await createFeedbackRequest({
        type,
        subject: subjectTrim,
        description: descriptionTrim,
      });
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
  const subjectId = "ps-feedback-subject";
  const descriptionId = "ps-feedback-description";
  const descriptionHintId = "ps-feedback-description-hint";

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

            <fieldset className="ps-feedback-fieldset" disabled={submitting}>
              <legend className="ps-feedback-label">{t("dashboard.feedback.typeLabel")} *</legend>
              <div className="ps-feedback-type-grid" role="radiogroup" aria-label={t("dashboard.feedback.typeLabel")}>
                {FEEDBACK_TYPES.map((opt) => (
                  <label
                    key={opt.value}
                    className={`ps-feedback-type-option${type === opt.value ? " is-selected" : ""}`}
                  >
                    <input
                      className="ps-feedback-type-option__input"
                      type="radio"
                      name="feedback-type"
                      value={opt.value}
                      checked={type === opt.value}
                      onChange={() => setType(opt.value)}
                    />
                    <span className="ps-feedback-type-option__text">{isEn ? opt.en : opt.ar}</span>
                  </label>
                ))}
              </div>
            </fieldset>

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
              <Button type="submit" className="ps-feedback-submit" disabled={submitting}>
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
                        <StatusBadge tone="admin_assigned">{feedbackTypeLabel(item.type, locale)}</StatusBadge>
                        <StatusBadge tone={feedbackStatusTone(item.status)}>
                          {feedbackStatusLabel(item.status, locale)}
                        </StatusBadge>
                      </div>
                      <time className="ps-feedback-item__date" dateTime={item.createdAt}>
                        {formatFeedbackDate(item.createdAt, locale)}
                      </time>
                    </div>
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
