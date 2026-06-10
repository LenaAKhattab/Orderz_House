/** Soft minimal masthead — primary blue only (mobile home). */
export default function HomeMobileHeroMastheadArt() {
  return (
    <svg
      className="hm-hero__masthead-art"
      viewBox="0 0 390 168"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="hm-mast-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dce6f5" />
          <stop offset="50%" stopColor="#eef2fa" />
          <stop offset="100%" stopColor="#f5f7fc" />
        </linearGradient>
        <linearGradient id="hm-mast-blob" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5b6fa3" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#2f3b65" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="hm-mast-arc" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#2f3b65" stopOpacity="0" />
          <stop offset="50%" stopColor="#3d4d7a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2f3b65" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hm-mast-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5b6fa3" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#5b6fa3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="390" height="168" fill="url(#hm-mast-bg)" />

      {/* Soft ambient shapes — left side only */}
      <ellipse cx="88" cy="76" rx="100" ry="68" fill="url(#hm-mast-glow)" />
      <ellipse cx="56" cy="48" rx="48" ry="34" fill="url(#hm-mast-blob)" />
      <ellipse cx="168" cy="108" rx="56" ry="38" fill="#2f3b65" fillOpacity="0.05" />

      {/* Gentle connection arc */}
      <path
        d="M220 62 C178 50, 142 72, 108 88 C82 100, 58 96, 42 82"
        fill="none"
        stroke="url(#hm-mast-arc)"
        strokeWidth="8"
        strokeLinecap="round"
      />

      {/* Two soft nodes — client & freelancer */}
      <circle cx="218" cy="62" r="14" fill="#ffffff" fillOpacity="0.85" />
      <circle cx="218" cy="62" r="14" fill="none" stroke="#3d4d7a" strokeOpacity="0.2" strokeWidth="1" />
      <circle cx="42" cy="82" r="12" fill="#ffffff" fillOpacity="0.8" />
      <circle cx="42" cy="82" r="12" fill="none" stroke="#5b6fa3" strokeOpacity="0.25" strokeWidth="1" />

      {/* Center dot — platform link */}
      <circle cx="128" cy="72" r="5" fill="#2f3b65" fillOpacity="0.14" />

      {/* Light wave at bottom */}
      <path
        d="M-12 118 C64 100, 132 132, 210 114 S 334 96, 402 112 L402 168 L-12 168 Z"
        fill="#2f3b65"
        fillOpacity="0.04"
      />
      <path
        d="M0 142 C76 128, 148 152, 232 138 S 348 124, 390 136 L390 168 L0 168 Z"
        fill="#f5f7fc"
        fillOpacity="0.95"
      />
    </svg>
  );
}
