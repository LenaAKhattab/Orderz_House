/**
 * @param {string} props.title
 * @param {import("react").ReactNode} props.children
 * @param {boolean} [props.accent] — subtle highlight for important blocks (e.g. revision)
 */
export default function OrderSection({ title, children, accent = false }) {
  return (
    <section className={`od-section${accent ? " od-section--accent" : ""}`}>
      <h2 className="od-section__title">{title}</h2>
      <div className="od-section__body">{children}</div>
    </section>
  );
}
