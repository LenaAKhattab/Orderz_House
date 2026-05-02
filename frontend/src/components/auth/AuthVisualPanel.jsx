import * as tw from "./authTw";

const AuthVisualPanel = ({ title, description, quote, personName, personRole }) => {
  return (
    <aside className={tw.authVisualPanel}>
      <div className={tw.authVisualGlow} />
      <div className={tw.authVisualContent}>
        <h2 className={tw.authVisualTitle}>{title}</h2>
        <p className={tw.authVisualDesc}>{description}</p>

        <article className={tw.authQuoteCard}>
          <p className={tw.authQuoteText}>{quote}</p>
          <div className={tw.authPersonRow}>
            <span className={tw.authAvatar}>أ</span>
            <div>
              <strong className={tw.authPersonStrong}>{personName}</strong>
              <span className={tw.authPersonSpan}>{personRole}</span>
            </div>
          </div>
        </article>

        <div className={tw.authDots} aria-hidden="true">
          <span className={tw.authDotBar} />
          <span className={tw.authDotSmall} />
          <span className={tw.authDotSmall} />
          <span className={tw.authDotSmall} />
        </div>
      </div>
    </aside>
  );
};

export default AuthVisualPanel;
