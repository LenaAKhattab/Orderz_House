import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCategoriesRequest, getSubcategoriesRequest, getSubSubcategoriesRequest } from "../../services/api";

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

function CategoryIconArt({ index }) {
  const mod = index % 3;
  if (mod === 0) {
    return (
      <svg viewBox="0 0 40 40" fill="none" className="services-cat-icon__svg" aria-hidden>
        <rect x="6" y="8" width="28" height="24" rx="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6 16h28" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (mod === 1) {
    return (
      <svg viewBox="0 0 40 40" fill="none" className="services-cat-icon__svg" aria-hidden>
        <path d="M8 30l8-18 6 12 6-8 4 14H8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 40" fill="none" className="services-cat-icon__svg" aria-hidden>
      <circle cx="20" cy="14" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 32c0-6 5-10 10-10s10 4 10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ExpandArrow({ open, size = "md" }) {
  return (
    <span
      className={`services-expand-arrow services-expand-arrow--${size} ${open ? "services-expand-arrow--open" : ""}`.trim()}
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="services-expand-arrow__svg">
        <path
          d="M6 9l6 6 6-6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

const HEADER_LEDE =
  "استكشف مجموعة الخدمات المتاحة داخل المنصة، حيث نوفر حلولًا متكاملة تلبي احتياجات الأعمال، المشاريع الأكاديمية، والخدمات الشخصية بجودة عالية وتنفيذ احترافي.";

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
      <div className="services-shell" aria-busy="true" aria-live="polite">
        <header className="services-header services-header--center">
          <div className="services-skel services-skel--title services-skel--center" />
          <div className="services-skel services-skel--sub services-skel--center wide" />
        </header>
        <div className="services-cat-grid services-cat-grid--hero">
          {[0, 1, 2].map((i) => (
            <div key={i} className="services-skel-card services-skel-card--hero services-skel-card--hero--media" aria-hidden>
              <div className="services-skel-hero-fill" />
              <div className="services-skel-card__bottom">
                <div className="services-skel services-skel--line services-skel--center" />
                <div className="services-skel services-skel--line short services-skel--center" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && categories.length === 0) {
    return (
      <div className="services-shell">
        <header className="services-header services-header--center">
          <h1 className="services-header__title">الخدمات</h1>
          <p className="services-header__lede">{HEADER_LEDE}</p>
        </header>
        <p className="services-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="services-shell">
      <header className="services-header services-header--center">
        <h1 className="services-header__title">الخدمات</h1>
        <p className="services-header__lede">{HEADER_LEDE}</p>
      </header>

      {!sortedCategories.length ? (
        <p className="services-empty services-empty--center">لا توجد تصنيفات متاحة حالياً.</p>
      ) : (
        <>
          <div className="services-cat-grid services-cat-grid--hero">
            {sortedCategories.map((cat, idx) => {
              const id = String(cat.id);
              const isOpen = openCategoryId === id;
              const img = resolveBackendAssetUrl(cat.image_url);
              const tone = idx % 3;

              return (
                <button
                  key={id}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls="services-category-detail"
                  id={`services-cat-trigger-${id}`}
                  className={`services-cat-card services-cat-card--hero services-cat-card--tone-${tone} ${img ? "services-cat-card--has-media" : ""} ${isOpen ? "services-cat-card--active" : ""}`.trim()}
                  onClick={() => toggleCat(id)}
                >
                  {img ? (
                    <>
                      <span className="services-cat-card__media" aria-hidden>
                        <img src={img} alt="" className="services-cat-card__bg-img" loading="lazy" decoding="async" />
                      </span>
                      <span className="services-cat-card__media-overlay" aria-hidden />
                    </>
                  ) : null}
                  <span className="services-cat-card__inner">
                    {!img ? (
                      <span className="services-cat-card__icon-wrap services-cat-card__icon-wrap--lg" aria-hidden>
                        <span className="services-cat-icon">
                          <CategoryIconArt index={idx} />
                        </span>
                      </span>
                    ) : null}
                    <span className="services-cat-card__stack">
                      <span className="services-cat-card__title">{cat.name || cat.title || "—"}</span>
                      {cat.description ? <span className="services-cat-card__desc">{cat.description}</span> : null}
                    </span>
                    <ExpandArrow open={isOpen} />
                  </span>
                </button>
              );
            })}
          </div>

          <div
            id="services-category-detail"
            role="region"
            aria-labelledby={openCategoryId ? `services-cat-trigger-${openCategoryId}` : undefined}
            aria-hidden={!openCategoryId}
            className={`services-detail-shell ${openCategoryId ? "is-open" : ""}`.trim()}
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
