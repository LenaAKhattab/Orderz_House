import { Link } from "react-router-dom";

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
    <section className="auth-form-panel">
      <div className="auth-form-header">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {helperLinkText ? (
          <Link to={helperLinkTo} className="auth-subtle-link">
            {helperLinkText}
          </Link>
        ) : null}
        {helperText ? <span className="auth-helper-text">{helperText}</span> : null}
      </div>

      {children}

      <p className="auth-footer-note">
        {footerText}{" "}
        <Link to={footerLinkTo} className="auth-inline-link">
          {footerLinkText}
        </Link>
      </p>
    </section>
  );
};

export default AuthFormCard;
