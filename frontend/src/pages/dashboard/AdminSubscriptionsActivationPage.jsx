import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import Pagination from "../../components/common/Pagination";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import {
  activateSubscriptionCompanyRequest,
  listActivationQueueRequest,
  listAssignablePlansAdminRequest,
} from "../../services/api";
import { useAuth } from "../../context/useAuth";
import SubscriptionsActivationList from "./SubscriptionsActivationList";
import "./superAdminSubscriptionsPage.css";

const PAGE_SIZE = 20;

const EMPTY_PAGINATION = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function formatDisplayRange(pagination) {
  const total = Number(pagination?.total) || 0;
  if (total <= 0) return "";
  const page = Number(pagination?.page) || 1;
  const limit = Number(pagination?.limit) || PAGE_SIZE;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `عرض ${start}–${end} من أصل ${total} اشتراك`;
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
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [view, setView] = useState("cards");

  const planTitleById = useMemo(() => {
    const map = {};
    for (const p of plans || []) map[String(p.id)] = p.title || String(p.id);
    return map;
  }, [plans]);

  const loadPlans = useCallback(async () => {
    try {
      const plansRes = await listAssignablePlansAdminRequest();
      setPlans(plansRes?.data?.plans || []);
    } catch {
      setPlans([]);
    }
  }, []);

  const loadQueue = useCallback(async (pageOverride) => {
    const targetPage = pageOverride ?? page;
    setError("");
    setLoading(true);
    try {
      const res = await listActivationQueueRequest({ page: targetPage, limit: PAGE_SIZE });
      const nextSubs = res?.data?.subscriptions || [];
      const nextPagination = res?.data?.pagination || EMPTY_PAGINATION;

      if (nextSubs.length === 0 && targetPage > 1 && (nextPagination.total ?? 0) > 0) {
        setPage(targetPage - 1);
        setLoading(false);
        return;
      }

      setSubs(nextSubs);
      setPagination(nextPagination);
      if (pageOverride == null && targetPage !== page) {
        setPage(targetPage);
      }
    } catch (err) {
      setError(errorMessage(err));
      setSubs([]);
      setPagination(EMPTY_PAGINATION);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    void loadQueue(page);
  }, [page, loadQueue]);

  const activate = async (subscriptionId) => {
    setError("");
    setSubmittingId(String(subscriptionId));
    try {
      await activateSubscriptionCompanyRequest(subscriptionId);
      await loadQueue(page);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmittingId(null);
    }
  };

  const refresh = useCallback(() => {
    void loadQueue(page);
  }, [loadQueue, page]);

  const total = Number(pagination?.total) || 0;
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  const showPagination = !loading && total > PAGE_SIZE;

  return (
    <DashboardShell className="oh-sa-subs oh-sa-activation-page">
      <DashboardPageHeader
        eyebrow={isSuperAdmin ? "لوحة المدير الأعلى" : "لوحة التحكم"}
        title="تفعيل اشتراكات المستقلين"
        description="متابعة الاشتراكات بانتظار تفعيل الشركة، والإسناد الإداري، ومتابعة الاشتراكات غير المفعّلة بعد."
      />

      {error ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : null}

      <DashboardSection
        title="بانتظار تفعيل الشركة"
        description={
          !loading && total > 0 ? formatDisplayRange(pagination) : undefined
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
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void refresh()}>
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

        {!loading && total === 0 ? (
          <DashboardEmptyState title="لا توجد اشتراكات بانتظار التفعيل حالياً" />
        ) : null}

        {!loading && subs.length > 0 ? (
          <>
            <SubscriptionsActivationList
              items={subs}
              view={view}
              planTitleById={planTitleById}
              submittingId={submittingId}
              onActivate={activate}
            />
            {showPagination ? (
              <div className="oh-sa-subs-pagination-wrap">
                <Pagination
                  currentPage={pagination.page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  isLoading={loading}
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
