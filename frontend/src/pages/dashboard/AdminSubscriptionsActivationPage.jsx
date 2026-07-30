import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { isAxiosCanceledError } from "../../utils/apiErrorMessage";
import SubscriptionsActivationList from "./SubscriptionsActivationList";
import "./superAdminSubscriptionsPage.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

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

function SearchIcon() {
  return (
    <svg className="oh-sa-activation-search__icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function AdminSubscriptionsActivationPage() {
  const { user } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isSuperAdmin = role === "super_admin";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingId, setSubmittingId] = useState(null);
  const [error, setError] = useState("");
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [view, setView] = useState("cards");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const skipSearchPageReset = useRef(true);
  const hasLoadedOnceRef = useRef(false);
  const abortRef = useRef(null);
  const searchInputRef = useRef(null);

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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (skipSearchPageReset.current) {
      skipSearchPageReset.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  const loadQueue = useCallback(
    async (pageOverride, { soft = false } = {}) => {
      const targetPage = pageOverride ?? page;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError("");
      if (soft) setRefreshing(true);
      else setLoading(true);

      try {
        const res = await listActivationQueueRequest(
          {
            page: targetPage,
            limit: PAGE_SIZE,
            ...(debouncedSearch ? { search: debouncedSearch } : {}),
          },
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        const nextSubs = res?.data?.subscriptions || [];
        const nextPagination = res?.data?.pagination || EMPTY_PAGINATION;

        if (nextSubs.length === 0 && targetPage > 1 && (nextPagination.total ?? 0) > 0) {
          setPage(targetPage - 1);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        setSubs(nextSubs);
        setPagination(nextPagination);
        hasLoadedOnceRef.current = true;
        if (pageOverride == null && targetPage !== page) {
          setPage(targetPage);
        }
      } catch (err) {
        if (isAxiosCanceledError(err) || controller.signal.aborted) return;
        setError(errorMessage(err));
        if (!soft) {
          setSubs([]);
          setPagination(EMPTY_PAGINATION);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [page, debouncedSearch],
  );

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    const soft = hasLoadedOnceRef.current;
    void loadQueue(page, { soft });
    return () => {
      abortRef.current?.abort();
    };
  }, [page, debouncedSearch, loadQueue]);

  const activate = async (subscriptionId) => {
    setError("");
    setSubmittingId(String(subscriptionId));
    try {
      await activateSubscriptionCompanyRequest(subscriptionId);
      await loadQueue(page, { soft: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmittingId(null);
    }
  };

  const refresh = useCallback(() => {
    void loadQueue(page, { soft: hasLoadedOnceRef.current });
  }, [loadQueue, page]);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    searchInputRef.current?.focus();
  }, []);

  const onSearchKeyDown = (event) => {
    if (event.key === "Escape" && searchInput) {
      event.preventDefault();
      clearSearch();
    }
  };

  const total = Number(pagination?.total) || 0;
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  const showPagination = !loading && !error && total > PAGE_SIZE;
  const hasActiveSearch = Boolean(debouncedSearch);
  const busy = loading || refreshing;
  const showInitialSkeleton = loading && !hasLoadedOnceRef.current;
  const showSearchEmpty = !busy && !error && total === 0 && hasActiveSearch;
  const showQueueEmpty = !busy && !error && total === 0 && !hasActiveSearch;
  const showList = !error && !showInitialSkeleton && subs.length > 0;

  return (
    <DashboardShell className="oh-sa-subs oh-sa-activation-page">
      <DashboardPageHeader
        eyebrow={isSuperAdmin ? "لوحة المدير الأعلى" : "لوحة التحكم"}
        title="تفعيل اشتراكات المستقلين"
        description="متابعة الاشتراكات بانتظار تفعيل الشركة، والإسناد الإداري، ومتابعة الاشتراكات غير المفعّلة بعد."
      />

      <DashboardSection
        title="بانتظار تفعيل الشركة"
        description={!busy && !error && total > 0 ? formatDisplayRange(pagination) : undefined}
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
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void refresh()}>
              تحديث
            </Button>
          </>
        }
      >
        <div className="oh-sa-activation-search" role="search">
          <label className="oh-sa-activation-search__label" htmlFor="sa-activation-search">
            البحث عن مستقل
          </label>
          <div className={`oh-sa-activation-search__control${busy ? " is-loading" : ""}`.trim()}>
            <span className="oh-sa-activation-search__icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <input
              ref={searchInputRef}
              id="sa-activation-search"
              className="oh-sa-activation-search__input"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="ابحث بالاسم أو البريد الإلكتروني..."
              aria-label="البحث عن مستقل"
              autoComplete="off"
              spellCheck={false}
            />
            {searchInput ? (
              <button
                type="button"
                className="oh-sa-activation-search__clear"
                onClick={clearSearch}
                aria-label="مسح البحث"
              >
                مسح
              </button>
            ) : null}
            {refreshing ? (
              <span className="oh-sa-activation-search__spinner" aria-hidden="true" />
            ) : null}
          </div>
        </div>

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

        {!error && refreshing && hasLoadedOnceRef.current ? (
          <div className="oh-sa-subs-list-loading" aria-live="polite">
            جارٍ تحديث النتائج…
          </div>
        ) : null}

        {showInitialSkeleton ? (
          <SubscriptionsActivationList
            items={[]}
            view={view}
            planTitleById={planTitleById}
            submittingId={submittingId}
            onActivate={activate}
            loading
          />
        ) : null}

        {showQueueEmpty ? <DashboardEmptyState title="لا توجد اشتراكات بانتظار التفعيل حالياً" /> : null}

        {showSearchEmpty ? (
          <DashboardEmptyState
            title="لم يتم العثور على نتائج"
            description="لا يوجد مستقل يطابق الاسم أو البريد الإلكتروني الذي أدخلته."
            actions={
              <Button type="button" variant="secondary" onClick={clearSearch}>
                مسح البحث
              </Button>
            }
          />
        ) : null}

        {showList ? (
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
                  isLoading={busy}
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
