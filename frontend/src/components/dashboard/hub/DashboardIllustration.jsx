/** Welcome hero illustration — served from /public/dashboard/banner.png */
const BANNER_SRC = "/dashboard/banner.png";

export default function DashboardIllustration({ className = "" }) {
  return (
    <img
      src={BANNER_SRC}
      alt=""
      className={`fdash-welcome__illustration-img ${className}`.trim()}
      width={260}
      height={165}
      decoding="async"
    />
  );
}
