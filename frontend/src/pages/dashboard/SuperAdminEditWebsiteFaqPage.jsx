import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import {
  createSuperAdminWebsiteFaqRequest,
  deleteSuperAdminWebsiteFaqRequest,
  listSuperAdminWebsiteFaqRequest,
  reorderSuperAdminWebsiteFaqRequest,
  updateSuperAdminWebsiteFaqRequest,
} from "../../services/api";
import "./superAdminEditWebsitePage.css";

function FaqFormModal({ mode, open, initial, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = mode === "edit";
  const [question, setQuestion] = useState("");
  const [questionEn, setQuestionEn] = useState("");
  const [answer, setAnswer] = useState("");
  const [answerEn, setAnswerEn] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuestion(initial?.question || "");
    setQuestionEn(initial?.questionEn || initial?.question_en || "");
    setAnswer(initial?.answer || "");
    setAnswerEn(initial?.answerEn || initial?.answer_en || "");
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const operationError = (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) {
      setError(t("siteEditor.errors.enterQuestionAndAnswer"));
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSuperAdminWebsiteFaqRequest(initial.id, {
          question: q,
          answer: a,
          questionEn: questionEn.trim(),
          answerEn: answerEn.trim(),
        });
      } else {
        await createSuperAdminWebsiteFaqRequest({
          question: q,
          answer: a,
          questionEn: questionEn.trim(),
          answerEn: answerEn.trim(),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(operationError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="oh-website-faq-modal__backdrop"
        aria-label={t("siteEditor.common.close")}
        onClick={onClose}
      />
      <div className="oh-website-faq-modal__panel">
        <div className="oh-website-faq-modal__header">
          <h2>{isEdit ? t("siteEditor.faq.modalEditTitle") : t("siteEditor.faq.modalAddTitle")}</h2>
          <button
            type="button"
            className="oh-website-faq-modal__close"
            aria-label={t("siteEditor.common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="oh-website-faq-form" onSubmit={handleSubmit}>
          <label>
            {t("siteEditor.faq.fieldQuestion")}
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} disabled={submitting} rows={3} />
          </label>
          <label>
            {t("siteEditor.faq.fieldQuestionEn")}
            <textarea value={questionEn} onChange={(e) => setQuestionEn(e.target.value)} disabled={submitting} rows={3} />
          </label>
          <label>
            {t("siteEditor.faq.fieldAnswer")}
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={submitting} rows={5} />
          </label>
          <label>
            {t("siteEditor.faq.fieldAnswerEn")}
            <textarea value={answerEn} onChange={(e) => setAnswerEn(e.target.value)} disabled={submitting} rows={5} />
          </label>
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("siteEditor.common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("siteEditor.common.saving")
                : isEdit
                  ? t("siteEditor.common.saveEdit")
                  : t("siteEditor.common.add")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminEditWebsiteFaqPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState({ open: false, mode: "create", item: null });

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminWebsiteFaqRequest();
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(operationError(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [operationError]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleDelete = async (item) => {
    if (!window.confirm(t("siteEditor.faq.deleteConfirm", { preview: item.question.slice(0, 48) }))) return;
    setBusyId(item.id);
    try {
      await deleteSuperAdminWebsiteFaqRequest(item.id);
      await loadItems();
    } catch (err) {
      window.alert(operationError(err));
    } finally {
      setBusyId(null);
    }
  };

  const moveItem = async (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const next = [...items];
    const [removed] = next.splice(index, 1);
    next.splice(targetIndex, 0, removed);
    setBusyId(removed.id);
    try {
      const res = await reorderSuperAdminWebsiteFaqRequest(next.map((x) => x.id));
      setItems(Array.isArray(res?.data?.items) ? res.data.items : next);
    } catch (err) {
      window.alert(operationError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.faq.pageTitle")}
        description={t("siteEditor.faq.pageDescription")}
        breadcrumbs={editWebsiteBreadcrumbs("dashboard.breadcrumbs.faq")}
      />

      <DashboardSection title={t("siteEditor.faq.sectionTitle")}>
        <div className="oh-website-faq-toolbar">
          <p className="oh-website-faq-toolbar__hint">{t("siteEditor.faq.toolbarHint")}</p>
          <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
            {t("siteEditor.faq.addQuestion")}
          </Button>
        </div>

        {loading ? <DashboardLoadingState label={t("siteEditor.common.loadingQuestions")} /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadItems}>
                {t("siteEditor.common.retry")}
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <DashboardEmptyState
            title={t("siteEditor.faq.emptyTitle")}
            description={t("siteEditor.faq.emptyDescription")}
            actions={
              <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
                {t("siteEditor.faq.addQuestion")}
              </Button>
            }
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="oh-website-faq-list">
            {items.map((item, index) => (
              <article key={item.id} className="oh-website-faq-item">
                <div className="oh-website-faq-item__head">
                  <span className="oh-website-faq-item__order">{index + 1}</span>
                  <div className="oh-website-faq-item__body">
                    <p className="oh-website-faq-item__question">{item.question}</p>
                    <p className="oh-website-faq-item__answer">{item.answer}</p>
                    <div className="oh-website-faq-item__actions">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busyId === item.id}
                        onClick={() => setModal({ open: true, mode: "edit", item })}
                      >
                        {t("siteEditor.common.edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busyId === item.id}
                        onClick={() => handleDelete(item)}
                      >
                        {t("siteEditor.common.delete")}
                      </Button>
                    </div>
                  </div>
                  <div className="oh-website-faq-item__reorder">
                    <button
                      type="button"
                      aria-label={t("siteEditor.common.moveUp")}
                      disabled={index === 0 || busyId === item.id}
                      onClick={() => moveItem(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t("siteEditor.common.moveDown")}
                      disabled={index === items.length - 1 || busyId === item.id}
                      onClick={() => moveItem(index, 1)}
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

      <FaqFormModal
        mode={modal.mode}
        open={modal.open}
        initial={modal.item}
        onClose={() => setModal({ open: false, mode: "create", item: null })}
        onSaved={loadItems}
      />
    </DashboardShell>
  );
}
