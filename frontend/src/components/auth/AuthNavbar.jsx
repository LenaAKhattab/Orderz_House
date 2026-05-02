import { NavLink, Link } from "react-router-dom";
import Button from "../ui/Button";
import * as tw from "./authTw";

const navItems = [
  { label: "استكشف", to: "/services" },
  { label: "التصنيفات", to: "/orders" },
];

const AuthNavbar = () => {
  return (
    <header className={tw.authNavbarWrap}>
      <div className="mx-auto w-full max-w-[min(1160px,calc(100%-48px))]">
        <div className={tw.authNavbar}>
          <Link to="/" className={tw.authBrand} aria-label="العودة إلى الرئيسية">
            <span>أوردرز هاوس</span>
          </Link>

          <nav aria-label="تنقل المصادقة">
            <ul className={tw.authNavList}>
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={tw.authNavLink}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className={tw.authNavbarActions}>
            <NavLink to="/login" className={tw.authSigninLink}>
              تسجيل الدخول
            </NavLink>
            <Button className={`btn btn-primary ${tw.authStartBtn}`}>ابدأ الآن</Button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AuthNavbar;
