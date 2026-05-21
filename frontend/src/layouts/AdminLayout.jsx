import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import LazyRouteOutlet from "../components/layout/LazyRouteOutlet";
import { useAuth } from "../context/useAuth";
import { getAccountSettingsPath, getNotificationsPath } from "../constants/authRoutes";
import { ADMIN_NAV_FOOTER, ADMIN_NAV_MAIN, adminBreadcrumb } from "../constants/adminNav";
import NotificationsBell from "../components/notifications/NotificationsBell";

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const onDown = (e) => {
      const el = ref.current;
      if (!el?.contains(e.target)) handler(e);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [ref, handler]);
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));

  useEffect(() => {
    queueMicrotask(() => setUserMenuOpen(false));
  }, [pathname]);

  const displayName = useMemo(() => fullNameAr(user) || user?.email || "مدير", [user]);
  const initial = (user?.firstName || user?.email || "A").trim().slice(0, 1).toUpperCase();
  const crumb = useMemo(() => adminBreadcrumb(pathname), [pathname]);
  const role = user?.primaryRole || user?.role;
  const notificationsPath = getNotificationsPath(role);
  const accountSettingsPath = getAccountSettingsPath(role);

  return (
    <div className="oh-sa-shell" dir="rtl" lang="ar">
      <aside className="oh-sa-nav" aria-label="قائمة الإدارة">
        <div className="oh-sa-brand oh-sa-brand--full-logo">
          <img
            src="/hero/fullLogp.png"
            alt="أوردرز هاوس"
            className="oh-sa-brand__logo"
            width={200}
            height={56}
            decoding="async"
          />
          <div className="oh-sa-brand__sub">لوحة الإدارة</div>
        </div>

        <ul className="oh-sa-nav__list">
          {ADMIN_NAV_MAIN.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={Boolean(item.end)}
                className={({ isActive }) => {
                  const prefix = item.matchPrefix && pathname.startsWith(item.matchPrefix);
                  const active = isActive || prefix;
                  return `oh-sa-navlink${active ? " oh-sa-navlink--active" : ""}`.trim();
                }}
              >
                <span className="oh-sa-navlink__icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink to="/dashboard/admin/orders/create" className="oh-sa-navlink">
              <span className="oh-sa-navlink__icon" aria-hidden>
                +
              </span>
              إنشاء طلب داخلي
            </NavLink>
          </li>
        </ul>

        <ul className="oh-sa-nav__list oh-sa-nav__list--muted">
          {ADMIN_NAV_FOOTER.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className="oh-sa-navlink" end={item.to === "/dashboard/admin/settings"}>
                <span className="oh-sa-navlink__icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <div className="oh-sa-workspace">
        <header className="oh-sa-topbar">
          <div className="oh-sa-breadcrumb">
            <span>{crumb}</span>
          </div>

          <div className="oh-sa-topbar__actions">
            <NotificationsBell notificationsPagePath={notificationsPath} variant="superadmin" />
            <div className="oh-sa-user" ref={userMenuRef}>
              <button
                type="button"
                className="oh-sa-avatar"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="oh-sa-avatar-img" />
                ) : (
                  initial
                )}
              </button>
              {userMenuOpen ? (
                <div className="oh-sa-user-menu" role="menu">
                  <div style={{ padding: "6px 10px 10px", fontSize: "0.82rem", color: "#5b6684", fontWeight: 800 }}>
                    {displayName}
                  </div>
                  <NavLink to={accountSettingsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    إعدادات الحساب
                  </NavLink>
                  <NavLink to={notificationsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    الإشعارات
                  </NavLink>
                  <NavLink to="/" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    الموقع العام
                  </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                      navigate("/", { replace: true });
                    }}
                  >
                    تسجيل الخروج
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="oh-sa-outlet">
          <LazyRouteOutlet />
        </div>
      </div>
    </div>
  );
}
