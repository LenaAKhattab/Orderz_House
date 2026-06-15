import OrderDetailsNeuIcon from "./OrderDetailsNeuIcon";
import { useTranslation } from "../../../i18n/LanguageProvider";

/** Order title block: small label + readable title. */
export default function OrderTitleCard({ title, icon = "title", label }) {
  const { t } = useTranslation();
  const titleLabel = label || t("orders.details.titleLabel");

  return (
    <section className="od-title-card" aria-labelledby="od-order-title-value">
      <div className="od-section-head">
        <OrderDetailsNeuIcon name={icon} variant="squircle" />
        <div className="od-section-head__copy">
          <div className="od-title-card__label">{titleLabel}</div>
          <h1 className="od-title-card__value" id="od-order-title-value">
            {title?.trim() ? title : "—"}
          </h1>
        </div>
      </div>
    </section>
  );
}
