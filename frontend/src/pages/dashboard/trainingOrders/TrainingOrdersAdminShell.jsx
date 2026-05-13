import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { trainingOrdersBreadcrumbs } from "../../../components/dashboard/dashboardBreadcrumbs";
import "./trainingOrdersAdmin.css";

const TABS = [
  { to: "/dashboard/super-admin/training-orders/settings", label: "الإعدادات", end: false },
  { to: "/dashboard/super-admin/training-orders/templates", label: "قوالب الطلبات", end: false },
  { to: "/dashboard/super-admin/training-orders/rounds", label: "الجولات", end: false },
  { to: "/dashboard/super-admin/training-orders/applications", label: "المتقدمون", end: false },
];

function trainingSectionTitle(pathname) {
  if (pathname.includes("/applications")) return "المتقدمون";
  if (pathname.includes("/templates")) return "قوالب الطلبات";
  if (pathname.includes("/rounds")) return "الجولات";
  if (pathname.includes("/settings")) return "الإعدادات";
  return "نظرة عامة";
}

export default function TrainingOrdersAdminShell() {
  const { pathname } = useLocation();
  const sectionLabel = trainingSectionTitle(pathname);

  return (
    <DashboardShell className="oh-training-hub">
      <div className="oh-training-hub__inner" dir="rtl" lang="ar">
        {/*
          Dev note: this shell is the only place that should render DashboardPageHeader for Training Orders.
          Nested routes under <Outlet /> should use DashboardSection title/description (and toolbars as needed),
          not a second DashboardPageHeader — that would duplicate breadcrumbs and top header chrome.
        */}
        <DashboardPageHeader
          eyebrow="لوحة المدير الأعلى"
          title="الطلبات التجريبية"
          description="إدارة إعدادات الجولات التلقائية، قوالب الطلبات الوهمية، ومتابعة المتقدمين — منفصلة بالكامل عن الطلبات الحقيقية."
          breadcrumbs={trainingOrdersBreadcrumbs(sectionLabel)}
        />

        <nav aria-label="أقسام الطلبات التجريبية">
          <div className="dash-ui-tabs oh-training-hub__tabs" role="presentation">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={Boolean(t.end)}
                className={({ isActive }) =>
                  `dash-ui-tab oh-training-hub__tab${isActive ? " dash-ui-tab--selected oh-training-hub__tab--active" : ""}`.trim()
                }
              >
                {t.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <Outlet />
      </div>
    </DashboardShell>
  );
}

export function TrainingOrdersIndexRedirect() {
  return <Navigate to="/dashboard/super-admin/training-orders/settings" replace />;
}
