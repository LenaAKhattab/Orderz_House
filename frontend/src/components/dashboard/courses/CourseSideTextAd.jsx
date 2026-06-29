import { useEffect, useMemo, useState } from "react";
import { freelancerGetCourseSideTextAdRequest } from "../../../services/api";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./courseSideTextAd.css";

const cache = new Map();
const inflight = new Map();

function cacheKey(context, courseId) {
  return `${context}:${courseId ?? ""}`;
}

async function loadCourseSideTextAdConfig(context, courseId) {
  const key = cacheKey(context, courseId);
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const promise = freelancerGetCourseSideTextAdRequest({ context, courseId })
    .then((res) => {
      const cfg = res?.data || { enabled: false };
      cache.set(key, cfg);
      return cfg;
    })
    .catch(() => {
      const fallback = { enabled: false };
      cache.set(key, fallback);
      return fallback;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCourseSideTextAdCache() {
  cache.clear();
  inflight.clear();
}

function isArabicText(text) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function pickLocalizedWithDirection({ locale, textAr, textEn }) {
  const ar = String(textAr || "").trim();
  const en = String(textEn || "").trim();
  const isEn = locale === "en";

  if (isEn && en) {
    return { text: en, textDir: "ltr" };
  }
  if (isEn && ar) {
    return { text: ar, textDir: "rtl" };
  }
  if (ar) {
    return { text: ar, textDir: "rtl" };
  }
  if (en) {
    return { text: en, textDir: isArabicText(en) ? "rtl" : "ltr" };
  }
  return { text: "", textDir: "rtl" };
}

/**
 * @param {{
 *   context: "courses_list" | "course_details",
 *   courseId?: string|number,
 *   preview?: object | null
 * }} props
 */
export default function CourseSideTextAd({ context, courseId, preview = null }) {
  const { locale } = useTranslation();
  const key = cacheKey(context, courseId);
  const [remote, setRemote] = useState(preview ? null : cache.get(key) ?? null);
  const [loading, setLoading] = useState(!preview && !cache.has(key));

  useEffect(() => {
    if (preview) return undefined;
    let mounted = true;
    setLoading(!cache.has(key));
    void loadCourseSideTextAdConfig(context, courseId).then((cfg) => {
      if (!mounted) return;
      setRemote(cfg);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [preview, context, courseId, key]);

  const config = preview || remote;

  const resolved = useMemo(() => {
    if (!config?.enabled) return null;
    const { text, textDir } = pickLocalizedWithDirection({
      locale,
      textAr: config.textAr,
      textEn: config.textEn,
    });
    if (!text) return null;
    const url = config.url ? String(config.url).trim() : "";
    return {
      text,
      textDir,
      url,
      speed: ["slow", "fast"].includes(config.speed) ? config.speed : "normal",
      textColor: ["black", "red"].includes(config.textColor) ? config.textColor : "blue",
    };
  }, [config, locale]);

  if (loading || !resolved) return null;

  const directionClass = resolved.textDir === "rtl" ? "fc-text-ad--rtl" : "fc-text-ad--ltr";
  const speedClass = `fc-text-ad--speed-${resolved.speed}`;
  const colorClass =
    resolved.textColor === "black"
      ? "fc-text-ad--color-black"
      : resolved.textColor === "red"
        ? "fc-text-ad--color-red"
        : "fc-text-ad--color-blue";
  const className = ["fc-text-ad", directionClass, speedClass, colorClass].join(" ");

  const ticker = (
    <div className="fc-text-ad__track" aria-hidden={false}>
      <span className="fc-text-ad__text">{resolved.text}</span>
    </div>
  );

  const shell = resolved.url ? (
    (() => {
      const external = /^https?:\/\//i.test(resolved.url);
      return (
        <a
          className="fc-text-ad__card"
          href={resolved.url}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {ticker}
        </a>
      );
    })()
  ) : (
    <div className="fc-text-ad__card">{ticker}</div>
  );

  return (
    <section className={className} dir={resolved.textDir} aria-label={resolved.text}>
      <div className="fc-text-ad__shell">{shell}</div>
    </section>
  );
}
