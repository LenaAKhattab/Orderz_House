import PlansMobileHero from "./PlansMobileHero";
import PlansMobilePlans from "./PlansMobilePlans";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./plans-mobile-page.css";

/**
 * Radical mobile-only plans layout (≤640px). Desktop unchanged.
 * @param {{
 *   loading?: boolean;
 *   plans?: object[];
 *   error?: string;
 *   currentSubscription?: object | null;
 *   hasBlockingSubscription?: boolean;
 *   checkoutBusyPlanId?: string | number | null;
 *   onCta?: (plan: object) => void;
 * }} p
 */
export default function PlansMobilePage({
  loading = false,
  plans = [],
  error = "",
  currentSubscription = null,
  hasBlockingSubscription = false,
  checkoutBusyPlanId = null,
  onCta,
  pageTitle = null,
  pageSubtitle = null,
}) {
  const { t, dir } = useTranslation();

  return (
    <div className="plans-mobile-page" dir={dir}>
      <PlansMobileHero title={pageTitle} subtitle={pageSubtitle} />
      <PlansMobilePlans
        loading={loading}
        plans={plans}
        currentSubscription={currentSubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
        onCta={onCta}
      />

      {error ? (
        <p className="pm-feedback pm-feedback--error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && plans.length === 0 ? (
        <p className="pm-feedback" role="status">
          {t("common.empty.plans")}
        </p>
      ) : null}

      <p className="pm-footnote">{t("plans.mobile.footnote")}</p>
    </div>
  );
}
