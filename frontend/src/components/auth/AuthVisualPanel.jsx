const AuthVisualPanel = ({ title, description, quote, personName, personRole }) => {
  const initial = personName?.trim()?.charAt(0) || "؟";

  return (
    <aside className="oh-auth-visual">
      <div className="oh-auth-visual__mesh" aria-hidden />
      <div className="oh-auth-visual__glow-secondary" aria-hidden />
      <div className="oh-auth-visual__glow" aria-hidden />
      <div className="oh-auth-visual__content">
        <div className="oh-auth-visual__badge">
          <img
            src="/hero/fullLogp.png"
            alt="أوردرز هاوس"
            className="oh-auth-visual__badge-logo"
            width={160}
            height={40}
            decoding="async"
          />
        </div>
        <h2 className="oh-auth-visual__title">{title}</h2>
        <p className="oh-auth-visual__desc">{description}</p>

        <article className="oh-auth-quote">
          <p className="oh-auth-quote__text">{quote}</p>
          <div className="oh-auth-person">
            <span className="oh-auth-person__avatar">{initial}</span>
            <div>
              <strong className="oh-auth-person__name">{personName}</strong>
              <span className="oh-auth-person__role">{personRole}</span>
            </div>
          </div>
        </article>

        <div className="oh-auth-visual__dots" aria-hidden="true">
          <span className="oh-auth-visual__dot-bar" />
          <span className="oh-auth-visual__dot" />
          <span className="oh-auth-visual__dot" />
          <span className="oh-auth-visual__dot" />
        </div>
      </div>
    </aside>
  );
};

export default AuthVisualPanel;
