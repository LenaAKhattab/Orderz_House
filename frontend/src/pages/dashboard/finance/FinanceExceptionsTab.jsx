import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { adminListPaymentExceptionsRequest } from "../../../services/api";
import { FinanceNotice } from "../../../components/orders/smart/FinanceBits";
import PaymentExceptionsList from "../../../components/orders/smart/PaymentExceptionsList";

export default function FinanceExceptionsTab({ canResolve }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [status, setStatus] = useState("open");
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await adminListPaymentExceptionsRequest(status);
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      push({ type: "error", title: f("exceptions.failed"), message: getSafeApiErrorMessage(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, push]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fin-tab" data-testid="finance-exceptions">
      <FinanceNotice tone="warning" testId="finance-exceptions-notice">
        {f("exceptions.decisionOnly")}
      </FinanceNotice>
      <div className="smart-editor-tabs" role="group" aria-label={f("exceptions.filter")}>
        {["open", "resolved", "all"].map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn-sm ${status === s ? "btn-primary" : "btn-secondary"}`}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
          >
            {f(`exceptions.filters.${s}`)}
          </button>
        ))}
      </div>
      {!rows ? <p className="help">{f("common.loading")}</p> : <PaymentExceptionsList rows={rows} canResolve={canResolve} onChanged={load} />}
    </div>
  );
}
