import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { getOnboardingGettingStartedRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { resolveSafeInternalNavPath } from "../../utils/safeInternalNavPath";

export default function FreelancerGettingStartedPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getOnboardingGettingStartedRequest();
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
    } catch (err) {
      setError(getSafeApiErrorMessage(err) || "تعذر تحميل مركز البداية.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="مركز البداية"
        description="شروحات قصيرة لآلية العمل في Orderz House. المحتوى يُدار من لوحة الإدارة."
      />
      <DashboardSection>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={load} /> : null}
        {!loading && !error && items.length === 0 ? (
          <DashboardEmptyState
            title="لا توجد مقالات بعد"
            description="سيظهر الدليل هنا بعد تفعيل محتوى مركز البداية من الإدارة. إن لم تُطبَّق الهجرة بعد، أكمل التدريب وطلب التفعيل من لوحة التحكم."
          />
        ) : null}
        {!loading && !error && items.length > 0 ? (
          <div className="grid gap-3">
            {items.map((item) => {
              const inner = (
                <>
                  <h2 className="mb-[0.4rem] text-[1.05rem]">{item.title}</h2>
                  <p className="m-0 leading-[1.65] text-[var(--dash-text-secondary,#5a6378)]">{item.body}</p>
                </>
              );
              const cardClass =
                "block min-w-0 overflow-hidden rounded-[14px] border border-[color:rgb(23_32_51/0.08)] bg-[var(--dash-card,#fff)] px-4 py-3.5 text-inherit no-underline";
              const safeCta = resolveSafeInternalNavPath(item.ctaUrl, "");
              if (safeCta) {
                return (
                  <Link key={item.id ?? item.title} className={cardClass} to={safeCta}>
                    {inner}
                  </Link>
                );
              }
              return (
                <article key={item.id ?? item.title} className={cardClass}>
                  {inner}
                </article>
              );
            })}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
