import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import { useToast } from "../../components/ui/toastContext";
import {
  getAdminPublicPlansContentRequest,
  updateAdminPublicPlansContentRequest,
} from "../../services/api";
import { invalidatePublicPlansContentCache } from "../../services/freelancerSessionCache";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  PUBLIC_PLANS_CONTENT_DEFAULTS,
  PUBLIC_PLANS_CONTENT_MAX_LENGTHS,
  PUBLIC_PLANS_DEFAULT_SECTION,
  PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
  resolvePublicPlansDefaultSection,
} from "../../constants/publicPlansContent";
import "./super-admin-plans.css";

function emptyForm() {
  return {
    badgeText: PUBLIC_PLANS_CONTENT_DEFAULTS.badgeText,
    title: PUBLIC_PLANS_CONTENT_DEFAULTS.title,
    description: PUBLIC_PLANS_CONTENT_DEFAULTS.description,
    defaultSection: PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
    trainingTabLabel: PUBLIC_PLANS_CONTENT_DEFAULTS.trainingTabLabel,
    workTabLabel: PUBLIC_PLANS_CONTENT_DEFAULTS.workTabLabel,
  };
}

function formFromPayload(data) {
  return {
    badgeText: String(data?.badgeText || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.badgeText,
    title: String(data?.title || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.title,
    description: String(data?.description || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.description,
    defaultSection: resolvePublicPlansDefaultSection(data?.defaultSection),
    trainingTabLabel:
      String(data?.trainingTabLabel || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.trainingTabLabel,
    workTabLabel: String(data?.workTabLabel || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.workTabLabel,
  };
}

export default function PublicPlansContentModal({ open, isEn = false, onClose }) {
  const { push } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    void getAdminPublicPlansContentRequest()
      .then((res) => {
        if (cancelled) return;
        setForm(formFromPayload(res?.data));
      })
      .catch((err) => {
        if (cancelled) return;
        setForm(emptyForm());
        setError(
          getSafeApiErrorMessage(err) ||
            (isEn ? "Could not load plans page content." : "تعذر تحميل محتوى صفحة الباقات."),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isEn]);

  if (!open) return null;

  const titleId = "oh-public-plans-content-title";
  const canSave = String(form.title || "").trim().length > 0 && !loading && !submitting;

  const handleSave = async () => {
    const title = String(form.title || "").trim();
    if (!title) {
      setError(isEn ? "Main heading is required." : "العنوان الرئيسي مطلوب.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await updateAdminPublicPlansContentRequest({
        badgeText: String(form.badgeText || "").trim(),
        title,
        description: String(form.description || "").trim(),
        defaultSection: resolvePublicPlansDefaultSection(form.defaultSection),
        trainingTabLabel: String(form.trainingTabLabel || "").trim(),
        workTabLabel: String(form.workTabLabel || "").trim(),
      });
      invalidatePublicPlansContentCache();
      onClose?.();
      push({
        type: "success",
        message: isEn
          ? "Plans page content updated successfully."
          : "تم تحديث محتوى صفحة الباقات بنجاح.",
      });
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Failed to save plans page content." : "تعذر حفظ محتوى صفحة الباقات."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="oh-sapl-modal-root" role="presentation" data-public-plans-content-modal="true">
      <button
        type="button"
        className="oh-sapl-modal-backdrop"
        onClick={submitting ? undefined : onClose}
        aria-label={isEn ? "Close dialog" : "إغلاق النافذة"}
      />
      <div
        className="oh-sapl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        dir={isEn ? "ltr" : "rtl"}
      >
        <header className="oh-sapl-modal__head">
          <div>
            <h2 id={titleId} className="oh-sapl-modal__title">
              {isEn ? "Edit plans page content" : "تعديل محتوى صفحة الباقات"}
            </h2>
          </div>
          <button
            type="button"
            className="oh-sapl-modal__close"
            onClick={onClose}
            disabled={submitting}
            aria-label={isEn ? "Close" : "إغلاق"}
          >
            ×
          </button>
        </header>

        <div className="oh-sapl-modal__scroll">
          {loading ? (
            <div className="oh-sapl-public-content-skel" aria-hidden>
              <span className="oh-sapl-skel" style={{ height: 18, width: "40%" }} />
              <span className="oh-sapl-skel" style={{ height: 46, width: "100%" }} />
              <span className="oh-sapl-skel" style={{ height: 18, width: "36%" }} />
              <span className="oh-sapl-skel" style={{ height: 46, width: "100%" }} />
              <span className="oh-sapl-skel" style={{ height: 18, width: "28%" }} />
              <span className="oh-sapl-skel" style={{ height: 88, width: "100%" }} />
            </div>
          ) : (
            <div className="oh-sapl-form">
              <label className="oh-sapl-field">
                <span className="oh-sapl-field__label">{isEn ? "Short badge text" : "النص القصير"}</span>
                <input
                  type="text"
                  className="oh-sapl-input"
                  value={form.badgeText}
                  maxLength={PUBLIC_PLANS_CONTENT_MAX_LENGTHS.badgeText}
                  disabled={submitting}
                  onChange={(event) => setForm((prev) => ({ ...prev, badgeText: event.target.value }))}
                />
              </label>
              <label className="oh-sapl-field">
                <span className="oh-sapl-field__label">{isEn ? "Main heading" : "العنوان الرئيسي"}</span>
                <input
                  type="text"
                  className="oh-sapl-input"
                  value={form.title}
                  maxLength={PUBLIC_PLANS_CONTENT_MAX_LENGTHS.title}
                  disabled={submitting}
                  required
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label className="oh-sapl-field">
                <span className="oh-sapl-field__label">{isEn ? "Description" : "الوصف"}</span>
                <textarea
                  className="oh-sapl-input oh-sapl-input--textarea"
                  value={form.description}
                  maxLength={PUBLIC_PLANS_CONTENT_MAX_LENGTHS.description}
                  disabled={submitting}
                  rows={4}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>

              <fieldset className="oh-sapl-field oh-sapl-public-content-section">
                <legend className="oh-sapl-field__label">
                  {isEn ? "Section shown first to the user" : "القسم الذي يظهر أولاً للمستخدم"}
                </legend>
                <p className="oh-sapl-field__hint" style={{ marginTop: 0 }}>
                  {isEn ? "Default section:" : "القسم الافتراضي:"}
                </p>
                <div className="oh-sapl-radio-group" role="radiogroup">
                  <div className="oh-sapl-radio oh-sapl-radio--with-input">
                    <input
                      type="radio"
                      name="public_plans_default_section"
                      value={PUBLIC_PLANS_DEFAULT_SECTION.TRAINING}
                      checked={form.defaultSection === PUBLIC_PLANS_DEFAULT_SECTION.TRAINING}
                      disabled={submitting}
                      aria-label={isEn ? "Show training first" : "إظهار باقات التدريب أولاً"}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          defaultSection: PUBLIC_PLANS_DEFAULT_SECTION.TRAINING,
                        }))
                      }
                    />
                    <input
                      type="text"
                      className="oh-sapl-input"
                      value={form.trainingTabLabel}
                      maxLength={PUBLIC_PLANS_CONTENT_MAX_LENGTHS.trainingTabLabel}
                      disabled={submitting}
                      aria-label={isEn ? "Training tab label" : "اسم تبويب باقات التدريب"}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, trainingTabLabel: event.target.value }))
                      }
                    />
                  </div>
                  <div className="oh-sapl-radio oh-sapl-radio--with-input">
                    <input
                      type="radio"
                      name="public_plans_default_section"
                      value={PUBLIC_PLANS_DEFAULT_SECTION.WORK}
                      checked={form.defaultSection === PUBLIC_PLANS_DEFAULT_SECTION.WORK}
                      disabled={submitting}
                      aria-label={isEn ? "Show marketplace membership first" : "إظهار عضوية سوق أوردرز هاوس أولاً"}
                      onChange={() =>
                        setForm((prev) => ({
                          ...prev,
                          defaultSection: PUBLIC_PLANS_DEFAULT_SECTION.WORK,
                        }))
                      }
                    />
                    <input
                      type="text"
                      className="oh-sapl-input"
                      value={form.workTabLabel}
                      maxLength={PUBLIC_PLANS_CONTENT_MAX_LENGTHS.workTabLabel}
                      disabled={submitting}
                      aria-label={isEn ? "Membership tab label" : "اسم تبويب عضوية سوق أوردرز هاوس"}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, workTabLabel: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </fieldset>
            </div>
          )}

          {error ? (
            <p className="oh-sapl-default-control__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="oh-sapl-modal__foot">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            {isEn ? "Cancel" : "إلغاء"}
          </Button>
          <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
            {submitting ? (isEn ? "Saving…" : "جارٍ الحفظ…") : isEn ? "Save changes" : "حفظ التغييرات"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
