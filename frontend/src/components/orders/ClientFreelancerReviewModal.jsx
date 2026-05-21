import { useCallback, useEffect, useState } from "react";
import {
  getClientOrderReviewStatusRequest,
  submitClientOrderReviewRequest,
  updateClientOrderReviewRequest,
} from "../../services/api";

function StarRow({ value, onChange, label }) {
  return (
    <div className="oh-review-stars" role="group" aria-label={label}>
      <span className="oh-review-stars__label">{label}</span>
      <div className="oh-review-stars__row">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`oh-review-stars__btn${value >= n ? " is-on" : ""}`}
            onClick={() => onChange(n)}
            aria-label={`${n} من 5`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 1200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "rgba(15, 23, 42, 0.45)",
};

export default function ClientFreelancerReviewModal({ open, orderId, orderTitle, onClose, onSubmitted }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(null);
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [communicationRating, setCommunicationRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const load = useCallback(async () => {
    if (!open || !orderId) return;
    setLoading(true);
    setError("");
    try {
      const res = await getClientOrderReviewStatusRequest(orderId);
      const data = res?.data ?? res;
      setStatus(data);
      if (data?.existingReview) {
        setRating(data.existingReview.rating || 0);
        setReviewText(data.existingReview.reviewText || "");
        setCommunicationRating(data.existingReview.communicationRating || 0);
        setDeliveryRating(data.existingReview.deliveryRating || 0);
        setWouldRecommend(data.existingReview.wouldRecommend !== false);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذر تحميل حالة التقييم.");
    } finally {
      setLoading(false);
    }
  }, [open, orderId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating < 1) {
      setError("اختر تقييماً بالنجوم.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        rating,
        reviewText: reviewText.trim() || undefined,
        communicationRating: communicationRating > 0 ? communicationRating : undefined,
        deliveryRating: deliveryRating > 0 ? deliveryRating : undefined,
        wouldRecommend,
      };
      if (status?.existingReview?.canEdit) {
        await updateClientOrderReviewRequest(orderId, payload);
      } else {
        await submitClientOrderReviewRequest(orderId, payload);
      }
      onSubmitted?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "تعذر إرسال التقييم.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const title = orderTitle || status?.orderTitle || "المشروع";
  const freelancerName = status?.freelancerName || "المستقل";
  const readOnly = status?.existingReview && !status?.existingReview?.canEdit;

  return (
    <div style={overlayStyle} role="presentation" onClick={onClose}>
      <div
        className="card oh-review-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oh-review-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 480, width: "100%", maxHeight: "90vh", overflow: "auto" }}
        dir="rtl"
      >
        <h2 id="oh-review-title" style={{ marginTop: 0 }}>
          قيّم تجربتك مع المستقل
        </h2>

        {loading ? (
          <p className="help">جارٍ التحميل…</p>
        ) : (
          <form className="oh-review-form" onSubmit={handleSubmit}>
            <p className="help" style={{ marginTop: 0 }}>
              {readOnly
                ? `تقييمك لمشروع «${title}»`
                : `كيف كانت تجربتك مع ${freelancerName} في «${title}»؟`}
            </p>

            <StarRow value={rating} onChange={setRating} label="التقييم العام" />

            {!readOnly ? (
              <>
                <label className="oh-review-form__field">
                  <span className="oh-account-label">ملاحظاتك (اختياري)</span>
                  <textarea
                    className="input"
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    rows={4}
                    maxLength={2000}
                    placeholder="شارك تجربتك باختصار."
                    style={{ width: "100%", marginTop: 6 }}
                  />
                </label>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowDetails((v) => !v)}
                >
                  {showDetails ? "إخفاء التفاصيل" : "تقييمات تفصيلية (اختياري)"}
                </button>

                {showDetails ? (
                  <div className="oh-review-form__details" style={{ marginTop: 12 }}>
                    <StarRow value={communicationRating} onChange={setCommunicationRating} label="التواصل" />
                    <StarRow value={deliveryRating} onChange={setDeliveryRating} label="التسليم" />
                  </div>
                ) : null}

                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={wouldRecommend}
                    onChange={(e) => setWouldRecommend(e.target.checked)}
                  />
                  أوصي بهذا المستقل
                </label>
              </>
            ) : status?.existingReview?.reviewText ? (
              <blockquote style={{ margin: "12px 0", padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
                {status.existingReview.reviewText}
              </blockquote>
            ) : null}

            {error ? (
              <p className="help" style={{ color: "#b91c1c" }}>
                {error}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
                {readOnly ? "إغلاق" : "لاحقاً"}
              </button>
              {!readOnly && status?.canSubmit !== false ? (
                <button type="submit" className="btn btn-primary" disabled={submitting || rating < 1}>
                  {submitting ? "جارٍ الإرسال…" : status?.existingReview?.canEdit ? "حفظ التعديل" : "إرسال التقييم"}
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
