export default function DashboardHubPage({ children, className = "" }) {
  return (
    <div className={`fdash-page ${className}`.trim()} dir="rtl">
      <div className="fdash-page__inner">{children}</div>
    </div>
  );
}
