import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { formatAdminNumber, formatJoDateTime, trainingAdminT } from "./trainingOrdersDisplayUtils";

export default function TrainingOrderApplicantsModal({
  open,
  orderTitle,
  applicantsTotal,
  loading,
  error,
  applicants,
  page = 1,
  pagination,
  onPageChange,
  onClose,
}) {
  const { t, locale } = useTranslation();

  if (!open) return null;

  const totalApplicants = applicantsTotal ?? applicants?.length ?? 0;
  const pageSize = pagination?.limit ?? 5;
  const totalPages = Math.max(1, pagination?.totalPages ?? 1);
  const rowOffset = (page - 1) * pageSize;
  const showPagination = totalApplicants > pageSize && totalPages > 1;

  return (
    <div
      className="oh-training-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="oh-training-modal oh-training-modal--applicants oh-training-applicants-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-order-applicants-modal-title"
      >
        <div className="oh-training-applicants-modal__head">
          <div className="oh-training-applicants-modal__head-main">
            <h3 id="training-order-applicants-modal-title" className="oh-training-applicants-modal__title">
              {t("trainingOrders.overview.visiblePreview.applicantsModalTitle")}
            </h3>
            {orderTitle ? (
              <p className="oh-training-applicants-modal__order-title">{orderTitle}</p>
            ) : null}
            <span className="oh-training-applicants-modal__total-badge oh-training-num" dir="ltr">
              {trainingAdminT(t, "trainingOrders.overview.visiblePreview.applicantsTotal", {
                count: totalApplicants,
              })}
            </span>
          </div>
          <button
            type="button"
            className="oh-training-applicants-modal__close"
            onClick={onClose}
            aria-label={t("trainingOrders.applications.close")}
          >
            ×
          </button>
        </div>

        {error ? (
          <p className="auth-form-error oh-training-applicants-modal__error">{error}</p>
        ) : totalApplicants === 0 && !loading ? (
          <DashboardEmptyState title={t("trainingOrders.overview.visiblePreview.applicantsEmpty")} />
        ) : (
          <>
            <div className="oh-training-applicants-modal__table-card">
              {loading ? (
                <DashboardLoadingState label={t("trainingOrders.applications.loadingApplicants")} rows={3} />
              ) : (
                <div className="oh-training-table-wrap oh-training-applicants-modal__table-wrap">
                  <table className="oh-training-table oh-training-applicants-modal__table">
                    <colgroup>
                      <col className="oh-app-modal-col-index" />
                      <col className="oh-app-modal-col-user" />
                      <col className="oh-app-modal-col-account" />
                      <col className="oh-app-modal-col-plan" />
                      <col className="oh-app-modal-col-amount" />
                      <col className="oh-app-modal-col-status" />
                      <col className="oh-app-modal-col-submitted" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="oh-app-modal-col-index">{t("trainingOrders.overview.visiblePreview.modalColNumber")}</th>
                        <th className="oh-app-modal-col-user">{t("trainingOrders.overview.visiblePreview.modalColUser")}</th>
                        <th className="oh-app-modal-col-account">{t("trainingOrders.overview.visiblePreview.modalColAccount")}</th>
                        <th className="oh-app-modal-col-plan">{t("trainingOrders.overview.visiblePreview.modalColPlan")}</th>
                        <th className="oh-app-modal-col-amount">{t("trainingOrders.overview.visiblePreview.modalColAmount")}</th>
                        <th className="oh-app-modal-col-status">{t("trainingOrders.overview.visiblePreview.modalColStatus")}</th>
                        <th className="oh-app-modal-col-submitted">{t("trainingOrders.overview.visiblePreview.modalColSubmittedAt")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applicants.map((a, index) => (
                        <tr key={a.id}>
                          <td className="oh-app-modal-col-index oh-training-num" dir="ltr">
                            {formatAdminNumber(rowOffset + index + 1)}
                          </td>
                          <td className="oh-app-modal-col-user">{a.freelancerName || "—"}</td>
                          <td className="oh-app-modal-col-account oh-training-num" dir="ltr">
                            {formatAdminNumber(a.accountId || a.freelancerUserId)}
                          </td>
                          <td className="oh-app-modal-col-plan">{a.planTitle || "—"}</td>
                          <td className="oh-app-modal-col-amount oh-training-num" dir="ltr">
                            {a.amount != null ? `${formatAdminNumber(a.amount, { maximumFractionDigits: 2 })} JOD` : "—"}
                          </td>
                          <td className="oh-app-modal-col-status">{a.status || "—"}</td>
                          <td className="oh-app-modal-col-submitted oh-num" dir="ltr">
                            {a.createdAt ? formatJoDateTime(a.createdAt, locale) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {showPagination ? (
              <DashboardToolbar className="oh-training-applicants-modal__pagination">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading || page <= 1}
                  onClick={() => onPageChange?.(page - 1)}
                >
                  {t("trainingOrders.overview.visiblePreview.prev")}
                </button>
                <span className="help oh-training-num">
                  {trainingAdminT(t, "trainingOrders.overview.visiblePreview.pageOf", { page, totalPages })}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={loading || page >= totalPages}
                  onClick={() => onPageChange?.(page + 1)}
                >
                  {t("trainingOrders.overview.visiblePreview.next")}
                </button>
              </DashboardToolbar>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
