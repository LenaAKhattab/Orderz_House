import { useMemo } from "react";
import { Link } from "react-router-dom";
import heroImage from "../../assets/hero.png";
import CategoriesSkeleton from "../skeletons/CategoriesSkeleton";
import "./categories-section.css";

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

const FALLBACK_CARDS = [
  {
    key: "programming",
    title: "خدمات البرمجة",
    text: "خدمات برمجية احترافية للأعمال، والأبحاث الأكاديمية، والمشاريع المخصصة.",
  },
  {
    key: "design",
    title: "خدمات التصميم",
    text: "خدمات تصميم احترافية للأعمال، والمجال الأكاديمي، والاحتياجات الشخصية.",
  },
  {
    key: "content-writing",
    title: "خدمات كتابة المحتوى",
    text: "خدمات كتابة احترافية للأعمال، الأبحاث الأكاديمية، والاحتياجات الشخصية.",
  },
];

/** Visual theme per category slug — matches landing reference (sky / violet / orange). */
const THEME_BY_SLUG = {
  programming: "sky",
  design: "violet",
  "content-writing": "orange",
};

const THEME_CLASSES = {
  sky: {
    chip: "bg-sky-100 text-sky-800 ring-2 ring-sky-200/55",
    btn: "bg-sky-100 text-sky-900 hover:bg-sky-200/90 border border-sky-200/60",
  },
  violet: {
    chip: "bg-violet-100 text-violet-800 ring-2 ring-violet-200/55",
    btn: "bg-violet-100 text-violet-900 hover:bg-violet-200/90 border border-violet-200/60",
  },
  orange: {
    chip: "bg-orange-100 text-orange-900 ring-2 ring-orange-200/55",
    btn: "bg-orange-100 text-orange-950 hover:bg-orange-200/90 border border-orange-200/60",
  },
};

const THEME_ORDER = ["sky", "violet", "orange"];

function themeForCard(slug, index) {
  const s = String(slug || "").toLowerCase();
  if (THEME_BY_SLUG[s]) return THEME_BY_SLUG[s];
  return THEME_ORDER[index % THEME_ORDER.length];
}

function IconProgramming({ className = "" }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M14 6l-4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDesign({ className = "" }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconWriting({ className = "" }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10.5-10.5a2.121 2.121 0 0 0-3-3L5 17v3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13 7l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CategoryIcon({ slug, theme }) {
  const s = String(slug || "").toLowerCase();
  if (s === "programming") return <IconProgramming className="shrink-0" />;
  if (s === "design") return <IconDesign className="shrink-0" />;
  if (s === "content-writing") return <IconWriting className="shrink-0" />;
  if (theme === "sky") return <IconProgramming className="shrink-0" />;
  if (theme === "violet") return <IconDesign className="shrink-0" />;
  if (theme === "orange") return <IconWriting className="shrink-0" />;
  return <IconDesign className="shrink-0" />;
}

/**
 * @param {{ items?: unknown[]; loading?: boolean }} p — Data from `usePublicHomeCategories` (homepage).
 */
const CategoriesSection = ({ items = [], loading = false }) => {
  const cards = useMemo(() => {
    const source = items.length > 0 ? items : FALLBACK_CARDS;
    return source.map((c, index) => {
      const slugRaw = c.slug != null ? String(c.slug) : c.key != null ? String(c.key) : "";
      const slug = slugRaw.toLowerCase();
      return {
        key: String(c.slug || c.id || c.key || index),
        slug: slugRaw || String(c.slug || c.key || index),
        theme: themeForCard(slug, index),
        title: c.name || c.title || "",
        text: c.description || c.text || "",
        imgAlt: c.name || c.title || "تصنيف",
        imgSrc: resolveBackendAssetUrl(c.image_url) || heroImage,
      };
    });
  }, [items]);

  const cardGridTemplate =
    cards.length > 0 ? `repeat(${cards.length}, minmax(0, 1fr))` : "repeat(1, minmax(0, 1fr))";

  if (loading) {
    return <CategoriesSkeleton />;
  }

  return (
    <section
      className="relative box-border my-8 w-full px-3 py-6 sm:my-10 sm:px-5 sm:py-8 md:my-12 md:px-8 md:py-10 lg:my-14 lg:px-9 lg:py-12 max-[560px]:px-2.5"
      aria-labelledby="home-categories-heading"
    >
      <div className="relative z-10 mx-auto w-full max-w-none">
        <div
          className={[
            "grid w-full grid-cols-1 items-stretch  rounded-[22px]   p-5 sm:p-6 md:p-8 lg:rounded-[28px] lg:px-9 xl:rounded-[32px] xl:p-0",
            "max-[960px]:gap-6 min-[961px]:grid-cols-[minmax(14rem,26%)_minmax(0,1fr)]",
          ].join(" ")}
        >
          <aside
            className={[
              "relative flex min-h-0 min-w-0 w-full max-w-[min(420px,100%)] flex-col items-center justify-center max-[960px]:max-w-none",
              "min-[961px]:min-h-[min(20rem,48vh)] min-[961px]:items-end min-[961px]:justify-center min-[961px]:ps-0 min-[961px]:pe-2",
              "max-[960px]:items-center max-[960px]:text-center",
            ].join(" ")}
          >
            <div className="home-categories-intro relative flex w-full max-w-[min(19rem,100%)] flex-col items-stretch max-[960px]:max-w-none min-[961px]:items-end">
              <h2
                id="home-categories-heading"
                dir="rtl"
                lang="ar"
                className="home-categories-intro__title m-0 max-[960px]:text-center px-2 py-6 text-[clamp(1.35rem,2.5vw,2.05rem)] font-extrabold leading-tight tracking-tight text-gray-900 min-[961px]:px-0 min-[961px]:py-8 min-[961px]:text-end"
              >
                <span className="text-gray-900">اكتشف التصنيفات</span>{" "}
                <span className="text-[#2f3b65]" dir="rtl" lang="ar">
                  خلال ثوانٍ
                </span>
              </h2>
              <div className="home-categories-decor" aria-hidden="true">
                <span className="home-categories-decor__ring home-categories-decor__ring--lg" />
                <span className="home-categories-decor__ring home-categories-decor__ring--md" />
                <span className="home-categories-decor__ring home-categories-decor__ring--sm" />
                <span className="home-categories-decor__dot home-categories-decor__dot--1" />
                <span className="home-categories-decor__dot home-categories-decor__dot--2" />
              </div>
            </div>
          </aside>

          <div className="min-h-0 min-w-0 rounded-2xl border border-gray-200/90 bg-white p-2.5 sm:p-4 lg:rounded-[22px] lg:p-5">
            <div
              className="m-0 grid min-w-0 list-none items-stretch gap-5 sm:gap-6 md:gap-7"
              style={{ gridTemplateColumns: cardGridTemplate }}
              role="list"
              aria-label="تصنيفات المنصة"
            >
              {cards.map((card) => {
                const t = THEME_CLASSES[card.theme] || THEME_CLASSES.sky;
                return (
                  <article
                    key={card.key}
                    className="group flex min-w-0 max-w-full flex-col rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_40px_-14px_rgba(15,23,42,0.12)] transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_22px_50px_-18px_rgba(15,23,42,0.16)]"
                    role="listitem"
                  >
                    <div className="relative w-full shrink-0">
                      <div className="aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-slate-200/35 sm:aspect-[5/3]">
                        <img
                          src={card.imgSrc || heroImage}
                          alt={card.imgAlt}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          onError={(event) => {
                            event.currentTarget.onerror = null;
                            event.currentTarget.src = heroImage;
                          }}
                        />
                      </div>
                      <div
                        className={`absolute bottom-0 left-1/2 z-10 flex h-[52px] w-[52px] -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border-[5px] border-white shadow-[0_6px_20px_rgba(15,23,42,0.12)] ${t.chip}`}
                        aria-hidden
                      >
                        <CategoryIcon slug={String(card.slug || "").toLowerCase()} theme={card.theme} />
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col items-center gap-2 px-1 pb-1 pt-9 text-center sm:gap-2.5 sm:px-2 sm:pt-10">
                      <h3 className="m-0 text-[clamp(1rem,2.2vw,1.22rem)] font-extrabold leading-snug tracking-tight text-slate-900">
                        {card.title}
                      </h3>
                      <p className="m-0 max-w-[30ch] text-[0.9rem] leading-relaxed text-slate-500 sm:text-[0.95rem]">
                        {card.text}
                      </p>
                      <div className="mt-3 flex w-full flex-1 flex-col justify-end sm:mt-4">
                        <Link
                          to="/services"
                          className={`inline-flex items-center justify-center gap-2 self-center rounded-full px-6 py-2.5 text-sm font-extrabold no-underline transition-colors ${t.btn}`}
                        >
                          <span>استكشف الخدمات</span>
                          <span className="text-lg font-black leading-none" aria-hidden>
                            ←
                          </span>
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;
