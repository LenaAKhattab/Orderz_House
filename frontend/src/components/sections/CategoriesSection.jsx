import { useEffect, useMemo, useState } from "react";
import heroImage from "../../assets/hero.png";
import { getCategoriesRequest } from "../../services/api";

function resolveBackendAssetUrl(maybeUrl) {
  if (!maybeUrl) return "";
  const raw = String(maybeUrl).trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

const FALLBACK_CARDS = [
  {
    key: "programming",
    title: "البرمجة",
    text: "بناء تطبيقات الويب، الواجهات البرمجية، والحلول الحديثة بكفاءة عالية.",
  },
  {
    key: "design",
    title: "التصميم",
    text: "تصميم واجهات نظيفة، هويات بصرية، وتجارب استخدام أنيقة.",
  },
  {
    key: "content-writing",
    title: "كتابة المحتوى",
    text: "كتابة محتوى تسويقي، صفحات هبوط، ومقالات متوافقة مع SEO.",
  },
];

const SECTION_SUBTITLE = "اختر ما تحتاجه — برمجة، تصميم، أو كتابة محتوى";

const CategoriesSection = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await getCategoriesRequest();
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => {
    const source = items.length > 0 ? items : FALLBACK_CARDS;
    return source.map((c, index) => ({
      key: String(c.slug || c.id || index),
      title: c.name || c.title || "",
      text: c.description || c.text || "",
      imgAlt: c.name || c.title || "تصنيف",
      imgSrc: resolveBackendAssetUrl(c.image_url) || heroImage,
    }));
  }, [items]);

  const cardGridTemplate =
    cards.length > 0 ? `repeat(${cards.length}, minmax(0, 1fr))` : "repeat(1, minmax(0, 1fr))";

  return (
    <section
      className="relative box-border w-full bg-gray-50/50 px-3 sm:px-5 md:px-8 lg:px-9 max-[560px]:px-2.5"
      aria-labelledby="home-categories-heading"
    >
      <div className="relative z-10 mx-auto w-full max-w-none">
        <div
          className={[
            "grid w-full grid-cols-1 items-stretch  rounded-[22px]   p-5 sm:p-6 md:p-8 lg:rounded-[28px] lg:px-9 xl:rounded-[32px] xl:p-0",
            "max-[960px]:gap-6 min-[961px]:grid-cols-[minmax(220px,32%)_minmax(0,1fr)] ",
          ].join(" ")}
        >
          <aside
            className={[
              "flex max-w-[min(400px,100%)] flex-col items-start justify-center gap-3 px-1 py-1.5 text-start sm:gap-3.5 sm:px-2",
              "max-[960px]:max-w-none max-[960px]:items-center max-[960px]:text-center",
            ].join(" ")}
          >
            <h2
              id="home-categories-heading"
              className="m-0 text-[clamp(1.35rem,2.5vw,2.05rem)] font-extrabold leading-tight tracking-tight text-gray-900"
            >
              <span className="text-gray-900">اكتشف التصنيفات</span>{" "}
              <span className="text-blue-600">خلال ثوانٍ</span>
            </h2>

            <p className="m-0 max-w-[32ch] text-sm leading-relaxed text-gray-500 sm:text-[0.98rem] max-[960px]:max-w-none">
              {SECTION_SUBTITLE}
            </p>
          </aside>

          <div className="min-h-0 min-w-0 rounded-2xl bg-gray-100 p-2.5 sm:p-4 lg:rounded-[22px] lg:p-5">
            <div
              className={[
                "m-0 grid min-w-0 list-none items-stretch gap-2 sm:gap-3 md:gap-4 lg:gap-5",
                loading ? "pointer-events-none opacity-70" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ gridTemplateColumns: cardGridTemplate }}
              role="list"
              aria-label="تصنيفات المنصة"
              aria-busy={loading}
            >
              {cards.map((card) => (
                <article
                  key={card.key}
                  className="group flex min-w-0 max-w-full flex-col overflow-hidden rounded-[14px] border border-gray-200/95 bg-white shadow-none transition-transform duration-200 ease-out hover:-translate-y-0.5"
                  role="listitem"
                >
                  <div className="relative aspect-5/3 w-full min-h-0 shrink-0 overflow-hidden rounded-t-[14px] sm:aspect-4/3">
                    <img
                      src={card.imgSrc || heroImage}
                      alt={card.imgAlt}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <div className="flex flex-1 flex-col items-center gap-1.5 px-2 py-3 text-center sm:gap-2 sm:px-3 sm:py-4 md:px-4 md:py-5">
                    <h3 className="m-0 text-[clamp(0.7rem,2.1vw,1.05rem)] font-extrabold leading-snug tracking-tight text-gray-900">
                      {card.title}
                    </h3>
                    <p className="m-0 text-[clamp(0.62rem,1.75vw,0.92rem)] leading-relaxed text-gray-600">
                      {card.text}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;
