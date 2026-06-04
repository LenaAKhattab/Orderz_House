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

function formatPeakHour(hour) {
  if (hour == null || Number.isNaN(Number(hour))) return null;
  const h = ((Number(hour) % 24) + 24) % 24;
  if (h === 0) return "12 صباحاً";
  if (h === 12) return "12 ظهراً";
  if (h < 12) return `${h} صباحاً`;
  return `${h - 12} مساءً`;
}

function buildOrderHighlights(orders) {
  if (!orders?.totals) return [];
  const lines = [];
  const peak = orders.timing?.busiestHours?.[0];
  if (peak?.hour != null && Number(peak.orders_count ?? peak.ordersCount) > 0) {
    lines.push(
      `ذروة الطلب: ${formatPeakHour(peak.hour)} (${formatInt(peak.orders_count ?? peak.ordersCount)} طلب).`,
    );
  }
  if (orders.totals.completionRate != null && Number(orders.totals.totalOrders) > 0) {
    lines.push(`معدل إكمال الطلبات: ${formatInt(orders.totals.completionRate)}٪.`);
  }
  if (Number(orders.totals.ordersWaitingTooLong) > 0) {
    lines.push(`${formatInt(orders.totals.ordersWaitingTooLong)} طلب متأخر (+72 ساعة).`);
  }
  if (orders.categories?.slowestCategory?.name) {
    lines.push(`أبطأ فئة: ${orders.categories.slowestCategory.name}.`);
  }
  return lines;
}

function buildSubscriptionHighlights(subscriptions) {
  if (!subscriptions?.totals) return [];
  const lines = [];
  const top = subscriptions.byPlan?.[0];
  if (top?.planTitle) lines.push(`الباقة الأكثر: «${top.planTitle}» (${formatInt(top.subscribers)}).`);
  const country = subscriptions.countries?.[0];
  if (country?.name) lines.push(`أعلى دولة: ${country.name} (${formatInt(country.subscribers)}).`);
  if (Number(subscriptions.totals.pendingActivation) > 0) {
    lines.push(`${formatInt(subscriptions.totals.pendingActivation)} بانتظار التفعيل.`);
  }
  return lines;
}

function buildCourseHighlights(courses) {
  if (!courses?.totals) return [];
  const lines = [];
  if (courses.highlights?.mostJoinedCourse?.title) {
    lines.push(`الأكثر انضماماً: ${courses.highlights.mostJoinedCourse.title}.`);
  }
  if (courses.totals.finalExamCompletionRate != null) {
    lines.push(`إكمال الاختبار النهائي: ${formatInt(courses.totals.finalExamCompletionRate)}٪.`);
  }
  if (Number(courses.totals.stuckAbove80Percent) > 0) {
    lines.push(`${formatInt(courses.totals.stuckAbove80Percent)} متعلّم عالق فوق 80٪.`);
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
  const summary = intelligence?.summary?.data;
  const orders = intelligence?.orders?.data;
  const clients = intelligence?.clients?.data;
  const freelancers = intelligence?.freelancers?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const courses = intelligence?.courses?.data;
  const categories = intelligence?.categories?.data;
  const financial = intelligence?.financial?.data;
  const operationalCharts = buildOperationalCharts(intelligence, periodLabel);

  const summaryFailed = sectionFailed(sectionErrors, "summary");
  const ordersFailed = sectionFailed(sectionErrors, "orders");
  const clientsFailed = sectionFailed(sectionErrors, "clients");
  const freelancersFailed = sectionFailed(sectionErrors, "freelancers");
  const subscriptionsFailed = sectionFailed(sectionErrors, "subscriptions");
  const coursesFailed = sectionFailed(sectionErrors, "courses");
  const categoriesFailed = sectionFailed(sectionErrors, "categories");
  const financialFailed = sectionFailed(sectionErrors, "financial");

  const posthogOff = isPosthogUnavailable(posthog, meta);

  const detailSections = (
    <>
      <IntelligenceSection
        title="مؤشرات المنصة"
        sectionKey="summary"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
        className="sa-section--compact"
      >
        <p className="sa-section-scope-label help m-0 mb-2">إجماليات المنصة — {periodLabel || "الفترة المحددة"}</p>
        <MiniStatGrid
          loading={loading && !summary && !summaryFailed}
          dense
          showCardScope={false}
          items={[
            {
              ...fromSection(summaryFailed, summary?.totalUsers),
              key: "users",
              label: "إجمالي المستخدمين",
              scopeLabel: summaryIntelligenceScope("users", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalClients),
              key: "clients",
              label: "إجمالي العملاء",
              scopeLabel: summaryIntelligenceScope("clients", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalFreelancers),
              key: "freelancers",
              label: "إجمالي المستقلين",
              scopeLabel: summaryIntelligenceScope("freelancers", period),
            },
            {
              ...fromSection(summaryFailed, summary?.activeFreelancers),
              key: "activeFree",
              label: "مستقلون نشطون",
              scopeLabel: summaryIntelligenceScope("activeFree", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalOrders),
              key: "orders",
              label: "إجمالي الطلبات",
              to: SA_ROUTES.orders,
              scopeLabel: summaryIntelligenceScope("orders", period),
            },
            {
              ...fromSection(summaryFailed, summary?.openOrders),
              key: "open",
              label: "طلبات مفتوحة",
              to: SA_ROUTES.orders,
              scopeLabel: summaryIntelligenceScope("open", period),
            },
            {
              ...fromSection(summaryFailed, summary?.completedOrders),
              key: "done",
              label: "طلبات مكتملة",
              to: SA_ROUTES.orders,
              scopeLabel: summaryIntelligenceScope("done", period),
            },
            {
              ...fromSection(summaryFailed, summary?.cancelledOrders),
              key: "cancel",
              label: "طلبات ملغاة",
              to: SA_ROUTES.orders,
              scopeLabel: summaryIntelligenceScope("cancel", period),
            },
            {
              ...fromSection(summaryFailed, summary?.activeSubscriptions),
              key: "activeSub",
              label: "اشتراكات نشطة",
              to: SA_ROUTES.subscriptions,
              scopeLabel: summaryIntelligenceScope("activeSub", period),
            },
            {
              ...fromSection(summaryFailed, summary?.pendingSubscriptions),
              key: "pendingSub",
              label: "اشتراكات معلقة",
              to: SA_ROUTES.subscriptionsActivation,
              scopeLabel: summaryIntelligenceScope("pendingSub", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalRevenueJod, { money: true }),
              key: "revenue",
              label: "إجمالي إيرادات الطلبات",
              scopeLabel: summaryIntelligenceScope("revenue", period),
            },
            {
              ...fromSection(summaryFailed, summary?.monthlyRevenueJod, { money: true }),
              key: "monthRev",
              label: "إيرادات الشهر",
              scopeLabel: summaryIntelligenceScope("monthRev", period),
            },
            {
              ...fromSection(summaryFailed, summary?.totalCourses),
              key: "courses",
              label: "عدد الدورات",
              to: SA_ROUTES.courses,
              scopeLabel: summaryIntelligenceScope("courses", period),
            },
            {
              ...fromSection(summaryFailed, summary?.enrolledStudents),
              key: "students",
              label: "الطلاب المسجلون",
              to: SA_ROUTES.courses,
              scopeLabel: summaryIntelligenceScope("students", period),
            },
            {
              ...fromSection(summaryFailed, summary?.pendingFinancialClaims),
              key: "claims",
              label: "مطالبات مالية معلقة",
              to: SA_ROUTES.financialClaims,
              scopeLabel: summaryIntelligenceScope("claims", period),
            },
          ]}
        />
      </IntelligenceSection>

      <CollapsibleBlock
        title="اتجاهات تشغيلية"
        description={`طلبات، اشتراكات، مطالبات مالية، وتسجيلات الدورات${periodLabel ? ` — ${periodLabel}` : ""}.`}
        defaultOpen={false}
        className="sa-section--compact mb-4"
      >
        <IntelligenceTrendCharts
          charts={operationalCharts}
          loading={loading && !orders && !ordersFailed}
          periodLabel={periodLabel}
        />
      </CollapsibleBlock>

      <IntelligenceSection
        title="ذكاء الطلبات"
        sectionKey="orders"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
        highlights={<SectionHighlights items={buildOrderHighlights(orders)} />}
      >
        <MiniStatGrid
          loading={loading && !orders && !ordersFailed}
          dense
          items={[
            {
              ...fromSection(ordersFailed, orders?.totals?.totalOrders),
              key: "o1",
              label: "إجمالي الطلبات",
              to: SA_ROUTES.orders,
              scopeLabel: ordersMetricScope("o1", period),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersToday),
              key: "o2",
              label: "طلبات اليوم",
              to: SA_ROUTES.orders,
              scopeLabel: ordersMetricScope("o2", period),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersThisWeek),
              key: "o3",
              label: "طلبات الأسبوع",
              to: SA_ROUTES.orders,
              scopeLabel: ordersMetricScope("o3", period),
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersThisMonth),
              key: "o4",
              label: "طلبات الشهر",
              to: SA_ROUTES.orders,
              scopeLabel: ordersMetricScope("o4", period),
            },
            { ...fromSection(ordersFailed, orders?.totals?.completedOrders), key: "o5", label: "مكتملة", to: SA_ROUTES.orders },
            { ...fromSection(ordersFailed, orders?.totals?.pendingOrders), key: "o6", label: "معلّقة", to: SA_ROUTES.orders },
            { ...fromSection(ordersFailed, orders?.totals?.cancelledOrders), key: "o7", label: "ملغاة", to: SA_ROUTES.orders },
            { ...fromSection(ordersFailed, orders?.totals?.fixedOrders), key: "o8", label: "ثابتة", to: SA_ROUTES.orders },
            { ...fromSection(ordersFailed, orders?.totals?.biddingOrders), key: "o9", label: "مزايدة", to: SA_ROUTES.orders },
            {
              ...fromSection(ordersFailed, orders?.totals?.completionRate, { percent: true }),
              key: "o10",
              label: "معدل الإكمال %",
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.cancellationRate, { percent: true }),
              key: "o11",
              label: "معدل الإلغاء %",
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.averageOrderValueJod, { money: true }),
              key: "o12",
              label: "متوسط قيمة الطلب",
            },
            {
              ...fromSection(ordersFailed, orders?.totals?.ordersWaitingTooLong),
              key: "o13",
              label: "طلبات متأخرة",
              to: SA_ROUTES.orders,
              scopeLabel: ordersMetricScope("o13", period),
            },
          ]}
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 sa-subgrid-tight">
          <div>
            <p className="help mb-2">الفئات الأكثر طلباً</p>
            <TopList rows={orders?.categories?.breakdown || []} valueLabel="عدد الطلبات" valueKey="totalOrders" labelKey="name" />
          </div>
          <div>
            <p className="help mb-2">نطاقات قيمة الطلبات</p>
            <TopList
              rows={[
                { name: "أقل من 50 د.أ", total: orders?.orderValueRanges?.lessThan50 },
                { name: "50 – 199", total: orders?.orderValueRanges?.from50To199 },
                { name: "200 – 499", total: orders?.orderValueRanges?.from200To499 },
                { name: "500+", total: orders?.orderValueRanges?.aboveOrEqual500 },
              ].filter((r) => r.total != null)}
              valueLabel="عدد"
              valueKey="total"
              labelKey="name"
            />
          </div>
          <div>
            <p className="help mb-2">أوقات التنفيذ (متوسط ساعات)</p>
            <p className="help mb-1">إنشاء → أخذ: {orders?.timing?.avgHoursCreateToTake ?? "—"}</p>
            <p className="help m-0">أخذ → إكمال: {orders?.timing?.avgHoursTakeToComplete ?? "—"}</p>
          </div>
        </div>
      </IntelligenceSection>

      <IntelligenceSection
        title="تحليل العملاء"
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
            { ...fromSection(clientsFailed, clients?.totals?.totalClients), key: "c1", label: "إجمالي العملاء" },
            { ...fromSection(clientsFailed, clients?.totals?.newClientsThisWeek), key: "c2", label: "جدد هذا الأسبوع" },
            { ...fromSection(clientsFailed, clients?.totals?.newClientsThisMonth), key: "c3", label: "جدد هذا الشهر" },
            { ...fromSection(clientsFailed, clients?.totals?.returningClients), key: "c4", label: "عملاء متكررون" },
            { ...fromSection(clientsFailed, clients?.totals?.inactiveClients), key: "c5", label: "غير نشطين" },
            {
              ...fromSection(clientsFailed, clients?.totals?.signupToFirstOrderRate, { percent: true }),
              key: "c6",
              label: "تحويل تسجيل → أول طلب %",
            },
          ]}
        />
        <p className="help mb-2">أعلى العملاء إنفاقاً</p>
        <TopList rows={clients?.topClients || []} valueLabel="الإنفاق" valueKey="spendJod" labelKey="fullName" money />
      </IntelligenceSection>

      <IntelligenceSection
        title="تحليل المستقلين"
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
            { ...fromSection(freelancersFailed, freelancers?.totals?.totalFreelancers), key: "f1", label: "إجمالي المستقلين" },
            { ...fromSection(freelancersFailed, freelancers?.totals?.activeFreelancers), key: "f2", label: "نشطون" },
            { ...fromSection(freelancersFailed, freelancers?.totals?.inactiveFreelancers), key: "f3", label: "غير نشطين" },
            { ...fromSection(freelancersFailed, freelancers?.totals?.subscribedFreelancers), key: "f4", label: "مشتركون", to: SA_ROUTES.subscriptions },
            { ...fromSection(freelancersFailed, freelancers?.totals?.nonSubscribedFreelancers), key: "f5", label: "بدون اشتراك" },
            {
              ...fromSection(freelancersFailed, freelancers?.totals?.inactiveAfterSubscription),
              key: "f6",
              label: "خاملون بعد الاشتراك",
              to: SA_ROUTES.subscriptions,
            },
          ]}
        />
        <p className="help mb-2">أفضل المستقلين أداءً</p>
        <TopList rows={freelancers?.topPerformers || []} valueLabel="مكتمل" valueKey="completedOrders" labelKey="fullName" />
      </IntelligenceSection>

      <IntelligenceSection
        title="الاشتراكات والمدفوعات"
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
              label: "اشتراكات نشطة",
              to: SA_ROUTES.subscriptions,
            },
            {
              ...fromSection(subscriptionsFailed, subscriptions?.totals?.pendingActivation),
              key: "s2",
              label: "بانتظار التفعيل",
              to: SA_ROUTES.subscriptionsActivation,
            },
            { ...fromSection(subscriptionsFailed, subscriptions?.totals?.pendingPayment), key: "s3", label: "مدفوعات معلقة", to: SA_ROUTES.subscriptions },
            { ...fromSection(subscriptionsFailed, subscriptions?.totals?.failedPayments), key: "s4", label: "مدفوعات فاشلة", to: SA_ROUTES.subscriptions },
          ]}
        />
        <div className="grid gap-3 md:grid-cols-2 sa-subgrid-tight">
          <div>
            <p className="help mb-2">التوزيع حسب الباقة</p>
            <TopList rows={subscriptions?.byPlan || []} valueLabel="مشتركون" valueKey="subscribers" labelKey="planTitle" />
          </div>
          <div>
            <p className="help mb-2">أعلى دول الاشتراك</p>
            <TopList rows={subscriptions?.countries || []} valueLabel="مشتركون" valueKey="subscribers" labelKey="name" />
          </div>
        </div>
      </IntelligenceSection>

      <IntelligenceSection
        title="الدورات والتدريب"
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
            { ...fromSection(coursesFailed, courses?.totals?.totalCourses), key: "cr1", label: "إجمالي الدورات", to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.publishedCourses), key: "cr2", label: "منشورة", to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.draftCourses), key: "cr3", label: "مسودات", to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.totalLessons), key: "cr4", label: "دروس", to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.studentsEnrolled), key: "cr5", label: "طلاب", to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.stuckAbove80Percent), key: "cr6", label: "عالقون فوق 80%", to: SA_ROUTES.courses },
            { ...fromSection(coursesFailed, courses?.totals?.finalExamSubmissions), key: "cr7", label: "تسليمات الاختبار" },
            {
              ...fromSection(coursesFailed, courses?.totals?.finalExamCompletionRate, { percent: true }),
              key: "cr8",
              label: "إكمال الاختبار %",
            },
          ]}
        />
        <TopList rows={courses?.topCourses || []} valueLabel="مسجلون" valueKey="enrolled" labelKey="title" />
      </IntelligenceSection>

      <IntelligenceSection
        title="الفئات والخدمات"
        sectionKey="categories"
        sectionErrors={sectionErrors}
        loading={loading}
        intelligence={intelligence}
        onRetry={onRetry}
      >
        <div className="grid gap-3 md:grid-cols-2 sa-subgrid-tight">
          <div>
            <p className="help mb-2">الأكثر طلباً</p>
            <TopList rows={categories?.mostRequested || []} valueLabel="طلب" valueKey="totalOrders" labelKey="name" />
          </div>
          <div>
            <p className="help mb-2">نقص العرض المحتمل</p>
            <TopList
              rows={categories?.potentialShortage || []}
              valueLabel="طلب"
              valueKey="demandOrders"
              labelKey="name"
              emptyLabel="لا يوجد نقص واضح"
            />
          </div>
        </div>
      </IntelligenceSection>

      <IntelligenceSection
        title="العمليات المالية"
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
              label: "معلّقة",
              to: SA_ROUTES.financialClaims,
            },
            { ...fromSection(financialFailed, financial?.totals?.approvedClaims), key: "fi2", label: "معتمدة", to: SA_ROUTES.financialClaims },
            { ...fromSection(financialFailed, financial?.totals?.paidClaims), key: "fi3", label: "مدفوعة", to: SA_ROUTES.financialClaims },
            { ...fromSection(financialFailed, financial?.totals?.rejectedClaims), key: "fi4", label: "مرفوضة", to: SA_ROUTES.financialClaims },
            { ...fromSection(financialFailed, financial?.totals?.totalClaimAmountJod, { money: true }), key: "fi5", label: "إجمالي القيمة" },
            { ...fromSection(financialFailed, financial?.totals?.averageClaimAmountJod, { money: true }), key: "fi6", label: "متوسط المطالبة" },
            {
              ...fromSection(financialFailed, financial?.totals?.claimsWaitingTooLong),
              key: "fi7",
              label: "متأخرة (+7 أيام)",
              to: SA_ROUTES.financialClaims,
            },
          ]}
        />
      </IntelligenceSection>

      <DashboardSection title="النشاط والنمو" className="sa-section--compact sa-section--muted">
        <p className="sa-section-scope-label help m-0 mb-2">{periodScopeLabel(period)} — PostHog</p>
        {posthogOff ? (
          <SectionInlineNotice tone="warn">{meta?.posthogError || posthog?.meta?.posthogError || "بيانات PostHog غير متاحة."}</SectionInlineNotice>
        ) : null}
        <MiniStatGrid
          loading={posthogLoading && !posthog && !posthogOff}
          dense
          showCardScope={false}
          items={[
            {
              key: "a1",
              label: "زوار اليوم",
              scopeLabel: SCOPE_LABELS.realtime,
              ...fromSection(posthogOff, posthog?.kpis?.visitorsToday),
            },
            {
              key: "a2",
              label: "نشطون اليوم",
              scopeLabel: SCOPE_LABELS.realtime,
              ...fromSection(posthogOff, posthog?.kpis?.activeUsersToday),
            },
            {
              key: "a3",
              label: "طلبات اليوم (تحليلات)",
              scopeLabel: SCOPE_LABELS.today,
              ...fromSection(posthogOff, posthog?.kpis?.ordersToday),
            },
            {
              key: "a4",
              label: "تسجيلات",
              scopeLabel: periodScopeLabel(period),
              ...fromSection(
                isPosthogEventUnavailable(posthog, meta, "signup_completed"),
                posthog?.events?.signup_completed,
              ),
            },
            {
              key: "a5",
              label: "تسجيلات دخول",
              scopeLabel: periodScopeLabel(period),
              ...fromSection(
                isPosthogEventUnavailable(posthog, meta, "user_logged_in"),
                posthog?.events?.user_logged_in,
              ),
            },
            {
              key: "a6",
              label: "اشتراكات مشتراة",
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
      title="تحليلات تفصيلية"
      description="طلبات، عملاء، اشتراكات، دورات، ومالية."
      defaultOpen={false}
      className="sa-section--compact sa-section--intel-detail sa-collapsible--premium mb-4"
      onOpenChange={handleDetailOpen}
    >
      {loading && !intelligence?.summary?.data ? (
        <p className="help m-0 mb-3 text-slate-500">جارٍ تحميل البيانات…</p>
      ) : null}
      {intelligenceError && !intelligence?.summary?.data ? (
        <SectionInlineNotice tone="warn">
          {intelligenceError}{" "}
          <button type="button" className="sa-section-notice__btn" onClick={onRetry}>
            إعادة المحاولة
          </button>
        </SectionInlineNotice>
      ) : null}
      {detailSections}
    </CollapsibleBlock>
  );
}
