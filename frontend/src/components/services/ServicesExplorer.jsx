import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCategoriesRequest, getSubcategoriesRequest, getSubSubcategoriesRequest } from "../../services/api";
import ServicesBenefitsStrip from "./ServicesBenefitsStrip";
import ServicesRefCard from "./ServicesRefCard";

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

function ServicesRefCardSkeleton() {
  return (
    <div className="services-ref-skel-card" aria-hidden>
      <span className="services-ref-skel-card__media" />
      <span className="services-ref-skel-card__body">
        <span className="services-ref-skel-card__line services-ref-skel-card__line--title" />
        <span className="services-ref-skel-card__line services-ref-skel-card__line--desc" />
      </span>
      <span className="services-ref-skel-card__cta" />
    </div>
  );
}

const HEADER_LEDE =
  "استكشف مجموعة الخدمات المتاحة داخل المنصة، حيث نوفر حلولاً متكاملة تلبي احتياجات الأعمال والمشاريع بكفاءة واحترافية من كتابة وتحرير إلى برمجة وتصميم.";

function ServicesRefHero({ lede = HEADER_LEDE }) {
  return (
    <header className="services-ref-hero">
      <h1 className="services-ref-hero__title">الخدمات</h1>
      <div className="services-ref-hero__divider" aria-hidden>
        <span className="services-ref-hero__divider-line" />
        <span className="services-ref-hero__divider-diamond" />
        <span className="services-ref-hero__divider-line" />
      </div>
      <p className="services-ref-hero__lede">{lede}</p>
    </header>
  );
}

function ServicesSubSkeleton() {
  return (
    <div className="services-skel-sub-grid" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="services-skel-sub-card">
          <div className="services-skel-sub-card__title" />
          <div className="services-skel-sub-card__desc" />
        </div>
      ))}
    </div>
  );
}

function ServicesPillSkeleton() {
  return (
    <div className="services-skel-pill-row" aria-hidden>
      {Array.from({ length: 15 }, (_, i) => (
        <div key={i} className="services-skel-pill" />
      ))}
    </div>
  );
}

const ServicesExplorer = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [openCategoryId, setOpenCategoryId] = useState(null);
  const [openSubcategoryId, setOpenSubcategoryId] = useState(null);

  const [subsByCat, setSubsByCat] = useState({});
  const subsByCatRef = useRef({});
  useEffect(() => {
    subsByCatRef.current = subsByCat;
  }, [subsByCat]);

  const [subsLoading, setSubsLoading] = useState({});
  const [subsError, setSubsError] = useState({});

  const [subSubsBySub, setSubSubsBySub] = useState({});
  const subSubsBySubRef = useRef({});
  useEffect(() => {
    subSubsBySubRef.current = subSubsBySub;
  }, [subSubsBySub]);

  const [subSubsLoading, setSubSubsLoading] = useState({});
  const [subSubsError, setSubSubsError] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getCategoriesRequest();
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) setCategories(list);
      } catch {
        if (!cancelled) {
          setCategories([]);
          setError("تعذر تحميل التصنيفات. حاول لاحقاً.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSubsForCategory = useCallback(async (categoryId) => {
    const id = String(categoryId);
    if (subsByCatRef.current[id] !== undefined) return;
    setSubsLoading((m) => ({ ...m, [id]: true }));
    setSubsError((m) => ({ ...m, [id]: "" }));
    try {
      const res = await getSubcategoriesRequest(id);
      const list = res?.data?.subcategories;
      setSubsByCat((m) => ({ ...m, [id]: Array.isArray(list) ? list : [] }));
    } catch {
      setSubsByCat((m) => ({ ...m, [id]: [] }));
      setSubsError((m) => ({ ...m, [id]: "تعذر تحميل التصنيفات الفرعية." }));
    } finally {
      setSubsLoading((m) => ({ ...m, [id]: false }));
    }
  }, []);

  const loadSubSubsForSub = useCallback(async (subcategoryId) => {
    const id = String(subcategoryId);
    if (subSubsBySubRef.current[id] !== undefined) return;
    setSubSubsLoading((m) => ({ ...m, [id]: true }));
    setSubSubsError((m) => ({ ...m, [id]: "" }));
    try {
      const res = await getSubSubcategoriesRequest(id);
      const list = res?.data?.subSubcategories;
      setSubSubsBySub((m) => ({ ...m, [id]: Array.isArray(list) ? list : [] }));
    } catch {
      setSubSubsBySub((m) => ({ ...m, [id]: [] }));
      setSubSubsError((m) => ({ ...m, [id]: "تعذر تحميل التصنيفات التفصيلية." }));
    } finally {
      setSubSubsLoading((m) => ({ ...m, [id]: false }));
    }
  }, []);

  const toggleCat = (id) => {
    const sid = String(id);
    setOpenCategoryId((prev) => {
      if (prev === sid) {
        setOpenSubcategoryId(null);
        return null;
      }
      setOpenSubcategoryId(null);
      void loadSubsForCategory(sid);
      return sid;
    });
  };

  const toggleSub = (id) => {
    const sid = String(id);
    setOpenSubcategoryId((prev) => {
      if (prev === sid) return null;
      void loadSubSubsForSub(sid);
      return sid;
    });
  };

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => {
      const oa = Number(a?.sortOrder) || 0;
      const ob = Number(b?.sortOrder) || 0;
      if (oa !== ob) return oa - ob;
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }, [categories]);

  const openCat = openCategoryId ? sortedCategories.find((c) => String(c.id) === openCategoryId) : null;
  const openSubs = openCategoryId ? subsByCat[openCategoryId] : undefined;

  const activeSub = useMemo(() => {
    if (!openSubcategoryId || !Array.isArray(openSubs)) return null;
    return openSubs.find((s) => String(s.id) === openSubcategoryId) ?? null;
  }, [openSubs, openSubcategoryId]);

  if (loading) {
    return (
      <div className="services-ref-shell" aria-busy="true" aria-live="polite">
        <ServicesRefHero />
        <div className="services-ref-cards">
          {[0, 1, 2].map((i) => (
            <ServicesRefCardSkeleton key={i} />
          ))}
        </div>
        <div className="services-ref-skel-benefits" aria-hidden />
      </div>
    );
  }

  if (error && categories.length === 0) {
    return (
      <div className="services-ref-shell">
        <ServicesRefHero />
        <p className="services-ref-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="services-ref-shell">
      <ServicesRefHero />

      {!sortedCategories.length ? (
        <p className="services-ref-muted">لا توجد تصنيفات متاحة حالياً.</p>
      ) : (
        <>
          <div className="services-ref-cards">
            {sortedCategories.map((cat, idx) => {
              const id = String(cat.id);
              const isOpen = openCategoryId === id;
              const img = resolveBackendAssetUrl(cat.image_url);
              const tone = idx % 3;

              return (
                <ServicesRefCard
                  key={id}
                  cat={cat}
                  idx={idx}
                  tone={tone}
                  isOpen={isOpen}
                  imageSrc={img}
                  onToggle={() => toggleCat(id)}
                />
              );
            })}
          </div>

          <ServicesBenefitsStrip />

          <div
            id="services-category-detail"
            role="region"
            aria-labelledby={openCategoryId ? `services-cat-trigger-${openCategoryId}` : undefined}
            aria-hidden={!openCategoryId}
            className={`services-ref-detail services-detail-shell ${openCategoryId ? "is-open" : ""}`.trim()}
          >
            <div className="services-detail-shell__body">
              <div className="services-detail-shell__inner">
                {openCategoryId && openCat ? (
                  <>
                    <div className="services-detail-head">
                      <h2 className="services-detail-head__title">{openCat.name || openCat.title || "—"}</h2>
                      {openCat.description ? <p className="services-detail-head__desc">{openCat.description}</p> : null}
                    </div>

                    {subsLoading[openCategoryId] ? (
                      <div aria-busy="true">
                        <ServicesSubSkeleton />
                      </div>
                    ) : subsError[openCategoryId] ? (
                      <p className="services-error services-error--inline" role="alert">
                        {subsError[openCategoryId]}
                      </p>
                    ) : !openSubs || openSubs.length === 0 ? (
                      <p className="services-muted services-muted--center">لا توجد تصنيفات فرعية لهذا القسم.</p>
                    ) : (
                      <div className="services-sub-grid">
                        {openSubs.map((sub) => {
                          const sid = String(sub.id);
                          const subOpen = openSubcategoryId === sid;

                          return (
                            <button
                              key={sid}
                              type="button"
                              className={`services-sub-card services-sub-card--panel ${subOpen ? "services-sub-card--active" : ""}`.trim()}
                              onClick={() => toggleSub(sid)}
                              aria-pressed={subOpen}
                              aria-controls="services-subsub-global"
                              id={`services-sub-trigger-${sid}`}
                            >
                              <span className="services-sub-card__stack">
                                <span className="services-sub-card__title">{sub.name || "—"}</span>
                                {sub.description ? (
                                  <span className="services-sub-card__desc">{sub.description}</span>
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {openCategoryId &&
              openCat &&
              !subsLoading[openCategoryId] &&
              !subsError[openCategoryId] &&
              openSubs?.length ? (
                <div
                  id="services-subsub-global"
                  className={`services-subsub-bleed ${openSubcategoryId ? "services-subsub-bleed--visible" : ""}`.trim()}
                  role="region"
                  aria-live="polite"
                  aria-labelledby={openSubcategoryId ? `services-sub-trigger-${openSubcategoryId}` : undefined}
                  aria-hidden={!openSubcategoryId}
                >
                  <div className="services-subsub-bleed__grow">
                    <div className="services-subsub-panel">
                      {openSubcategoryId ? (
                        <div key={openSubcategoryId} className="services-subsub-panel__animate">
                          {activeSub ? (
                            <p className="services-subsub-panel__label">
                              <span className="services-subsub-panel__label-muted">التخصصات ضمن</span>
                              <span className="services-subsub-panel__label-strong">{activeSub.name || "—"}</span>
                            </p>
                          ) : null}

                          {subSubsLoading[openSubcategoryId] || !Array.isArray(subSubsBySub[openSubcategoryId]) ? (
                            <div aria-busy="true">
                              <ServicesPillSkeleton />
                            </div>
                          ) : subSubsError[openSubcategoryId] ? (
                            <p className="services-error services-error--inline" role="alert">
                              {subSubsError[openSubcategoryId]}
                            </p>
                          ) : subSubsBySub[openSubcategoryId].length === 0 ? (
                            <p className="services-muted services-muted--center">لا توجد عناصر تفصيلية.</p>
                          ) : (
                            <div
                              className="services-pill-row"
                              aria-label={activeSub?.name ? `تخصصات ${activeSub.name}` : "تخصصات"}
                            >
                              {subSubsBySub[openSubcategoryId].map((ss) => (
                                <span key={String(ss.id)} className="services-pill-tag">
                                  {ss.name || "—"}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ServicesExplorer;
