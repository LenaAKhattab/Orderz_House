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
    <section className={tw.authFormPanel}>
      <div className={tw.authFormHeader}>
        <h1 className={tw.authFormTitle}>{title}</h1>
        <p className={tw.authFormSubtitle}>{subtitle}</p>
        {helperLinkText ? (
          <Link to={helperLinkTo} className={tw.authSubtleLink}>
            {helperLinkText}
          </Link>
        ) : null}
        {helperText ? <span className={tw.authHelperText}>{helperText}</span> : null}
      </div>

      {children}

      <p className={tw.authFooterNote}>
        {footerText}{" "}
        <Link to={footerLinkTo} className={tw.authInlineLink}>
          {footerLinkText}
        </Link>
      </p>
    </section>
  );
};

export default AuthFormCard;
