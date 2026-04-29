import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { listClientMyOrdersRequest } from "../../services/api";
import { orderStatusLabelAr } from "../../utils/orderFlowUi";

function paymentStatusAr(s) {
  if (s === "not_required") return "لا يتطلب دفعاً حالياً";
  if (s === "unpaid") return "غير مدفوع";
  if (s === "paid") return "مدفوع";
  if (s === "refunded") return "مُسترد";
  return s || "—";
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

export default function ClientFinancialPage() {
  const { push } = useToast();
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

  return (
    <main className="container page-content dash-shell client-financial-page" dir="rtl">
      <header className="dash-hero dash-hero--compact">
        <div className="dash-hero__kicker">لوحة العميل</div>
        <h1 className="dash-hero__title">المالية</h1>
        <p className="dash-hero__subtitle">
          سجل الدفع المرتبط بطلباتك (حالة الدفع حسب الطلب). ربط Stripe لخصم المبالغ وعرض الفواتير يُضاف لاحقاً؛ حالياً تُعرض الحقول المخزّنة في النظام فقط.
        </p>
      </header>

      <section className="card" style={{ marginBottom: 14 }}>
        <p className="help" style={{ margin: 0 }}>
          لمراجعة تفاصيل الطلبات والمرفقات، انتقل إلى{" "}
          <Link to="/dashboard/client/my-orders" className="auth-inline-link">
            طلباتي
          </Link>
          .
        </p>
      </section>

      <section className="card client-financial-page__table-wrap" aria-busy={busy}>
        {busy ? (
          <p className="help" style={{ margin: 0 }}>
            جارٍ التحميل…
          </p>
        ) : rows.length === 0 ? (
          <p style={{ margin: 0 }}>لا توجد طلبات لعرض حالة دفع لها بعد.</p>
        ) : (
          <div className="client-financial-table-scroll">
            <table className="client-financial-table">
              <thead>
                <tr>
                  <th>رمز الطلب</th>
                  <th>العنوان</th>
                  <th>المبلغ / العملة</th>
                  <th>يتطلب دفع</th>
                  <th>حالة الدفع</th>
                  <th>حالة الطلب</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <span className="oh-code" dir="ltr">
                        {o.orderCode || "—"}
                      </span>
                    </td>
                    <td>{o.title || "—"}</td>
                    <td dir="ltr">
                      {o.projectType === "bidding" && o.bidBudgetMin != null && o.bidBudgetMax != null
                        ? `${formatMoney(o.bidBudgetMin)} – ${formatMoney(o.bidBudgetMax)} JOD`
                        : o.budget != null
                          ? `${formatMoney(o.budget)} JOD`
                          : "—"}
                    </td>
                    <td>{o.paymentRequired ? "نعم" : "لا"}</td>
                    <td>{paymentStatusAr(o.paymentStatus)}</td>
                    <td>{o.orderStatus || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
