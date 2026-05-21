/** Status banner illustration — served from /public/dashboard/search.png */
const BANNER_ILLUS_SRC = "/dashboard/search.png";

export default function DashboardBannerIllustration({ className = "" }) {
  return (
    <img
      src={BANNER_ILLUS_SRC}
      alt=""
      className={`fdash-banner__illus-img ${className}`.trim()}
      width={112}
      height={80}
      decoding="async"
    />
  );
}
