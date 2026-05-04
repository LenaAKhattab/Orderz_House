import OpenOrdersMarketplace from "../components/open-orders/OpenOrdersMarketplace";
import { useAuth } from "../context/useAuth";

/**
 * Public معرض الطلبات — same open-orders experience as the freelancer dashboard pool.
 * API uses `GET /orders/pool` with guest/public sanitization; actions require auth + role (see OpenOrdersMarketplace).
 */
const Orders = () => {
  const { user, loading } = useAuth();

  return (
    <main className="container page-content dashboard-orders-system open-orders-public-page">
      {!loading && user ? (
        <section className="card dashboard-orders-system__header" style={{ marginBottom: 20 }}>
          <h1>معرض الطلبات</h1>
          <p>
            تصفّح الطلبات المنشورة في <strong>المعرض</strong> (من العملاء أو الإدارة). طلبات <strong>سعر ثابت</strong>{" "}
            تُستلم عبر تدفق الاستلام؛ طلبات <strong>المزايدة بميزانية محددة</strong> تُقدَّم لها عروض أسعار.
          </p>
        </section>
      ) : null}
      <OpenOrdersMarketplace layout="public" />
    </main>
  );
};

export default Orders;
