import { NavLink, useLocation } from "react-router-dom";
import LazyRouteOutlet from "../../../components/layout/LazyRouteOutlet";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import { trainingOrdersBreadcrumbs } from "../../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../../i18n/LanguageProvider";
import TrainingOrdersStatusBar from "./TrainingOrdersStatusBar";
import "./trainingOrdersAdmin.css";

function trainingSectionLabelKey(pathname) {
  if (pathname.includes("/applications")) return "dashboard.breadcrumbs.trainingApplications";
  if (pathname.includes("/templates")) return "dashboard.breadcrumbs.trainingPool";
  if (pathname.includes("/rounds")) return "dashboard.breadcrumbs.trainingRounds";
  if (pathname.includes("/settings")) return "dashboard.breadcrumbs.trainingSettings";
  return "dashboard.breadcrumbs.trainingOverview";
}

export default function TrainingOrdersAdminShell() {
  const { t, dir, locale } = useTranslation();
  const { pathname } = useLocation();
  const sectionLabelKey = trainingSectionLabelKey(pathname);
  const tabs = [
    { to: "/dashboard/super-admin/training-orders", label: t("trainingOrders.shell.overview"), end: true },
    { to: "/dashboard/super-admin/training-orders/rounds", label: t("trainingOrders.shell.rounds"), end: false },
    { to: "/dashboard/super-admin/training-orders/templates", label: t("trainingOrders.shell.templates"), end: false },
    { to: "/dashboard/super-admin/training-orders/applications", label: t("trainingOrders.shell.applications"), end: false },
    { to: "/dashboard/super-admin/training-orders/settings", label: t("trainingOrders.shell.settings"), end: false },
  ];

  return (
    <DashboardShell className="oh-training-hub">
      <div className="oh-training-hub__inner" dir={dir} lang={locale}>
        <DashboardPageHeader
          eyebrow={t("trainingOrders.shell.eyebrow")}
          title={t("trainingOrders.shell.title")}
          description={t("trainingOrders.shell.description")}
          breadcrumbs={trainingOrdersBreadcrumbs(sectionLabelKey)}
        />

        <nav aria-label={t("trainingOrders.shell.tabsAria")}>
          <div className="dash-ui-tabs oh-training-hub__tabs" role="presentation">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={Boolean(tab.end)}
                className={({ isActive }) =>
                  `dash-ui-tab oh-training-hub__tab${isActive ? " dash-ui-tab--selected oh-training-hub__tab--active" : ""}`.trim()
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <TrainingOrdersStatusBar />

        <LazyRouteOutlet />
      </div>
    </DashboardShell>
  );
}
