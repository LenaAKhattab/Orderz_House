import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { listClientMyOrdersRequest } from "../../services/api";

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
    <div className="container page-content dash-shell client-financial-page" dir="rtl">
      <div className="dash client-financial-page__root">
        <header className="dash-hero dash-hero--elevated">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة العميل</p>
            <h1 className="dash-hero__title">المالية</h1>
            <p className="dash-hero__subtitle">
              نظرة على المدفوعات وحالات الدفع المرتبطة بطلباتك. ربط Stripe للفواتير والخصم يُضاف لاحقاً؛ حالياً تُعرض البيانات المخزّنة في النظام.
            </p>
          </div>
        </header>

        <div className="client-financial-page__stats" aria-label="ملخص مالي">
          <div className="client-financial-page__stat">
            <span className="client-financial-page__stat-label">إجمالي المدفوع (طلبات بميزانية مدفوعة)</span>
            <strong className="client-financial-page__stat-value" dir="ltr">
              {busy ? "—" : `${formatMoney(summary.totalPaid)} JOD`}
            </strong>
          </div>
          <div className="client-financial-page__stat client-financial-page__stat--accent">
            <span className="client-financial-page__stat-label">بانتظار دفع (عدد طلبات)</span>
            <strong className="client-financial-page__stat-value">{busy ? "—" : summary.pendingPayment}</strong>
          </div>
          <div className="client-financial-page__stat client-financial-page__stat--muted">
            <span className="client-financial-page__stat-label">تحتاج دفع (غير مكتملة)</span>
            <strong className="client-financial-page__stat-value">{busy ? "—" : summary.unpaid}</strong>
          </div>
        </div>

        <section className="dash-section client-financial-page__notice">
          <div className="dash-section__body">
            <p className="help client-financial-page__notice-text" style={{ margin: 0 }}>
              للتفاصيل الكاملة لكل طلب والمرفقات، انتقل إلى صفحة{" "}
              <Link to="/dashboard/client/my-orders" className="dash-section__link">
                طلباتي
              </Link>
              .
            </p>
          </div>
        </section>

        <section className="dash-section client-financial-page__table-section">
          <div className="dash-section__head">
            <h2 className="dash-section__title">سجل الطلبات وحالة الدفع</h2>
          </div>
          <div className="dash-section__body client-financial-page__table-body">
            {busy ? (
              <p className="help" style={{ margin: 0 }}>
                جارٍ التحميل…
              </p>
            ) : rows.length === 0 ? (
              <div className="dash-empty client-financial-page__empty">
                <div className="dash-empty__icon" aria-hidden="true">
                  ◌
                </div>
                <div className="dash-empty__copy">
                  <h3 className="dash-empty__title">لا توجد بيانات بعد</h3>
                  <p className="dash-empty__subtitle">عند وجود طلبات ستظهر هنا حالة الدفع والمبالغ المرتبطة بها.</p>
                </div>
                <Link to="/dashboard/client/my-orders" className="btn btn-primary dash-empty__action">
                  الانتقال إلى طلباتي
                </Link>
              </div>
            ) : (
              <div className="client-financial-page__table-wrap">
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
                          <td>{orderStatusLabelAr(o.orderStatus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
