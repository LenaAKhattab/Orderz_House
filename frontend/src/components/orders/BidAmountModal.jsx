import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import { formatMoney } from "../open-orders/openOrdersFormatters";
import "../../styles/bidAmountModal.css";

export default function BidAmountModal({
  open,
  title,
  projectTitle,
  categoryName,
  durationText,
  min,
  max,
  currency = "JOD",
  busy,
  onClose,
  onSubmit,
}) {
  const { t, locale, dir } = useTranslation();
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState("");

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setValue("");
        setFieldError("");
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const currencyLabel = locale === "en" ? currency || "JOD" : t("orders.bid.currencyShort");
  const summaryTitle = (projectTitle || title || "").trim();
  const rangeText =
    min != null && max != null
      ? `${formatMoney(min)} – ${formatMoney(max)} ${currencyLabel}`
      : null;
  const showCategory = Boolean(categoryName && categoryName !== "—");
  const showDuration = Boolean(durationText && durationText !== "—");

  const submit = (event) => {
    event.preventDefault();
    const amount = Number(String(value).replace(/,/g, "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFieldError(t("orders.bid.invalidAmount"));
      return;
    }
    if (min != null && max != null && (amount < Number(min) || amount > Number(max))) {
      setFieldError(t("orders.bid.outOfRange"));
      return;
    }
    setFieldError("");
    onSubmit(amount);
  };

  return (
    <div
      className="oh-bid-modal-overlay"
      role="presentation"
      onMouseDown={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="oh-bid-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oh-bid-modal-title"
        dir={dir}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="oh-bid-modal__head">
          <div className="oh-bid-modal__head-main">
            <span className="oh-bid-modal__badge">{t("orders.bid.badge")}</span>
            <h2 id="oh-bid-modal-title" className="oh-bid-modal__title">
              {t("orders.bid.sendTitle")}
            </h2>
          </div>
          <button
            type="button"
            className="oh-bid-modal__close"
            onClick={onClose}
            disabled={busy}
            aria-label={t("orders.bid.close")}
          >
            ×
          </button>
        </header>

        {summaryTitle || rangeText || showCategory || showDuration ? (
          <section className="oh-bid-modal__summary" aria-label={t("orders.bid.summaryAria")}>
            {summaryTitle ? (
              <>
                <p className="oh-bid-modal__summary-label">{t("orders.bid.summaryLabel")}</p>
                <p className="oh-bid-modal__summary-title">{summaryTitle}</p>
              </>
            ) : null}
            <div className="oh-bid-modal__summary-meta">
              {rangeText ? (
                <p className="oh-bid-modal__summary-row">
                  <strong>{t("orders.bid.rangeLabel")}</strong>{" "}
                  <span className="oh-num" dir="ltr">
                    {rangeText}
                  </span>
                </p>
              ) : null}
              {showCategory ? (
                <p className="oh-bid-modal__summary-row">
                  <strong>{t("orders.bid.categoryLabel")}</strong> {categoryName}
                </p>
              ) : null}
              {showDuration ? (
                <p className="oh-bid-modal__summary-row">
                  <strong>{t("orders.bid.durationLabel")}</strong>{" "}
                  <span className="oh-num" dir="ltr">
                    {durationText}
                  </span>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <form onSubmit={submit}>
          <div className="oh-bid-modal__field">
            <label className="oh-bid-modal__label" htmlFor="bid-amount-input">
              {t("orders.bid.amountLabel")}
            </label>
            <div className={`oh-bid-modal__input-wrap${fieldError ? " oh-bid-modal__input-wrap--error" : ""}`}>
              <input
                id="bid-amount-input"
                className="oh-bid-modal__input oh-num"
                dir="ltr"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (fieldError) setFieldError("");
                }}
                placeholder={t("orders.bid.amountPlaceholder")}
                disabled={busy}
                aria-invalid={fieldError ? "true" : undefined}
                aria-describedby={fieldError ? "bid-amount-error" : "bid-amount-helper"}
              />
              <span className="oh-bid-modal__currency oh-num" dir="ltr">
                {currencyLabel}
              </span>
            </div>
            {fieldError ? (
              <p id="bid-amount-error" className="oh-bid-modal__error" role="alert">
                {fieldError}
              </p>
            ) : (
              <p id="bid-amount-helper" className="oh-bid-modal__helper">
                {t("orders.bid.inputHelper")}
              </p>
            )}
          </div>

          <div className="oh-bid-modal__actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t("orders.bid.submitting") : t("orders.bid.submit")}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              {t("orders.bid.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
