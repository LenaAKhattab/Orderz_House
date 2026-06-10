import { useMemo } from "react";
import { Link } from "react-router-dom";
import heroImage from "../../../assets/hero.png";
import { mapHomeCategoryCards } from "../../../utils/homeCategoryCards";
import { mapHomeMobileOrderCards } from "../../../utils/homeMobileOrderCards";
import { CategoryCardSkeleton } from "../../skeletons/CategoriesSkeleton";

const SKELETON_COUNT = 4;
const ORDER_SKELETON_COUNT = 3;

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Mobile-only categories — pill grid + latest pool orders list.
 * @param {{
 *   items?: unknown[];
 *   loading?: boolean;
 *   error?: boolean;
 *   recentOrders?: unknown[];
 *   recentOrdersLoading?: boolean;
 *   recentOrdersError?: boolean;
 * }} p
 */
export default function HomeMobileCategories({
  items = [],
  loading = false,
  error = false,
  recentOrders = [],
  recentOrdersLoading = false,
  recentOrdersError = false,
}) {
  const cards = useMemo(() => mapHomeCategoryCards(items), [items]);
  const orderCards = useMemo(() => mapHomeMobileOrderCards(recentOrders, items), [recentOrders, items]);

  return (
    <section className="hm-categories" dir="rtl" aria-labelledby="hm-categories-heading">
      <header className="hm-section-head">
        <h2 id="hm-categories-heading" className="hm-section-head__title">
          اكتشف التصنيفات خلال ثوانٍ
        </h2>
        <Link to="/services" className="hm-section-head__link">
          عرض الكل
        </Link>
      </header>

      {error && !loading && items.length === 0 ? (
        <p className="hm-categories__fallback" role="status">
          تعذّر تحميل التصنيفات. نعرض أدناه تصنيفات افتراضية.
        </p>
      ) : null}

      <div className="hm-categories__pills" role="list" aria-busy={loading || undefined}>
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <span key={`pill-skel-${i}`} className="hm-pill hm-pill--skeleton" aria-hidden />
            ))
          : cards.map((card, index) => (
              <Link
                key={card.key}
                to="/services"
                role="listitem"
                className={`hm-pill${index % 3 === 1 ? " hm-pill--accent" : ""}`}
              >
                {card.title}
              </Link>
            ))}
      </div>

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
                    <ChevronLeft />
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
