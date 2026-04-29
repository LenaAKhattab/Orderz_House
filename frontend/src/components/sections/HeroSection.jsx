import { Link } from "react-router-dom";

const HeroSection = () => {
  return (
    <section
      className="home-hero home-hero--analytics"
      data-navbar-hero
      aria-labelledby="home-hero-heading"
    >
      <div className="home-hero__bg" aria-hidden="true" />

      <div className="container home-hero__inner">
        <div className="hero-analytics">
          <div className="hero-analytics__center">
            <h1 id="home-hero-heading" className="hero-analytics__title">
              <span>هنا تتصل الفرق</span>
              <span>وتُنجز الأهداف</span>
              <span className="hero-analytics__accent">بشكل أسرع.</span>
            </h1>
            <p className="hero-analytics__lead">
              نظّم المهام والتواصل والتحليلات في منصة واحدة، تمكّن فريقك من العمل بذكاء
              وتحقيق النتائج أسرع.
            </p>
            <div className="hero-analytics__actions">
              <Link to="/register" className="btn btn-primary">ابدأ الآن</Link>
            </div>
          </div>

          <div className="hero-analytics__floating" aria-hidden="true">
            <article className="ha-card ha-card--users">
              <h4>إجمالي المستخدمين</h4>
              <p>50,789</p>
              <span>+8.5% عن الأمس</span>
            </article>

            <article className="ha-card ha-card--revenue">
              <h4>إجمالي الإيراد</h4>
              <p>$31K</p>
              <span>شهري / سنوي</span>
              <div className="ha-progress"><i /></div>
            </article>

            <article className="ha-card ha-card--countries">
              <h4>الاستخدام حسب الدول</h4>
              <p>السعودية • الإمارات • مصر • الأردن</p>
              <div className="ha-map" />
            </article>

            <article className="ha-card ha-card--chart">
              <h4>التدفق النقدي</h4>
              <p>$241,562.39</p>
              <div className="ha-bars">
                <span /><span /><span /><span /><span className="is-main" /><span /><span />
              </div>
              <small>أغسطس 2025 — $23,214.53</small>
            </article>
          </div>
        </div>

      </div>
    </section>
  );
};

export default HeroSection;
