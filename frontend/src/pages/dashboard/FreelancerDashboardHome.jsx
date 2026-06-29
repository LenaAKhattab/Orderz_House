import { useCallback, useEffect, useMemo, useState } from "react";

import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";

import DashboardWelcomeHero from "../../components/dashboard/hub/DashboardWelcomeHero";

import DashboardWelcomeSkeleton from "../../components/dashboard/hub/DashboardWelcomeSkeleton";

import DashboardActionBanner from "../../components/dashboard/hub/DashboardActionBanner";

import FreelancerAccountReadinessNotice from "../../components/dashboard/hub/FreelancerAccountReadinessNotice";

import DashboardInsightsSection from "../../components/dashboard/hub/DashboardInsightsSection";

import DashboardHubSkeletonCards from "../../components/dashboard/hub/DashboardHubSkeletonCards";

import {

  IconBriefcase,

  IconShieldCheck,

  IconStar,

  IconWallet,

} from "../../components/dashboard/hub/icons/DashboardIcons";

import { useToast } from "../../components/ui/toastContext";

import { useTranslation } from "../../i18n/LanguageProvider";

import { getLocalizedTrustLevelLabel } from "../../utils/freelancerTrustLevelUi";

import { enrichFreelancerDashboardItem, resolveFreelancerDashboardItem } from "../../lib/i18n/resolveFreelancerDashboardItem";

import "../../styles/dashboardHub.css";

import { getFreelancerDashboardSummaryRequest } from "../../services/api";

import {

  buildCoursesActivationBannerActions,

  computeActiveWorkloadCount,

  deriveFreelancerCoursesFocus,

  formatMoneyJod,

  insightsForWelcomeTip,

  prioritizeCoursesInsights,

} from "../../utils/freelancerDashboardData";

import { setFreelancerCoursesFocusFromSummary } from "../../utils/freelancerCoursesFocusCache";

import {

  filterInsightsForAccountReadiness,

  filterPendingActionsForAccountReadiness,

  resolveFreelancerAccountReadiness,

} from "../../utils/freelancerAccountReadiness";

import { trackEvent } from "../../services/analytics";



const TRUST_LEVEL_NUM = {

  beginner: 1,

  active: 2,

  professional: 3,

  trusted: 4,

  expert: 5,

};



function trustLevelNumber(reputation) {

  if (reputation?.trustLevel && TRUST_LEVEL_NUM[reputation.trustLevel]) {

    return TRUST_LEVEL_NUM[reputation.trustLevel];

  }

  const score = Number(reputation?.trustScore) || 0;

  if (score >= 80) return 5;

  if (score >= 60) return 4;

  if (score >= 40) return 3;

  if (score >= 20) return 2;

  return 1;

}



function buildWelcomeMetrics({ reputation, earningsSummary, earningsLoadState, activeWorkload, reviews, t, locale }) {

  const trustLabel = getLocalizedTrustLevelLabel(reputation, locale, t);

  const trustSub = t("freelancerDashboard.stats.trustLevelNumber", { level: trustLevelNumber(reputation) });

  const currency = t("freelancerDashboard.common.currencyJod");



  let earningsValue = `0 ${currency}`;

  let earningsSub = t("freelancerDashboard.stats.fromClaims");

  if (earningsLoadState === "error") {

    earningsValue = t("freelancerDashboard.common.unavailable");

    earningsSub = t("freelancerDashboard.common.loadFailed");

  } else {

    const paid = Number(earningsSummary?.paidTotalJod);

    if (Number.isFinite(paid) && paid > 0) {

      earningsValue = `${formatMoneyJod(paid)} ${currency}`;

      earningsSub = t("freelancerDashboard.stats.paidTotal");

    }

  }



  let ratingValue = t("freelancerDashboard.stats.noRatingYet");

  let ratingSub = t("freelancerDashboard.stats.outOfFive");

  if (reviews?.loadState === "error") {

    ratingValue = t("freelancerDashboard.common.unavailable");

  } else if (reviews?.totalReviews > 0 && reviews?.averageRating != null) {

    ratingValue = Number(reviews.averageRating).toFixed(1);

    ratingSub = `${t("freelancerDashboard.stats.outOfFive")} · ${t("freelancerDashboard.stats.reviewCount", { count: reviews.totalReviews })}`;

  }



  return [

    {

      id: "trust",

      label: t("freelancerDashboard.stats.trustLevel"),

      value: trustLabel,

      sublabel: trustSub,

      icon: IconShieldCheck,

      tone: "purple",

    },

    {

      id: "earnings",

      label: t("freelancerDashboard.stats.totalEarnings"),

      value: earningsValue,

      sublabel: earningsSub,

      icon: IconWallet,

      tone: "green",

    },

    {

      id: "active",

      label: t("freelancerDashboard.stats.activeOrders"),

      value: String(activeWorkload ?? 0),

      sublabel: t("freelancerDashboard.stats.activeOrdersSub"),

      icon: IconBriefcase,

      tone: "blue",

    },

    {

      id: "rating",

      label: t("freelancerDashboard.stats.overallRating"),

      value: ratingValue,

      sublabel: ratingSub,

      icon: IconStar,

      tone: "amber",

    },

  ];

}



function buildWelcomeTip(insights, t, locale) {

  const alt = (insights || []).find((item) => item?.type !== "profile");

  if (!alt) return null;



  return {

    headline:

      resolveFreelancerDashboardItem(alt, "title", t, locale) ||

      t("freelancerDashboard.tip.defaultHeadline"),

    description:

      resolveFreelancerDashboardItem(alt, "description", t, locale) ||

      t("freelancerDashboard.tip.defaultDescription"),

    progress: null,

    actionUrl: alt.actionUrl || "/dashboard/freelancer/orders",

    actionLabel:

      resolveFreelancerDashboardItem(alt, "actionLabel", t, locale) ||

      t("freelancerDashboard.tip.browseOrders"),

  };

}



export default function FreelancerDashboardHome({ user }) {

  const { push } = useToast();

  const { t, locale, isLanguageSwitching } = useTranslation();

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [summary, setSummary] = useState(null);



  const load = useCallback(async () => {

    setError("");

    try {

      const res = await getFreelancerDashboardSummaryRequest();

      const data = res?.data ?? res;

      setSummary(data || null);

      setFreelancerCoursesFocusFromSummary(data || null);

    } catch (e) {

      setSummary(null);

      const msg = e?.response?.data?.message || e?.message || t("freelancerDashboard.header.loadErrorDefault");

      setError(msg);

      push({ type: "error", title: t("freelancerDashboard.header.loadErrorTitle"), message: msg });

    }

  }, [push, t]);



  useEffect(() => {

    let cancelled = false;

    (async () => {

      setLoading(true);

      try {

        await load();

      } finally {

        if (!cancelled) setLoading(false);

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [load]);



  const subscription = summary?.subscription ?? null;

  const orderCounts = useMemo(() => summary?.orders?.counts ?? {}, [summary?.orders?.counts]);

  const pendingActions = summary?.pendingActions ?? [];

  const insights = useMemo(

    () => (summary?.insights ?? []).filter((item) => item?.type !== "profile"),

    [summary?.insights],

  );

  const reputation = summary?.reputation ?? null;

  const reviews = summary?.reviews ?? null;



  const earningsLoadState = summary?.earnings?.loadState === "error" ? "error" : summary ? "ok" : "pending";

  const earningsSummary = useMemo(() => {

    if (!summary?.earnings || earningsLoadState !== "ok") return null;

    const { error: _e, ...rest } = summary.earnings;

    return rest;

  }, [summary?.earnings, earningsLoadState]);



  const activeWorkload = useMemo(

    () => summary?.workload?.activeWorkload ?? computeActiveWorkloadCount(orderCounts),

    [summary?.workload?.activeWorkload, orderCounts],

  );



  useEffect(() => {

    const userId = user?.id != null ? String(user.id) : "";

    const startDate = String(subscription?.actualStartDate || "").trim();

    const status = String(subscription?.status || "");

    if (!userId || !startDate || status !== "active") return;

    const storageKey = `oh_ga_first_subscription_started_${userId}_${startDate}`;

    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(storageKey)) return;

    trackEvent("first_subscription_started", { subscription_start_date: startDate });

    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(storageKey, "1");

  }, [subscription?.actualStartDate, subscription?.status, user?.id]);



  const welcomeName = useMemo(() => String(user?.firstName || "").trim() || null, [user]);



  const metrics = useMemo(

    () =>

      buildWelcomeMetrics({

        reputation,

        earningsSummary,

        earningsLoadState,

        activeWorkload,

        reviews,

        t,

        locale,

      }),

    [reputation, earningsSummary, earningsLoadState, activeWorkload, reviews, t, locale],

  );



  const coursesFocus = useMemo(() => deriveFreelancerCoursesFocus(summary), [summary]);



  const accountReadinessState = useMemo(

    () => resolveFreelancerAccountReadiness(summary),

    [summary],

  );



  const coursesSection =

    summary?.courses?.loadState === "ok" ? summary.courses : null;



  const tip = useMemo(

    () =>

      buildWelcomeTip(

        insightsForWelcomeTip(

          filterInsightsForAccountReadiness(insights, accountReadinessState).map((item) =>
            enrichFreelancerDashboardItem(item, summary, locale, t),
          ),

          coursesFocus.show &&

            accountReadinessState !== "courses_incomplete" &&

            accountReadinessState !== "courses_complete_pending_approval",

        ),

        t,

        locale,

      ),

    [insights, coursesFocus.show, accountReadinessState, t, locale, summary],

  );



  const displayPendingActions = useMemo(() => {
    const withCourses = buildCoursesActivationBannerActions(summary, pendingActions, t, locale);
    return filterPendingActionsForAccountReadiness(withCourses, accountReadinessState).map((item) =>
      enrichFreelancerDashboardItem(item, summary, locale, t),
    );
  }, [summary, pendingActions, accountReadinessState, t, locale]);

  const displayInsights = useMemo(
    () =>
      prioritizeCoursesInsights(
        filterInsightsForAccountReadiness(insights, accountReadinessState).map((item) =>
          enrichFreelancerDashboardItem(item, summary, locale, t),
        ),
        coursesFocus.show &&
          accountReadinessState !== "courses_incomplete" &&
          accountReadinessState !== "courses_complete_pending_approval",
        t,
      ),
    [insights, coursesFocus.show, accountReadinessState, summary, locale, t],
  );



  const showAccountReadinessNotice =

    accountReadinessState === "courses_incomplete" ||

    accountReadinessState === "courses_complete_pending_approval";



  if (loading || isLanguageSwitching) {

    return (

      <DashboardHubPage>

        <DashboardWelcomeSkeleton />

        <div className="fdash-skel" style={{ height: 56, borderRadius: 18 }} />

        <DashboardHubSkeletonCards count={3} />

      </DashboardHubPage>

    );

  }



  if (error && !summary) {

    return (

      <DashboardHubPage>

        <div className="fdash-alert">

          <p style={{ margin: 0 }}>{error}</p>

          <button type="button" className="fdash-toolbar__btn" onClick={() => void load()}>

            {t("freelancerDashboard.header.retry")}

          </button>

        </div>

      </DashboardHubPage>

    );

  }



  return (

    <DashboardHubPage>

      <DashboardWelcomeHero welcomeName={welcomeName} metrics={metrics} tip={tip} showCoursesStartCard />

      {showAccountReadinessNotice ? (

        <FreelancerAccountReadinessNotice

          readinessState={accountReadinessState}

          coursesSection={coursesSection}

        />

      ) : null}

      <DashboardActionBanner actions={displayPendingActions} />

      {displayInsights.length > 0 ? <DashboardInsightsSection insights={displayInsights} /> : null}

    </DashboardHubPage>

  );

}

