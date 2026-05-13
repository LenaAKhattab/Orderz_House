import { useState } from "react";

export default function SafeAdImage({ src, alt, className = "", imgClassName = "" }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-400 ${className}`.trim()}
        role="img"
        aria-label={alt || "صورة الإعلان"}
      >
        <span className="text-xs font-semibold">أوردرز هاوس</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt || ""}
      className={imgClassName}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
