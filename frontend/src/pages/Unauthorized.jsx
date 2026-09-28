import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getPostAuthHomePath } from "../constants/dashboardPermissions";
import { useTranslation } from "../i18n/LanguageProvider";
import "../i18n/opsAdminResources";

const Unauthorized = ({
  title,
  message,
}) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const homeTo = user ? getPostAuthHomePath(user) : "/";
  const primaryLabel = user ? t("opsAdmin.unauthorized.backDashboard") : t("opsAdmin.unauthorized.backHome");
  const displayTitle = title ?? t("opsAdmin.unauthorized.defaultTitle");
  const displayMessage = message ?? t("opsAdmin.unauthorized.defaultMessage");

  return (
    <main className="page-content container" style={{ padding: "min(12vh, 120px) 0 48px", textAlign: "center" }}>
      <div
        aria-hidden
        style={{
          fontSize: "clamp(3rem, 10vw, 5rem)",
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "var(--primary)",
          opacity: 0.92,
          marginBottom: "12px",
        }}
      >
        403
      </div>
      <h1 style={{ color: "var(--primary)", marginBottom: "12px", fontSize: "clamp(1.25rem, 3vw, 1.5rem)" }}>
        {displayTitle}
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "28px", maxWidth: "40ch", marginInline: "auto" }}>
        {displayMessage}
      </p>
      <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
        <Link to={homeTo} className="btn btn-primary">
          {primaryLabel}
        </Link>
        {user ? (
          <Link to="/" className="btn btn-secondary">
            {t("opsAdmin.unauthorized.publicSite")}
          </Link>
        ) : (
          <Link to="/login" className="btn btn-secondary">
            {t("opsAdmin.unauthorized.login")}
          </Link>
        )}
      </div>
    </main>
  );
};

export default Unauthorized;
