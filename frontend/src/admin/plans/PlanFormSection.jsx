/**
 * Grouped panel for plan create/edit forms.
 * @param {{ title?: string; hint?: string; children: React.ReactNode; id?: string }} p
 */
export default function PlanFormSection({ title, hint = "", children, id }) {
  return (
    <section className="oh-sapl-section" id={id} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {title || hint ? (
        <div className="oh-sapl-section__head">
          {title ? (
            <h2 className="oh-sapl-section__title" id={id ? `${id}-title` : undefined}>
              {title}
            </h2>
          ) : null}
          {hint ? <p className="oh-sapl-section__hint">{hint}</p> : null}
        </div>
      ) : null}
      <div className="oh-sapl-section__body">{children}</div>
    </section>
  );
}
