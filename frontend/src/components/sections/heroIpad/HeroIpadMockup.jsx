import { useCallback, useEffect, useId, useMemo, useState } from "react";
import * as tw from "../../auth/authTw";
import usePublicHomeCategories from "../../../hooks/usePublicHomeCategories";
import usePublicPoolOrdersPreview from "../../../hooks/usePublicPoolOrdersPreview";
import usePublicPlans from "../../../hooks/usePublicPlans";
import { orderPriceText, typeLabelAr } from "../../open-orders/openOrdersFormatters";
import { orderStatusLabelAr } from "../../../utils/orderFlowUi";
import HeroIpadOverviewAnalytics from "./HeroIpadOverviewAnalytics";
import { HERO_IPAD_BRAND_AR, HERO_IPAD_DEFAULT_ID, HERO_IPAD_LOGO_SRC, HERO_IPAD_NAV } from "./heroIpadData";

/** Same rules as `CategoriesSection.jsx` / `ServicesExplorer.jsx` for `categories.image_url`. */
function resolveBackendAssetUrl(maybeUrl) {
  if (!maybeUrl) return "";
  const raw = String(maybeUrl).trim();
  if (!raw) return "";

  const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
  const apiOrigin = (() => {
    try {
      return new URL(base).origin;
    } catch {
      return "";
    }
  })();
  const isLocalHost = (host) => ["localhost", "127.0.0.1", "::1"].includes(String(host || "").toLowerCase());

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (apiOrigin && isLocalHost(parsed.hostname)) {
        return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, apiOrigin).toString();
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  try {
    const relative = raw.startsWith("/") ? raw : `/${raw}`;
    return new URL(relative, apiOrigin || base).toString();
  } catch {
    return raw;
  }
}

function formatPriceJod(priceJod) {
  if (priceJod === null || priceJod === undefined) return null;
  const n = Number(priceJod);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "مجانية";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} د.أ`;
}

function pickFeaturedPlanIndex(plans) {
  if (!Array.isArray(plans) || plans.length === 0) return -1;
  const popular = plans.findIndex((p) => p?.isPopular === true || p?.is_popular === true);
  if (popular >= 0) return popular;
  const featured = plans.findIndex((p) => p?.isFeatured === true || p?.is_featured === true);
  if (featured >= 0) return featured;
  return Math.floor(plans.length / 2);
}

function formatIpadPlanPriceLine(plan) {
  const price = formatPriceJod(plan?.priceJod);
  const d = Number(plan?.durationDays);
  const dur = Number.isFinite(d) && d > 0 ? `${d} يوم` : null;
  if (price && dur) return `${price} · ${dur}`;
  if (price) return price;
  if (dur) return dur;
  return "—";
}

/**
 * Hero iPad auth preview — role icons (SVG, currentColor).
 */
function IpadAuthIconClient({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M12 11a3 3 0 100-6 3 3 0 000 6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 20a8 8 0 0116 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 8h4M18 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IpadAuthIconFreelancer({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M8 6h8a2 2 0 012 2v9H6V8a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 10h8M8 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 18l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const HERO_IPAD_AUTH_ROLES = [
  {
    id: "client",
    title: "عميل",
    description: "أنشئ طلبات وابحث عن أفضل المستقلين.",
    Icon: IpadAuthIconClient,
  },
  {
    id: "freelancer",
    title: "مستقل",
    description: "استقبل الطلبات وابدأ العمل بسهولة.",
    Icon: IpadAuthIconFreelancer,
  },
];

function useHeroIpadSidebarOpen() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 640px)");
    const apply = () => setSidebarOpen(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
  return [sidebarOpen, setSidebarOpen];
}

function SidebarIcon({ name, className = "size-[1em] shrink-0" }) {
  const stroke = "currentColor";
  const common = { className, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true };
  switch (name) {
    case "layout":
      return (
        <svg {...common}>
          <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" stroke={stroke} strokeWidth="1.6" />
        </svg>
      );
    case "layers":
      return (
        <svg {...common}>
          <path d="M12 3l8 4-8 4-8-4 8-4z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M4 10l8 4 8-4M4 15l8 4 8-4" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "plans":
      return (
        <svg {...common}>
          <path
            d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
            stroke={stroke}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9 9h6M9 12h6M9 15h4" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case "orders":
      return (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h8" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M5 6h.01M5 12h.01M5 18h.01" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <path d="M12 12a3 3 0 100-6 3 3 0 000 6z" stroke={stroke} strokeWidth="1.6" />
          <path d="M5 20a7 7 0 0114 0" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function ScreenOverview() {
  return (
    <div className="home-hero-ipad-screen home-hero-ipad-screen--overview">
      <p className="home-hero-ipad-screen__kicker">مرحبًا بك في لوحة التحكم</p>
      <HeroIpadOverviewAnalytics />
      <p className="home-hero-ipad-screen__hint">يتغيّر المحتوى حسب الدور: عميل، مستقل، أو إداري.</p>
    </div>
  );
}

/**
 * @param {{ categories?: { id?: number|string; slug?: string; name?: string; description?: string|null; image_url?: string|null }[]; loading?: boolean; error?: boolean }} p
 */
function ScreenServices({ categories = [], loading = false, error = false }) {
  return (
    <div className="home-hero-ipad-screen home-hero-ipad-screen--services-v2">
      <p className="home-hero-ipad-services-v2__kicker">تصنيفات الخدمات</p>

      {loading ? (
        <div className="home-hero-ipad-services-v2__grid" aria-busy="true" aria-label="جاري التحميل">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="home-hero-ipad-services-v2__card home-hero-ipad-services-v2__card--skeleton">
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w40" />
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w70" />
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w90" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <p className="home-hero-ipad-screen__hint home-hero-ipad-screen__hint--warn" role="alert">
          تعذر تحميل التصنيفات. تحقق من الاتصال بالخادم.
        </p>
      ) : null}

      {!loading && !error && categories.length === 0 ? (
        <p className="home-hero-ipad-screen__hint">لا توجد تصنيفات مفعّلة حالياً.</p>
      ) : null}

      {!loading && !error && categories.length > 0 ? (
        <div className="home-hero-ipad-services-v2__grid" role="list">
          {categories.map((c, index) => {
            const key = String(c.slug ?? c.id ?? index);
            const title = c.name || "";
            const desc = (c.description && String(c.description).trim()) || "—";
            const img = resolveBackendAssetUrl(c.image_url);
            return (
              <article key={key} className="home-hero-ipad-services-v2__card" role="listitem">
                <div className="home-hero-ipad-services-v2__card-top">
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      className="home-hero-ipad-services-v2__thumb"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="home-hero-ipad-services-v2__icon" aria-hidden />
                  )}
                </div>
                <h3 className="home-hero-ipad-services-v2__title">{title}</h3>
                <p className="home-hero-ipad-services-v2__desc">{desc}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && !error ? (
        <p className="home-hero-ipad-screen__hint">البيانات من جدول التصنيفات النشطة في المنصة.</p>
      ) : null}
    </div>
  );
}

/**
 * @param {{ plans?: { id?: string; name?: string; title?: string; description?: string|null; priceJod?: number|null; durationDays?: number|null }[]; loading?: boolean; error?: boolean }} p
 */
function ScreenPlans({ plans = [], loading = false, error = false }) {
  const featuredIndex = useMemo(() => pickFeaturedPlanIndex(plans), [plans]);

  return (
    <div className="home-hero-ipad-screen home-hero-ipad-screen--plans">
      {loading ? (
        <div className="home-hero-ipad-plans-stack" aria-busy="true" aria-label="جاري التحميل">
          {[0, 1, 2].map((i) => (
            <div key={i} className="home-hero-ipad-plan-card home-hero-ipad-plan-card--skeleton">
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w50" />
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w90" />
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w40" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <p className="home-hero-ipad-screen__hint home-hero-ipad-screen__hint--warn" role="alert">
          تعذر تحميل الباقات. تحقق من الاتصال بالخادم.
        </p>
      ) : null}

      {!loading && !error && plans.length === 0 ? (
        <p className="home-hero-ipad-screen__hint">لا توجد باقات ظاهرة حالياً.</p>
      ) : null}

      {!loading && !error && plans.length > 0 ? (
        <div className="home-hero-ipad-plans-stack" role="list">
          {plans.map((p, idx) => {
            const id = String(p.id ?? idx);
            const featured = idx === featuredIndex;
            const title = p.title || p.name || "—";
            const desc = (p.description && String(p.description).trim()) || "—";
            const priceLine = formatIpadPlanPriceLine(p);
            return (
              <article
                key={id}
                className={`home-hero-ipad-plan-card${featured ? " home-hero-ipad-plan-card--featured" : ""}`}
                role="listitem"
              >
                {featured ? (
                  <span className="home-hero-ipad-plan-card__badge" aria-hidden>
                    الأكثر شيوعًا
                  </span>
                ) : null}
                <h3 className="home-hero-ipad-plan-card__title">{title}</h3>
                <p className="home-hero-ipad-plan-card__desc">{desc}</p>
                <p className="home-hero-ipad-plan-card__price">{priceLine}</p>
              </article>
            );
          })}
        </div>
      ) : null}

      {!loading && !error ? (
        <p className="home-hero-ipad-screen__hint">البيانات من جدول الباقات النشطة الظاهرة في المنصة.</p>
      ) : null}
    </div>
  );
}

/**
 * @param {{ orders?: { id?: string|number; title?: string; orderStatus?: string; projectType?: string }[]; loading?: boolean; error?: boolean }} p
 */
function ScreenOrders({ orders = [], loading = false, error = false }) {
  return (
    <div className="home-hero-ipad-screen home-hero-ipad-screen--orders">
      {loading ? (
        <div className="home-hero-ipad-table" aria-busy="true" aria-label="جاري التحميل">
          <div className="home-hero-ipad-table__row home-hero-ipad-table__row--head">
            <span>الطلب</span>
            <span>الحالة</span>
            <span>الميزانية</span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="home-hero-ipad-table__row home-hero-ipad-table__row--skeleton">
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w90" />
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w70" />
              <span className="home-hero-ipad-services-v2__sk home-hero-ipad-services-v2__sk--line home-hero-ipad-services-v2__sk--w50" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && error ? (
        <p className="home-hero-ipad-screen__hint home-hero-ipad-screen__hint--warn" role="alert">
          تعذر تحميل معرض الطلبات. تحقق من الاتصال بالخادم.
        </p>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <p className="home-hero-ipad-screen__hint">لا توجد طلبات في المعرض حالياً.</p>
      ) : null}

      {!loading && !error && orders.length > 0 ? (
        <div className="home-hero-ipad-table" role="presentation">
          <div className="home-hero-ipad-table__row home-hero-ipad-table__row--head">
            <span>الطلب</span>
            <span>الحالة</span>
            <span>الميزانية</span>
          </div>
          {orders.map((o, i) => {
            const id = o?.id != null ? String(o.id) : `idx-${i}`;
            const title = String(o?.title || "—").trim() || "—";
            const statusLine = `${orderStatusLabelAr(o?.orderStatus)} · ${typeLabelAr(o?.projectType)}`;
            const budget = orderPriceText(o);
            return (
              <div key={id} className="home-hero-ipad-table__row">
                <span className="home-hero-ipad-table__title" title={title}>
                  {title}
                </span>
                <span className="home-hero-ipad-table__status home-hero-ipad-table__status--stack">{statusLine}</span>
                <span className="home-hero-ipad-table__num" dir="ltr">
                  {budget}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && !error ? (
        <p className="home-hero-ipad-screen__hint">نفس بيانات صفحة معرض الطلبات العامة (`/orders`).</p>
      ) : null}
    </div>
  );
}

function ScreenAuth() {
  const roleGroupId = useId();
  const [role, setRole] = useState(null);

  return (
    <div className="home-hero-ipad-screen home-hero-ipad-screen--auth" dir="rtl">
      <div className="hi-ipad-auth-onb">
        <header className="hi-ipad-auth-onb__head">
          <img
            src={HERO_IPAD_LOGO_SRC}
            alt=""
            className="hi-ipad-auth-onb__logo"
            width={44}
            height={14}
            decoding="async"
          />
          <span className="hi-ipad-auth-onb__brand">{HERO_IPAD_BRAND_AR}</span>
        </header>

        <h2 className="hi-ipad-auth-onb__title" id={`${roleGroupId}-heading`}>
          ابدأ رحلتك داخل المنصة
        </h2>
        <p className="hi-ipad-auth-onb__lede">اختر نوع الحساب المناسب للمتابعة.</p>

        <div className="hi-ipad-auth-onb__roles" role="radiogroup" aria-labelledby={`${roleGroupId}-heading`}>
          {HERO_IPAD_AUTH_ROLES.map((r) => {
            const selected = role === r.id;
            const Icon = r.Icon;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`hi-ipad-auth-onb__role${selected ? " hi-ipad-auth-onb__role--active" : ""}`}
                onClick={() => setRole(r.id)}
              >
                <span className="hi-ipad-auth-onb__role-icon-wrap" aria-hidden>
                  <Icon className="hi-ipad-auth-onb__role-icon" />
                </span>
                <span className="hi-ipad-auth-onb__role-body">
                  <span className="hi-ipad-auth-onb__role-title">{r.title}</span>
                  <span className="hi-ipad-auth-onb__role-desc">{r.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className={`${tw.authSubmitBtn} hi-ipad-auth-onb__cta`} disabled={!role} tabIndex={-1}>
          متابعة
        </button>

        <p className="hi-ipad-auth-onb__foot">
          <span className={tw.authInlineLink}>تسجيل الدخول</span>
          <span className="hi-ipad-auth-onb__foot-sep" aria-hidden>
            {" · "}
          </span>
          <span className={tw.authSubtleLink}>إنشاء حساب</span>
        </p>
      </div>
    </div>
  );
}

const SCREEN_BY_ID = {
  overview: ScreenOverview,
  services: ScreenServices,
  plans: ScreenPlans,
  orders: ScreenOrders,
  auth: ScreenAuth,
};

export default function HeroIpadMockup() {
  const baseId = useId();
  const sidebarId = `${baseId}-sidebar`;
  const [selectedId, setSelectedId] = useState(HERO_IPAD_DEFAULT_ID);
  const [sidebarOpen, setSidebarOpen] = useHeroIpadSidebarOpen();
  const { items: serviceCategories, loading: serviceCategoriesLoading, error: serviceCategoriesError } =
    usePublicHomeCategories();
  const { items: publicPlans, loading: publicPlansLoading, error: publicPlansError } = usePublicPlans();
  const { items: poolOrders, loading: poolOrdersLoading, error: poolOrdersError } = usePublicPoolOrdersPreview();

  const activeMeta = useMemo(
    () => HERO_IPAD_NAV.find((n) => n.id === selectedId) ?? HERO_IPAD_NAV[0],
    [selectedId],
  );

  const ActiveScreen = SCREEN_BY_ID[selectedId] ?? ScreenOverview;
  const activeScreenProps =
    selectedId === "services"
      ? {
          categories: serviceCategories,
          loading: serviceCategoriesLoading,
          error: serviceCategoriesError,
        }
      : selectedId === "plans"
        ? {
            plans: publicPlans,
            loading: publicPlansLoading,
            error: publicPlansError,
          }
        : selectedId === "orders"
          ? {
              orders: poolOrders,
              loading: poolOrdersLoading,
              error: poolOrdersError,
            }
          : {};

  const onNavKeyDown = useCallback(
    (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = HERO_IPAD_NAV.findIndex((n) => n.id === selectedId);
      if (i < 0) return;
      const next =
        e.key === "ArrowDown"
          ? (i + 1) % HERO_IPAD_NAV.length
          : (i - 1 + HERO_IPAD_NAV.length) % HERO_IPAD_NAV.length;
      setSelectedId(HERO_IPAD_NAV[next].id);
    },
    [selectedId],
  );

  return (
    <div className="home-hero-ipad-mockup w-full shrink-0">
      <div className="home-hero-ipad-device-stage relative mx-auto w-full max-w-[min(100%,min(92vw,420px))] md:max-w-[min(100%,clamp(620px,48vw,860px))]">
        <div className="home-hero-ipad-tablet-root home-hero-ipad-tablet-root--device relative aspect-[4/3] w-full shrink-0">
          <div className="home-hero-ipad-device-tilt">
            <div className="home-hero-ipad-chassis">
              <div className="home-hero-ipad-chassis__specular" aria-hidden />
              <span className="home-hero-ipad-chassis__side home-hero-ipad-chassis__side--start" aria-hidden />
              <span className="home-hero-ipad-chassis__side home-hero-ipad-chassis__side--end" aria-hidden />

              <div className="home-hero-ipad-bezel">
                <div className="home-hero-ipad-bezel__top">
                  <span className="home-hero-ipad-bezel__camera" aria-hidden />
                </div>
                <div className="home-hero-ipad-bezel__screen-rim">
                  <div className="home-hero-ipad-bezel__screen">
                    <div
                      className="home-hero-ipad-mockup__viewport-inner home-hero-ipad-mockup__viewport-inner--app flex min-h-0 min-w-0 flex-1 flex-col px-0.5 pb-1"
                      dir="rtl"
                    >
                      <header className="home-hero-ipad-app__header">
                  <button
                    type="button"
                    className="home-hero-ipad-app__menu-btn"
                    aria-expanded={sidebarOpen}
                    aria-controls={sidebarId}
                    onClick={() => setSidebarOpen((o) => !o)}
                  >
                    <span className="home-hero-ipad-app__menu-icon" aria-hidden>
                      <span />
                      <span />
                    </span>
                    <span className="sr-only">{sidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}</span>
                  </button>
                  <div className="home-hero-ipad-app__header-brand">
                    <img
                      src={HERO_IPAD_LOGO_SRC}
                      alt=""
                      className="home-hero-ipad-app__logo"
                      decoding="async"
                      width={112}
                      height={36}
                    />
                    <div className="home-hero-ipad-app__header-text">
                      <span className="home-hero-ipad-app__brand-name">{HERO_IPAD_BRAND_AR}</span>
                    </div>
                  </div>
                </header>

                <div className="home-hero-ipad-app__shell flex min-h-0 min-w-0 flex-1">
                  <aside
                    id={sidebarId}
                    className="home-hero-ipad-sidebar"
                    data-state={sidebarOpen ? "open" : "collapsed"}
                    aria-label="التنقل بين الأقسام"
                  >
                    <nav
                      className="home-hero-ipad-sidebar__nav"
                      role="navigation"
                      onKeyDown={onNavKeyDown}
                    >
                      {HERO_IPAD_NAV.map((item) => {
                        const active = item.id === selectedId;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={`home-hero-ipad-sidebar__item${active ? " home-hero-ipad-sidebar__item--active" : ""}`}
                            aria-current={active ? "true" : undefined}
                            onClick={() => setSelectedId(item.id)}
                          >
                            <SidebarIcon name={item.icon} className="home-hero-ipad-sidebar__icon" />
                            <span className="home-hero-ipad-sidebar__label">{item.label}</span>
                          </button>
                        );
                      })}
                    </nav>
                  </aside>

                  <main className="home-hero-ipad-main min-w-0 flex-1">
                    <div className="home-hero-ipad-main__intro">
                      <h2 className="home-hero-ipad-main__title">{activeMeta.title}</h2>
                      <p className="home-hero-ipad-main__desc">{activeMeta.description}</p>
                    </div>
                    <div
                      className="home-hero-ipad-main__body"
                      id={`${baseId}-main`}
                      role="region"
                      aria-label={activeMeta.title}
                    >
                      <div key={selectedId} className="home-hero-ipad-main__panel">
                        <ActiveScreen {...activeScreenProps} />
                      </div>
                    </div>
                  </main>
                </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
