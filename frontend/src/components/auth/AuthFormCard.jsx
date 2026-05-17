import { Link } from "react-router-dom";
import * as tw from "./authTw";

const AuthFormCard = ({
  title,
  subtitle,
  helperText,
  helperLinkText,
  helperLinkTo,
  children,
  footerText,
  footerLinkText,
  footerLinkTo,
}) => {
  return (
    <section className="oh-auth-form-panel">
      <div className="oh-auth-brand oh-auth-brand--full-logo">
        <img
          src="/hero/fullLogp.png"
          alt="أوردرز هاوس"
          className="oh-auth-brand__logo"
          width={200}
          height={48}
          decoding="async"
        />
      </div>

      <div className="oh-auth-form-header">
        <h1 className="oh-auth-form-title">{title}</h1>
        <p className="oh-auth-form-subtitle">{subtitle}</p>
        {helperLinkText ? (
          <Link to={helperLinkTo} className={tw.authSubtleLink}>
            {helperLinkText}
          </Link>
        ) : null}
        {helperText ? <span className={tw.authHelperText}>{helperText}</span> : null}
      </div>

      {children}

      <p className="oh-auth-footer-note">
        {footerText}{" "}
        <Link to={footerLinkTo} className={tw.authInlineLink}>
          {footerLinkText}
        </Link>
      </p>
    </section>
  );
};

export default AuthFormCard;
