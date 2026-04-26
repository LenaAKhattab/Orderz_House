import { useState } from "react";
import { approveClientOrderDeliveryRequest, downloadClientOrderFile } from "../../services/api";

function fileHref(fileUrl) {
  if (!fileUrl) return "";
  const raw = String(fileUrl).trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

/** يحسّن عرض اسم الملف إن كان محفوظاً بترميز خاطئ سابقاً. */
function displayFileName(f) {
  const raw = String(f?.originalName || f?.filePath || "").trim() || "مرفق";
  try {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i) & 0xff;
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (/[\u0600-\u06FF]/.test(decoded) && !/[\u0600-\u06FF]/.test(raw)) return decoded;
  } catch {
    /* ignore */
  }
  return raw;
}

/**
 * @param {'workflow' | 'archive'} variant — workflow: مراجعة قبل الاعتماد؛ archive: طلب مكتمل، عرض وتنزيل فقط
 */
export default function ClientDeliveryReviewModal({ open, order, onClose, onApprove, variant = "workflow" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  if (!open || !order) return null;

  const isArchive = variant === "archive";
  const deliveryFiles = (Array.isArray(order.files) ? order.files : []).filter((f) => f.purpose === "delivery");
  const canApprove = !isArchive && order.orderStatus === "pending_client_review" && deliveryFiles.length > 0;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await approveClientOrderDeliveryRequest(order.id);
      onApprove?.();
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "تعذّر اعتماد التسليم.");
    } finally {
      setBusy(false);
    }
  };

  const downloadOne = async (f) => {
    setDownloadingId(f.id);
    setError("");
    try {
      await downloadClientOrderFile(order.id, f.id, displayFileName(f));
    } catch (e) {
      setError(e?.message || "تعذّر تنزيل الملف.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy && !downloadingId) onClose();
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
        aria-labelledby="delivery-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}
      >
        <h2 id="delivery-modal-title" style={{ marginTop: 0 }}>
          {isArchive ? "ملفات تسليم المستقل" : "استلام الطلب ومراجعة المرفقات"}
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          {isArchive
            ? "يمكنك معاينة أو تنزيل الملفات التي أرسلها المستقل في أي وقت."
            : "اطلع على ملفات التسليم من المستقل. عند موافقتك على المرفقات يُعتبر الطلب مكتملاً بينكما."}
        </p>
        {error ? (
          <p className="help" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        {!isArchive && order.orderStatus === "in_progress" && deliveryFiles.length === 0 ? (
          <p className="help">لم يُسلّم المستقل الملفات بعد. يمكنك استخدام «طلب تعديل» إن احتجت توضيحاً إضافياً.</p>
        ) : null}
        {deliveryFiles.length ? (
          <ul className="order-details__attachments" style={{ marginTop: 12 }}>
            {deliveryFiles.map((f) => (
              <li
                key={f.id}
                className="order-details__attachment"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
              >
                <span style={{ wordBreak: "break-word" }}>{displayFileName(f)}</span>
                <span style={{ display: "inline-flex", gap: 8, flexShrink: 0 }}>
                  {f.fileUrl ? (
                    <a className="btn btn-secondary" style={{ padding: "6px 12px", fontSize: 14 }} href={fileHref(f.fileUrl)} target="_blank" rel="noreferrer">
                      معاينة
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "6px 12px", fontSize: 14 }}
                    disabled={Boolean(downloadingId) || busy}
                    onClick={() => downloadOne(f)}
                  >
                    {downloadingId === f.id ? "جارٍ التنزيل…" : "تنزيل"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : !isArchive && order.orderStatus === "pending_client_review" ? (
          <p className="help">لا توجد مرفقات مسجّلة للتسليم.</p>
        ) : isArchive && !deliveryFiles.length ? (
          <p className="help">لا توجد مرفقات تسليم مسجّلة لهذا الطلب.</p>
        ) : null}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            إغلاق
          </button>
          {!isArchive ? (
            <button type="button" className="btn btn-primary" disabled={busy || !canApprove} onClick={submit}>
              {busy ? "جارٍ الاعتماد…" : "اعتماد التسليم وإنهاء الطلب"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
