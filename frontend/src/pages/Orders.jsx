const sampleOrders = [
  { id: "ORD-101", title: "تصميم هوية بصرية", status: "قيد المراجعة" },
  { id: "ORD-102", title: "تطوير صفحة هبوط", status: "جديد" },
  { id: "ORD-103", title: "إدارة حملة تسويقية", status: "قيد التنفيذ" },
];

const Orders = () => {
  return (
    <main className="container page-content">
      <section className="card">
        <h1>الطلبات</h1>
        <p>هيكل استعراضي لصفحة الطلبات بدون أي إجراءات تشغيلية حالياً.</p>
      </section>

      <section className="cards-grid">
        {sampleOrders.map((order) => (
          <article className="card" key={order.id}>
            <h2>{order.title}</h2>
            <p>رقم الطلب: {order.id}</p>
            <p>الحالة: {order.status}</p>
          </article>
        ))}
      </section>
    </main>
  );
};

export default Orders;
