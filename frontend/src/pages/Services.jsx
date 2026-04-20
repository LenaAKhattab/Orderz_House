const services = [
  "إدارة الطلبات الرقمية",
  "تنسيق التنفيذ بين الفرق",
  "تنظيم سير عمل المستقلين",
  "متابعة حالات الطلبات",
];

const Services = () => {
  return (
    <main className="container page-content">
      <section className="card">
        <h1>الخدمات</h1>
        <p>نظرة سريعة على الخدمات الأساسية داخل المنصة.</p>
      </section>

      <section className="cards-grid">
        {services.map((service) => (
          <article key={service} className="card">
            <h2>{service}</h2>
            <p>وصف مختصر للخدمة بهدف عرض الهيكل العام للواجهة فقط.</p>
          </article>
        ))}
      </section>
    </main>
  );
};

export default Services;
