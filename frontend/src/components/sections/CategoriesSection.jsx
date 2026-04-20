import { useEffect, useMemo, useState } from "react";
import heroImage from "../../assets/hero.png";
import { getCategoriesRequest } from "../../services/api";

function resolveBackendAssetUrl(maybeUrl) {
  if (!maybeUrl) return "";
  const raw = String(maybeUrl).trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  // baseURL is ".../api" → resolve "/images/..." correctly to backend origin
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

function tiltClassByIndex(i) {
  if (i === 0) return "cat-card--tilt-left";
  if (i === 1) return "cat-card--center";
  return "cat-card--tilt-right";
}

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
      tiltClass: tiltClassByIndex(index),
    }));
  }, [items]);

  return (
    <section className="home-categories" aria-labelledby="home-categories-heading">
      <div className="home-categories__bg" aria-hidden="true" />
      <div className="container home-categories__inner">
        <header className="home-categories__head">
          <h2 id="home-categories-heading" className="home-categories__title">
            اكتشف التصنيفات خلال ثوانٍ
          </h2>
          <p className="home-categories__subtitle">اختر ما تحتاجه — برمجة، تصميم، أو كتابة محتوى</p>
        </header>

        <div className="home-categories__grid" role="list" aria-label="تصنيفات المنصة">
          {(loading ? cards : cards).map((card) => (
            <article key={card.key} className={`cat-card ${card.tiltClass}`} role="listitem">
              <div className="cat-card__img">
                <img src={card.imgSrc || heroImage} alt={card.imgAlt} loading="lazy" decoding="async" />
              </div>
              <div className="cat-card__body">
                <h3 className="cat-card__title">{card.title}</h3>
                <p className="cat-card__text">{card.text}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;

