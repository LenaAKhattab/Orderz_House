import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import {
  adminAddRewardAdjustmentRequest,
  adminApproveRewardPeriodRequest,
  adminCloseRewardPeriodRequest,
  adminCopyPreviousRewardWeightsRequest,
  adminCreateRewardPeriodRequest,
  adminGetRewardPeriodRequest,
  adminListRewardPeriodsRequest,
  adminMarkRewardPeriodPaidRequest,
  adminRewardStaffRequest,
  adminSetRewardWeightsRequest,
} from "../../../services/api";
import { FinanceNotice, FinanceTable, Money, StatusBadge } from "../../../components/orders/smart/FinanceBits";
import {
  REASON_MIN,
  buildWeightsPayload,
  currentMonth,
  evaluateWeights,
  isValidAmount,
} from "../../../components/orders/smart/financeUtils";

const statusTone = (s) => (s === "draft" ? "neutral" : s === "approved" ? "info" : "success");

/** Monthly employee reward pool: periods, weights (exactly 100.00 %), preview, approve/close/pay, adjustments. */
export default function FinanceRewardsTab({ canPayout }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [periods, setPeriods] = useState(null);
  const [staff, setStaff] = useState([]);
  const [month, setMonth] = useState(() => currentMonth());
  const [selectedId, setSelectedId] = useState(null);
  const [period, setPeriod] = useState(null);
  const [weights, setWeights] = useState([]);
  const [addUserId, setAddUserId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [adj, setAdj] = useState({ userId: "", amount: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const loadPeriods = useCallback(async () => {
    try {
      const res = await adminListRewardPeriodsRequest();
      setPeriods(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      push({ type: "error", title: f("rewards.failed"), message: getSafeApiErrorMessage(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [push]);

  const applyPeriod = (p) => {
    setPeriod(p);
    setWeights((p?.preview?.weights || []).map((w) => ({ userId: String(w.userId), name: w.name, percent: String(w.percent) })));
  };

  const loadPeriod = useCallback(
    async (id) => {
      if (!id) return;
      try {
        const res = await adminGetRewardPeriodRequest(id);
        applyPeriod(res?.data || null);
      } catch (e) {
        push({ type: "error", title: f("rewards.failed"), message: getSafeApiErrorMessage(e) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push],
  );

  useEffect(() => {
    void loadPeriods();
    adminRewardStaffRequest()
      .then((res) => setStaff(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, [loadPeriods]);

  useEffect(() => {
    void loadPeriod(selectedId);
  }, [selectedId, loadPeriod]);

  const run = async (fn, after) => {
    setBusy(true);
    try {
      const res = await fn();
      push({ type: "success", title: f("common.saved") });
      if (res?.data?.id) applyPeriod(res.data);
      else await loadPeriod(selectedId);
      if (typeof after === "function") after(res);
      await loadPeriods();
    } catch (e) {
      push({ type: "error", title: f("rewards.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const check = useMemo(() => evaluateWeights(weights), [weights]);
  const staffName = (id) => staff.find((s) => String(s.id) === String(id))?.name || weights.find((w) => w.userId === String(id))?.name || `#${id}`;
  const isDraft = period?.status === "draft";
  const preview = period?.preview || null;
  const policyActive = Boolean(preview?.policyActive);
  const addable = staff.filter((s) => !weights.some((w) => w.userId === String(s.id)));
  const beneficiaries = period?.allocations?.length ? period.allocations : staff.map((s) => ({ userId: String(s.id), name: s.name }));

  return (
    <div className="fin-tab" data-testid="finance-rewards">
      <section className="fin-card">
        <h3>{f("rewards.periods")}</h3>
        <form
          className="fin-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => adminCreateRewardPeriodRequest(month),
              (res) => {
                if (res?.data?.id) setSelectedId(String(res.data.id));
              },
            );
          }}
        >
          <label className="field">
            <span className="label">{f("rewards.month")}</span>
            <input className="input" type="month" max={currentMonth()} value={month} onChange={(e) => setMonth(e.target.value)} data-testid="finance-reward-month" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !/^\d{4}-\d{2}$/.test(month)}>
            {f("rewards.create")}
          </button>
        </form>
        {!periods ? <p className="help">{f("common.loading")}</p> : null}
        {periods && !periods.length ? <p className="help">{f("common.none")}</p> : null}
        {periods && periods.length ? (
          <FinanceTable caption={f("rewards.periods")} testId="finance-reward-periods">
            <thead>
              <tr>
                <th scope="col">{f("rewards.month")}</th>
                <th scope="col">{f("rewards.status")}</th>
                <th scope="col">{f("rewards.paymentStatus")}</th>
                <th scope="col">{f("rewards.pool")}</th>
                <th scope="col">
                  <span className="fin-sr-only">{f("rewards.open")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} aria-selected={selectedId === String(p.id)}>
                  <td dir="ltr">{p.month}</td>
                  <td>
                    <StatusBadge tone={statusTone(p.status)}>{f(`rewards.statuses.${p.status}`)}</StatusBadge>
                  </td>
                  <td>{f(`rewards.paymentStatuses.${p.paymentStatus}`)}</td>
                  <td>
                    <Money amount={p.frozen?.pool ?? p.preview?.pool} currency="JOD" />
                  </td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedId(String(p.id))}>
                      {f("rewards.open")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </FinanceTable>
        ) : null}
      </section>

      {period ? (
        <section className="fin-card" data-testid="finance-reward-period" data-status={period.status}>
          <div className="fin-card__head">
            <h3 dir="auto">{f("rewards.periodTitle", { month: period.month })}</h3>
            <div className="fin-card__badges">
              <StatusBadge tone={statusTone(period.status)}>{f(`rewards.statuses.${period.status}`)}</StatusBadge>
              <span className="oh-mini-chip">{f(`rewards.paymentStatuses.${period.paymentStatus}`)}</span>
            </div>
          </div>

          {isDraft && preview ? (
            <>
              {!policyActive ? (
                <FinanceNotice tone="warning" testId="finance-reward-policy-disabled">
                  {f("rewards.previewOnly")}
                </FinanceNotice>
              ) : null}
              <dl className="fin-dl">
                <div>
                  <dt>{f("rewards.percent")}</dt>
                  <dd dir="ltr">{preview.percent}%</dd>
                </div>
                <div>
                  <dt>{f("rewards.companyShare")}</dt>
                  <dd>
                    <Money amount={preview.companyShare} currency="JOD" />
                  </dd>
                </div>
                <div>
                  <dt>{f("rewards.pool")}</dt>
                  <dd>
                    <Money amount={preview.pool} currency="JOD" testId="finance-reward-pool" />
                  </dd>
                </div>
                <div>
                  <dt>{f("rewards.settlementCount")}</dt>
                  <dd>{preview.settlementCount ?? 0}</dd>
                </div>
              </dl>

              <h4>{f("rewards.weights")}</h4>
              <p className="help">{f("rewards.weightsHint")}</p>
              {weights.length ? (
                <FinanceTable caption={f("rewards.weights")} testId="finance-reward-weights">
                  <thead>
                    <tr>
                      <th scope="col">{f("rewards.person")}</th>
                      <th scope="col">{f("rewards.percentCol")}</th>
                      <th scope="col">{f("rewards.previewAmount")}</th>
                      <th scope="col">
                        <span className="fin-sr-only">{f("rewards.remove")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {weights.map((w, i) => {
                      const saved = preview.weights?.find((x) => String(x.userId) === w.userId);
                      return (
                        <tr key={w.userId}>
                          <td dir="auto">{staffName(w.userId)}</td>
                          <td>
                            <input
                              className="input fin-input-narrow"
                              dir="ltr"
                              inputMode="decimal"
                              aria-label={f("rewards.percentFor", { name: staffName(w.userId) })}
                              value={w.percent}
                              onChange={(e) => setWeights(weights.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))}
                            />
                          </td>
                          <td>{saved && saved.percent === w.percent ? <Money amount={saved.amount} currency="JOD" /> : "—"}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              aria-label={f("rewards.removeFor", { name: staffName(w.userId) })}
                              onClick={() => setWeights(weights.filter((_, j) => j !== i))}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </FinanceTable>
              ) : (
                <p className="help">{f("rewards.noWeights")}</p>
              )}
              <p className={`fin-total ${check.valid ? "fin-total--ok" : "fin-total--bad"}`} data-testid="finance-reward-total" data-valid={check.valid}>
                {f("rewards.total")}: <strong dir="ltr">{check.totalLabel}%</strong> {check.valid ? "✓" : `· ${f("rewards.totalMustBe")}`}
              </p>
              <div className="smart-panel__inline">
                <select className="input" aria-label={f("rewards.addPerson")} value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                  <option value="">{f("rewards.addPerson")}</option>
                  {addable.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!addUserId}
                  onClick={() => {
                    setWeights([...weights, { userId: addUserId, name: staffName(addUserId), percent: "" }]);
                    setAddUserId("");
                  }}
                >
                  {f("rewards.add")}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  data-testid="finance-reward-copy-previous"
                  onClick={() => void run(() => adminCopyPreviousRewardWeightsRequest(period.id))}
                >
                  {f("rewards.copyPrevious")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !check.valid}
                  data-testid="finance-reward-save-weights"
                  onClick={() => void run(() => adminSetRewardWeightsRequest(period.id, buildWeightsPayload(weights)))}
                >
                  {f("rewards.saveWeights")}
                </button>
              </div>
              {canPayout ? (
                <div className="smart-panel__inline">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !policyActive || !preview.weightsValid}
                    data-testid="finance-reward-approve"
                    onClick={() => void run(() => adminApproveRewardPeriodRequest(period.id))}
                  >
                    {f("rewards.approve")}
                  </button>
                  {!preview.weightsValid ? <span className="help">{f("rewards.saveFirst")}</span> : null}
                </div>
              ) : null}
            </>
          ) : null}

          {!isDraft ? (
            <>
              <dl className="fin-dl">
                <div>
                  <dt>{f("rewards.percent")}</dt>
                  <dd dir="ltr">{period.frozen?.percent}%</dd>
                </div>
                <div>
                  <dt>{f("rewards.policyVersion")}</dt>
                  <dd>{period.frozen?.policyVersion ?? "—"}</dd>
                </div>
                <div>
                  <dt>{f("rewards.companyShare")}</dt>
                  <dd>
                    <Money amount={period.frozen?.companyShare} currency="JOD" />
                  </dd>
                </div>
                <div>
                  <dt>{f("rewards.pool")}</dt>
                  <dd>
                    <Money amount={period.frozen?.pool} currency="JOD" />
                  </dd>
                </div>
                <div>
                  <dt>{f("rewards.settlementCount")}</dt>
                  <dd>{period.frozen?.settlementCount ?? 0}</dd>
                </div>
                <div>
                  <dt>{f("rewards.approvedAt")}</dt>
                  <dd>{period.approvedAt ? formatLocaleDateTime(period.approvedAt, locale) : "—"}</dd>
                </div>
                <div>
                  <dt>{f("rewards.closedAt")}</dt>
                  <dd>{period.closedAt ? formatLocaleDateTime(period.closedAt, locale) : "—"}</dd>
                </div>
                <div>
                  <dt>{f("rewards.paidAt")}</dt>
                  <dd>
                    {period.paidAt ? formatLocaleDateTime(period.paidAt, locale) : "—"}
                    {period.paymentReference ? (
                      <>
                        {" · "}
                        <span dir="auto">{period.paymentReference}</span>
                      </>
                    ) : null}
                  </dd>
                </div>
              </dl>
              <h4>{f("rewards.allocations")}</h4>
              <FinanceTable caption={f("rewards.allocations")} testId="finance-reward-allocations">
                <thead>
                  <tr>
                    <th scope="col">{f("rewards.person")}</th>
                    <th scope="col">{f("rewards.percentCol")}</th>
                    <th scope="col">{f("common.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(period.allocations || []).map((a) => (
                    <tr key={a.userId}>
                      <td dir="auto">{a.name}</td>
                      <td dir="ltr">{a.percent}%</td>
                      <td>
                        <Money amount={a.amount} currency="JOD" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </FinanceTable>
              {(period.adjustments || []).length ? (
                <>
                  <h4>{f("rewards.adjustments")}</h4>
                  <ul className="smart-events">
                    {period.adjustments.map((a) => (
                      <li key={a.id}>
                        <span dir="auto">
                          {staffName(a.userId)} · <Money amount={a.amount} currency="JOD" /> · {a.reason}
                        </span>
                        <span className="help">{formatLocaleDateTime(a.createdAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {canPayout ? (
                <div className="fin-actions" data-testid="finance-reward-payout-actions">
                  {period.status === "approved" ? (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => adminCloseRewardPeriodRequest(period.id))}>
                      {f("rewards.close")}
                    </button>
                  ) : null}
                  {period.status === "closed" && period.paymentStatus === "unpaid" ? (
                    <div className="smart-panel__inline">
                      <input
                        className="input"
                        dir="auto"
                        maxLength={200}
                        placeholder={f("rewards.paymentReference")}
                        aria-label={f("rewards.paymentReference")}
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy || paymentReference.trim().length < 3}
                        onClick={() => void run(() => adminMarkRewardPeriodPaidRequest(period.id, paymentReference.trim()), () => setPaymentReference(""))}
                      >
                        {f("rewards.markPaid")}
                      </button>
                    </div>
                  ) : null}
                  <form
                    className="fin-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(
                        () => adminAddRewardAdjustmentRequest(period.id, { userId: adj.userId, amount: adj.amount.trim(), reason: adj.reason.trim() }),
                        () => setAdj({ userId: "", amount: "", reason: "" }),
                      );
                    }}
                  >
                    <h4>{f("rewards.addAdjustment")}</h4>
                    <p className="help">{f("rewards.adjustmentHint")}</p>
                    <div className="smart-editor-grid">
                      <label className="field">
                        <span className="label">{f("rewards.person")}</span>
                        <select className="input" value={adj.userId} onChange={(e) => setAdj({ ...adj, userId: e.target.value })}>
                          <option value="">{f("common.choose")}</option>
                          {beneficiaries.map((b) => (
                            <option key={b.userId} value={String(b.userId)}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">{f("rewards.adjustmentAmount")}</span>
                        <input className="input" dir="ltr" inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="label">{f("common.reason")}</span>
                        <input className="input" dir="auto" maxLength={500} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
                      </label>
                    </div>
                    <div>
                      <button
                        type="submit"
                        className="btn btn-secondary"
                        disabled={busy || !adj.userId || !isValidAmount(adj.amount, { allowNegative: true }) || adj.reason.trim().length < REASON_MIN}
                      >
                        {f("rewards.addAdjustment")}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
