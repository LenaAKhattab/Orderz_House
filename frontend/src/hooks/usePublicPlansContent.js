import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import {
  PUBLIC_PLANS_CONTENT_DEFAULTS,
  PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
  resolvePublicPlansDefaultSection,
} from "../constants/publicPlansContent";
import {
  fetchPublicPlansContentCached,
  getCachedPublicPlansContent,
} from "../services/freelancerSessionCache";

function fallbackPayload(t) {
  return {
    badgeText: t("plans.training.hero.eyebrow"),
    title: t("plans.training.hero.title"),
    description: t("plans.training.hero.subtitle"),
    defaultSection: PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
    trainingTabLabel: t("plans.categories.training"),
    workTabLabel: t("plans.categories.membership"),
    textsAreCustom: false,
  };
}

function resolveDisplayContent(data, t) {
  const defaultSection = resolvePublicPlansDefaultSection(data?.defaultSection);
  if (!data || data.textsAreCustom !== true) {
    return {
      ...fallbackPayload(t),
      defaultSection,
    };
  }
  return {
    badgeText: String(data.badgeText || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.badgeText,
    title: String(data.title || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.title,
    description: String(data.description || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.description,
    defaultSection,
    trainingTabLabel:
      String(data.trainingTabLabel || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.trainingTabLabel,
    workTabLabel: String(data.workTabLabel || "").trim() || PUBLIC_PLANS_CONTENT_DEFAULTS.workTabLabel,
    textsAreCustom: true,
  };
}

/**
 * Public `/plans` hero copy + initial section.
 * Skeleton until first resolve; on failure uses safe configured defaults (no page break).
 */
export function usePublicPlansContent({ enabled = true } = {}) {
  const { t } = useTranslation();
  const cached = enabled ? getCachedPublicPlansContent() : null;
  const [raw, setRaw] = useState(() => (enabled ? cached : null));
  const [loading, setLoading] = useState(() => Boolean(enabled) && !cached);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setRaw(null);
      setLoading(false);
      return undefined;
    }

    const generation = ++generationRef.current;
    let cancelled = false;
    const haveCache = Boolean(getCachedPublicPlansContent());
    if (haveCache) {
      setRaw(getCachedPublicPlansContent());
      setLoading(false);
    } else {
      setLoading(true);
    }

    void fetchPublicPlansContentCached()
      .then((data) => {
        if (cancelled || generation !== generationRef.current) return;
        setRaw(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled || generation !== generationRef.current) return;
        setRaw(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const content = useMemo(() => resolveDisplayContent(raw, t), [raw, t]);

  return {
    loading: Boolean(enabled) && loading,
    ready: Boolean(enabled) && !loading,
    badgeText: content.badgeText,
    title: content.title,
    description: content.description,
    defaultSection: content.defaultSection,
    trainingTabLabel: content.trainingTabLabel,
    workTabLabel: content.workTabLabel,
    textsAreCustom: content.textsAreCustom,
  };
}
