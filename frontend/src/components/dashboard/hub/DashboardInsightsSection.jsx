import DashboardInsightCard from "./DashboardInsightCard";
import DashboardHubSkeletonCards from "./DashboardHubSkeletonCards";

const PLACEHOLDER_INSIGHTS = [
  {
    id: "placeholder-orders",
    type: "orders",
    titleAr: "طلبات تحتاج مراجعة",
    descriptionAr: "لديك 2 طلبات تنتظر ردك",
    helperText: "قم بمراجعتها للرد على عملائك",
    actionLabel: "طلباتي",
    actionUrl: "/dashboard/freelancer/my-orders",
  },
  {
    id: "placeholder-courses",
    type: "courses",
    titleAr: "دورة قيد التقدم",
    descriptionAr: "أكملت 60% من دورة",
    helperText: "أكمل الدورة لفتح المزيد من الفرص",
    actionLabel: "الدورات",
    actionUrl: "/dashboard/freelancer/courses",
  },
  {
    id: "placeholder-performance",
    type: "performance",
    titleAr: "أداء مميز",
    descriptionAr: "معدل التسليم في الوقت المحدد ممتاز",
    helperText: "استمر على هذا الأداء الرائع!",
    actionLabel: null,
    actionUrl: null,
  },
];

export default function DashboardInsightsSection({ insights = [], loading = false }) {
  const items = (insights.length ? insights : PLACEHOLDER_INSIGHTS).slice(0, 3);

  return (
    <section className="fdash-insights" aria-labelledby="fdash-insights-heading">
      <h2 id="fdash-insights-heading" className="fdash-insights__title">
        رؤى وتوصيات
      </h2>
      {loading ? (
        <DashboardHubSkeletonCards count={3} />
      ) : (
        <div className="fdash-insights__grid">
          {items.map((item) => (
            <DashboardInsightCard
              key={item.id}
              type={item.type}
              title={item.titleAr}
              description={item.descriptionAr}
              helperText={item.helperText}
              actionUrl={item.actionUrl}
              actionLabel={item.actionLabel}
            />
          ))}
        </div>
      )}
    </section>
  );
}
