import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import DashboardWelcomeHero from "../../components/dashboard/hub/DashboardWelcomeHero";
import DashboardWelcomeSkeleton from "../../components/dashboard/hub/DashboardWelcomeSkeleton";
import DashboardActionBanner from "../../components/dashboard/hub/DashboardActionBanner";
import DashboardInsightsSection from "../../components/dashboard/hub/DashboardInsightsSection";
import DashboardHubSkeletonCards from "../../components/dashboard/hub/DashboardHubSkeletonCards";
import {
  IconBriefcase,
  IconShieldCheck,
  IconStar,
  IconWallet,
} from "../../components/dashboard/hub/icons/DashboardIcons";
import { useToast } from "../../components/ui/toastContext";
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

function buildWelcomeMetrics({ reputation, earningsSummary, earningsLoadState, activeWorkload, reviews }) {
  const trustLabel = reputation?.trustLevelAr || "مبتدئ";
  const trustSub = `مستوى ${trustLevelNumber(reputation)}`;

  let earningsValue = "0 د.أ";
  let earningsSub = "من المطالبات المالية";
  if (earningsLoadState === "error") {
    earningsValue = "غير متاح";
    earningsSub = "تعذر التحميل";
  } else {
    const paid = Number(earningsSummary?.paidTotalJod);
    if (Number.isFinite(paid) && paid > 0) {
      earningsValue = `${formatMoneyJod(paid)} د.أ`;
      earningsSub = "إجمالي مدفوع";
    }
  }

  let ratingValue = "لا يوجد بعد";
  let ratingSub = "من 5";
  if (reviews?.loadState === "error") {
    ratingValue = "غير متاح";
  } else if (reviews?.totalReviews > 0 && reviews?.averageRating != null) {
    ratingValue = Number(reviews.averageRating).toFixed(1);
    ratingSub = `من 5 · ${reviews.totalReviews} تقييم`;
  }

  return [
    {
      id: "trust",
      label: "مستوى الثقة",
      value: trustLabel,
      sublabel: trustSub,
      icon: IconShieldCheck,
      tone: "purple",
    },
    {
      id: "earnings",
      label: "إجمالي الأرباح",
      value: earningsValue,
      sublabel: earningsSub,
      icon: IconWallet,
      tone: "green",
    },
    {
      id: "active",
      label: "الطلبات النشطة",
      value: String(activeWorkload ?? 0),
      sublabel: "طلبات جارية",
      icon: IconBriefcase,
      tone: "blue",
    },
    {
      id: "rating",
      label: "التقييم العام",
      value: ratingValue,
      sublabel: ratingSub,
      icon: IconStar,
      tone: "amber",
    },
  ];
}

function buildWelcomeTip(insights) {
  const alt = (insights || []).find((item) => item?.type !== "profile");
  if (!alt) return null;

  return {
    headline: alt.titleAr || "استمر في التميز",
    description:
      alt.descriptionAr || "ركّز على جودة التسليم وبناء تقييمات قوية من العملاء.",
    progress: null,
    actionUrl: alt.actionUrl || "/dashboard/freelancer/orders",
    actionLabel: alt.actionLabel || "تصفح الطلبات",
  };
}

export default function FreelancerDashboardHome({ user }) {
  const { push } = useToast();
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
      const msg = e?.response?.data?.message || e?.message || "تعذر تحميل لوحة التحكم.";
      setError(msg);
      push({ type: "error", title: "تعذر تحميل لوحة التحكم", message: msg });
    }
  }, [push]);

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
      }),
    [reputation, earningsSummary, earningsLoadState, activeWorkload, reviews],
  );

  const coursesFocus = useMemo(() => deriveFreelancerCoursesFocus(summary), [summary]);

  const tip = useMemo(
    () => buildWelcomeTip(insightsForWelcomeTip(insights, coursesFocus.show)),
    [insights, coursesFocus.show],
  );

  const displayPendingActions = useMemo(
    () => buildCoursesActivationBannerActions(summary, pendingActions),
    [summary, pendingActions],
  );

  const displayInsights = useMemo(
    () => prioritizeCoursesInsights(insights, coursesFocus.show),
    [insights, coursesFocus.show],
  );

  if (loading) {
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
            إعادة المحاولة
          </button>
        </div>
      </DashboardHubPage>
    );
  }

  return (
    <DashboardHubPage>
      <DashboardWelcomeHero welcomeName={welcomeName} metrics={metrics} tip={tip} />
      <DashboardActionBanner actions={displayPendingActions} />
      {displayInsights.length > 0 ? <DashboardInsightsSection insights={displayInsights} /> : null}
    </DashboardHubPage>
  );
}
