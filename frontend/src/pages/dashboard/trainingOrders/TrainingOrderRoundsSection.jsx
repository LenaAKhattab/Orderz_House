import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { adminCancelTrainingRoundRequest, adminListTrainingRoundsRequest } from "../../../services/api";

import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";

import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";

import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";

import StatusBadge from "../../../components/dashboard/StatusBadge";

import {

  formatAdminDateTime,

  formatAdminNumber,

  formatAdminRange,

  formatRoundTableTitle,

  getRoundSourceLabel,

  getRoundStatusLabel,

  trainingAdminT,

} from "./trainingOrdersDisplayUtils";

import { useTranslation } from "../../../i18n/LanguageProvider";

import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";

import { useToast } from "../../../components/ui/toastContext";

import "./trainingOrdersAdmin.css";



function roundStatusTone(status) {

  if (status === "active") return "success";

  if (status === "scheduled") return "pending";

  if (status === "expired") return "inactive";

  if (status === "stopped") return "warning";

  return "neutral";

}



function canStopRoundStatus(status) {

  return status === "active" || status === "scheduled";

}



function roundRowClassName(status) {

  const classes = [];

  if (status === "active") classes.push("oh-training-table__row--active");

  if (status === "expired" || status === "stopped") classes.push("oh-training-table__row--muted");

  return classes.length ? classes.join(" ") : undefined;

}



function RoundPeriodCell({ startsAt, expiresAt, t }) {

  const from = formatAdminDateTime(startsAt);

  const to = formatAdminDateTime(expiresAt);

  if (from === "—" && to === "—") return "—";



  return (
    <div className="oh-period-cell">
      {from !== "—" ? (
        <div className="oh-period-line">
          <span className="oh-period-label">{t("trainingOrders.rounds.periodFrom")}</span>
          <span className="oh-period-value oh-num" dir="ltr">
            {from}
          </span>
        </div>
      ) : null}
      {to !== "—" ? (
        <div className="oh-period-line">
          <span className="oh-period-label">{t("trainingOrders.rounds.periodTo")}</span>
          <span className="oh-period-value oh-num" dir="ltr">
            {to}
          </span>
        </div>
      ) : null}
    </div>
  );

}



export default function TrainingOrderRoundsSection({ onRoundsChanged, refreshKey = 0 }) {

  const { t } = useTranslation();

  const { push } = useToast();

  const hasLoadedOnceRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [pageRefreshing, setPageRefreshing] = useState(false);

  const [error, setError] = useState("");

  const [page, setPage] = useState(1);

  const [rounds, setRounds] = useState([]);

  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [statusFilter, setStatusFilter] = useState("");

  const [busyId, setBusyId] = useState(null);



  const errMsg = (e) => getSafeApiErrorMessage(e) || t("trainingOrders.rounds.genericError");



  const load = useCallback(async ({ silent = false } = {}) => {
    const keepVisible = silent || hasLoadedOnceRef.current;
    if (!keepVisible) {
      setError("");
      setLoading(true);
    } else {
      setPageRefreshing(true);
    }

    try {
      const res = await adminListTrainingRoundsRequest({
        page,
        limit: 10,
        status: statusFilter || undefined,
      });
      const payload = res?.data ?? res;
      setRounds(payload?.rounds || []);
      setPagination(payload?.pagination || { page: 1, totalPages: 1, total: 0 });
      hasLoadedOnceRef.current = true;
    } catch (e) {
      if (!keepVisible) {
        setError(errMsg(e));
      }
    } finally {
      setLoading(false);
      setPageRefreshing(false);
    }
  }, [page, statusFilter, t]);



  useEffect(() => {
    const silent = hasLoadedOnceRef.current;
    void load({ silent });
  }, [load, refreshKey]);



  const cancel = async (r) => {

    if (!canStopRoundStatus(r.status) || busyId != null) return;

    if (!window.confirm(t("trainingOrders.actions.confirm.stopRound", { title: r.title || "—" }))) return;

    setBusyId(r.id);

    setError("");

    try {

      await adminCancelTrainingRoundRequest(r.id);

      push({

        type: "success",

        title: t("trainingOrders.rounds.stopRound"),

        message: t("trainingOrders.actions.toast.roundStopped"),

      });

      await load({ silent: true });

      onRoundsChanged?.();

    } catch (e) {

      const status = e?.response?.status;

      push({

        type: "error",

        title:

          status === 403

            ? t("trainingOrders.actions.toast.permissionDenied")

            : t("trainingOrders.actions.toast.roundStopFailed"),

        message: errMsg(e),

      });

    } finally {

      setBusyId(null);

    }

  };



  const totalPages = useMemo(() => Math.max(1, pagination?.totalPages || 1), [pagination]);



  return (

    <section id="round-history" className="oh-training-rounds-section oh-training-overview__section" aria-labelledby="oh-training-rounds-heading">

      <header className="oh-training-rounds-section__header oh-training-rounds-section__header--toolbar">

        <div className="oh-training-rounds-section__title-row">

          <h2 id="oh-training-rounds-heading" className="oh-training-rounds-section__title">

            {t("trainingOrders.rounds.title")}

          </h2>

          <label className="oh-training-rounds-section__filter oh-training-rounds-section__filter--inline">

            <span className="oh-training-rounds-section__filter-label">{t("trainingOrders.rounds.statusFilterLabel")}</span>

            <select

              value={statusFilter}

              onChange={(e) => {

                setStatusFilter(e.target.value);

                setPage(1);

              }}

            >

              <option value="">{t("trainingOrders.rounds.all")}</option>

              <option value="scheduled">{t("trainingOrders.roundStatus.scheduled")}</option>

              <option value="active">{t("trainingOrders.roundStatus.active")}</option>

              <option value="expired">{t("trainingOrders.roundStatus.expired")}</option>

              <option value="stopped">{t("trainingOrders.roundStatus.stopped")}</option>

            </select>

          </label>

        </div>

        <p className="oh-training-rounds-section__description">{t("trainingOrders.rounds.description")}</p>

      </header>



      {error ? <p className="auth-form-error">{error}</p> : null}

      {loading && rounds.length === 0 ? (

        <DashboardLoadingState label={t("trainingOrders.rounds.loading")} />

      ) : rounds.length === 0 ? (

        <DashboardEmptyState title={t("trainingOrders.rounds.emptyList")} />

      ) : (

        <div className="oh-training-table-wrap oh-training-table-wrap--history">

          <table className="oh-training-table oh-training-table--history oh-round-history-table">
            <colgroup>
              <col className="oh-round-col-title" />
              <col className="oh-round-col-source" />
              <col className="oh-round-col-status" />
              <col className="oh-round-col-range" />
              <col className="oh-round-col-count" />
              <col className="oh-round-col-period" />
              <col className="oh-round-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th className="oh-round-col-title">{t("trainingOrders.rounds.colTitle")}</th>
                <th className="oh-round-col-source">{t("trainingOrders.rounds.colSource")}</th>
                <th className="oh-round-col-status">{t("trainingOrders.rounds.colStatus")}</th>
                <th className="oh-round-col-range">{t("trainingOrders.rounds.colRange")}</th>
                <th className="oh-round-col-count">{t("trainingOrders.rounds.colOrderCount")}</th>
                <th className="oh-round-col-period">{t("trainingOrders.rounds.colPeriod")}</th>
                <th className="oh-round-col-action oh-training-table__col-action">{t("trainingOrders.rounds.colAction")}</th>
              </tr>
            </thead>

            <tbody>

              {rounds.map((r) => {

                const stoppable = canStopRoundStatus(r.status);

                const isActive = r.status === "active";

                return (

                  <tr key={r.id} className={roundRowClassName(r.status)}>
                    <td className="oh-round-col-title">
                      <div className="oh-training-round-title">
                        <strong title={formatRoundTableTitle(r.id, t)}>{formatRoundTableTitle(r.id, t)}</strong>
                        {isActive ? (
                          <span className="oh-training-round-title__current">{t("trainingOrders.rounds.currentLabel")}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="oh-round-col-source">{getRoundSourceLabel(r.roundSource, t)}</td>
                    <td className="oh-round-col-status">
                      <StatusBadge tone={roundStatusTone(r.status)}>{getRoundStatusLabel(r.status, t)}</StatusBadge>
                    </td>
                    <td className="oh-round-col-range oh-num" dir="ltr">
                      {formatAdminRange(r.minOrders, r.maxOrders)}
                    </td>
                    <td className="oh-round-col-count oh-num" dir="ltr">
                      {formatAdminNumber(r.generatedCount)}
                    </td>
                    <td className="oh-round-col-period">
                      <RoundPeriodCell startsAt={r.startsAt} expiresAt={r.expiresAt} t={t} />
                    </td>
                    <td className="oh-round-col-action oh-training-table__col-action">

                      {stoppable ? (

                        <button

                          type="button"

                          className="btn btn-secondary btn-sm oh-training-table__action"

                          disabled={busyId === r.id}

                          onClick={() => cancel(r)}

                        >

                          {busyId === r.id ? t("trainingOrders.rounds.busy") : t("trainingOrders.rounds.stopRound")}

                        </button>

                      ) : (

                        <span className="oh-training-table__no-action" aria-hidden="true">

                          —

                        </span>

                      )}

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      )}



      <DashboardToolbar className="oh-training-pagination">

        <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>

          {t("trainingOrders.rounds.prev")}

        </button>

        <span className="help oh-training-num">{trainingAdminT(t, "trainingOrders.rounds.pageOf", { page, totalPages })}</span>

        <button type="button" className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>

          {t("trainingOrders.rounds.next")}

        </button>

      </DashboardToolbar>

    </section>

  );

}


