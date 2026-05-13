export default function AdSponsoredLabel({ className = "" }) {
  return (
    <span className={`oh-ad-sponsored pointer-events-none ${className}`.trim()} aria-hidden="true">
      إعلان
    </span>
  );
}
