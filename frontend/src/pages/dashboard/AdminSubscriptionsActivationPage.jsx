import { Link, useLocation } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/subscriptionsResources";
import { isAdminStaffShell } from "../../lib/staff/staffDashboardPaths";

/**
 * Web-Admin-A2 — Manual subscription activation is obsolete.
 * Paid packages activate via Stripe webhook; STARTER trial starts from the freelancer
 * account after KYC + training. Routes kept for bookmarks/legacy deep links.
 */
export default function AdminSubscriptionsActivationPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const homeTo = isAdminStaffShell(pathname) ? "/dashboard/admin" : "/dashboard/super-admin";

  return (
    <DashboardShell data-testid="membership-activation-deprecated">
      <DashboardPageHeader
        title={t("subscriptions.activationPage.title")}
        subtitle={t("subscriptions.activationPage.subtitle")}
      />
      <DashboardSection>
        <p style={{ margin: "0 0 12px", lineHeight: 1.7, maxWidth: "42rem" }}>
          {t("subscriptions.activationPage.body1")}
        </p>
        <p style={{ margin: "0 0 16px", lineHeight: 1.7, maxWidth: "42rem", color: "#475569" }}>
          {t("subscriptions.activationPage.body2")}
        </p>
        <Link className="btn btn-primary" to={homeTo} data-testid="membership-activation-back-home">
          {t("subscriptions.activationPage.backToDashboard")}
        </Link>
      </DashboardSection>
    </DashboardShell>
  );
}
