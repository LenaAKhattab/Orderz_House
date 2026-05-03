import { NavLink, Outlet, Navigate } from "react-router-dom";
import "./trainingOrdersAdmin.css";

const TABS = [
  { to: "/dashboard/super-admin/training-orders/settings", label: "الإعدادات", end: false },
  { to: "/dashboard/super-admin/training-orders/templates", label: "قوالب الطلبات", end: false },
  { to: "/dashboard/super-admin/training-orders/rounds", label: "الجولات", end: false },
  { to: "/dashboard/super-admin/training-orders/applications", label: "المتقدمون", end: false },
];

export default function TrainingOrdersAdminShell() {
  return (
    <section className="container page-content oh-training-hub" dir="rtl" lang="ar">
      <header className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>الطلبات التجريبية</h1>
        <p style={{ marginBottom: 0, color: "#475569" }}>
          إدارة إعدادات الجولات التلقائية، قوالب الطلبات الوهمية، ومتابعة المتقدمين — منفصلة بالكامل عن الطلبات الحقيقية.
        </p>
      </header>

      <nav aria-label="أقسام الطلبات التجريبية">
        <ul className="oh-training-hub__tabs">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={Boolean(t.end)}
                className={({ isActive }) =>
                  `oh-training-hub__tab${isActive ? " oh-training-hub__tab--active" : ""}`.trim()
                }
              >
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </section>
  );
}

export function TrainingOrdersIndexRedirect() {
  return <Navigate to="/dashboard/super-admin/training-orders/settings" replace />;
}
