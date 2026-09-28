import DashboardSection from "../../dashboard/DashboardSection";
import {
  MiniStatGrid,
  TopList,
  IntelligenceTrendCharts,
  buildOperationalCharts,
  SectionFailedBlock,
  SectionHighlights,
  CollapsibleBlock,
  formatInt,
} from "./superAdminHomeBundleUi";
import {
  SA_ROUTES,
  sectionFailed,
  getSectionData,
  metricItem,
  isPosthogUnavailable,
  isPosthogEventUnavailable,
} from "./superAdminHomeDataUtils";
import {
  summaryIntelligenceScope,
  ordersMetricScope,
  SCOPE_LABELS,
  periodScopeLabel,
} from "./dashboardMetricScope";
import { formatAverageCompletionDuration } from "../../../utils/courseLearningDuration";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./registerAnalysisLocale";

function SectionInlineNotice({ children, tone = "warn", className = "" }) {
  return (
    <p
      className={`sa-section-notice sa-section-notice--${tone} ${className}`.trim()}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </p>
  );
}

function fromSection(failed, value, { money = false, percent = false } = {}) {
  if (failed) return metricItem({ key: "_", label: "_", value: null, money, percent, failed: true });
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return metricItem({ key: "_", label: "_", value: null, money, percent });
  }
  return metricItem({ key: "_", label: "_", value, money, percent });
}

function IntelligenceSection({
  title,
  description,
  sectionKey,
  sectionErrors,
  loading,
  intelligence,
  onRetry,
  highlights,
  children,
  className = "sa-section--compact",
  actions,
}) {
  const failed = sectionFailed(sectionErrors, sectionKey);
  const data = getSectionData(intelligence, sectionKey);
  const pending = loading && !data && !failed;

  return (
    <DashboardSection title={title} description={description} className={className} actions={actions}>
      {failed ? (
        <SectionFailedBlock message={sectionErrors[sectionKey]} onRetry={onRetry} />
      ) : (
        <>
          {!pending ? highlights : null}
          {children}
        </>
      )}
    </DashboardSection>
  );
}

function formatPeakHour(hour, t) {
  if (hour == null || Number.isNaN(Number(hour))) return null;
  const h = ((Number(hour) % 24) + 24) % 24;
  if (h === 0) return t("analysis.time.midnight");
  if (h === 12) return t("analysis.time.noon");
  if (h < 12) return t("analysis.time.am", { hour: h });
  return t("analysis.time.pm", { hour: h - 12 });
}

function buildOrderHighlights(orders, t) {
  if (!orders?.totals) return [];
  const lines = [];
  const peak = orders.timing?.busiestHours?.[0];
  if (peak?.hour != null && Number(peak.orders_count ?? peak.ordersCount) > 0) {
    lines.push({
      key: "analysis.intelligence.orders.peak",
      params: {
        hour: formatPeakHour(peak.hour, t),
        count: formatInt(peak.orders_count ?? peak.ordersCount),
      },
    });
  }
  if (orders.totals.completionRate != null && Number(orders.totals.totalOrders) > 0) {
    lines.push({
      key: "analysis.intelligence.orders.completionRate",
      params: { rate: formatInt(orders.totals.completionRate) },
    });
  }
  if (Number(orders.totals.ordersWaitingTooLong) > 0) {
    lines.push({
      key: "analysis.intelligence.orders.overdue",
      params: { count: formatInt(orders.totals.ordersWaitingTooLong) },
    });
  }
  if (orders.categories?.slowestCategory?.name) {
    lines.push({
      key: "analysis.intelligence.orders.slowestCategory",
      params: { name: orders.categories.slowestCategory.name },
    });
  }
  return lines;
}

function buildSubscriptionHighlights(subscriptions) {
  if (!subscriptions?.totals) return [];
  const lines = [];
  const top = subscriptions.byPlan?.[0];
  if (top?.planTitle) {
    lines.push({
      key: "analysis.intelligence.subscriptions.topPlan",
      params: { plan: top.planTitle, count: formatInt(top.subscribers) },
    });
  }
  const country = subscriptions.countries?.[0];
  if (country?.name) {
    lines.push({
      key: "analysis.intelligence.subscriptions.topCountry",
      params: { name: country.name, count: formatInt(country.subscribers) },
    });
  }
  if (Number(subscriptions.totals.pendingActivation) > 0) {
    lines.push({
      key: "analysis.intelligence.subscriptions.pendingCount",
      params: { count: formatInt(subscriptions.totals.pendingActivation) },
    });
  }
  return lines;
}

function buildCourseHighlights(courses) {
  if (!courses?.totals) return [];
  const lines = [];
  if (courses.highlights?.mostJoinedCourse?.title) {
    lines.push({
      key: "analysis.intelligence.courses.mostJoined",
      params: { title: courses.highlights.mostJoinedCourse.title },
    });
  }
  if (courses.totals.finalExamCompletionRate != null) {
    lines.push({
      key: "analysis.intelligence.courses.examRate",
      params: { rate: formatInt(courses.totals.finalExamCompletionRate) },
    });
  }
  if (Number(courses.totals.stuckAbove80Percent) > 0) {
    lines.push({
      key: "analysis.intelligence.courses.stuckLearners",
      params: { count: formatInt(courses.totals.stuckAbove80Percent) },
    });
  }
  if (courses.totals.averageLearningDurationSeconds != null) {
    lines.push({
      key: "analysis.intelligence.courses.avgDuration",
      params: {
        duration: formatAverageCompletionDuration(courses.totals.averageLearningDurationSeconds),
      },
    });
  }
  return lines;
}

export default function SuperAdminHomeIntelligenceSections({
  intelligence,
  posthog,
  meta = {},
  loading,
  posthogLoading = false,
  sectionErrors = {},
  onRetry,
  onRequestIntelligence,
  onRequestPosthog,
  intelligenceError = "",
  period,
  periodLabel,
}) {
  const { t, locale } = useTranslation();
  const resolvedPeriodLabel =
    periodLabel || (period?.labelKey ? t(period.labelKey) : t("analysis.home.defaultPeriod"));
  const summary = intelligence?.summary?.data;
  const orders = intelligence?.orders?.data;
  const clients = intelligence?.clients?.data;
  const freelancers = intelligence?.freelancers?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const courses = intelligence?.courses?.data;
  const categories = intelligence?.categories?.data;
  const financial = intelligence?.financial?.data;
  const operationalCharts = buildOperationalCharts(intelligence, resolvedPeriodLabel, locale);

  const summaryFailed = sectionFailed(sectionErrors, "summary");
  const ordersFailed = sectionFailed(sectionErrors, "orders");
  const clientsFailed = sectionFailed(sectionErrors, "clients");
  const freelancersFailed = sectionFailed(sectionErrors, "freelancers");
  const subscriptionsFailed = sectionFailed(sectionErrors, "subscriptions");
  const coursesFailed = sectionFailed(sectionErrors, "courses");
  const financialFailed = sectionFailed(sectionErrors, "financial");

  const posthogOff = isPosthogUnavailable(posthog, meta);

  const detailSections = (
    <>
      <IntelligenceSection
        title={t("analysis.intelligence.platformMetrics.title")}
        sectionKey="summary"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
        className="sa-section--compact"
      >
        <p className="sa-section-scope-label help m-0 mb-2">
          {t("analysis.intelligence.platformMetrics.scope", { period: resolvedPeriodLabel })}
        </p>
        <MiniStatGrid
          loading={loading && !summary && !summaryFailed}
          dense
          showCardScope={false}
          items={[
            {
              ...fromSection(summaryFailed, summary?.totalUsers),
              key: "users",
              label: t("analysis.intelligence.summary.totalUsers"),
              scopeLabel: summaryIntelligenceScope("users", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalClients),
              key: "clients",
              label: t("analysis.intelligence.summary.totalClients"),
              scopeLabel: summaryIntelligenceScope("clients", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalFreelancers),
              key: "freelancers",
              label: t("analysis.intelligence.summary.totalFreelancers"),
              scopeLabel: summaryIntelligenceScope("freelancers", period),
            },
            {
              ...fromSection(summaryFailed, summary?.activeFreelancers),
              key: "activeFree",
              label: t("analysis.intelligence.summary.activeFreelancers"),
              scopeLabel: summaryIntelligenceScope("activeFree", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalOrders),
              key: "orders",
              label: t("analysis.intelligence.summary.totalOrders"),
              scopeLabel: summaryIntelligenceScope("orders", period),
            },
            {
              ...fromSection(summaryFailed, summary?.openOrders),
              key: "open",
              label: t("analysis.intelligence.summary.openOrders"),
              scopeLabel: summaryIntelligenceScope("open", period),
            },
            {
              ...fromSection(summaryFailed, summary?.completedOrders),
              key: "done",
              label: t("analysis.intelligence.summary.completedOrders"),
              scopeLabel: summaryIntelligenceScope("done", period),
            },
            {
              ...fromSection(summaryFailed, summary?.cancelledOrders),
              key: "cancel",
              label: t("analysis.intelligence.summary.cancelledOrders"),
              scopeLabel: summaryIntelligenceScope("cancel", period),
            },
            {
              ...fromSection(summaryFailed, summary?.activeSubscriptions),
              key: "activeSub",
              label: t("analysis.intelligence.summary.activeSubscriptions"),
              to: SA_ROUTES.subscriptions,
              scopeLabel: summaryIntelligenceScope("activeSub", period),
            },
            {
              ...fromSection(summaryFailed, summary?.pendingSubscriptions),
              key: "pendingSub",
              label: t("analysis.intelligence.summary.pendingSubscriptions"),
              to: SA_ROUTES.subscriptions,
              scopeLabel: summaryIntelligenceScope("pendingSub", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalRevenueJod, { money: true }),
              key: "revenue",
              label: t("analysis.intelligence.summary.orderRevenue"),
              scopeLabel: summaryIntelligenceScope("revenue", period),
            },
            {
              ...fromSection(summaryFailed, summary?.monthlyRevenueJod, { money: true }),
              key: "monthRev",
              label: t("analysis.intelligence.summary.monthRevenue"),
              scopeLabel: summaryIntelligenceScope("monthRev", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalCourses),
              key: "courses",
              label: t("analysis.intelligence.summary.courseCount"),
              to: SA_ROUTES.courses,
              scopeLabel: summaryIntelligenceScope("courses", period),
            },
            {
              ...fromSection(summaryFailed, summary?.enrolledStudents),
              key: "students",
              label: t("analysis.intelligence.summary.enrolledStudents"),
              to: SA_ROUTES.courses,
              scopeLabel: summaryIntelligenceScope("students", period),
            },
            {
              ...fromSection(summaryFailed, summary?.pendingFinancialClaims),
              key: "claims",
              label: t("analysis.intelligence.summary.pendingClaims"),
              to: SA_ROUTES.financialClaims,
              scopeLabel: summaryIntelligenceScope("claims", period),
            },
          ]}
        />
      </IntelligenceSection>

      <CollapsibleBlock
        title={t("analysis.intelligence.operationalTrends.title")}
        description={t("analysis.bundle.trendsOperationalDesc", { period: resolvedPeriodLabel ? ` — ${resolvedPeriodLabel}` : "" })}
        defaultOpen={false}
        className="sa-section--compact mb-4"
      >
        <IntelligenceTrendCharts
          charts={operationalCharts}
          loading={loading && !orders && !ordersFailed}
          periodLabel={resolvedPeriodLabel}
        />
      </CollapsibleBlock>

      <IntelligenceSection
        title={t("analysis.intelligence.orders.title")}
        sectionKey="orders"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
        highlights={<SectionHighlights items={buildOrderHighlights(orders, t)} />}
      >
        <MiniStatGrid
          loading={loading && !orders && !ordersFailed}
          dense
          items={[
            {
              ...fromSection(ordersFailed, orders?.totals?.totalOrders),
              key: "o1",
              label: t("analysis.intelligence.summary.totalOrders"),
              scopeLabel: ordersMetricScope("o1", period),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersToday),
              key: "o2",
              label: t("analysis.intelligence.orders.today"),
              scopeLabel: ordersMetricScope("o2", period),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersThisWeek),
              key: "o3",
              label: t("analysis.intelligence.orders.week"),
              scopeLabel: ordersMetricScope("o3", period),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersThisMonth),
              key: "o4",
              label: t("analysis.intelligence.orders.month"),
              scopeLabel: ordersMetricScope("o4", period),
            },
            { ...fromSection(ordersFailed, orders?.totals?.completedOrders), key: "o5", label: t("analysis.intelligence.orders.completed") },
            { ...fromSection(ordersFailed, orders?.totals?.pendingOrders), key: "o6", label: t("analysis.intelligence.orders.pending") },
            { ...fromSection(ordersFailed, orders?.totals?.cancelledOrders), key: "o7", label: t("analysis.intelligence.orders.cancelled") },
            { ...fromSection(ordersFailed, orders?.totals?.fixedOrders), key: "o8", label: t("analysis.intelligence.orders.fixed") },
            { ...fromSection(ordersFailed, orders?.totals?.biddingOrders), key: "o9", label: t("analysis.intelligence.orders.bidding") },
            {
              ...fromSection(ordersFailed, orders?.totals?.completionRate, { percent: true }),
              key: "o10",
              label: t("analysis.intelligence.orders.completionPct"),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.cancellationRate, { percent: true }),
              key: "o11",
              label: t("analysis.intelligence.orders.cancellationPct"),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.averageOrderValueJod, { money: true }),
              key: "o12",
              label: t("analysis.intelligence.orders.avgValue"),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersWaitingTooLong),
              key: "o13",
              label: t("analysis.intelligence.orders.overdueLabel"),
              scopeLabel: ordersMetricScope("o13", period),
            },
          ]}
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 sa-subgrid-tight">
          <div>
            <p className="help mb-2">{t("analysis.intelligence.orders.topCategories")}</p>
            <TopList rows={orders?.categories?.breakdown || []} valueLabel={t("analysis.intelligence.orders.orderCount")} valueKey="totalOrders" labelKey="name" />
          </div>
          <div>
            <p className="help mb-2">{t("analysis.intelligence.orders.valueRanges")}</p>
            <TopList
              rows={[
                { name: t("analysis.intelligence.orders.rangeUnder50"), total: orders?.orderValueRanges?.lessThan50 },
                { name: t("analysis.intelligence.orders.range50_199"), total: orders?.orderValueRanges?.from50To199 },
                { name: t("analysis.intelligence.orders.range200_499"), total: orders?.orderValueRanges?.from200To499 },
                { name: t("analysis.intelligence.orders.range500plus"), total: orders?.orderValueRanges?.aboveOrEqual500 },
              ].filter((r) => r.total != null)}
              valueLabel={t("analysis.intelligence.orders.count")}
              valueKey="total"
              labelKey="name"
            />
          </div>
          <div>
            <p className="help mb-2">{t("analysis.intelligence.orders.timing")}</p>
            <p className="help mb-1">
              {t("analysis.intelligence.orders.createToTake")}: {orders?.timing?.avgHoursCreateToTake ?? "—"}
            </p>
            <p className="help m-0">
              {t("analysis.intelligence.orders.takeToComplete")}: {orders?.timing?.avgHoursTakeToComplete ?? "—"}
            </p>
          </div>
        </div>
      </IntelligenceSection>

      <IntelligenceSection
        title={t("analysis.intelligence.clients.title")}
        sectionKey="clients"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
      >
        <MiniStatGrid
          loading={loading && !clients && !clientsFailed}
          dense
          items={[
            { ...fromSection(clientsFailed, clients?.totals?.totalClients), key: "c1", label: t("analysis.intelligence.clients.total") },
            { ...fromSection(clientsFailed, clients?.totals?.newClientsThisWeek), key: "c2", label: t("analysis.intelligence.clients.newWeek") },
            { ...fromSection(clientsFailed, clients?.totals?.newClientsThisMonth), key: "c3", label: t("analysis.intelligence.clients.newMonth") },
            { ...fromSection(clientsFailed, clients?.totals?.returningClients), key: "c4", label: t("analysis.intelligence.clients.returning") },
            { ...fromSection(clientsFailed, clients?.totals?.inactiveClients), key: "c5", label: t("analysis.intelligence.clients.inactive") },
            {
              ...fromSection(clientsFailed, clients?.totals?.signupToFirstOrderRate, { percent: true }),
              key: "c6",
              label: t("analysis.intelligence.clients.signupConversion"),
            },
          ]}
        />
        <p className="help mb-2">{t("analysis.intelligence.clients.topSpenders")}</p>
        <TopList rows={clients?.topClients || []} valueLabel={t("analysis.intelligence.clients.spend")} valueKey="spendJod" labelKey="fullName" money />
      </IntelligenceSection>

      <IntelligenceSection
        title={t("analysis.intelligence.freelancers.title")}
        sectionKey="freelancers"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
      >
        <MiniStatGrid
          loading={loading && !freelancers && !freelancersFailed}
          dense
          items={[
            { ...fromSection(freelancersFailed, freelancers?.totals?.totalFreelancers), key: "f1", label: t("analysis.intelligence.freelancers.total") },
            { ...fromSection(freelancersFailed, freelancers?.totals?.activeFreelancers), key: "f2", label: t("analysis.intelligence.freelancers.active") },
            { ...fromSection(freelancersFailed, freelancers?.totals?.inactiveFreelancers), key: "f3", label: t("analysis.intelligence.freelancers.inactive") },
            { ...fromSection(freelancersFailed, freelancers?.totals?.subscribedFreelancers), key: "f4", label: t("analysis.intelligence.freelancers.subscribed"), to: SA_ROUTES.subscriptions },
            { ...fromSection(freelancersFailed, freelancers?.totals?.nonSubscribedFreelancers), key: "f5", label: t("analysis.intelligence.freelancers.noSubscription") },
            {
              ...fromSection(freelancersFailed, freelancers?.totals?.inactiveAfterSubscription),
              key: "f6",
              label: t("analysis.intelligence.freelancers.inactiveAfterSub"),
              to: SA_ROUTES.subscriptions,
            },
          ]}
        />
        <p className="help mb-2">{t("analysis.intelligence.freelancers.topPerformers")}</p>
        <TopList rows={freelancers?.topPerformers || []} valueLabel={t("analysis.intelligence.freelancers.completed")} valueKey="completedOrders" labelKey="fullName" />
      </IntelligenceSection>

      <IntelligenceSection
        title={t("analysis.intelligence.subscriptions.title")}
        sectionKey="subscriptions"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
        highlights={<SectionHighlights items={buildSubscriptionHighlights(subscriptions)} />}
      >
        <MiniStatGrid
          loading={loading && !subscriptions && !subscriptionsFailed}
          dense
          items={[
            {
              ...fromSection(subscriptionsFailed, subscriptions?.totals?.activeSubscriptions),
              key: "s1",
              label: t("analysis.intelligence.summary.activeSubscriptions"),
              to: SA_ROUTES.subscriptions,
            },
            {
              ...fromSection(subscriptionsFailed, subscriptions?.totals?.pendingActivation),
              key: "s2",
              label: t("analysis.intelligence.subscriptions.pendingActivation"),
              to: SA_ROUTES.subscriptions,
            },
            { ...fromSection(subscriptionsFailed, subscriptions?.totals?.pendingPayment), key: "s3", label: t("analysis.intelligence.subscriptions.pendingPayment"), to: SA_ROUTES.subscriptions },
            { ...fromSection(subscriptionsFailed, subscriptions?.totals?.failedPayments), key: "s4", label: t("analysis.intelligence.subscriptions.failedPayment"), to: SA_ROUTES.subscriptions },
          ]}
        />
        <div className="grid gap-3 md:grid-cols-2 sa-subgrid-tight">
          <div>
            <p className="help mb-2">{t("analysis.intelligence.subscriptions.byPlan")}</p>
            <TopList rows={subscriptions?.byPlan || []} valueLabel={t("analysis.intelligence.subscriptions.subscribers")} valueKey="subscribers" labelKey="planTitle" />
          </div>
          <div>
            <p className="help mb-2">{t("analysis.intelligence.subscriptions.topCountries")}</p>
            <TopList rows={subscriptions?.countries || []} valueLabel={t("analysis.intelligence.subscriptions.subscribers")} valueKey="subscribers" labelKey="name" />
          </div>
        </div>
      </IntelligenceSection>

      <IntelligenceSection
        title={t("analysis.intelligence.courses.title")}
        sectionKey="courses"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
        highlights={<SectionHighlights items={buildCourseHighlights(courses)} />}
      >
        <MiniStatGrid
          loading={loading && !courses && !coursesFailed}
          dense
          items={[
            { ...fromSection(coursesFailed, courses?.totals?.totalCourses), key: "cr1", label: t("analysis.intelligence.courses.total"), to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.publishedCourses), key: "cr2", label: t("analysis.intelligence.courses.published"), to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.draftCourses), key: "cr3", label: t("analysis.intelligence.courses.drafts"), to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.totalLessons), key: "cr4", label: t("analysis.intelligence.courses.lessons"), to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.studentsEnrolled), key: "cr5", label: t("analysis.intelligence.courses.students"), to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.stuckAbove80Percent), key: "cr6", label: t("analysis.intelligence.courses.stuck80"), to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.finalExamSubmissions), key: "cr7", label: t("analysis.intelligence.courses.examSubmissions") },
            {
              ...fromSection(coursesFailed, courses?.totals?.finalExamCompletionRate, { percent: true }),
              key: "cr8",
              label: t("analysis.intelligence.courses.examCompletion"),
            },
            {
              key: "cr9",
              label: t("analysis.intelligence.courses.avgLearning"),
              value: coursesFailed
                ? null
                : formatAverageCompletionDuration(courses?.totals?.averageLearningDurationSeconds),
              failed: coursesFailed,
            },
          ]}
        />
        <TopList rows={courses?.topCourses || []} valueLabel={t("analysis.intelligence.courses.enrolled")} valueKey="enrolled" labelKey="title" />
      </IntelligenceSection>

      <IntelligenceSection
        title={t("analysis.intelligence.categories.title")}
        sectionKey="categories"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
      >
        <div className="grid gap-3 md:grid-cols-2 sa-subgrid-tight">
          <div>
            <p className="help mb-2">{t("analysis.intelligence.categories.mostRequested")}</p>
            <TopList rows={categories?.mostRequested || []} valueLabel={t("analysis.intelligence.categories.order")} valueKey="totalOrders" labelKey="name" />
          </div>
          <div>
            <p className="help mb-2">{t("analysis.intelligence.categories.shortage")}</p>
            <TopList
              rows={categories?.potentialShortage || []}
              valueLabel={t("analysis.intelligence.categories.order")}
              valueKey="demandOrders"
              labelKey="name"
              emptyLabel={t("analysis.intelligence.categories.noShortage")}
            />
          </div>
        </div>
      </IntelligenceSection>

      <IntelligenceSection
        title={t("analysis.intelligence.financial.title")}
        sectionKey="financial"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
      >
        <MiniStatGrid
          loading={loading && !financial && !financialFailed}
          dense
          items={[
            {
              ...fromSection(financialFailed, financial?.totals?.pendingClaims),
              key: "fi1",
              label: t("analysis.intelligence.financial.pending"),
              to: SA_ROUTES.financialClaims,
            },
            { ...fromSection(financialFailed, financial?.totals?.approvedClaims), key: "fi2", label: t("analysis.intelligence.financial.approved"), to: SA_ROUTES.financialClaims },
            { ...fromSection(financialFailed, financial?.totals?.paidClaims), key: "fi3", label: t("analysis.intelligence.financial.paid"), to: SA_ROUTES.financialClaims },
            { ...fromSection(financialFailed, financial?.totals?.rejectedClaims), key: "fi4", label: t("analysis.intelligence.financial.rejected"), to: SA_ROUTES.financialClaims },
            { ...fromSection(financialFailed, financial?.totals?.totalClaimAmountJod, { money: true }), key: "fi5", label: t("analysis.intelligence.financial.totalValue") },
            { ...fromSection(financialFailed, financial?.totals?.averageClaimAmountJod, { money: true }), key: "fi6", label: t("analysis.intelligence.financial.avgClaim") },
            {
              ...fromSection(financialFailed, financial?.totals?.claimsWaitingTooLong),
              key: "fi7",
              label: t("analysis.intelligence.financial.overdue7d"),
              to: SA_ROUTES.financialClaims,
            },
          ]}
        />
      </IntelligenceSection>

      <DashboardSection title={t("analysis.intelligence.activity.title")} className="sa-section--compact sa-section--muted">
        <p className="sa-section-scope-label help m-0 mb-2">{t(periodScopeLabel(period))} — PostHog</p>
        {posthogOff ? (
          <SectionInlineNotice tone="warn">
            {meta?.posthogError || posthog?.meta?.posthogError || t("analysis.bundle.posthogUnavailable")}
          </SectionInlineNotice>
        ) : null}
        <MiniStatGrid
          loading={posthogLoading && !posthog && !posthogOff}
          dense
          showCardScope={false}
          items={[
            {
              key: "a1",
              label: t("analysis.intelligence.activity.visitorsToday"),
              scopeLabel: SCOPE_LABELS.realtime,
              ...fromSection(posthogOff, posthog?.kpis?.visitorsToday),
            },
            {
              key: "a2",
              label: t("analysis.intelligence.activity.activeToday"),
              scopeLabel: SCOPE_LABELS.realtime,
              ...fromSection(posthogOff, posthog?.kpis?.activeUsersToday),
            },
            {
              key: "a3",
              label: t("analysis.intelligence.activity.ordersTodayAnalytics"),
              scopeLabel: SCOPE_LABELS.today,
              ...fromSection(posthogOff, posthog?.kpis?.ordersToday),
            },
            {
              key: "a4",
              label: t("analysis.intelligence.activity.signups"),
              scopeLabel: periodScopeLabel(period),
              ...fromSection(
                isPosthogEventUnavailable(posthog, meta, "signup_completed"),
                posthog?.events?.signup_completed,
              ),
            },
            {
              key: "a5",
              label: t("analysis.intelligence.activity.logins"),
              scopeLabel: periodScopeLabel(period),
              ...fromSection(
                isPosthogEventUnavailable(posthog, meta, "user_logged_in"),
                posthog?.events?.user_logged_in,
              ),
            },
            {
              key: "a6",
              label: t("analysis.intelligence.activity.purchasedSubs"),
              scopeLabel: periodScopeLabel(period),
              ...fromSection(
                isPosthogEventUnavailable(posthog, meta, "subscription_purchased"),
                posthog?.events?.subscription_purchased,
              ),
            },
          ]}
        />
      </DashboardSection>
    </>
  );

  const handleDetailOpen = (open) => {
    if (!open) return;
    onRequestIntelligence?.();
    onRequestPosthog?.();
  };

  return (
    <CollapsibleBlock
      title={t("analysis.bundle.detailAnalytics")}
      description={t("analysis.bundle.detailAnalyticsDesc")}
      defaultOpen={false}
      className="sa-section--compact sa-section--intel-detail sa-collapsible--premium mb-4"
      onOpenChange={handleDetailOpen}
    >
      {loading && !intelligence?.summary?.data ? (
        <p className="help m-0 mb-3 text-slate-500">{t("analysis.bundle.loadingData")}</p>
      ) : null}
      {intelligenceError && !intelligence?.summary?.data ? (
        <SectionInlineNotice tone="warn">
          {intelligenceError}{" "}
          <button type="button" className="sa-section-notice__btn" onClick={onRetry}>
            {t("analysis.labels.retry")}
          </button>
        </SectionInlineNotice>
      ) : null}
      {detailSections}
    </CollapsibleBlock>
  );
}
