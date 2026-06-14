import { Link } from "react-router-dom";
import heroImage from "../../../assets/hero.png";
import HomeFeaturedServicesGrid from "../HomeFeaturedServicesGrid";
import { HOME_FEATURED_ICON_STROKE_WIDTH_MOBILE } from "../../../constants/homeFeaturedServices";
import { mapHomeMobileOrderCards } from "../../../utils/homeMobileOrderCards";

const ORDER_SKELETON_COUNT = 3;

function ChevronLeftSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Mobile-only categories — featured services grid + latest pool orders list.
 * @param {{
 *   recentOrders?: unknown[];
 *   recentOrdersLoading?: boolean;
 *   recentOrdersError?: boolean;
 * }} p
 */
export default function HomeMobileCategories({
  recentOrders = [],
  recentOrdersLoading = false,
  recentOrdersError = false,
}) {
  const orderCards = mapHomeMobileOrderCards(recentOrders, []);

  return (
    <section className="hm-categories" dir="rtl" aria-labelledby="hm-categories-heading">
      <header className="hm-section-head hm-section-head--categories">
        <div className="hm-categories-intro-copy">
          <h2 id="hm-categories-heading" className="hm-section-head__title hm-section-head__title--categories">
            اكتشف التصنيفات خلال ثوانٍ
          </h2>
          <p className="hm-section-head__subtitle">اختر المجال المناسب وابدأ الطلب خلال دقائق</p>
        </div>
        <Link to="/orders" className="hm-section-head__link">
          عرض الكل
        </Link>
      </header>

      <HomeFeaturedServicesGrid
        className="hm-categories-icon-grid hm-categories-icon-grid--featured"
        iconSize={38}
        iconStrokeWidth={HOME_FEATURED_ICON_STROKE_WIDTH_MOBILE}
        listLabel="الخدمات المميزة"
      />

      <header className="hm-section-head hm-section-head--sub">
        <h3 className="hm-section-head__title hm-section-head__title--sm">أحدث الطلبات</h3>
        <Link to="/orders" className="hm-section-head__link">
          عرض الكل
        </Link>
      </header>

      {recentOrdersError && !recentOrdersLoading && orderCards.length === 0 ? (
        <p className="hm-categories__fallback" role="status">
          تعذّر تحميل الطلبات. جرّب لاحقاً أو تصفّح معرض الطلبات.
        </p>
      ) : null}

      <div className="hm-categories__featured" role="list" aria-label="أحدث الطلبات في المعرض">
        {recentOrdersLoading
          ? Array.from({ length: ORDER_SKELETON_COUNT }, (_, i) => (
              <div key={`order-skel-${i}`} className="hm-list-card hm-list-card--skeleton" aria-hidden />
            ))
          : orderCards.length > 0
            ? orderCards.map((order, index) => (
                <Link
                  key={order.id}
                  to={order.to}
                  role="listitem"
                  className={`hm-list-card${index === 0 ? " hm-list-card--highlight" : ""}`}
                >
                  <div className="hm-list-card__thumb">
                    <img
                      src={order.imgSrc || heroImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = heroImage;
                      }}
                    />
                  </div>
                  <div className="hm-list-card__body">
                    <h4 className="hm-list-card__title">{order.title}</h4>
                    <div className="hm-list-card__tags">
                      <span className="hm-list-card__tag hm-list-card__tag--accent">{order.categoryTag}</span>
                      <span className="hm-list-card__tag hm-list-card__tag--muted" dir="ltr">
                        {order.priceTag}
                      </span>
                    </div>
                  </div>
                  <span className="hm-list-card__action" aria-hidden>
                    <ChevronLeftSmall />
                  </span>
                </Link>
              ))
            : !recentOrdersError ? (
                <p className="hm-categories__empty-orders" role="status">
                  لا توجد طلبات في المعرض حالياً.
                </p>
              ) : null}
      </div>
    </section>
  );
}
