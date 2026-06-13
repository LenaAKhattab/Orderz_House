import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import {
  createSuperAdminWebsiteFaqRequest,
  deleteSuperAdminWebsiteFaqRequest,
  listSuperAdminWebsiteFaqRequest,
  reorderSuperAdminWebsiteFaqRequest,
  updateSuperAdminWebsiteFaqRequest,
} from "../../services/api";
import "./superAdminEditWebsitePage.css";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function FaqFormModal({ mode, open, initial, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuestion(initial?.question || "");
    setAnswer(initial?.answer || "");
    setError("");
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const q = question.trim();
    const a = answer.trim();
    if (!q || !a) {
      setError("أدخل السؤال والإجابة.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSuperAdminWebsiteFaqRequest(initial.id, { question: q, answer: a });
      } else {
        await createSuperAdminWebsiteFaqRequest({ question: q, answer: a });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-website-faq-modal" role="dialog" aria-modal="true">
      <button type="button" className="oh-website-faq-modal__backdrop" aria-label="إغلاق" onClick={onClose} />
      <div className="oh-website-faq-modal__panel">
        <div className="oh-website-faq-modal__header">
          <h2>{isEdit ? "تعديل سؤال" : "إضافة سؤال"}</h2>
          <button type="button" className="oh-website-faq-modal__close" aria-label="إغلاق" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="oh-website-faq-form" onSubmit={handleSubmit}>
          <label>
            السؤال
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} disabled={submitting} rows={3} />
          </label>
          <label>
            الإجابة
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={submitting} rows={5} />
          </label>
          {error ? <p className="oh-website-faq-form__error">{error}</p> : null}
          <div className="oh-website-faq-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "جاري الحفظ…" : isEdit ? "حفظ التعديل" : "إضافة"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminEditWebsiteFaqPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [modal, setModal] = useState({ open: false, mode: "create", item: null });

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listSuperAdminWebsiteFaqRequest();
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleDelete = async (item) => {
    if (!window.confirm(`حذف السؤال: «${item.question.slice(0, 48)}…»؟`)) return;
    setBusyId(item.id);
    try {
      await deleteSuperAdminWebsiteFaqRequest(item.id);
      await loadItems();
    } catch (err) {
      window.alert(errorMessage(err));
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
      window.alert(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="الأسئلة الشائعة"
        description="إدارة الأسئلة والأجوبة المعروضة في قسم «الأسئلة الشائعة» على الصفحة الرئيسية."
        breadcrumbs={editWebsiteBreadcrumbs("الأسئلة الشائعة")}
      />

      <DashboardSection title="قائمة الأسئلة">
        <div className="oh-website-faq-toolbar">
          <p className="oh-website-faq-toolbar__hint">
            التغييرات تظهر مباشرة في قسم «الأسئلة الشائعة» على الصفحة الرئيسية.
          </p>
          <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
            إضافة سؤال
          </Button>
        </div>

        {loading ? <DashboardLoadingState label="جاري تحميل الأسئلة…" /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadItems}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}
        {!loading && !error && items.length === 0 ? (
          <DashboardEmptyState
            title="لا توجد أسئلة"
            description="أضف أول سؤال شائع ليظهر في الصفحة الرئيسية."
            actions={
              <Button type="button" onClick={() => setModal({ open: true, mode: "create", item: null })}>
                إضافة سؤال
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
                        تعديل
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busyId === item.id}
                        onClick={() => handleDelete(item)}
                      >
                        حذف
                      </Button>
                    </div>
                  </div>
                  <div className="oh-website-faq-item__reorder">
                    <button
                      type="button"
                      aria-label="تحريك لأعلى"
                      disabled={index === 0 || busyId === item.id}
                      onClick={() => moveItem(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="تحريك لأسفل"
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
