/** Order title block: small label + readable title (RTL). */
export default function OrderTitleCard({ title }) {
  return (
    <section className="od-title-card" aria-labelledby="od-order-title-value">
      <div className="od-title-card__label">عنوان الطلب</div>
      <h1 className="od-title-card__value" id="od-order-title-value">
        {title?.trim() ? title : "—"}
      </h1>
    </section>
  );
}
