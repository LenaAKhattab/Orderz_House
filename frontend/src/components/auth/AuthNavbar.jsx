import { NavLink, Link } from "react-router-dom";
import Button from "../ui/Button";

const navItems = [
  { label: "استكشف", to: "/services" },
  { label: "التصنيفات", to: "/orders" },
];

const AuthNavbar = () => {
  return (
    <header className="auth-navbar-wrap">
      <div className="container">
        <div className="auth-navbar">
          <Link to="/" className="auth-brand" aria-label="العودة إلى الرئيسية">
            <span>أوردرز هاوس</span>
          </Link>

          <nav aria-label="تنقل المصادقة">
            <ul className="auth-nav-list">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className="auth-nav-link">
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="auth-navbar-actions">
            <NavLink to="/login" className="auth-signin-link">
              تسجيل الدخول
            </NavLink>
            <Button className="auth-start-btn">ابدأ الآن</Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AuthNavbar;
