const Footer = ({ homeBlend = false }) => {
  return (
    <footer
      className={
        homeBlend
          ? "mt-auto border-0 bg-transparent pb-[env(safe-area-inset-bottom,0)] shadow-none"
          : "mt-auto border-t border-[rgba(47,59,101,0.2)] bg-white pb-[env(safe-area-inset-bottom,0)]"
      }
    >
      <div className="mx-auto grid w-full max-w-[min(1160px,calc(100%-48px))] grid-cols-1 items-start gap-x-5 gap-y-6 px-0 py-[34px] pb-[42px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_0.8fr_0.85fr_1fr_0.9fr_1.4fr]">
        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">استكشاف</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                من نحن
              </a>
            </li>
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                الطلبات
              </a>
            </li>
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                الباقات
              </a>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">للعملاء</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                إضافة طلب
              </a>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">للمستقلين</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                المشاريع
              </a>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">الموارد</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                سياسة الخصوصية
              </a>
            </li>
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                الشروط والأحكام
              </a>
            </li>
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                مركز المساعدة
              </a>
            </li>
          </ul>
        </section>

        <section className="min-w-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">الشركة</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <a className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]" href="#">
                من نحن
              </a>
            </li>
          </ul>
        </section>

        <section className="min-w-0 border-s border-dashed border-[rgba(47,59,101,0.2)] ps-[18px] max-lg:border-0 max-lg:ps-0">
          <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">تواصل معنا</h3>
          <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
            <li>
              <span className="font-semibold text-[#76cfdf]">رقم الهاتف:</span>{" "}
              <a href="tel:+971522857808" dir="ltr" className="inline-block text-[#202020] [unicode-bidi:plaintext] [direction:ltr]">
                +971 522857808
              </a>
            </li>
            <li>
              <span className="font-semibold text-[#76cfdf]">البريد الإلكتروني:</span>{" "}
              <a href="mailto:faz3at@icloud.com" dir="ltr" className="inline-block text-[#202020] [unicode-bidi:plaintext] [direction:ltr]">
                faz3at@icloud.com
              </a>
            </li>
            <li>
              <a
                className="text-[#202020] no-underline transition-colors hover:text-[#2f3b65]"
                href="https://wa.me/971522857808"
                target="_blank"
                rel="noreferrer"
              >
                واتساب
              </a>
            </li>
            <li>
              <span>الموقع:</span> عمّان، الأردن
            </li>
          </ul>
          <div className="mt-[18px] border-t border-dashed border-[rgba(47,59,101,0.2)] pt-3.5">
            <h3 className="mb-3 text-[0.98rem] font-bold text-[#2f3b65]">ساعات العمل</h3>
            <ul className="m-0 grid list-none gap-2 p-0 text-[0.9rem] leading-[1.55] text-[#202020]">
              <li>من السبت إلى الخميس</li>
              <li>9:00 صباحاً - 6:00 مساءً</li>
            </ul>
          </div>
        </section>
      </div>

      <div
        className={
          homeBlend
            ? "border-t border-[rgba(47,59,101,0.08)] bg-transparent py-[18px] pb-7"
            : "border-t border-[rgba(47,59,101,0.2)] bg-white py-[18px] pb-7"
        }
      >
        <div className="mx-auto flex w-full max-w-[min(1160px,calc(100%-48px))] flex-wrap items-center justify-between gap-4">
          <div className="flex gap-4">
            <a className="text-[0.86rem] text-[#76cfdf] no-underline transition-colors hover:text-[#2f3b65]" href="#">
              سياسة الخصوصية
            </a>
            <a className="text-[0.86rem] text-[#76cfdf] no-underline transition-colors hover:text-[#2f3b65]" href="#">
              الشروط والأحكام
            </a>
          </div>
          <p className="m-0 text-[0.86rem] text-[#76cfdf]">© 2026 أوردرز هاوس - جميع الحقوق محفوظة</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
