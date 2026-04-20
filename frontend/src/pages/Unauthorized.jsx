import { Link } from "react-router-dom";

const Unauthorized = () => {
  return (
    <main className="page-content container" style={{ padding: "min(12vh, 120px) 0 48px", textAlign: "center" }}>
      <h1 style={{ color: "var(--primary)", marginBottom: "12px" }}>غير مصرّح</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: "28px", maxWidth: "36ch", marginInline: "auto" }}>
        لا يمكنك الوصول إلى هذه الصفحة. إن كنت تعتقد أن هذا خطأ، سجّل الدخول بالحساب المناسب أو تواصل مع الدعم.
      </p>
      <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
        <Link to="/" className="btn btn-primary">
          العودة للرئيسية
        </Link>
        <Link to="/login" className="btn btn-secondary">
          تسجيل الدخول
        </Link>
      </div>
    </main>
  );
};

export default Unauthorized;
