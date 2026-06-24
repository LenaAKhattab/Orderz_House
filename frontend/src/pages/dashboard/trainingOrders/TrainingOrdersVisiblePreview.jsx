import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { useTranslation } from "../../../i18n/LanguageProvider";
import {
  adminHideTrainingFakeOrderFromRoundRequest,
  adminListTrainingApplicationsByFakeOrderRequest,
  adminListTrainingVisibleOrdersRequest,
} from "../../../services/api";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { useToast } from "../../../components/ui/toastContext";
import OverviewWidgetFrame from "./OverviewWidgetFrame";
import TrainingOrderApplicantsModal from "./TrainingOrderApplicantsModal";
import {
  formatAdminNumber,
  formatJoDateTime,
  getFakeOrderStatusLabel,
  resolveApplicantsTotal,
  resolveRowApplicantsCount,
  trainingAdminT,
  unwrapTrainingPayload,
} from "./trainingOrdersDisplayUtils";
import "./trainingOrdersAdmin.css";

const PAGE_SIZE = 10;
const APPLICANTS_MODAL_PAGE_SIZE = 5;

function fakeStatusTone(status) {
  if (status === "active") return "success";
  if (status === "expired") return "inactive";
  if (status === "stopped") return "warning";
  return "neutral";
}

export default function TrainingOrdersVisiblePreview({
  onAfterHide,
  refreshKey = 0,
  suppressLoading = false,
  onStatusChange,
}) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const hasLoadedOnceRef = useRef(false);
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [hideBusyId, setHideBusyId] = useState(null);
  const [pageRefreshing, setPageRefreshing] = useState(false);

  const [applicantsModalOpen, setApplicantsModalOpen] = useState(false);
  const [applicantsModalOrder, setApplicantsModalOrder] = useState(null);
  const [applicantsModalLoading, setApplicantsModalLoading] = useState(false);
  const [applicantsModalError, setApplicantsModalError] = useState("");
  const [applicantsModalApps, setApplicantsModalApps] = useState([]);
  const [applicantsModalTotal, setApplicantsModalTotal] = useState(0);
  const [applicantsModalPage, setApplicantsModalPage] = useState(1);
  const [applicantsModalPagination, setApplicantsModalPagination] = useState(null);

  const fetchPage = useCallback(async (pageToLoad, { silent = false } = {}) => {
    const keepVisible = silent || hasLoadedOnceRef.current;
    if (!keepVisible) {
      setError("");
      setStatus("loading");
    } else {
      setPageRefreshing(true);
    }
    try {
      const res = await adminListTrainingVisibleOrdersRequest({ page: pageToLoad, limit: PAGE_SIZE });
      const payload = unwrapTrainingPayload(res);
      const nextOrders = Array.isArray(payload?.orders) ? payload.orders : [];
      const nextPagination = payload?.pagination || {
        page: pageToLoad,
        limit: PAGE_SIZE,
        total: nextOrders.length,
        totalPages: 1,
      };
      setOrders(nextOrders);
      setPagination(nextPagination);
      setStatus("success");
      hasLoadedOnceRef.current = true;
      return { orders: nextOrders, pagination: nextPagination };
    } catch (e) {
      if (!keepVisible) {
        setOrders([]);
        setError(getSafeApiErrorMessage(e) || t("trainingOrders.actions.toast.serverError"));
        setStatus("error");
      }
      throw e;
    } finally {
      setPageRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    let cancelled = false;
    const silent = hasLoadedOnceRef.current;
    fetchPage(page, { silent })
      .catch(() => {
        if (cancelled) return;
      });
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey, fetchPage]);

  const totalPages = useMemo(() => Math.max(1, pagination?.totalPages || 1), [pagination]);

  const closeApplicantsModal = useCallback(() => {
    setApplicantsModalOpen(false);
    setApplicantsModalOrder(null);
    setApplicantsModalApps([]);
    setApplicantsModalError("");
    setApplicantsModalTotal(0);
    setApplicantsModalPage(1);
    setApplicantsModalPagination(null);
    setApplicantsModalLoading(false);
  }, []);

  const fetchApplicantsModalPage = useCallback(async (order, pageToLoad) => {
    if (!order?.id) return;
    setApplicantsModalLoading(true);
    setApplicantsModalError("");
    try {
      const res = await adminListTrainingApplicationsByFakeOrderRequest(order.id, {
        page: pageToLoad,
        limit: APPLICANTS_MODAL_PAGE_SIZE,
      });
      const payload = unwrapTrainingPayload(res);
      const apps = payload?.applicants ?? payload?.applications ?? [];
      setApplicantsModalApps(apps);
      setApplicantsModalTotal(resolveApplicantsTotal({ ...payload, applicants: apps, applications: apps }));
      setApplicantsModalPagination(payload?.pagination ?? null);
      setApplicantsModalPage(pageToLoad);
    } catch (e) {
      setApplicantsModalError(getSafeApiErrorMessage(e) || t("trainingOrders.applications.genericError"));
    } finally {
      setApplicantsModalLoading(false);
    }
  }, [t]);

  const openApplicantsModal = async (row) => {
    if (!row?.id) return;
    setApplicantsModalOpen(true);
    setApplicantsModalOrder(row);
    setApplicantsModalApps([]);
    setApplicantsModalPage(1);
    setApplicantsModalPagination(null);
    setApplicantsModalTotal(resolveRowApplicantsCount(row));
    await fetchApplicantsModalPage(row, 1);
  };

  const hideOrder = async (row) => {
    if (!row?.id || hideBusyId) return;
    if (!window.confirm(t("trainingOrders.actions.confirm.hideFromCurrentRound"))) return;
    setHideBusyId(row.id);
    try {
      await adminHideTrainingFakeOrderFromRoundRequest(row.id);
      if (applicantsModalOrder?.id === row.id) {
        closeApplicantsModal();
      }
      push({
        type: "success",
        title: t("trainingOrders.overview.visiblePreview.hide"),
        message: t("trainingOrders.actions.toast.orderHiddenFromRound"),
      });
      const { orders: refreshed, pagination: refreshedPagination } = await fetchPage(page, { silent: true });
      if (refreshed.length === 0 && page > 1) {
        setPage(page - 1);
      } else {
        setPagination(refreshedPagination);
        setOrders(refreshed);
      }
      await onAfterHide?.();
    } catch (e) {
      const httpStatus = e?.response?.status;
      push({
        type: "error",
        title:
          httpStatus === 403
            ? t("trainingOrders.actions.toast.permissionDenied")
            : t("trainingOrders.actions.toast.orderHideFailed"),
        message: getSafeApiErrorMessage(e) || t("trainingOrders.actions.toast.orderHideFailed"),
      });
    } finally {
      setHideBusyId(null);
    }
  };

  const rowOffset = (page - 1) * PAGE_SIZE;

  const applicantsButtonLabel = (count) =>
    trainingAdminT(t, "trainingOrders.overview.visiblePreview.applicantsButton", {
      count: formatAdminNumber(count),
    });

  return (
    <>
      <section className="oh-training-visible-preview oh-training-overview__section" aria-labelledby="oh-training-visible-heading">
        <header className="oh-training-visible-preview__header">
          <div className="oh-training-visible-preview__heading">
            <h2 id="oh-training-visible-heading" className="oh-training-visible-preview__title">
              {t("trainingOrders.overview.visiblePreview.title")}
            </h2>
            <p className="oh-training-visible-preview__helper">{t("trainingOrders.overview.visiblePreview.helper")}</p>
            <p className="oh-training-visible-preview__sort-hint">{t("trainingOrders.overview.visiblePreview.sortHint")}</p>
            {pageRefreshing ? (
              <p className="oh-training-visible-preview__refresh-note" role="status" aria-live="polite">
                {t("trainingOrders.overview.updatingData")}
              </p>
            ) : null}
          </div>
        </header>

        <div className={`oh-training-visible-preview__body${pageRefreshing ? " oh-training-visible-preview__body--refreshing" : ""}`}>
          <OverviewWidgetFrame
            status={status}
            error={error}
            onRetry={() => void fetchPage(page).catch(() => {})}
            suppressLoading={suppressLoading}
          >
            {status === "success" && orders.length === 0 ? (
              <DashboardEmptyState title={t("trainingOrders.overview.visiblePreview.empty")} />
            ) : status === "success" ? (
              <div className="oh-training-table-wrap oh-training-table-wrap--preview">
                <table className="oh-training-table oh-training-table--compact oh-training-table--preview oh-training-table--visible">
                  <colgroup>
                    <col className="oh-visible-col-index" />
                    <col className="oh-visible-col-title" />
                    <col className="oh-visible-col-category" />
                    <col className="oh-visible-col-round" />
                    <col className="oh-visible-col-visible-until" />
                    <col className="oh-visible-col-applicants" />
                    <col className="oh-visible-col-status" />
                    <col className="oh-visible-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="oh-visible-col-index oh-training-table__col-num">{t("trainingOrders.overview.visiblePreview.colNumber")}</th>
                      <th className="oh-visible-col-title">{t("trainingOrders.overview.visiblePreview.colTitle")}</th>
                      <th className="oh-visible-col-category">{t("trainingOrders.overview.visiblePreview.colCategory")}</th>
                      <th className="oh-visible-col-round">{t("trainingOrders.overview.visiblePreview.colRound")}</th>
                      <th className="oh-visible-col-visible-until">{t("trainingOrders.overview.visiblePreview.colVisibleUntil")}</th>
                      <th className="oh-visible-col-applicants">{t("trainingOrders.overview.visiblePreview.colApplicants")}</th>
                      <th className="oh-visible-col-status">{t("trainingOrders.overview.visiblePreview.colStatus")}</th>
                      <th className="oh-visible-col-actions oh-training-table__col-action">{t("trainingOrders.overview.visiblePreview.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((row, index) => {
                      const busy = hideBusyId === row.id;
                      const rowNumber = rowOffset + index + 1;
                      const applicantCount = resolveRowApplicantsCount(row);
                      return (
                        <tr key={row.id}>
                          <td className="oh-visible-col-index oh-training-table__col-num oh-num" dir="ltr">
                            {formatAdminNumber(rowNumber)}
                          </td>
                          <td className="oh-visible-col-title">
                            <strong title={row.title || undefined}>{row.title || "—"}</strong>
                          </td>
                          <td className="oh-visible-col-category" title={row.categoryName || undefined}>
                            {row.categoryName || "—"}
                          </td>
                          <td className="oh-visible-col-round oh-num" dir="ltr">
                            {formatAdminNumber(row.roundId)}
                          </td>
                          <td className="oh-visible-col-visible-until oh-num" dir="ltr">
                            {formatJoDateTime(row.visibleUntil, locale)}
                          </td>
                          <td className="oh-visible-col-applicants">
                            <button
                              type="button"
                              className="btn btn-secondary oh-training-table__action oh-training-visible-preview__applicants-btn"
                              disabled={Boolean(hideBusyId)}
                              onClick={() => openApplicantsModal(row)}
                            >
                              {applicantsButtonLabel(applicantCount)}
                            </button>
                          </td>
                          <td className="oh-visible-col-status">
                            <StatusBadge tone={fakeStatusTone(row.status)}>
                              {getFakeOrderStatusLabel(row.status, t)}
                            </StatusBadge>
                          </td>
                          <td className="oh-visible-col-actions oh-training-table__col-action">
                            <button
                              type="button"
                              className="btn btn-secondary oh-training-table__action"
                              disabled={Boolean(hideBusyId)}
                              title={t("trainingOrders.pool.hideFromRoundHint")}
                              onClick={() => hideOrder(row)}
                            >
                              {busy ? t("trainingOrders.overview.visiblePreview.hideBusy") : t("trainingOrders.overview.visiblePreview.hide")}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {status === "success" && pagination.total > 0 ? (
              <DashboardToolbar className="oh-training-pagination oh-training-visible-preview__pagination">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("trainingOrders.overview.visiblePreview.prev")}
                </button>
                <span className="help oh-training-num">
                  {trainingAdminT(t, "trainingOrders.overview.visiblePreview.pageOf", { page, totalPages })}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("trainingOrders.overview.visiblePreview.next")}
                </button>
              </DashboardToolbar>
            ) : null}
          </OverviewWidgetFrame>
        </div>
      </section>

      <TrainingOrderApplicantsModal
        open={applicantsModalOpen}
        orderTitle={applicantsModalOrder?.title}
        applicantsTotal={applicantsModalTotal}
        loading={applicantsModalLoading}
        error={applicantsModalError}
        applicants={applicantsModalApps}
        page={applicantsModalPage}
        pagination={applicantsModalPagination}
        onPageChange={(nextPage) => {
          if (applicantsModalOrder) void fetchApplicantsModalPage(applicantsModalOrder, nextPage);
        }}
        onClose={closeApplicantsModal}
      />
    </>
  );
}
