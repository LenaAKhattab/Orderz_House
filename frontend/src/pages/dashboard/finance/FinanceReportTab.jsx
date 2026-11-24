import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { adminFinanceReportRequest, getCategoriesRequest } from "../../../services/api";
import { localizeCategoryName } from "../../../lib/i18n/platformContentLocale";
import { FinanceTable, Money } from "../../../components/orders/smart/FinanceBits";
import {
  CUSTOMER_MODE_ROWS,
  SETTLED_ROWS,
  buildMoneyBlocks,
  defaultReportRange,
  reportRangeParams,
} from "../../../components/orders/smart/financeUtils";

const WHATSAPP_STATUSES = ["pending_review", "approved", "rejected"];

/** Management report: counts, activation, money in three separate blocks (never mixed across currencies). */
export default function FinanceReportTab() {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [range, setRange] = useState(() => defaultReportRange());
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCategoriesRequest()
      .then((res) => {
        if (!cancelled) setCategories(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await adminFinanceReportRequest({ ...reportRangeParams(range.from, range.to), categoryId });
      setData(res?.data || null);
    } catch (e) {
      push({ type: "error", title: f("report.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, categoryId, push]);

  useEffect(() => {
    void load();
    // Initial load only; later loads are explicit (Apply).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blocks = data ? buildMoneyBlocks(data.money) : null;
  const currencyRows = (rows, testId) =>
    rows.length ? (
      <FinanceTable caption={f("report.byCurrency")} testId={testId}>
        <thead>
          <tr>
            <th scope="col">{f("common.currency")}</th>
            <th scope="col">{f("common.count")}</th>
            <th scope="col">{f("common.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.currency} data-currency={r.currency}>
              <td dir="ltr">{r.currency}</td>
              <td>{r.count}</td>
              <td>
                <Money amount={r.amount} currency={r.currency} />
              </td>
            </tr>
          ))}
        </tbody>
      </FinanceTable>
    ) : (
      <p className="help">{f("common.none")}</p>
    );

  return (
    <div className="fin-tab" data-testid="finance-report">
      <form
        className="fin-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label className="field">
          <span className="label">{f("report.from")}</span>
          <input className="input" type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">{f("report.to")}</span>
          <input className="input" type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
        <label className="field">
          <span className="label">{f("report.category")}</span>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{f("report.allCategories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {localizeCategoryName(c, locale)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="finance-report-apply">
          {f("report.apply")}
        </button>
      </form>

      {!data ? <p className="help">{busy ? f("common.loading") : f("common.none")}</p> : null}
      {data ? (
        <>
          <section className="fin-card" data-testid="finance-report-orders">
            <h3>{f("report.ordersHeading")}</h3>
            <div className="fin-stats">
              <div className="fin-stat">
                <span className="fin-stat__label">{f("report.total")}</span>
                <strong>{data.orders?.total ?? 0}</strong>
              </div>
              {CUSTOMER_MODE_ROWS.map((k) => (
                <div className="fin-stat" key={k}>
                  <span className="fin-stat__label">{f(`report.modes.${k}`)}</span>
                  <strong>{data.orders?.[k] ?? 0}</strong>
                </div>
              ))}
              <div className="fin-stat">
                <span className="fin-stat__label">{f("report.completed")}</span>
                <strong>{data.orders?.completed ?? 0}</strong>
              </div>
              <div className="fin-stat">
                <span className="fin-stat__label">{f("report.cancelled")}</span>
                <strong>{data.orders?.cancelled ?? 0}</strong>
              </div>
            </div>
          </section>

          <div className="fin-grid-2">
            <section className="fin-card">
              <h3>{f("report.topCategories")}</h3>
              {(data.byCategory || []).length ? (
                <ol className="fin-list">
                  {data.byCategory.map((c) => (
                    <li key={c.categoryId}>
                      <span>{localizeCategoryName({ name: c.name }, locale)}</span>
                      <strong>{c.count}</strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="help">{f("common.none")}</p>
              )}
            </section>
            <section className="fin-card">
              <h3>{f("report.activation")}</h3>
              <div className="fin-stats">
                <div className="fin-stat">
                  <span className="fin-stat__label">{f("report.eligible")}</span>
                  <strong>{data.accountActivation?.eligible ?? 0}</strong>
                </div>
                <div className="fin-stat">
                  <span className="fin-stat__label">{f("report.activated")}</span>
                  <strong>{data.accountActivation?.activated ?? 0}</strong>
                </div>
                <div className="fin-stat">
                  <span className="fin-stat__label">{f("report.pendingSettlements")}</span>
                  <strong data-testid="finance-report-pending">{data.pendingSettlements ?? 0}</strong>
                </div>
              </div>
            </section>
          </div>

          <h3 className="fin-heading">{f("report.moneyHeading")}</h3>
          <p className="help">{f("report.moneyHint")}</p>
          <div className="fin-money-blocks">
            <section className="fin-card fin-card--quoted" data-testid="finance-money-quoted">
              <h4>{f("report.quoted")}</h4>
              <p className="help">{f("report.quotedHint")}</p>
              {currencyRows(blocks.quoted, "finance-money-quoted-table")}
            </section>
            <section className="fin-card fin-card--received" data-testid="finance-money-received">
              <h4>{f("report.received")}</h4>
              <p className="help">{f("report.receivedQuotes")}</p>
              {currencyRows(blocks.received.quotePayments, "finance-money-received-table")}
              {blocks.received.clientMarketplace ? (
                <div className="smart-panel__row">
                  <span className="smart-panel__label">{f("report.receivedMarketplace")}</span>
                  <span className="smart-panel__value">
                    <Money amount={blocks.received.clientMarketplace.amount} currency={blocks.received.clientMarketplace.currency} /> ·{" "}
                    {f("common.countValue", { count: blocks.received.clientMarketplace.count })}
                  </span>
                </div>
              ) : null}
              <h5>{f("report.unallocated")}</h5>
              <p className="help">{f("report.unallocatedHint")}</p>
              {currencyRows(blocks.received.unallocated, "finance-money-unallocated-table")}
            </section>
            <section className="fin-card fin-card--settled" data-testid="finance-money-settled">
              <h4>{f("report.settled", { currency: blocks.settled?.baseCurrency || "JOD" })}</h4>
              <p className="help">{f("report.settledHint", { count: blocks.settled?.count ?? 0 })}</p>
              {blocks.settled ? (
                <dl className="fin-dl">
                  {SETTLED_ROWS.map((k) => (
                    <div key={k}>
                      <dt>{f(`report.settledRows.${k}`)}</dt>
                      <dd>
                        <Money amount={blocks.settled[k]} currency={blocks.settled.baseCurrency} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          </div>

          <div className="fin-grid-2">
            <section className="fin-card" data-testid="finance-report-exceptions">
              <h3>{f("report.exceptions")}</h3>
              {(data.paymentExceptions || []).length ? (
                <FinanceTable caption={f("report.exceptions")}>
                  <thead>
                    <tr>
                      <th scope="col">{f("exceptions.kind")}</th>
                      <th scope="col">{f("exceptions.status")}</th>
                      <th scope="col">{f("common.count")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paymentExceptions.map((r) => (
                      <tr key={`${r.kind}-${r.status}`}>
                        <td>{f(`exceptions.kinds.${r.kind}`)}</td>
                        <td>{f(`exceptions.statuses.${r.status}`)}</td>
                        <td>{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </FinanceTable>
              ) : (
                <p className="help">{f("common.none")}</p>
              )}
            </section>
            <section className="fin-card" data-testid="finance-report-rewards">
              <h3>{f("report.rewards")}</h3>
              <div className="fin-stats">
                <div className="fin-stat">
                  <span className="fin-stat__label">{f("report.rewardPeriods")}</span>
                  <strong>{data.employeeRewards?.periods ?? 0}</strong>
                </div>
                <div className="fin-stat">
                  <span className="fin-stat__label">{f("report.rewardPaid")}</span>
                  <strong>{data.employeeRewards?.paidPeriods ?? 0}</strong>
                </div>
                <div className="fin-stat">
                  <span className="fin-stat__label">{f("report.rewardPool")}</span>
                  <strong>
                    <Money amount={data.employeeRewards?.pool} currency="JOD" />
                  </strong>
                </div>
              </div>
            </section>
          </div>

          <section className="fin-card fin-card--separate" data-testid="finance-report-whatsapp-intake">
            <h3>{f("report.whatsappIntake")}</h3>
            <p className="help">{f("report.whatsappIntakeHint")}</p>
            {Object.keys(data.whatsappIntake || {}).length ? (
              <ul className="fin-list">
                {Object.entries(data.whatsappIntake).map(([status, n]) => (
                  <li key={status}>
                    <span>{WHATSAPP_STATUSES.includes(status) ? t(`dashboard.whatsappOrders.status.${status}`) : status}</span>
                    <strong>{n}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="help">{f("common.none")}</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
