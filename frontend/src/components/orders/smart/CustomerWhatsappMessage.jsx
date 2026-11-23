import { useEffect, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { buildCustomerMessage, copyText, MESSAGE_LOCALES } from "./customerMessages";

const LOCALE_NAMES = { ar: "العربية", en: "English", de: "Deutsch", nl: "Nederlands", ro: "Română" };

/**
 * Generated, copy-only WhatsApp message for the customer (no automatic sending).
 * @param {{ kind: "account"|"guest"|"conversion", customer: object, link?: string|null }} props
 */
export default function CustomerWhatsappMessage({ kind, customer, link = null }) {
  const { t, locale } = useTranslation();
  const [msgLocale, setMsgLocale] = useState(MESSAGE_LOCALES.includes(locale) ? locale : "ar");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    let cancelled = false;
    buildCustomerMessage({ kind, locale: msgLocale, customer, link }).then((m) => {
      if (!cancelled) setText(m);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, msgLocale, customer, link]);

  const doCopy = async (what, value) => {
    if (await copyText(value)) {
      setCopied(what);
      window.setTimeout(() => setCopied(""), 1800);
    }
  };

  return (
    <div className="smart-msg" data-testid="smart-orders-whatsapp-message">
      <div className="smart-msg__head">
        <span className="label">
          <MessageCircle size={16} aria-hidden="true" /> {t("smartOrders.panel.whatsappTemplate")}
        </span>
        <label className="smart-msg__lang">
          <span className="help">{t("smartOrders.created.messageLanguage")}</span>
          <select className="input" value={msgLocale} onChange={(e) => setMsgLocale(e.target.value)}>
            {MESSAGE_LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <textarea
        className="input smart-msg__text"
        readOnly
        rows={5}
        dir={msgLocale === "ar" ? "rtl" : "ltr"}
        value={text}
        aria-label={t("smartOrders.panel.whatsappTemplate")}
      />
      <div className="smart-msg__actions">
        <button type="button" className="btn btn-primary" onClick={() => doCopy("message", text)} disabled={!text}>
          <Copy size={16} aria-hidden="true" /> {copied === "message" ? t("smartOrders.created.copied") : t("smartOrders.created.copyMessage")}
        </button>
        {link ? (
          <button type="button" className="btn btn-secondary" onClick={() => doCopy("link", link)}>
            <Copy size={16} aria-hidden="true" /> {copied === "link" ? t("smartOrders.created.copied") : t("smartOrders.created.copyLink")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
