import { useEffect, useState } from "react";
import { requestClientOrderRevisionRequest } from "../../services/api";

export default function ClientRevisionRequestModal({ open, orderId, onClose, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setNote("");
      setError("");
    }
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestClientOrderRevisionRequest(orderId, note.trim());
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "تعذّر إرسال طلب التعديل.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.45)",
      }}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revision-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 480, width: "100%" }}
      >
        <h2 id="revision-modal-title" style={{ marginTop: 0 }}>
          طلب تعديل
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          اشرح للمستقل ما تحتاج تعديله في المخرجات أو في فهم المطلوب. إن كان التسليم بانتظار مراجعتك وطلبت تعديلاً، ستُعاد
          الحالة للمستقل ليرفع نسخة محدّثة.
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        <form onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="revision-note">
              ملاحظاتك
            </label>
            <textarea
              id="revision-note"
              className="input"
              rows={5}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              placeholder="صف التعديل المطلوب…"
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              إلغاء
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "جارٍ الإرسال…" : "إرسال طلب التعديل"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
