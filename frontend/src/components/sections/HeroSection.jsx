import { useId } from "react";
import { Link } from "react-router-dom";
import "./home-hero-ref.css";

/** Filled shield + check (reference: centered feature card, illustration-style). */
function IconShieldIllustrated({ size = 36 }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `hero-shield-grad-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#166534" />
          <stop offset="1" stopColor="#14532d" />
        </linearGradient>
      </defs>
      <path
        d="M12 3 4 6v6c0 4.5 3.5 8.5 8 9 4.5-.5 8-4.5 8-9V6l-8-3Z"
        fill={`url(#${gradId})`}
        stroke="rgba(20, 83, 45, 0.25)"
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
      <path
        d="m9.2 12.2 1.9 1.9 4.1-4.1"
        stroke="#22c55e"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Play icon inside the white circle (reference: video-style thumbnail). */
function IconPlayCircle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M9 7.5v9l7.5-4.5L9 7.5Z" />
    </svg>
  );
}

function FloatCardTopLeft() {
  return (
    <>
      <div className="home-hero__float-avatars">
        <span className="home-hero__float-avatar home-hero__float-avatar--a" aria-hidden="true">
          م
        </span>
        <span className="home-hero__float-avatar home-hero__float-avatar--b" aria-hidden="true">
          ع
        </span>
        <span className="home-hero__float-avatar home-hero__float-avatar--c" aria-hidden="true">
          +
        </span>
      </div>
      <p className="home-hero__float-stat">طلبات موثوقة</p>
      <p className="home-hero__float-desc">مسار واضح من الطلب حتى التسليم</p>
    </>
  );
}

function FloatCardBottomLeft() {
  return (
    <div className="home-hero__float-bl-inner" dir="rtl">
      <div className="home-hero__float-bl-icon" aria-hidden="true">
        <IconShieldIllustrated size={40} />
      </div>
      <p className="home-hero__float-bl-title">آمن ومنظم</p>
      <p className="home-hero__float-bl-desc">تابع طلبك من الإنشاء حتى التسليم في مكان واحد.</p>
    </div>
  );
}

function FloatCardTopRight() {
  return (
    <div className="home-hero__float-tr-inner" dir="rtl">
      <div className="home-hero__float-tr-thumb" aria-hidden="true">
        <div className="home-hero__float-tr-thumb-bg" />
        <span className="home-hero__float-tr-play-ring">
          <IconPlayCircle />
        </span>
      </div>
      <div className="home-hero__float-tr-copy">
        <p className="home-hero__float-tr-title">لماذا منصتنا؟</p>
        <p className="home-hero__float-tr-sub">تجربة موحّدة للعميل والمستقل</p>
      </div>
    </div>
  );
}

function FloatCardMidRight() {
  return (
    <>
      <p className="home-hero__float-stat home-hero__float-stat--compact">منصة واحدة</p>
      <p className="home-hero__float-desc">للعميل والمستقل — دون تعقيد</p>
      <div className="home-hero__float-mr-illus" aria-hidden="true">
        ✦
      </div>
    </>
  );
}

const HeroSection = () => {
  return (
    <section className="home-hero home-hero--ref" data-navbar-hero aria-labelledby="home-hero-heading">
      <div className="home-hero__bg" aria-hidden="true" />
      <div className="home-hero__glow home-hero__glow--l" aria-hidden="true" />
      <div className="home-hero__glow home-hero__glow--r" aria-hidden="true" />
      <div className="home-hero__glow home-hero__glow--accent home-hero__glow--orange" aria-hidden="true" />
      <div className="home-hero__glow home-hero__glow--accent home-hero__glow--green" aria-hidden="true" />
      <div className="home-hero__glow home-hero__glow--accent home-hero__glow--purple" aria-hidden="true" />

      <div className="container home-hero__inner">
        <div className="home-hero__ref-stage">
          <div className="home-hero__floats" aria-hidden="true">
            <div className="home-hero__float home-hero__float--tl">
              <FloatCardTopLeft />
            </div>
            <div className="home-hero__float home-hero__float--bl">
              <FloatCardBottomLeft />
            </div>
            <div className="home-hero__float home-hero__float--tr">
              <FloatCardTopRight />
            </div>
            <div className="home-hero__float home-hero__float--mr">
              <FloatCardMidRight />
            </div>
          </div>

          <div className="home-hero__ref-center">
            <p className="home-hero__ref-badge">منصة ذكية لإدارة طلباتك</p>
            <h1 id="home-hero-heading" className="home-hero__ref-title">
              <span className="home-hero__ref-title-line">
                أنجز{" "}
                <span className="home-hero__ref-accent-wrap">
                  <span className="home-hero__ref-accent">طلباتك</span>
                </span>{" "}
                مع أفضل المستقلين
              </span>
              <span className="home-hero__ref-title-line home-hero__ref-title-line--second">وتشغيلاً رقمياً بثقة</span>
            </h1>

            <p className="home-hero__lead">
              منصة تجمع العملاء والمستقلين في مسار واحد: طلبات أوضح، تنفيذ أسرع، ومتابعة أدق — بلغة تصميم هادئة ومركّزة على
              النتيجة.
            </p>

            <div className="home-hero__cta">
              <Link to="/register" className="btn btn-primary home-hero__cta-primary">
                ابدأ الآن
              </Link>
              <Link to="/services" className="btn btn-secondary home-hero__cta-secondary">
                استكشف الخدمات
              </Link>
            </div>
          </div>

          <div className="home-hero__floats--mobile" aria-hidden="true">
            <div className="home-hero__float-m">
              <FloatCardTopLeft />
            </div>
            <div className="home-hero__float-m home-hero__float-m--soft">
              <FloatCardBottomLeft />
            </div>
            <div className="home-hero__float-m home-hero__float-m--row">
              <FloatCardTopRight />
            </div>
            <div className="home-hero__float-m home-hero__float-m--soft">
              <FloatCardMidRight />
            </div>
          </div>

          <div className="home-hero__mock-wrap" aria-hidden="true">
            <div className="home-hero__phone">
              <div className="home-hero__phone-bezel">
                <div className="home-hero__phone-notch" />
                <div className="home-hero__phone-screen">
                  <div className="home-hero__phone-card">
                    <div className="home-hero__phone-card-bar" />
                    <div className="home-hero__phone-card-rows">
                      <div className="home-hero__phone-card-row" />
                      <div className="home-hero__phone-card-row" />
                      <div className="home-hero__phone-card-row" />
                    </div>
                    <div className="home-hero__phone-pill" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
