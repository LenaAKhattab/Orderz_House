import Button from "../components/ui/Button";

const Contact = () => {
  return (
    <main className="container page-content">
      <section className="card form-card">
        <h1>تواصل معنا</h1>
        <p>هذه واجهة تواصل ثابتة للعرض فقط بدون إرسال فعلي حالياً.</p>

        <form className="form-grid">
          <label className="field">
            <span>الاسم</span>
            <input type="text" placeholder="اكتب الاسم الكامل" />
          </label>

          <label className="field">
            <span>البريد الإلكتروني</span>
            <input type="email" placeholder="example@mail.com" />
          </label>

          <label className="field">
            <span>الموضوع</span>
            <input type="text" placeholder="عنوان الرسالة" />
          </label>

          <label className="field">
            <span>الرسالة</span>
            <textarea rows="5" placeholder="اكتب رسالتك هنا" />
          </label>

          <Button type="button">إرسال</Button>
        </form>
      </section>
    </main>
  );
};

export default Contact;
