import OrderDetailsNeuIcon from "./OrderDetailsNeuIcon";
import { useTranslation } from "../../../i18n/LanguageProvider";

/** Main project description block. */
export default function OrderDescriptionCard({ label, text, icon = "description" }) {
  const { t } = useTranslation();
  const sectionLabel = label || t("orders.details.descriptionLabel");
  const raw = text?.trim() || "";
  const paragraphs = raw ? raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean) : [];

  return (
    <article className="od-description">
      <div className="od-section-head od-section-head--compact">
        <OrderDetailsNeuIcon name={icon} variant="squircle" />
        <h2 className="od-description__label">{sectionLabel}</h2>
      </div>
      <div className="od-description__body">
        {paragraphs.length ? (
          paragraphs.map((para, i) => (
            <p key={i} className="od-description__text">
              {para}
            </p>
          ))
        ) : (
          <p className="od-description__text">—</p>
        )}
      </div>
    </article>
  );
}
