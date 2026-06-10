import PlansMobileMastheadArt from "./PlansMobileMastheadArt";

export default function PlansMobileHero() {
  return (
    <header className="pm-hero">
      <div className="pm-hero__masthead">
        <PlansMobileMastheadArt />
        <div className="pm-hero__top">
          <p className="pm-hero__label">خطط الاشتراك</p>
          <h1 className="pm-hero__title">باقات أوردرز هاوس للعمل الحر</h1>
        </div>
      </div>
      <p className="pm-hero__lede">
        اختر الباقة المناسبة لنشاطك، قارن المزايا، وابدأ أو رقِّ اشتراكك من مكان واحد.
      </p>
    </header>
  );
}
