import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { getDashboardPath } from "../../constants/authRoutes";

export default function ClientCreateOrderPage() {
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const base = role ? getDashboardPath(role) : "/dashboard";

  return (
    <main className="container page-content">
      <section className="card">
        <h1 style={{ marginBottom: 6 }}>إنشاء طلب (عميل)</h1>
        <p style={{ margin: 0 }}>
          هذه الصفحة جاهزة كهيكل فقط. تدفق إنشاء طلبات العملاء + الدفع سيتم تنفيذه في خطوة لاحقة.
        </p>
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-secondary" to={base}>
            العودة للوحة التحكم
          </Link>
          <Link className="btn btn-secondary" to="/orders">
            تصفح الطلبات
          </Link>
        </div>
      </section>
    </main>
  );
}

