const Footer = () => {
  return (
    <footer className="footer">
      <div className="container footer-content">
        <section className="footer-column">
          <h3 className="footer-title">استكشاف</h3>
          <ul className="footer-links">
            <li><a href="#">من نحن</a></li>
            <li><a href="#">الطلبات</a></li>
            <li><a href="#">الباقات</a></li>
          </ul>
        </section>

        <section className="footer-column">
          <h3 className="footer-title">للعملاء</h3>
          <ul className="footer-links">
            <li><a href="#">إضافة طلب</a></li>
          </ul>
        </section>

        <section className="footer-column">
          <h3 className="footer-title">للمستقلين</h3>
          <ul className="footer-links">
            <li><a href="#">المشاريع</a></li>
          </ul>
        </section>

        <section className="footer-column">
          <h3 className="footer-title">الموارد</h3>
          <ul className="footer-links">
            <li><a href="#">سياسة الخصوصية</a></li>
            <li><a href="#">الشروط والأحكام</a></li>
            <li><a href="#">مركز المساعدة</a></li>
          </ul>
        </section>

        <section className="footer-column">
          <h3 className="footer-title">الشركة</h3>
          <ul className="footer-links">
            <li><a href="#">من نحن</a></li>
          </ul>
        </section>

        <section className="footer-column footer-column-contact">
          <h3 className="footer-title">تواصل معنا</h3>
          <ul className="footer-links footer-contact">
            <li>
              <span>رقم الهاتف:</span>{" "}
              <a href="tel:+971522857808" dir="ltr" className="contact-ltr">
                +971 522857808
              </a>
            </li>
            <li>
              <span>البريد الإلكتروني:</span>{" "}
              <a href="mailto:faz3at@icloud.com" dir="ltr" className="contact-ltr">
                faz3at@icloud.com
              </a>
            </li>
            <li>
              <a
                href="https://wa.me/971522857808"
                target="_blank"
                rel="noreferrer"
              >
                واتساب
              </a>
            </li>
            <li><span>الموقع:</span> عمّان، الأردن</li>
          </ul>
          <div className="work-hours-block">
            <h3 className="footer-title">ساعات العمل</h3>
            <ul className="footer-links">
            <li>من السبت إلى الخميس</li>
            <li>9:00 صباحاً - 6:00 مساءً</li>
            </ul>
          </div>
        </section>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-content">
          <div className="footer-bottom-links">
            <a href="#">سياسة الخصوصية</a>
            <a href="#">الشروط والأحكام</a>
          </div>
          <p className="footer-copyright">© 2026 أوردرز هاوس - جميع الحقوق محفوظة</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
