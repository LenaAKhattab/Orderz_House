const AuthVisualPanel = ({ title, description, quote, personName, personRole }) => {
  return (
    <aside className="auth-visual-panel">
      <div className="auth-visual-glow" />
      <div className="auth-visual-content">
        <h2>{title}</h2>
        <p>{description}</p>

        <article className="auth-quote-card">
          <p>{quote}</p>
          <div className="auth-person-row">
            <span className="auth-avatar">أ</span>
            <div>
              <strong>{personName}</strong>
              <span>{personRole}</span>
            </div>
          </div>
        </article>

        <div className="auth-dots" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </aside>
  );
};

export default AuthVisualPanel;
