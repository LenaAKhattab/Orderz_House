import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { getDashboardPathByRole } from "../constants/authRoutes";

const Unauthorized = () => {
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const homeTo = user && role ? getDashboardPathByRole(role) : "/";
  const primaryLabel = user ? "العودة للوحة التحكم" : "العودة للرئيسية";

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
        غير مصرّح
      </h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "28px", maxWidth: "40ch", marginInline: "auto" }}>
        لا يمكنك الوصول إلى هذه الصفحة. إن كنت تعتقد أن هذا خطأ، استخدم حسابًا له الصلاحية أو تواصل مع الدعم.
      </p>
      <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
        <Link to={homeTo} className="btn btn-primary">
          {primaryLabel}
        </Link>
        {user ? (
          <Link to="/" className="btn btn-secondary">
            الموقع العام
          </Link>
        ) : (
          <Link to="/login" className="btn btn-secondary">
            تسجيل الدخول
          </Link>
        )}
      </div>
    </main>
  );
};

export default Unauthorized;
