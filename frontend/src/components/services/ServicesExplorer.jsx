import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import PublicPageHeader from "../layout/PublicPageHeader";
import { getCategoriesRequest, getSubcategoriesRequest, getSubSubcategoriesRequest } from "../../services/api";
import { filterServiceCategories } from "../../utils/homeCategoryCards";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";
import { getLocalizedServiceCategoryDescription } from "../../lib/i18n/getLocalizedServiceCategoryDescription";
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

function ServicesRefCardSkeleton({ compact = false }) {
  if (compact) {
    return (
      <div className="services-ref-skel-card services-ref-skel-card--compact" aria-hidden>
        <span className="services-ref-skel-card__compact-icon" />
        <span className="services-ref-skel-card__compact-title" />
      </div>
    );
  }

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

function ServicesMobileSubSkeleton() {
  return (
    <div className="services-mobile-subcategory-list" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="services-mobile-subcategory-row services-mobile-subcategory-row--skeleton">
          <span className="services-mobile-subcategory-skel-trigger" />
        </div>
      ))}
    </div>
  );
}

function ServicesMobilePillSkeleton() {
  return (
    <div className="services-mobile-specialty-grid services-mobile-specialty-grid--skeleton" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="services-mobile-specialty-skel-chip" />
      ))}
    </div>
  );
}

function SubcategoryChevron() {
  return (
    <span className="services-mobile-subcategory-trigger__chevron" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none">
        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function SubSpecialtiesContent({
  subId,
  sub,
  subSubsBySub,
  subSubsLoading,
  subSubsError,
  locale,
  t,
  mobile = false,
}) {
  const subName = getLocalizedField(sub, "name", locale);
  const ariaLabel = subName ? `${t("services.specialtiesAria")} ${subName}` : t("services.specialtiesAria");

  if (subSubsLoading[subId] || !Array.isArray(subSubsBySub[subId])) {
    return mobile ? <ServicesMobilePillSkeleton /> : <ServicesPillSkeleton />;
  }

  if (subSubsError[subId]) {
    return (
      <p className="services-error services-error--inline" role="alert">
        {subSubsError[subId]}
      </p>
    );
  }

  if (subSubsBySub[subId].length === 0) {
    return (
      <p className={mobile ? "services-mobile-specialty-empty" : "services-muted services-muted--center"}>
        {t("services.emptyDetails")}
      </p>
    );
  }

  if (mobile) {
    return (
      <div className="services-mobile-specialty-grid" aria-label={ariaLabel}>
        {subSubsBySub[subId].map((ss) => (
          <span key={String(ss.id)} className="services-mobile-specialty-chip">
            {getLocalizedField(ss, "name", locale) || "—"}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="services-pill-row" aria-label={ariaLabel}>
      {subSubsBySub[subId].map((ss) => (
        <span key={String(ss.id)} className="services-pill-tag">
          {getLocalizedField(ss, "name", locale) || "—"}
        </span>
      ))}
    </div>
  );
}

const MOBILE_SERVICES_MQ = "(max-width: 620px)";

function getMobileServicesLayoutSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_SERVICES_MQ).matches;
}

function subscribeMobileServicesLayout(onStoreChange) {
  const mq = window.matchMedia(MOBILE_SERVICES_MQ);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function useMobileServicesLayout() {
  return useSyncExternalStore(
    subscribeMobileServicesLayout,
    getMobileServicesLayoutSnapshot,
    () => false,
  );
}

const ServicesExplorer = () => {
  const { t, dir, locale } = useTranslation();
  const isMobileLayout = useMobileServicesLayout();
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
        const list = filterServiceCategories(Array.isArray(res?.data) ? res.data : []);
        if (!cancelled) setCategories(list);
      } catch {
        if (!cancelled) {
          setCategories([]);
          setError(t("common.errors.loadCategories"));
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
      setSubsError((m) => ({ ...m, [id]: t("common.errors.loadSubcategories") }));
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
      setSubSubsError((m) => ({ ...m, [id]: t("common.errors.loadSubSubcategories") }));
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
  const openCategoryDescription = openCat ? getLocalizedServiceCategoryDescription(openCat, locale) : "";
  const openSubs = openCategoryId ? subsByCat[openCategoryId] : undefined;

  const activeSub = useMemo(() => {
    if (!openSubcategoryId || !Array.isArray(openSubs)) return null;
    return openSubs.find((s) => String(s.id) === openSubcategoryId) ?? null;
  }, [openSubs, openSubcategoryId]);

  if (loading) {
    return (
      <div className="services-ref-shell" aria-busy="true" aria-live="polite">
        <PublicPageHeader title={t("services.hero.title")} subtitle={t("services.hero.subtitle")} />
        <div className={`services-ref-cards${isMobileLayout ? " services-ref-cards--compact" : ""}`.trim()}>
          {[0, 1, 2].map((i) => (
            <ServicesRefCardSkeleton key={i} compact={isMobileLayout} />
          ))}
        </div>
        <div className="services-ref-skel-benefits" aria-hidden />
      </div>
    );
  }

  if (error && categories.length === 0) {
    return (
      <div className="services-ref-shell" dir={dir}>
        <PublicPageHeader title={t("services.hero.title")} subtitle={t("services.hero.subtitle")} />
        <p className="services-ref-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="services-ref-shell" dir={dir}>
      <PublicPageHeader title={t("services.hero.title")} subtitle={t("services.hero.subtitle")} />

      {!sortedCategories.length ? (
        <p className="services-ref-muted">{t("common.empty.categories")}</p>
      ) : (
        <>
          <div className={`services-ref-cards${isMobileLayout ? " services-ref-cards--compact" : ""}`.trim()}>
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
                  compact={isMobileLayout}
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
                      <h2 className="services-detail-head__title">
                        {getLocalizedField(openCat, "name", locale) || getLocalizedField(openCat, "title", locale) || "—"}
                      </h2>
                      {openCategoryDescription ? (
                        <p className="services-detail-head__desc">{openCategoryDescription}</p>
                      ) : null}
                    </div>

                    {subsLoading[openCategoryId] ? (
                      <div aria-busy="true">
                        {isMobileLayout ? <ServicesMobileSubSkeleton /> : <ServicesSubSkeleton />}
                      </div>
                    ) : subsError[openCategoryId] ? (
                      <p className="services-error services-error--inline" role="alert">
                        {subsError[openCategoryId]}
                      </p>
                    ) : !openSubs || openSubs.length === 0 ? (
                      <p className="services-muted services-muted--center">{t("services.emptySubcategories")}</p>
                    ) : isMobileLayout ? (
                      <div className="services-mobile-subcategory-list">
                        {openSubs.map((sub) => {
                          const sid = String(sub.id);
                          const subOpen = openSubcategoryId === sid;
                          const panelId = `services-mobile-sub-panel-${sid}`;

                          return (
                            <div
                              key={sid}
                              className={`services-mobile-subcategory-row${subOpen ? " services-mobile-subcategory-row--open" : ""}`.trim()}
                            >
                              <button
                                type="button"
                                className="services-mobile-subcategory-trigger"
                                onClick={() => toggleSub(sid)}
                                aria-expanded={subOpen}
                                aria-controls={panelId}
                                id={`services-sub-trigger-${sid}`}
                              >
                                <span className="services-mobile-subcategory-trigger__label">
                                  {getLocalizedField(sub, "name", locale) || "—"}
                                </span>
                                <SubcategoryChevron />
                              </button>
                              {subOpen ? (
                                <div
                                  id={panelId}
                                  className="services-mobile-subcategory-panel"
                                  role="region"
                                  aria-labelledby={`services-sub-trigger-${sid}`}
                                >
                                  <SubSpecialtiesContent
                                    subId={sid}
                                    sub={sub}
                                    subSubsBySub={subSubsBySub}
                                    subSubsLoading={subSubsLoading}
                                    subSubsError={subSubsError}
                                    locale={locale}
                                    t={t}
                                    mobile
                                  />
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
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
                                <span className="services-sub-card__title">{getLocalizedField(sub, "name", locale) || "—"}</span>
                                {getLocalizedField(sub, "description", locale) ? (
                                  <span className="services-sub-card__desc">{getLocalizedField(sub, "description", locale)}</span>
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

              {!isMobileLayout &&
              openCategoryId &&
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
                              <span className="services-subsub-panel__label-muted">{t("services.specialtiesWithin")}</span>
                              <span className="services-subsub-panel__label-strong">{getLocalizedField(activeSub, "name", locale) || "—"}</span>
                            </p>
                          ) : null}

                          <SubSpecialtiesContent
                            subId={openSubcategoryId}
                            sub={activeSub}
                            subSubsBySub={subSubsBySub}
                            subSubsLoading={subSubsLoading}
                            subSubsError={subSubsError}
                            locale={locale}
                            t={t}
                          />
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
