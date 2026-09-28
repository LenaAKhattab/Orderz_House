import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getPostAuthHomePath } from "../constants/dashboardPermissions";
import { useTranslation } from "../i18n/LanguageProvider";
import "../i18n/opsAdminResources";

/**
 * صفحة 404 — مسارات غير معرّفة فقط (لا إعادة توجيه تلقائية).
 */
const NotFoundPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const backTo = user ? getPostAuthHomePath(user) : "/";
  const backLabel = user ? t("opsAdmin.notFound.backDashboard") : t("opsAdmin.notFound.backHome");

  return (
    <main className="page-content container" style={{ padding: "min(12vh, 120px) 0 48px", textAlign: "center" }}>
      <div
        aria-hidden
        style={{
          fontSize: "clamp(3.5rem, 12vw, 6rem)",
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: "-0.04em",
          color: "var(--primary)",
          opacity: 0.95,
          marginBottom: "12px",
        }}
      >
        404
      </div>
      <h1 style={{ color: "var(--primary)", marginBottom: "12px", fontSize: "clamp(1.25rem, 3vw, 1.5rem)" }}>
        {t("opsAdmin.notFound.title")}
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "28px", maxWidth: "40ch", marginInline: "auto" }}>
        {t("opsAdmin.notFound.description")}
      </p>
      <Link to={backTo} className="btn btn-primary">
        {backLabel}
      </Link>
    </main>
  );
};

export default NotFoundPage;
