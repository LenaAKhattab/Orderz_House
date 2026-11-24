import { useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { adminMyRewardsRequest } from "../../../services/api";
import { FinanceTable, Money } from "../../../components/orders/smart/FinanceBits";

/** The signed-in staff member's own rewards only (no company figures). */
export default function FinanceMyRewardsTab() {
  const { t } = useTranslation();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    adminMyRewardsRequest()
      .then((res) => {
        if (!cancelled) setRows(Array.isArray(res?.data) ? res.data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(getSafeApiErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fin-tab" data-testid="finance-my-rewards">
      <p className="help">{f("mine.hint")}</p>
      {error ? <p className="oh-inline-alert">{error}</p> : null}
      {!rows && !error ? <p className="help">{f("common.loading")}</p> : null}
      {rows && !rows.length ? <p className="help">{f("mine.empty")}</p> : null}
      {rows && rows.length ? (
        <FinanceTable caption={f("tabs.mine")}>
          <thead>
            <tr>
              <th scope="col">{f("rewards.month")}</th>
              <th scope="col">{f("rewards.percentCol")}</th>
              <th scope="col">{f("common.amount")}</th>
              <th scope="col">{f("rewards.status")}</th>
              <th scope="col">{f("rewards.paymentStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td dir="ltr">{r.month}</td>
                <td dir="ltr">{r.percent}%</td>
                <td>
                  <Money amount={r.amount} currency="JOD" />
                </td>
                <td>{f(`rewards.statuses.${r.status}`)}</td>
                <td>{f(`rewards.paymentStatuses.${r.paymentStatus}`)}</td>
              </tr>
            ))}
          </tbody>
        </FinanceTable>
      ) : null}
    </div>
  );
}
