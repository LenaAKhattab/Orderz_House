/** Soft plans masthead — primary blue (mobile plans page). */
export default function PlansMobileMastheadArt() {
  return (
    <svg
      className="pm-hero__masthead-art"
      viewBox="0 0 390 148"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="pm-mast-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dce6f5" />
          <stop offset="55%" stopColor="#eef2fa" />
          <stop offset="100%" stopColor="#f5f7fc" />
        </linearGradient>
        <linearGradient id="pm-mast-card" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5b6fa3" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2f3b65" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <rect width="390" height="148" fill="url(#pm-mast-bg)" />
      <ellipse cx="72" cy="68" rx="88" ry="58" fill="#2f3b65" fillOpacity="0.05" />
      <ellipse cx="118" cy="42" rx="44" ry="30" fill="url(#pm-mast-card)" />

      <g transform="translate(58 54)" opacity="0.9">
        <rect x="0" y="0" width="52" height="36" rx="10" fill="#ffffff" fillOpacity="0.88" />
        <rect x="0" y="0" width="52" height="36" rx="10" fill="none" stroke="#3d4d7a" strokeOpacity="0.18" />
        <path d="M10 12h32M10 18h22M10 24h26" stroke="#2f3b65" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="44" cy="8" r="9" fill="#2f3b65" fillOpacity="0.88" />
        <path
          d="M41 8 L43.5 10.5 L48 6"
          fill="none"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <path
        d="M0 118 C68 104, 132 128, 210 112 S 334 96, 390 110 L390 148 L0 148 Z"
        fill="#f5f7fc"
        fillOpacity="0.94"
      />
    </svg>
  );
}
