import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";

export default function BidAmountModal({ open, title, min, max, currency = "JOD", busy, onClose, onSubmit }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => setValue(""));
    }
  }, [open]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    const n = Number(String(value).replace(/,/g, "."));
    onSubmit(n);
  };

  const modalTitle = title || t("orders.bid.title");
  const hint = t("orders.bid.hint", { min, max, currency: currency || "" });

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
        aria-labelledby="bid-modal-title"
        onMouseDown={(ev) => ev.stopPropagation()}
        style={{ maxWidth: 420, width: "100%" }}
      >
        <h2 id="bid-modal-title" style={{ marginTop: 0 }}>
          {modalTitle}
        </h2>
        <p className="help" style={{ marginTop: 0 }}>
          {hint}
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="bid-amount-input">
              {t("orders.bid.amountLabel")}
            </label>
            <input
              id="bid-amount-input"
              className="input"
              dir="ltr"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("orders.bid.amountPlaceholder", { min })}
              disabled={busy}
            />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              {t("orders.bid.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("orders.bid.submitting") : t("orders.bid.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
