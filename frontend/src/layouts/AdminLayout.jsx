import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import LazyRouteOutlet from "../components/layout/LazyRouteOutlet";
import { useAuth } from "../context/useAuth";
import { getNotificationsPath } from "../constants/authRoutes";
import {
  ADMIN_NAV_CREATE_ORDER,
  ADMIN_NAV_HOME,
  ADMIN_NAV_MAIN,
  ADMIN_NAV_NOTIFICATIONS,
  adminBreadcrumb,
  filterAdminNavItems,
} from "../constants/adminNav";
import { userHasPermission } from "../constants/dashboardPermissions";
import NotificationsBell from "../components/notifications/NotificationsBell";

import "../styles/dashboardHub.css";
import "../styles/adminDashboardShell.css";
import "../styles/adminDashboardHub.css";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userMenuRef = useRef(null);

  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  useEffect(() => {
    queueMicrotask(() => {
      setSidebarOpen(false);
      setUserMenuOpen(false);
    });
  }, [pathname]);

  const displayName = useMemo(() => fullNameAr(user) || user?.email || "مدير", [user]);
  const initial = (user?.firstName || user?.email || "A").trim().slice(0, 1).toUpperCase();
  const crumb = useMemo(() => adminBreadcrumb(pathname), [pathname]);
  const role = user?.primaryRole || user?.role;
  const notificationsPath = getNotificationsPath(role);
  const businessNav = useMemo(() => filterAdminNavItems(ADMIN_NAV_MAIN, user, userHasPermission), [user]);
  const showCreateOrder = userHasPermission(user, ADMIN_NAV_CREATE_ORDER.permission);
  const hasBusinessPermissions = businessNav.length > 0 || showCreateOrder;
  const sidebarWrapClassName = ["oh-sa-sidebar-wrap", sidebarOpen ? "oh-sa-sidebar-wrap--open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="oh-sa-shell" dir="rtl" lang="ar">
      <div
        className={`oh-sa-backdrop${sidebarOpen ? " oh-sa-backdrop--open" : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />
      <div className="oh-sa-shell__grid">
        <div className={sidebarWrapClassName}>
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
          <li>
            <NavLink
              to={ADMIN_NAV_HOME.to}
              end={Boolean(ADMIN_NAV_HOME.end)}
              className={({ isActive }) => `oh-sa-navlink${isActive ? " oh-sa-navlink--active" : ""}`.trim()}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="oh-sa-navlink__icon" aria-hidden>
                {ADMIN_NAV_HOME.icon}
              </span>
              {ADMIN_NAV_HOME.label}
            </NavLink>
          </li>
          {businessNav.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={Boolean(item.end)}
                className={({ isActive }) => {
                  const prefix = item.matchPrefix && pathname.startsWith(item.matchPrefix);
                  const active = isActive || prefix;
                  return `oh-sa-navlink${active ? " oh-sa-navlink--active" : ""}`.trim();
                }}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="oh-sa-navlink__icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
          {showCreateOrder ? (
            <li>
              <NavLink
                to={ADMIN_NAV_CREATE_ORDER.to}
                className={({ isActive }) => `oh-sa-navlink${isActive ? " oh-sa-navlink--active" : ""}`.trim()}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="oh-sa-navlink__icon" aria-hidden>
                  {ADMIN_NAV_CREATE_ORDER.icon}
                </span>
                {ADMIN_NAV_CREATE_ORDER.label}
              </NavLink>
            </li>
          ) : null}
        </ul>

        <ul className="oh-sa-nav__list">
          <li>
            <NavLink
              to={ADMIN_NAV_NOTIFICATIONS.to}
              className={({ isActive }) => `oh-sa-navlink${isActive ? " oh-sa-navlink--active" : ""}`.trim()}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="oh-sa-navlink__icon" aria-hidden>
                {ADMIN_NAV_NOTIFICATIONS.icon}
              </span>
              {ADMIN_NAV_NOTIFICATIONS.label}
            </NavLink>
          </li>
        </ul>

        {!hasBusinessPermissions ? (
          <p className="oh-admin-nav-empty" style={{ padding: "12px 16px", fontSize: "0.82rem", color: "#5b6684", lineHeight: 1.6 }}>
            ليس لديك صلاحيات مفعلة حالياً. يرجى التواصل مع المدير الأعلى.
          </p>
        ) : null}

          </aside>
        </div>

        <div className="oh-sa-workspace">
        <header className="oh-sa-topbar">
          <div className="oh-sa-topbar__start">
            <button
              type="button"
              className="oh-sa-topbar__menu oh-sa-icon-button-3d"
              aria-label="فتح القائمة"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              ☰
            </button>
            <div className="oh-sa-breadcrumb">
              <span>{crumb}</span>
            </div>
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
                  <NavLink to={notificationsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    الإشعارات
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
    </div>
  );
}
