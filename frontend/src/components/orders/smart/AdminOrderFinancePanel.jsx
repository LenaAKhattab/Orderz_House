import { useCallback, useEffect, useState } from "react";
import DashboardModal from "../../dashboard/DashboardModal";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/smartOrdersResources";
import "../../../styles/smartOrders.css";
import { formatLocaleDateTime } from "../../../i18n/formatLocale";
import "../../../i18n/statusesResources";
import { statusLabel } from "../../../i18n/statusRegistry";
import { useToast } from "../../ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import {
  adminAddServiceItemRequest,
  adminCloseSettlementRequest,
  adminGetOrderFinanceRequest,
  adminListFxSnapshotsRequest,
  adminListServiceItemsRequest,
  adminQuoteSuggestionRequest,
  adminRecordOrderAdjustmentRequest,
  adminRecordOrderCostRequest,
  adminRemoveServiceItemRequest,
  adminVoidOrderCostRequest,
} from "../../../services/api";
import { FinanceNotice, FinanceTable, Money, StatusBadge } from "./FinanceBits";
import PaymentExceptionsList from "./PaymentExceptionsList";
import ServiceCatalogStep from "./ServiceCatalogStep";
import ServiceFormSnapshotView from "./ServiceFormSnapshotView";
import { buildServiceFormPayload, emptyServiceDraft, validateServiceDraft } from "./catalogForm";
import { useFinanceCaps } from "./useFinanceCaps";
import {
  ADJUSTMENT_KINDS,
  AMOUNT_ROWS,
  COST_KINDS,
  ITEM_PRICE_CURRENCIES,
  REASON_MIN,
  SETTLEMENT_BLOCKERS,
  expectedSettlementVersion,
  isValidAmount,
  settlementViewState,
} from "./financeUtils";

const LINE_GROUPS = ["revenue", "adjustments", "fees", "qualityChecks", "directCosts"];
const EMPTY_COST = { kind: "direct_expense", amount: "", currency: "JOD", description: "", sourceRef: "", qcProvider: "", qcPassed: false };
const EMPTY_ADJ = { kind: "refund", amount: "", currency: "JOD", reason: "" };

/** Snapshot shape for ServiceFormSnapshotView from a service-items API row. */
const itemSnapshot = (it) => ({ name: it.name, version: it.serviceVersion, fields: it.fields, values: it.values, quantity: it.quantity });

/**
 * Admin per-order finance (S5): settlement preview + close, receipts, costs, adjustments, payment exceptions,
 * multi-service items and the catalog quote suggestion. Visible with finance_view (Super Admin always).
 */
export default function AdminOrderFinancePanel({ orderId, open, onClose, onChanged }) {
  const { t, locale } = useTranslation();
  const { push } = useToast();
  const caps = useFinanceCaps();
  const f = (key, v) => t(`smartOrders.finance.${key}`, v);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fxOptions, setFxOptions] = useState({}); // currency → snapshots
  const [fxPick, setFxPick] = useState({}); // currency → snapshot id
  const [appliedFx, setAppliedFx] = useState([]);
  const [correctionReason, setCorrectionReason] = useState("");
  const [cost, setCost] = useState(EMPTY_COST);
  const [adj, setAdj] = useState(EMPTY_ADJ);
  const [voiding, setVoiding] = useState({ id: null, reason: "" });
  const [items, setItems] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [itemDraft, setItemDraft] = useState(emptyServiceDraft());
  const [itemService, setItemService] = useState(null);
  const [itemPrice, setItemPrice] = useState({ amount: "", currency: "JOD" });
  const [itemNote, setItemNote] = useState("");
  const [itemShowErrors, setItemShowErrors] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const load = useCallback(
    async (fxIds = appliedFx) => {
      if (!orderId) return;
      try {
        const res = await adminGetOrderFinanceRequest(orderId, fxIds);
        setData(res?.data || null);
      } catch (e) {
        push({ type: "error", title: f("panel.failed"), message: getSafeApiErrorMessage(e) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderId, push, appliedFx],
  );

  const loadItems = useCallback(async () => {
    if (!orderId || !caps.orders) return;
    const [itemsRes, suggestionRes] = await Promise.allSettled([adminListServiceItemsRequest(orderId), adminQuoteSuggestionRequest(orderId)]);
    setItems(itemsRes.status === "fulfilled" && Array.isArray(itemsRes.value?.data) ? itemsRes.value.data : []);
    setSuggestion(suggestionRes.status === "fulfilled" ? suggestionRes.value?.data || null : null);
  }, [orderId, caps.orders]);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setAppliedFx([]);
    setFxPick({});
    setCorrectionReason("");
    setAddingItem(false);
    void load([]);
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const settlement = data?.settlement || null;
  const viewState = open && data ? settlementViewState(settlement) : "loading";
  const fxMissingKey = (settlement?.fxMissing || []).join(",");

  // Snapshot choices for each currency that needs a rate.
  useEffect(() => {
    if (!fxMissingKey) return;
    let cancelled = false;
    for (const ccy of fxMissingKey.split(",")) {
      adminListFxSnapshotsRequest(ccy)
        .then((res) => {
          if (!cancelled) setFxOptions((o) => ({ ...o, [ccy]: Array.isArray(res?.data) ? res.data : [] }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [fxMissingKey]);

  const run = async (fn, after) => {
    setBusy(true);
    try {
      const res = await fn();
      push({ type: "success", title: f("common.saved") });
      if (typeof after === "function") after(res);
      await load();
      onChanged?.();
    } catch (e) {
      push({ type: "error", title: f("panel.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const runItems = async (fn, after) => {
    setBusy(true);
    try {
      await fn();
      push({ type: "success", title: f("common.saved") });
      if (typeof after === "function") after();
      await loadItems();
      onChanged?.();
    } catch (e) {
      push({ type: "error", title: f("panel.failed"), message: getSafeApiErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const applyFx = () => {
    const ids = [...new Set([...appliedFx, ...Object.values(fxPick).filter(Boolean)])];
    setAppliedFx(ids);
    void load(ids);
  };

  const latest = settlement?.latestSettlement || null;
  const expectedVersion = expectedSettlementVersion(settlement);
  const dt = (v) => (v ? formatLocaleDateTime(v, locale) : "—");
  const base = settlement?.baseCurrency || "JOD";

  const costValid =
    isValidAmount(cost.amount) &&
    /^[A-Z]{3}$/.test(cost.currency) &&
    cost.description.trim().length >= 3 &&
    (cost.kind !== "quality_check" || cost.qcPassed);
  const adjValid = isValidAmount(adj.amount, { allowNegative: adj.kind === "correction" }) && adj.reason.trim().length >= REASON_MIN;
  const itemErrors = validateServiceDraft(itemService, itemDraft);
  const itemPriceValid = !itemPrice.amount.trim() || /^\d{1,9}(\.\d{1,2})?$/.test(itemPrice.amount.trim());

  const submitItem = () => {
    setItemShowErrors(true);
    if (!itemService || Object.keys(itemErrors).length || !itemPriceValid) return;
    const payload = { serviceForm: buildServiceFormPayload(itemService, itemDraft) };
    if (itemPrice.amount.trim()) payload.price = { amount: itemPrice.amount.trim(), currency: itemPrice.currency };
    if (itemNote.trim()) payload.note = itemNote.trim();
    void runItems(
      () => adminAddServiceItemRequest(orderId, payload),
      () => {
        setItemDraft(emptyServiceDraft());
        setItemPrice({ amount: "", currency: "JOD" });
        setItemNote("");
        setItemShowErrors(false);
        setAddingItem(false);
      },
    );
  };

  return (
    <DashboardModal
      open={open}
      title={settlement?.orderCode ? f("panel.title", { orderCode: settlement.orderCode }) : f("panel.open")}
      onClose={onClose}
      closeDisabled={busy}
      panelClassName="smart-panel-modal"
    >
      <div className="smart-panel fin-panel" data-testid="smart-orders-finance-panel">
        {viewState === "loading" ? <p className="help">{f("common.loading")}</p> : null}
        {viewState === "unsupported" ? (
          <FinanceNotice tone="info" testId="finance-unsupported">
            {f("panel.unsupported")}
          </FinanceNotice>
        ) : null}

        {viewState === "breakdown" ? (
          <>
            {/* ---------------- Settlement preview ---------------- */}
            <div className="smart-panel__section" data-testid="finance-settlement-section">
              <h3>{f("panel.settlement")}</h3>
              <div className="smart-panel__row">
                <span className="smart-panel__label">{f("panel.orderStatus")}</span>
                <span className="smart-panel__value">{statusLabel(t, "orders", settlement.orderStatus)}</span>
              </div>
              {settlement.blockers?.length ? (
                <FinanceNotice tone="warning" testId="finance-blockers">
                  <strong>{f("panel.blockersTitle")}</strong>
                  <ul className="fin-bullets">
                    {settlement.blockers.map((b) => (
                      <li key={b}>{SETTLEMENT_BLOCKERS.includes(b) ? f(`panel.blockers.${b}`, { count: settlement.openExceptions ?? 0 }) : b}</li>
                    ))}
                  </ul>
                </FinanceNotice>
              ) : (
                <FinanceNotice tone="success">{f("panel.ready")}</FinanceNotice>
              )}
              {settlement.companyShareNegative ? <FinanceNotice tone="danger">{f("panel.companyNegative")}</FinanceNotice> : null}

              <FinanceTable caption={f("panel.amounts", { currency: base })} testId="finance-amounts">
                <thead>
                  <tr>
                    <th scope="col">{f("panel.item")}</th>
                    <th scope="col">{f("panel.amounts", { currency: base })}</th>
                  </tr>
                </thead>
                <tbody>
                  {AMOUNT_ROWS.map((k) => (
                    <tr key={k} className={k === "net" || k === "company" ? "fin-row--strong" : undefined}>
                      <th scope="row">{f(`panel.amountRows.${k}`)}</th>
                      <td>
                        {settlement.amounts?.[k] == null ? <span className="help">{f("panel.needsFx")}</span> : <Money amount={settlement.amounts[k]} currency={base} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </FinanceTable>
              <div className="smart-panel__row">
                <span className="smart-panel__label">{f("panel.freelancerSource")}</span>
                <span className="smart-panel__value">
                  {settlement.freelancer ? (
                    <>
                      <Money amount={settlement.freelancer.amount} currency={settlement.freelancer.currency} /> ·{" "}
                      <code dir="ltr">{settlement.freelancer.source}</code>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              {settlement.splitSuggestion != null ? (
                <div className="smart-panel__row">
                  <span className="smart-panel__label">{f("panel.splitSuggestion")}</span>
                  <span className="smart-panel__value">
                    <Money amount={settlement.splitSuggestion} currency={base} />
                  </span>
                </div>
              ) : null}
              <div className="fin-card__badges">
                {Object.entries(settlement.policies || {}).map(([key, p]) => (
                  <span key={key} className={`oh-mini-chip${p.active ? "" : " fin-chip--off"}`}>
                    {f(`policies.keys.${key}`)} v{p.version} · {p.active ? f("policies.active") : f("policies.disabled")}
                  </span>
                ))}
              </div>

              <details>
                <summary>{f("panel.lines")}</summary>
                {LINE_GROUPS.map((g) =>
                  settlement.lines?.[g]?.length ? (
                    <div key={g}>
                      <h4>{f(`panel.lineGroups.${g}`)}</h4>
                      <ul className="smart-events">
                        {settlement.lines[g].map((l, i) => (
                          <li key={`${g}-${l.sourceId || i}`}>
                            <span dir="auto">{l.label}</span>
                            <span>
                              <Money amount={l.amount} currency={l.currency} />
                              {l.currency !== base && l.baseAmount != null ? (
                                <>
                                  {" → "}
                                  <Money amount={l.baseAmount} currency={base} />
                                </>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </details>

              {(settlement.fxMissing || []).length ? (
                <div className="fin-form" data-testid="finance-fx-pickers">
                  <p className="help">{f("panel.fxMissing")}</p>
                  <div className="smart-editor-grid">
                    {settlement.fxMissing.map((ccy) => (
                      <label className="field" key={ccy}>
                        <span className="label" dir="ltr">
                          JOD → {ccy}
                        </span>
                        <select className="input" value={fxPick[ccy] || ""} onChange={(e) => setFxPick({ ...fxPick, [ccy]: e.target.value })}>
                          <option value="">{f("common.choose")}</option>
                          {(fxOptions[ccy] || []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {`#${s.id} · ${s.rate} · ${s.source} · ${dt(s.rateAt)}`}
                            </option>
                          ))}
                        </select>
                        {fxOptions[ccy] && !fxOptions[ccy].length ? <span className="help">{f("panel.noFxSnapshots")}</span> : null}
                      </label>
                    ))}
                  </div>
                  <div>
                    <button type="button" className="btn btn-secondary" disabled={!Object.values(fxPick).some(Boolean)} onClick={applyFx} data-testid="finance-fx-apply">
                      {f("panel.applyFx")}
                    </button>
                  </div>
                </div>
              ) : null}
              {(settlement.fxUsed || []).length ? (
                <p className="help" dir="auto">
                  {f("panel.fxUsed")}: <span dir="ltr">{settlement.fxUsed.map((id) => `#${id}`).join(", ")}</span>
                </p>
              ) : null}

              {caps.manage ? (
                <div className="fin-form" data-testid="finance-close-settlement">
                  {latest ? (
                    <label className="field">
                      <span className="label">{f("panel.correctionReason")} *</span>
                      <input className="input" dir="auto" maxLength={500} value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
                      <span className="help">{f("panel.correctionHint", { version: latest.version })}</span>
                    </label>
                  ) : null}
                  <div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || !settlement.canClose || (latest && correctionReason.trim().length < REASON_MIN)}
                      data-testid="finance-close-button"
                      data-expected-version={expectedVersion}
                      onClick={() =>
                        void run(
                          () =>
                            adminCloseSettlementRequest(orderId, {
                              expectedVersion,
                              fxSnapshotIds: appliedFx,
                              ...(latest ? { correctionReason: correctionReason.trim() } : {}),
                            }),
                          () => setCorrectionReason(""),
                        )
                      }
                    >
                      {latest ? f("panel.correct") : f("panel.close")}
                    </button>
                  </div>
                </div>
              ) : null}

              {(settlement.settlements || []).length ? (
                <>
                  <h4>{f("panel.history")}</h4>
                  <FinanceTable caption={f("panel.history")} testId="finance-settlement-history">
                    <thead>
                      <tr>
                        <th scope="col">{f("panel.version")}</th>
                        <th scope="col">{f("panel.amountRows.gross")}</th>
                        <th scope="col">{f("panel.amountRows.net")}</th>
                        <th scope="col">{f("panel.amountRows.freelancer")}</th>
                        <th scope="col">{f("panel.amountRows.company")}</th>
                        <th scope="col">{f("panel.closedAt")}</th>
                        <th scope="col">{f("common.reason")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlement.settlements.map((s) => (
                        <tr key={s.id}>
                          <td>v{s.version}</td>
                          <td>
                            <Money amount={s.gross} currency={s.baseCurrency} />
                          </td>
                          <td>
                            <Money amount={s.net} currency={s.baseCurrency} />
                          </td>
                          <td>
                            <Money amount={s.freelancer} currency={s.baseCurrency} />
                          </td>
                          <td>
                            <Money amount={s.company} currency={s.baseCurrency} />
                          </td>
                          <td>{dt(s.closedAt)}</td>
                          <td dir="auto">{s.correctionReason || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </FinanceTable>
                </>
              ) : null}
            </div>

            {/* ---------------- Unallocated receipts ---------------- */}
            <div className="smart-panel__section" data-testid="finance-unallocated-section">
              <h3>{f("panel.unallocated")}</h3>
              <p className="help">{f("panel.unallocatedHint")}</p>
              {(settlement.lines?.unallocatedReceipts || []).length ? (
                <ul className="smart-events">
                  {settlement.lines.unallocatedReceipts.map((l, i) => (
                    <li key={i}>
                      <span dir="auto">{l.label}</span>
                      <Money amount={l.amount} currency={l.currency} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">{f("common.none")}</p>
              )}
            </div>

            {/* ---------------- Costs ---------------- */}
            <div className="smart-panel__section" data-testid="finance-costs-section">
              <h3>{f("panel.costs")}</h3>
              {(data.costs || []).length ? (
                <ul className="fin-rows">
                  {data.costs.map((c) => (
                    <li key={c.id} className={`fin-row${c.voided ? " fin-row--voided" : ""}`}>
                      <div className="fin-row__main">
                        <strong>{f(`panel.costKinds.${c.kind}`)}</strong>
                        <Money amount={c.amount} currency={c.currency} />
                        <span dir="auto">{c.description}</span>
                        {c.qcProvider ? <span className="oh-mini-chip">{c.qcProvider}</span> : null}
                        {c.voided ? <StatusBadge tone="neutral">{f("panel.voided")}</StatusBadge> : null}
                        <span className="help">{dt(c.createdAt)}</span>
                      </div>
                      {c.voided && c.voidReason ? (
                        <p className="help" dir="auto">
                          {c.voidReason}
                        </p>
                      ) : null}
                      {!c.voided && caps.manage ? (
                        voiding.id === c.id ? (
                          <div className="smart-panel__inline">
                            <input
                              className="input"
                              dir="auto"
                              aria-label={f("panel.voidReason")}
                              placeholder={f("panel.voidReason")}
                              value={voiding.reason}
                              onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy || voiding.reason.trim().length < REASON_MIN}
                              onClick={() => void run(() => adminVoidOrderCostRequest(c.id, voiding.reason.trim()), () => setVoiding({ id: null, reason: "" }))}
                            >
                              {f("panel.confirmVoid")}
                            </button>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVoiding({ id: null, reason: "" })}>
                              {f("common.cancel")}
                            </button>
                          </div>
                        ) : (
                          <div>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVoiding({ id: c.id, reason: "" })} data-testid={`finance-cost-void-${c.id}`}>
                              {f("panel.void")}
                            </button>
                          </div>
                        )
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">{f("common.none")}</p>
              )}
              {caps.manage ? (
                <form
                  className="fin-form"
                  data-testid="finance-cost-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!costValid) return;
                    void run(
                      () =>
                        adminRecordOrderCostRequest(orderId, {
                          kind: cost.kind,
                          amount: cost.amount.trim(),
                          currency: cost.currency,
                          description: cost.description.trim(),
                          ...(cost.sourceRef.trim() ? { sourceRef: cost.sourceRef.trim() } : {}),
                          ...(cost.kind === "quality_check" ? { qcProvider: cost.qcProvider.trim() || null, qcResult: "passed" } : {}),
                        }),
                      () => setCost(EMPTY_COST),
                    );
                  }}
                >
                  <h4>{f("panel.addCost")}</h4>
                  <div className="smart-editor-grid">
                    <label className="field">
                      <span className="label">{f("panel.kind")}</span>
                      <select className="input" value={cost.kind} onChange={(e) => setCost({ ...cost, kind: e.target.value })}>
                        {COST_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {f(`panel.costKinds.${k}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">{f("common.amount")}</span>
                      <input className="input" dir="ltr" inputMode="decimal" value={cost.amount} onChange={(e) => setCost({ ...cost, amount: e.target.value })} />
                    </label>
                    <label className="field">
                      <span className="label">{f("common.currency")}</span>
                      <select className="input" value={cost.currency} onChange={(e) => setCost({ ...cost, currency: e.target.value })}>
                        {["JOD", "AED", "USD", "EUR"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">{f("panel.description")}</span>
                      <input className="input" dir="auto" maxLength={300} value={cost.description} onChange={(e) => setCost({ ...cost, description: e.target.value })} />
                    </label>
                    <label className="field">
                      <span className="label">{f("panel.sourceRef")}</span>
                      <input className="input" dir="ltr" maxLength={160} value={cost.sourceRef} onChange={(e) => setCost({ ...cost, sourceRef: e.target.value })} />
                    </label>
                    {cost.kind === "quality_check" ? (
                      <label className="field">
                        <span className="label">{f("panel.qcProvider")}</span>
                        <input className="input" dir="auto" maxLength={60} value={cost.qcProvider} onChange={(e) => setCost({ ...cost, qcProvider: e.target.value })} />
                      </label>
                    ) : null}
                  </div>
                  {cost.kind === "quality_check" ? (
                    <label className="smart-check">
                      <input type="checkbox" checked={cost.qcPassed} onChange={(e) => setCost({ ...cost, qcPassed: e.target.checked })} />
                      <span>{f("panel.qcPassed")}</span>
                    </label>
                  ) : null}
                  <div>
                    <button type="submit" className="btn btn-secondary" disabled={busy || !costValid}>
                      {f("panel.addCost")}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>

            {/* ---------------- Adjustments ---------------- */}
            <div className="smart-panel__section" data-testid="finance-adjustments-section">
              <h3>{f("panel.adjustments")}</h3>
              {(data.adjustments || []).length ? (
                <ul className="smart-events">
                  {data.adjustments.map((a) => (
                    <li key={a.id}>
                      <span dir="auto">
                        {f(`panel.adjustmentKinds.${a.kind}`)} · <Money amount={a.amount} currency={a.currency} /> · {a.reason}
                      </span>
                      <span className="help">{dt(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">{f("common.none")}</p>
              )}
              {caps.manage ? (
                <form
                  className="fin-form"
                  data-testid="finance-adjustment-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!adjValid) return;
                    void run(
                      () => adminRecordOrderAdjustmentRequest(orderId, { kind: adj.kind, amount: adj.amount.trim(), currency: adj.currency, reason: adj.reason.trim() }),
                      () => setAdj(EMPTY_ADJ),
                    );
                  }}
                >
                  <h4>{f("panel.addAdjustment")}</h4>
                  <div className="smart-editor-grid">
                    <label className="field">
                      <span className="label">{f("panel.kind")}</span>
                      <select className="input" value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })}>
                        {ADJUSTMENT_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {f(`panel.adjustmentKinds.${k}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">{f("common.amount")}</span>
                      <input className="input" dir="ltr" inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
                      <span className="help">{adj.kind === "correction" ? f("panel.signedHint") : f("panel.positiveHint")}</span>
                    </label>
                    <label className="field">
                      <span className="label">{f("common.currency")}</span>
                      <select className="input" value={adj.currency} onChange={(e) => setAdj({ ...adj, currency: e.target.value })}>
                        {["JOD", "AED", "USD", "EUR"].map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">{f("common.reason")}</span>
                      <input className="input" dir="auto" maxLength={500} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
                    </label>
                  </div>
                  <div>
                    <button type="submit" className="btn btn-secondary" disabled={busy || !adjValid}>
                      {f("panel.addAdjustment")}
                    </button>
                  </div>
                </form>
              ) : null}
            </div>

            {/* ---------------- Payment exceptions ---------------- */}
            <div className="smart-panel__section" data-testid="finance-order-exceptions-section">
              <h3>{f("panel.exceptions")}</h3>
              {caps.manage ? <p className="help">{f("exceptions.decisionOnly")}</p> : null}
              <PaymentExceptionsList rows={data.exceptions || []} canResolve={caps.manage} showOrder={false} onChanged={() => load()} />
            </div>
          </>
        ) : null}

        {/* ---------------- Service items (multi-service) ---------------- */}
        {open && caps.orders && items ? (
          <div className="smart-panel__section" data-testid="finance-service-items-section">
            <h3>{f("items.heading")}</h3>
            <p className="help">{f("items.hint")}</p>
            {items.length ? (
              <ul className="fin-rows">
                {items.map((it) => (
                  <li key={it.id} className={`fin-row${it.removedAt ? " fin-row--voided" : ""}`} data-testid={`finance-service-item-${it.itemNo}`}>
                    <div className="fin-row__main">
                      <strong>{f("items.itemNo", { no: it.itemNo })}</strong>
                      {it.price ? <Money amount={it.price.amount} currency={it.price.currency} /> : <span className="help">{f("items.noPrice")}</span>}
                      {it.removedAt ? <StatusBadge tone="neutral">{f("items.removed")}</StatusBadge> : null}
                      {it.note ? <span dir="auto">{it.note}</span> : null}
                    </div>
                    <ServiceFormSnapshotView serviceForm={itemSnapshot(it)} />
                    {!it.removedAt && caps.createOrder ? (
                      <div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() => void runItems(() => adminRemoveServiceItemRequest(orderId, it.id))}
                        >
                          {f("items.remove")}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="help">{f("items.empty")}</p>
            )}
            {caps.createOrder ? (
              addingItem ? (
                <div className="fin-form" data-testid="finance-service-item-form">
                  <ServiceCatalogStep
                    audience="admin"
                    draft={itemDraft}
                    onDraftChange={setItemDraft}
                    onServiceResolved={setItemService}
                    errors={itemErrors}
                    showErrors={itemShowErrors}
                    disabled={busy}
                  />
                  <div className="smart-editor-grid">
                    <label className="field">
                      <span className="label">{f("items.price")}</span>
                      <input
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        value={itemPrice.amount}
                        aria-invalid={itemShowErrors && !itemPriceValid ? true : undefined}
                        onChange={(e) => setItemPrice({ ...itemPrice, amount: e.target.value })}
                      />
                      <span className="help">{f("items.priceHint")}</span>
                    </label>
                    <label className="field">
                      <span className="label">{f("common.currency")}</span>
                      <select className="input" value={itemPrice.currency} onChange={(e) => setItemPrice({ ...itemPrice, currency: e.target.value })}>
                        {ITEM_PRICE_CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="label">{f("items.note")}</span>
                      <input className="input" dir="auto" maxLength={500} value={itemNote} onChange={(e) => setItemNote(e.target.value)} />
                    </label>
                  </div>
                  <div className="smart-panel__inline">
                    <button type="button" className="btn btn-primary" disabled={busy || !itemService} onClick={submitItem} data-testid="finance-service-item-submit">
                      {f("items.add")}
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setAddingItem(false)}>
                      {f("common.cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button type="button" className="btn btn-secondary" onClick={() => setAddingItem(true)} data-testid="finance-service-item-new">
                    {f("items.add")}
                  </button>
                </div>
              )
            ) : null}
          </div>
        ) : null}

        {/* ---------------- Quote suggestion ---------------- */}
        {open && caps.orders && suggestion ? (
          <div className="smart-panel__section" data-testid="finance-quote-suggestion">
            <h3>{f("suggestion.heading")}</h3>
            {(suggestion.lines || []).length ? (
              <FinanceTable caption={f("suggestion.heading")}>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{f("suggestion.service")}</th>
                    <th scope="col">{f("suggestion.basis")}</th>
                    <th scope="col">{f("common.amount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestion.lines.map((l) => (
                    <tr key={l.itemNo}>
                      <td>{l.itemNo}</td>
                      <td dir="ltr">
                        <code>{l.serviceCode}</code> v{l.version}
                      </td>
                      <td>
                        {f(`suggestion.reasons.${l.reason}`)}
                        {l.range ? (
                          <span className="help" dir="ltr">
                            {" "}
                            ({l.range.min}–{l.range.max} {l.currency})
                          </span>
                        ) : null}
                        {l.unitAmount && l.reason !== "range_admin_decides" ? (
                          <span className="help" dir="ltr">
                            {" "}
                            ({f("suggestion.unit")}: {l.unitAmount} {l.currency})
                          </span>
                        ) : null}
                      </td>
                      <td>{l.amount != null ? <Money amount={l.amount} currency={l.currency} /> : <span className="help">{f("suggestion.manual")}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </FinanceTable>
            ) : null}
            {suggestion.complete && suggestion.suggestedBaseAmount != null ? (
              <p>
                {f("suggestion.total")}: <Money amount={suggestion.suggestedBaseAmount} currency={suggestion.currency} testId="finance-suggested-amount" />
              </p>
            ) : (
              <p className="help" data-testid="finance-suggestion-manual">
                {f(`suggestion.notes.${suggestion.note || "manual_pricing_required"}`)}
              </p>
            )}
            <p className="help">{f("suggestion.hint")}</p>
          </div>
        ) : null}
      </div>
    </DashboardModal>
  );
}
