import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  getSuperAdminFeedbackByIdRequest,
  updateSuperAdminFeedbackRequest,
} from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  feedbackCategoryDisplayLabel,
  feedbackPriorityLabel,
  feedbackRoleLabel,
  feedbackStatusLabel,
  feedbackStatusTone,
  formatFeedbackDate,
} from "../../constants/feedback";
import "./superAdminFeedbackPage.css";

export default function SuperAdminFeedbackDetailPage() {
  const { id } = useParams();
  const { t, locale } = useTranslation();
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState(null);

  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("normal");
  const [adminNote, setAdminNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFeedbackByIdRequest(id);
      const item = res?.data?.feedback || null;
      setFeedback(item);
      if (item) {
        setStatus(item.status || "new");
        setPriority(item.priority || "normal");
        setAdminNote(item.adminNote || "");
      }
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || t("dashboard.feedback.adminLoadError"));
      setFeedback(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async (e) => {
    e.preventDefault();
    if (saving || !feedback) return;
    setSaving(true);
    try {
      const res = await updateSuperAdminFeedbackRequest(feedback.id, {
        status,
        priority,
        adminNote: adminNote.trim() || null,
      });
      const updated = res?.data?.feedback;
      setFeedback(updated);
      if (updated) {
        setStatus(updated.status);
        setPriority(updated.priority);
        setAdminNote(updated.adminNote || "");
      }
      push({ type: "success", message: t("dashboard.feedback.adminSaved") });
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("dashboard.feedback.adminSaveError"),
      });
    } finally {
      setSaving(false);
    }
  };

  const markResolved = async () => {
    setStatus("resolved");
  };

  const breadcrumbs = [
    ...superAdminBreadcrumbs("dashboard.breadcrumbs.problemsSuggestions").slice(0, -1),
    {
      labelKey: "dashboard.breadcrumbs.problemsSuggestions",
      href: "/dashboard/super-admin/feedback",
    },
    { label: t("dashboard.feedback.detailsTitle") },
  ];

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.feedback.detailsTitle")}
        description={t("dashboard.feedback.detailsIntro")}
        breadcrumbs={breadcrumbs}
        actions={
          <Link className="sa-feedback-link" to="/dashboard/super-admin/feedback">
            {t("dashboard.feedback.backToList")}
          </Link>
        }
      />

      {loading ? <DashboardLoadingState /> : null}
      {!loading && error ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={load}>
              {t("dashboard.feedback.retry")}
            </Button>
          }
        />
      ) : null}

      {!loading && !error && feedback ? (
        <div className="sa-feedback-detail-grid">
          <DashboardSection title={t("dashboard.feedback.senderSection")}>
            <dl className="sa-feedback-dl">
              <div>
                <dt>{t("dashboard.feedback.colUser")}</dt>
                <dd>{feedback.userName}</dd>
              </div>
              <div>
                <dt>{t("dashboard.feedback.colEmail")}</dt>
                <dd>
                  <a href={`mailto:${feedback.userEmail}`}>{feedback.userEmail}</a>
                </dd>
              </div>
              <div>
                <dt>{t("dashboard.feedback.colRole")}</dt>
                <dd>
                  <StatusBadge tone="neutral">{feedbackRoleLabel(feedback.userRole, locale)}</StatusBadge>
                </dd>
              </div>
              <div>
                <dt>{t("dashboard.feedback.colUserId")}</dt>
                <dd>{feedback.userId}</dd>
              </div>
              <div>
                <dt>{t("dashboard.feedback.colDate")}</dt>
                <dd>{formatFeedbackDate(feedback.createdAt, locale)}</dd>
              </div>
            </dl>
          </DashboardSection>

          <DashboardSection title={t("dashboard.feedback.submissionSection")}>
            <dl className="sa-feedback-dl">
              <div>
                <dt>{t("dashboard.feedback.typeLabel")}</dt>
                <dd>
                  <StatusBadge tone="admin_assigned">{feedbackCategoryDisplayLabel(feedback, locale)}</StatusBadge>
                </dd>
              </div>
              {feedback.topicLabel ? (
                <div>
                  <dt>{t("dashboard.feedback.colTopic")}</dt>
                  <dd>{feedback.topicLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t("dashboard.feedback.statusLabel")}</dt>
                <dd>
                  <StatusBadge tone={feedbackStatusTone(feedback.status)}>
                    {feedbackStatusLabel(feedback.status, locale)}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt>{t("dashboard.feedback.subjectLabel")}</dt>
                <dd className="sa-feedback-subject">{feedback.subject}</dd>
              </div>
            </dl>
            <p className="sa-feedback-description">{feedback.description}</p>
          </DashboardSection>

          <DashboardSection title={t("dashboard.feedback.managementSection")}>
            <form className="sa-feedback-manage-form" onSubmit={onSave}>
              <label className="sa-feedback-field">
                <span className="sa-feedback-field__label">{t("dashboard.feedback.statusLabel")}</span>
                <select
                  className="input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={saving}
                >
                  {FEEDBACK_STATUSES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {locale === "en" ? opt.en : opt.ar}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sa-feedback-field">
                <span className="sa-feedback-field__label">{t("dashboard.feedback.priorityLabel")}</span>
                <select
                  className="input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={saving}
                >
                  {FEEDBACK_PRIORITIES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {locale === "en" ? opt.en : opt.ar}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sa-feedback-field sa-feedback-field--full">
                <span className="sa-feedback-field__label">{t("dashboard.feedback.adminNoteLabel")}</span>
                <textarea
                  className="input sa-feedback-note"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  maxLength={5000}
                  rows={5}
                  disabled={saving}
                  placeholder={t("dashboard.feedback.adminNotePlaceholder")}
                />
                <span className="sa-feedback-hint">{t("dashboard.feedback.adminNoteHint")}</span>
              </label>

              <div className="sa-feedback-manage-actions">
                <Button type="button" variant="secondary" disabled={saving} onClick={markResolved}>
                  {t("dashboard.feedback.markResolved")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => setStatus("closed")}
                >
                  {t("dashboard.feedback.markClosed")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t("dashboard.feedback.saving") : t("dashboard.feedback.save")}
                </Button>
              </div>
              <p className="sa-feedback-priority-hint">
                {t("dashboard.feedback.currentPriority")}: {feedbackPriorityLabel(feedback.priority, locale)}
              </p>
            </form>
          </DashboardSection>
        </div>
      ) : null}
    </DashboardShell>
  );
}
