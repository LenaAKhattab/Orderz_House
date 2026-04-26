import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { getDashboardPath } from "../../constants/authRoutes";

const publicExploreItems = [
  { label: "من نحن", to: "/about" },
  { label: "الخدمات", to: "/services" },
];

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const onDown = (e) => {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      handler(e);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [ref, handler]);
}

const Navbar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, loading, logout } = useAuth();
  const [exploreOpen, setExploreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const exploreRef = useRef(null);
  const userMenuRef = useRef(null);

  const role = user?.primaryRole || user?.role;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const dashboardPath = user && role ? getDashboardPath(role) : null;
  const isLoggedIn = Boolean(user) && !loading;
  const createOrderPath =
    role === "super_admin"
      ? "/dashboard/super-admin/orders/create"
      : role === "admin"
        ? "/dashboard/admin/orders/create"
        : role === "client"
          ? "/dashboard/client/orders/create"
          : null;

  useOnClickOutside(exploreRef, () => setExploreOpen(false));
  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));

  useEffect(() => {
    const t = window.setTimeout(() => {
      setExploreOpen(false);
      setUserMenuOpen(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const navItems = useMemo(() => {
    const base =
      isLoggedIn && (role === "admin" || role === "super_admin")
        ? []
        : isLoggedIn && isFreelancer
          ? []
          : [{ label: "الباقات", to: "/plans" }];
    if (!isLoggedIn) {
      return [...base, ...publicExploreItems, { label: "الطلبات", to: "/orders" }];
    }
    if (role === "super_admin") {
      return [
        ...base,
        { label: "لوحة التحكم", to: dashboardPath || "/dashboard" },
        { label: "الاشتراكات", to: "/dashboard/super-admin/subscriptions" },
        { label: "الطلبات", to: "/dashboard/super-admin/orders" },
        { label: "إنشاء طلب", to: "/dashboard/super-admin/orders/create" },
      ];
    }
    if (role === "admin") {
      return [
        ...base,
        { label: "لوحة التحكم", to: dashboardPath || "/dashboard" },
        { label: "الطلبات", to: "/dashboard/admin/orders" },
        { label: "إنشاء طلب", to: "/dashboard/admin/orders/create" },
      ];
    }
    if (isFreelancer) {
      return [
        ...base,
        { label: "طلباتي", to: "/dashboard/freelancer/my-orders" },
        { label: "الطلبات", to: "/dashboard/freelancer/orders" },
        { label: "المطالبات المالية", to: "/dashboard/freelancer/financial-claims" },
      ];
    }
    if (role === "client") {
      return [
        ...base,
        { label: "لوحة التحكم", to: dashboardPath || "/dashboard" },
        { label: "إنشاء طلب", to: "/dashboard/client/orders/create" },
      ];
    }
    return [...base, { label: "لوحة التحكم", to: dashboardPath || "/dashboard" }];
  }, [isLoggedIn, role, dashboardPath, isFreelancer]);

  const moreItems = useMemo(() => {
    if (!isLoggedIn) return [];
    return isFreelancer ? [{ label: "الباقات", to: "/plans" }, ...publicExploreItems] : publicExploreItems;
  }, [isLoggedIn, isFreelancer]);

  const userName = fullNameAr(user) || user?.email || "";
  const userInitial = (user?.firstName || user?.email || "U").trim().slice(0, 1).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <header className="navbar navbar--at-top">
      <div className="container navbar-shell">
        <div className="navbar-content">
          <NavLink to="/" className="brand" aria-label="العودة إلى الرئيسية">
            <img src="/logo.png" alt="" className="brand-logo" />
          </NavLink>

          <nav aria-label="التنقل الرئيسي">
            <ul className="nav-list">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "nav-link-active" : ""}`.trim()
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}

              {isLoggedIn ? (
                <li className="nav-item-dropdown" ref={exploreRef}>
                  <button
                    type="button"
                    className={`nav-link nav-link-btn ${exploreOpen ? "nav-link-active" : ""}`.trim()}
                    aria-haspopup="menu"
                    aria-expanded={exploreOpen}
                    onClick={() => setExploreOpen((v) => !v)}
                  >
                    المزيد
                  </button>
                  {exploreOpen ? (
                    <div className="nav-dropdown" role="menu">
                      {moreItems.map((x) => (
                        <NavLink key={x.to} to={x.to} className="nav-dropdown-item" role="menuitem">
                          {x.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </li>
              ) : null}
            </ul>
          </nav>

          <div className="nav-auth-actions">
            {loading ? (
              <span className="nav-auth-placeholder" aria-hidden="true" />
            ) : user ? (
              <>
                {createOrderPath ? (
                  <NavLink to={createOrderPath} className="nav-create-btn" aria-label="إنشاء طلب">
                    <span className="nav-create-btn__icon" aria-hidden="true">
                      +
                    </span>
                    <span className="nav-create-btn__text">إنشاء طلب</span>
                  </NavLink>
                ) : null}
                <div className="nav-user" ref={userMenuRef}>
                  <button
                    type="button"
                    className="nav-user-btn"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    <span className="nav-user-avatar" aria-hidden="true">
                      {userInitial}
                    </span>
                    <span className="nav-user-name" title={userName}>
                      {userName}
                    </span>
                  </button>
                  {userMenuOpen ? (
                    <div className="nav-dropdown nav-dropdown--user" role="menu">
                      <NavLink to={dashboardPath} className="nav-dropdown-item" role="menuitem">
                        لوحة التحكم
                      </NavLink>
                      <button type="button" className="nav-dropdown-item nav-dropdown-item--danger" onClick={handleLogout}>
                        تسجيل الخروج
                      </button>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <NavLink to="/login" className="nav-login-btn">
                تسجيل الدخول
              </NavLink>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
