import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { useToast } from "../../components/ui/toastContext";
import { listClientMyOrdersRequest } from "../../services/api";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import { getOrderStatusLabel } from "../../utils/orderFlowUi";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../styles/dashboardHub.css";
import "./freelancerMyOrders.css";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import ClientFixedOrderPayNowButton from "../../components/orders/ClientFixedOrderPayNowButton";
import { isClientFixedOrderAwaitingStripeCheckout } from "../../utils/clientFixedOrderPayNow";

function paymentStatusAr(s) {
  if (s === "not_required") return "لا يتطلب دفعاً حالياً";
  if (s === "unpaid") return "غير مدفوع";
  if (s === "paid") return "مدفوع";
  if (s === "refunded") return "مُسترد";
  return s || "—";
}

function StatSegment({ tone, label, value, loading }) {
  return (
    <div className={`fmo-stat-segment fmo-stat-segment--${tone}`}>
      <span className="fmo-stat-segment__icon" aria-hidden>
        <Wallet size={18} strokeWidth={2} />
      </span>
      <div className="fmo-stat-segment__copy">
        {loading ? <HubMetricSkeleton variant="stat" /> : <strong className="fmo-stat-segment__value">{value}</strong>}
        <span className="fmo-stat-segment__label">{label}</span>
      </div>
    </div>
  );
}

export default function ClientFinancialPage() {
  const { push } = useToast();
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    const res = await listClientMyOrdersRequest({ limit: 100, offset: 0 });
    const list = res?.data?.orders ?? res?.orders;
    setRows(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        await load();
      } catch (e) {
        if (!cancelled) {
          push({ type: "error", title: "تعذر تحميل السجل", message: e?.response?.data?.message || e?.message });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, push]);

  const summary = useMemo(() => {
    let totalPaid = 0;
    let pendingPayment = 0;
    let unpaid = 0;
    for (const o of rows) {
      if (String(o?.paymentStatus || "") === "paid" && o?.budget != null) {
        const n = Number(o.budget);
        if (Number.isFinite(n)) totalPaid += n;
      }
      if (["pending_payment", "awaiting_payment_after_bid_selection"].includes(String(o?.orderStatus || ""))) {
        pendingPayment += 1;
      }
      const pay = String(o?.paymentStatus || "");
      const need = Boolean(o?.paymentRequired);
      if (need && pay === "unpaid" && String(o?.orderStatus || "") !== "completed") {
        unpaid += 1;
      }
    }
    return { totalPaid, pendingPayment, unpaid };
  }, [rows]);

  return (
    <DashboardHubPage className="fdash-page--my-orders fdash-page--client-financial">
      <header className="fmo-surface fmo-header">
        <div className="fmo-header__copy">
          <h1 className="fmo-header__title">المالية</h1>
          <p className="fmo-header__subtitle">
            نظرة على المدفوعات وحالات الدفع المرتبطة بطلباتك فقط. للتفاصيل الكاملة لكل طلب راجع صفحة طلباتي.
          </p>
        </div>
        <div className="fmo-header__art" aria-hidden>
          <span className="fmo-header__icon-chip">
            <Wallet size={32} strokeWidth={1.85} />
          </span>
        </div>
      </header>

      <div className="fmo-surface fmo-stats-bar" aria-label="ملخص مالي">
        <StatSegment
          tone="green"
          label="إجمالي المدفوع"
          value={<JodMoneyDisplay amount={summary.totalPaid} compact />}
          loading={busy}
        />
        <StatSegment tone="amber" label="بانتظار دفع" value={summary.pendingPayment} loading={busy} />
        <StatSegment tone="slate" label="تحتاج دفع" value={summary.unpaid} loading={busy} />
      </div>

      <section className="fmo-surface fmo-content fmo-content--financial">
        {busy ? (
          <p className="fmo-toolbar__hint">جارٍ التحميل…</p>
        ) : rows.length === 0 ? (
          <div className="fmo-empty">
            <h3 className="fmo-empty__title">لا توجد بيانات بعد</h3>
            <p className="fmo-empty__sub">عند وجود طلبات ستظهر هنا حالة الدفع والمبالغ المرتبطة بها.</p>
            <Link className="fmo-empty__cta" to="/dashboard/client/my-orders">
              الانتقال إلى طلباتي
            </Link>
          </div>
        ) : (
          <>
            <p className="fmo-toolbar__hint">
              للتفاصيل الكاملة والمرفقات، انتقل إلى{" "}
              <Link to="/dashboard/client/my-orders" className="fmo-empty__cta fmo-empty__cta--inline">
                طلباتي
              </Link>
              .
            </p>
            <div className="client-financial-table-scroll max-w-full overflow-x-auto">
              <table className="client-financial-table">
                <thead>
                  <tr>
                    <th>العنوان</th>
                    <th>المبلغ / العملة</th>
                    <th>يتطلب دفع</th>
                    <th>حالة الدفع</th>
                    <th>حالة الطلب</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td>{o.title || "—"}</td>
                      <td>
                        {o.projectType === "bidding" && o.bidBudgetMin != null && o.bidBudgetMax != null ? (
                          <JodMoneyDisplay amount={o.bidBudgetMin} amountMax={o.bidBudgetMax} compact />
                        ) : o.budget != null ? (
                          <JodMoneyDisplay amount={o.budget} compact />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{o.paymentRequired ? "نعم" : "لا"}</td>
                      <td>{paymentStatusAr(o.paymentStatus)}</td>
                      <td>{getOrderStatusLabel(o.orderStatus, t)}</td>
                      <td>
                        {isClientFixedOrderAwaitingStripeCheckout(o) ? (
                          <ClientFixedOrderPayNowButton order={o} className="btn btn-primary" />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </DashboardHubPage>
  );
}
