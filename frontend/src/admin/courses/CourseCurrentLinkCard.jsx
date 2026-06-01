import { useState } from "react";
import {
  copyTextToClipboard,
  fileNameFromUrl,
  formatAssetDate,
  getYoutubeThumbnail,
  isHttpUrl,
  isProbablyImageUrl,
  isYoutubeUrl,
} from "./courseAssetDisplayUtils";

/**
 * Saved URL preview — open, copy, optional image/YouTube thumbnail.
 */
export default function CourseCurrentLinkCard({
  url,
  title = "الرابط الحالي",
  updatedAt = null,
  className = "",
}) {
  const [copied, setCopied] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const trimmed = String(url || "").trim();

  if (!isHttpUrl(trimmed)) return null;

  const dateLabel = formatAssetDate(updatedAt);
  const showImage = isProbablyImageUrl(trimmed) && !imgBroken;
  const ytThumb = !showImage && isYoutubeUrl(trimmed) ? getYoutubeThumbnail(trimmed) : null;
  const displayName = fileNameFromUrl(trimmed);

  const onCopy = async () => {
    const ok = await copyTextToClipboard(trimmed);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`oh-course-asset oh-course-asset--link ${className}`.trim()} role="region" aria-label={title}>
      <div className="oh-course-asset__head">
        <span className="oh-course-asset__title">{title}</span>
        {dateLabel ? <span className="oh-course-asset__meta">آخر تحديث: {dateLabel}</span> : null}
      </div>

      {(showImage || ytThumb) && !imgBroken ? (
        <div className="oh-course-asset__preview">
          <img
            src={showImage ? trimmed : ytThumb}
            alt=""
            className="oh-course-asset__preview-img"
            loading="lazy"
            onError={() => setImgBroken(true)}
          />
        </div>
      ) : null}

      <div className="oh-course-asset__body">
        <span className="oh-course-asset__file-icon" aria-hidden>
          {isYoutubeUrl(trimmed) ? "▶" : "🔗"}
        </span>
        <div className="oh-course-asset__copy">
          <span className="oh-course-asset__filename">{displayName}</span>
          <a
            className="oh-course-asset__url"
            href={trimmed}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
          >
            {trimmed}
          </a>
        </div>
      </div>

      <div className="oh-course-asset__actions">
        <a className="btn btn-secondary oh-course-asset__btn" href={trimmed} target="_blank" rel="noopener noreferrer">
          فتح الرابط
        </a>
        <button type="button" className="btn btn-secondary oh-course-asset__btn" onClick={() => void onCopy()}>
          {copied ? "تم النسخ" : "نسخ الرابط"}
        </button>
      </div>
    </div>
  );
}
