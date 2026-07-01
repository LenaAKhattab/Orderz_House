import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Pagination from "../../components/common/Pagination";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { breadcrumbHomeCrumb, superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import {
  activateSubscriptionCompanyRequest,
  listAllSubscriptionsRequest,
  listAssignablePlansAdminRequest,
} from "../../services/api";
import { useAuth } from "../../context/useAuth";
import SubscriptionsActivationList from "./SubscriptionsActivationList";
import "./superAdminSubscriptionsPage.css";

const PAGE_SIZE = 20;

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function isPendingCompanyActivation(sub) {
  const payment = String(sub?.paymentStatus || "");
  const activation = String(sub?.activationStatus || "");
  const eligiblePaymentState =
    payment === "paid" || payment === "pending" || payment === "not_required" || payment === "";
  return activation === "company_pending" && eligiblePaymentState;
}

function sortPendingNewestFirst(a, b) {
  const ta = new Date(a?.assignedAt || a?.createdAt || 0).getTime();
  const tb = new Date(b?.assignedAt || b?.createdAt || 0).getTime();
  if (tb !== ta) return tb - ta;
  return Number(b?.id || 0) - Number(a?.id || 0);
}

export default function AdminSubscriptionsActivationPage() {
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isSuperAdmin = role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState(null);
  const [error, setError] = useState("");
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [view, setView] = useState("cards");

  const planTitleById = useMemo(() => {
    const map = {};
    for (const p of plans || []) map[String(p.id)] = p.title || String(p.id);
    return map;
  }, [plans]);

  const loadData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [subsRes, plansRes] = await Promise.all([
        listAllSubscriptionsRequest({}),
        listAssignablePlansAdminRequest(),
      ]);
      setSubs(subsRes?.data?.subscriptions || []);
      setPlans(plansRes?.data?.plans || []);
    } catch (err) {
      setError(errorMessage(err));
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const pendingCompanyActivation = useMemo(
    () => (subs || []).filter(isPendingCompanyActivation).sort(sortPendingNewestFirst),
    [subs],
  );

  const totalPages = Math.max(1, Math.ceil(pendingCompanyActivation.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return pendingCompanyActivation.slice(start, start + PAGE_SIZE);
  }, [pendingCompanyActivation, page]);

  const activate = async (subscriptionId) => {
    setError("");
    setSubmittingId(String(subscriptionId));
    try {
      await activateSubscriptionCompanyRequest(subscriptionId);
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmittingId(null);
    }
  };

  const breadcrumbs = isSuperAdmin
    ? superAdminBreadcrumbs("dashboard.breadcrumbs.subscriptionActivation")
    : [breadcrumbHomeCrumb(user), { labelKey: "dashboard.breadcrumbs.subscriptionActivation" }];

  const showPagination = !loading && pendingCompanyActivation.length > PAGE_SIZE;

  return (
    <DashboardShell className="oh-sa-subs oh-sa-activation-page">
      <DashboardPageHeader
        eyebrow={isSuperAdmin ? "لوحة المدير الأعلى" : "لوحة التحكم"}
        title="تفعيل اشتراكات المستقلين"
        description="يمكنك تفعيل الحسابات المشتركة بعد مراجعة الشركة، ليصبح المستقل مؤهلاً لاستلام الطلبات."
        breadcrumbs={breadcrumbs}
      />

      {error ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={() => void loadData()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : null}

      <DashboardSection
        title="بانتظار تفعيل الشركة"
        description={
          !loading && pendingCompanyActivation.length > 0
            ? `عرض ${pageItems.length} من ${pendingCompanyActivation.length} اشتراك بانتظار التفعيل`
            : undefined
        }
        actions={
          <>
            <button
              type="button"
              className={`btn btn-secondary ${view === "cards" ? "nav-link-active" : ""}`.trim()}
              onClick={() => setView("cards")}
            >
              عرض بطاقات
            </button>
            <button
              type="button"
              className={`btn btn-secondary ${view === "table" ? "nav-link-active" : ""}`.trim()}
              onClick={() => setView("table")}
            >
              عرض جدول
            </button>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void loadData()}>
              تحديث
            </Button>
          </>
        }
      >
        {loading ? (
          <SubscriptionsActivationList
            items={[]}
            view={view}
            planTitleById={planTitleById}
            submittingId={submittingId}
            onActivate={activate}
            loading
          />
        ) : null}

        {!loading && pendingCompanyActivation.length === 0 ? (
          <DashboardEmptyState title="لا توجد اشتراكات بانتظار التفعيل حالياً" />
        ) : null}

        {!loading && pendingCompanyActivation.length > 0 ? (
          <>
            <SubscriptionsActivationList
              items={pageItems}
              view={view}
              planTitleById={planTitleById}
              submittingId={submittingId}
              onActivate={activate}
            />
            {showPagination ? (
              <div className="oh-sa-subs-pagination-wrap">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  className="oh-sa-subs-pagination"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
