import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import LazyRouteOutlet from "../components/layout/LazyRouteOutlet";
import { useAuth } from "../context/useAuth";
import { useClientCreateOrderModal } from "../context/ClientCreateOrderModalContext";
import { getAccountSettingsPath, getNotificationsPath } from "../constants/authRoutes";
import { SUPER_ADMIN_NAV_MAIN, superAdminBreadcrumb } from "../constants/superAdminNav";
import NotificationsBell from "../components/notifications/NotificationsBell";
import { useTranslation } from "../i18n/LanguageProvider";
import { resolveNavLabel } from "../lib/i18n/resolveNavLabel";

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

const SUPER_ADMIN_SIDEBAR_COLLAPSED_KEY = "superAdminSidebarCollapsed";

function readSidebarCollapsedPreference() {
  try {
    return localStorage.getItem(SUPER_ADMIN_SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export default function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const { t, dir, locale } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openModal: openClientCreateOrderModal } = useClientCreateOrderModal();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readSidebarCollapsedPreference());
  const userMenuRef = useRef(null);

  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SUPER_ADMIN_SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setSidebarOpen(false);
      setUserMenuOpen(false);
    });
  }, [pathname]);

  const displayName = useMemo(
    () => fullNameAr(user) || user?.email || t("dashboard.roles.superAdmin"),
    [user, t],
  );
  const initial = (user?.firstName || user?.email || "S").trim().slice(0, 1).toUpperCase();
  const crumb = useMemo(() => superAdminBreadcrumb(pathname, t), [pathname, t]);
  const role = user?.primaryRole || user?.role;
  const notificationsPath = getNotificationsPath(role);
  const accountSettingsPath = getAccountSettingsPath(role);

  const shellClassName = `oh-sa-shell${sidebarCollapsed ? " oh-sa-shell--sidebar-collapsed" : ""}`;
  const navClassName = `oh-sa-nav${sidebarCollapsed ? " oh-sa-nav--collapsed" : ""}`;
  const sidebarWrapClassName = ["oh-sa-sidebar-wrap", sidebarOpen ? "oh-sa-sidebar-wrap--open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClassName} dir={dir} lang={locale}>
      <div
        className={`oh-sa-backdrop${sidebarOpen ? " oh-sa-backdrop--open" : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />
      <div className="oh-sa-shell__grid">
        <div className={sidebarWrapClassName}>
          <button
            type="button"
            className="oh-sa-sidebar__collapse oh-sa-icon-button-3d"
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? t("dashboard.nav.common.expandSidebar") : t("dashboard.nav.common.collapseSidebar")}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="oh-sa-sidebar__collapse-icon" size={22} strokeWidth={1.75} aria-hidden />
            ) : (
              <PanelLeftClose className="oh-sa-sidebar__collapse-icon" size={22} strokeWidth={1.75} aria-hidden />
            )}
          </button>

          <aside className={navClassName} aria-label={t("dashboard.nav.superAdmin.sidebarAria")}>
            <div className="oh-sa-brand oh-sa-brand--full-logo">
              <img
                src="/hero/fullLogp.png"
                alt={t("common.brand")}
                className="oh-sa-brand__logo"
                width={200}
                height={56}
                decoding="async"
              />
              <div className="oh-sa-brand__sub">{t("dashboard.nav.superAdmin.panelTitle")}</div>
            </div>

            <div className="oh-sa-nav__scroll">
              <ul className="oh-sa-nav__list">
                {SUPER_ADMIN_NAV_MAIN.map((item) => (
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
                      <span className="oh-sa-navlink__label">{resolveNavLabel(item, t)}</span>
                    </NavLink>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="oh-sa-navlink oh-sa-navlink--button"
                    onClick={() => {
                      setSidebarOpen(false);
                      openClientCreateOrderModal();
                    }}
                  >
                    <span className="oh-sa-navlink__icon" aria-hidden>
                      +
                    </span>
                    <span className="oh-sa-navlink__label">{t("dashboard.nav.superAdmin.createRequest")}</span>
                  </button>
                </li>
              </ul>

              <ul className="oh-sa-nav__list oh-sa-nav__list--muted">
                <li>
                  <NavLink to="/" className="oh-sa-navlink" onClick={() => setSidebarOpen(false)}>
                    <span className="oh-sa-navlink__icon" aria-hidden>
                      ↗
                    </span>
                    <span className="oh-sa-navlink__label">{t("dashboard.nav.common.backToWebsite")}</span>
                  </NavLink>
                </li>
              </ul>
            </div>
          </aside>
        </div>

        <div className="oh-sa-workspace">
        <header className="oh-sa-topbar">
          <div className="oh-sa-topbar__start">
            <button
              type="button"
              className="oh-sa-topbar__menu oh-sa-icon-button-3d"
              aria-label={t("dashboard.nav.common.openMenu")}
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
              <button type="button" className="oh-sa-avatar" aria-expanded={userMenuOpen} aria-haspopup="true" onClick={() => setUserMenuOpen((v) => !v)}>
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="oh-sa-avatar-img" />
                ) : (
                  initial
                )}
              </button>
              {userMenuOpen ? (
                <div className="oh-sa-user-menu" role="menu">
                  <div style={{ padding: "6px 10px 10px", fontSize: "0.82rem", color: "#5b6684", fontWeight: 800 }}>{displayName}</div>
                  <NavLink to={accountSettingsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    {t("dashboard.nav.common.accountSettings")}
                  </NavLink>
                  <NavLink to={notificationsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    {t("dashboard.nav.common.notifications")}
                  </NavLink>
                  <NavLink to="/" role="menuitem" onClick={() => setUserMenuOpen(false)}>
                    {t("dashboard.nav.common.backToWebsite")}
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
                    {t("dashboard.nav.common.logout")}
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
