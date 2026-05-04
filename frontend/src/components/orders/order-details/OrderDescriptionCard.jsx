/** Main project description block. */
export default function OrderDescriptionCard({ label = "وصف المشروع", text }) {
  return (
    <article className="od-description">
      <h2 className="od-description__label">{label}</h2>
      <p className="od-description__text">{text?.trim() ? text : "—"}</p>
    </article>
  );
}
