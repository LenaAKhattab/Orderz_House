import { Link } from "react-router-dom";

export default function DashboardHubQuickActions({ items }) {
  return (
    <div className="fdash-quick" role="navigation" aria-label="إجراءات سريعة">
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="fdash-quick__card">
          <span className="fdash-quick__icon" aria-hidden>
            {item.icon}
          </span>
          <span className="fdash-quick__label">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}
