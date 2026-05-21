import { lazy, Suspense } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { DASHBOARD_TITLE } from "../../constants/authRoutes";
import { useAuth } from "../../context/useAuth";
import RouteSuspenseFallback from "../../components/ui/RouteSuspenseFallback";

const OpenOrdersMarketplace = lazy(() => import("../../components/open-orders/OpenOrdersMarketplace"));
const ClientDashboardHome = lazy(() => import("./ClientDashboardHome"));
const FreelancerDashboardHome = lazy(() => import("./FreelancerDashboardHome"));
const FreelancerMyOrdersPage = lazy(() => import("./FreelancerMyOrdersPage"));
const SuperAdminVisitorsDashboard = lazy(() => import("./SuperAdminVisitorsDashboard"));
const AdminDashboardHome = lazy(() => import("./AdminDashboardHome"));

const ROLE_LABEL_AR = {
  super_admin: "مدير أعلى",
  admin: "إداري",
  freelancer: "مستقل",
  client: "عميل",
};

function EmptyState({ title, subtitle, actionLabel, actionTo }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty__icon" aria-hidden="true">
        ◌
      </div>
      <div className="dash-empty__copy">
        <h3 className="dash-empty__title">{title}</h3>
        <p className="dash-empty__subtitle">{subtitle}</p>
      </div>
      {actionLabel && actionTo ? (
        <NavLink to={actionTo} className="btn btn-secondary dash-empty__action">
          {actionLabel}
        </NavLink>
      ) : null}
    </div>
  );
}

function Section({ title, actionLabel, actionTo, children }) {
  const hasHead = Boolean(title || (actionLabel && actionTo));
  return (
    <section className="dash-section">
      {hasHead ? (
        <div className="dash-section__head">
          {title ? <h2 className="dash-section__title">{title}</h2> : <span />}
          {actionLabel && actionTo ? (
            <NavLink to={actionTo} className="dash-section__link">
              {actionLabel}
            </NavLink>
          ) : null}
        </div>
      ) : null}
      <div className="dash-section__body">{children}</div>
    </section>
  );
}

function LazyDashboardView({ children }) {
  return <Suspense fallback={<RouteSuspenseFallback />}>{children}</Suspense>;
}

const DashboardPage = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const title = DASHBOARD_TITLE[pathname] || "لوحة التحكم";
  const role = user?.primaryRole || user?.role;
  const roleLabel = role ? ROLE_LABEL_AR[role] || role : "";

  const isFreelancerRoute = pathname.startsWith("/dashboard/freelancer");
  const isClientMarketplace =
    pathname === "/dashboard/client/orders" || pathname.startsWith("/dashboard/client/orders/");
  if (pathname === "/dashboard/freelancer/orders" || isClientMarketplace) {
    return (
      <LazyDashboardView>
        <OpenOrdersMarketplace layout="dashboard" />
      </LazyDashboardView>
    );
  }
  if (role === "admin" && pathname === "/dashboard/admin") {
    return (
      <LazyDashboardView>
        <AdminDashboardHome user={user} />
      </LazyDashboardView>
    );
  }
  if (role === "client" && pathname === "/dashboard/client") {
    return (
      <LazyDashboardView>
        <ClientDashboardHome user={user} />
      </LazyDashboardView>
    );
  }
  if (role === "super_admin" && pathname === "/dashboard/super-admin") {
    return (
      <LazyDashboardView>
        <SuperAdminVisitorsDashboard />
      </LazyDashboardView>
    );
  }
  if (role === "freelancer" && isFreelancerRoute) {
    if (pathname === "/dashboard/freelancer") {
      return (
        <LazyDashboardView>
          <FreelancerDashboardHome user={user} />
        </LazyDashboardView>
      );
    }
    if (pathname === "/dashboard/freelancer/my-orders") {
      return (
        <LazyDashboardView>
          <FreelancerMyOrdersPage />
        </LazyDashboardView>
      );
    }
  }

  return (
    <section className="container page-content dash-shell">
      <div className="dash">
        <header className="dash-hero dash-hero--compact">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة التحكم</p>
            <h1 className="dash-hero__title oh-orders-sidebar-title">{title}</h1>
            {user ? <p className="dash-hero__subtitle">الدور: {roleLabel}</p> : null}
          </div>
        </header>
        <div className="dash-grid">
          <Section title="قريباً">
            <EmptyState
              title="هذه الصفحة قيد الإعداد"
              subtitle="سيتم إضافة محتوى لوحة التحكم حسب الدور قريباً."
            />
          </Section>
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
