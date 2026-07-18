import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import LazyRouteOutlet from "../components/layout/LazyRouteOutlet";
import AdminNavIcon from "../components/dashboard/AdminNavIcon";
import { useAuth } from "../context/useAuth";
import { useTranslation } from "../i18n/LanguageProvider";

import "../styles/dashboardHub.css";
import "../styles/adminDashboardShell.css";
import "../styles/adminDashboardHub.css";

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

export default function FinancialUserLayout() {
  const { user, logout } = useAuth();
  const { t, dir, locale } = useTranslation();
  const { pathname } = useLocation();
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

  const displayName = useMemo(
    () => user?.fullName || [user?.firstName, user?.familyName].filter(Boolean).join(" ").trim() || user?.email || t("dashboard.financialUser.panelTitle"),
    [user, t],
  );
  const initial = (displayName || "F").trim().slice(0, 1).toUpperCase();
  const sidebarWrapClassName = ["oh-sa-sidebar-wrap", sidebarOpen ? "oh-sa-sidebar-wrap--open" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="oh-sa-shell" dir={dir} lang={locale}>
      <div
        className={`oh-sa-backdrop${sidebarOpen ? " oh-sa-backdrop--open" : ""}`}
        aria-hidden={!sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />
      <div className="oh-sa-shell__grid">
        <div className={sidebarWrapClassName}>
          <aside className="oh-sa-nav" aria-label={t("dashboard.financialUser.sidebarAria")}>
            <div className="oh-sa-brand oh-sa-brand--full-logo">
              <img
                src="/hero/fullLogp.png"
                alt={t("common.brand")}
                className="oh-sa-brand__logo"
                width={200}
                height={56}
                decoding="async"
              />
              <div className="oh-sa-brand__sub">{t("dashboard.financialUser.panelTitle")}</div>
            </div>
            <div className="oh-sa-nav__scroll">
              <ul className="oh-sa-nav__list">
                <li>
                  <NavLink
                    to="/dashboard/my-bonuses"
                    className={({ isActive }) => `oh-sa-navlink${isActive ? " oh-sa-navlink--active" : ""}`.trim()}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <span className="oh-sa-navlink__icon" aria-hidden>
                      <AdminNavIcon name="bonuses" />
                    </span>
                    <span className="oh-sa-navlink__label">{t("dashboard.financialUser.myBonuses")}</span>
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
                <span>{t("dashboard.financialUser.myBonuses")}</span>
              </div>
            </div>
            <div className="oh-sa-topbar__actions">
              <div className="oh-sa-user" ref={userMenuRef}>
                <button
                  type="button"
                  className="oh-sa-avatar"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  {initial}
                </button>
                {userMenuOpen ? (
                  <div className="oh-sa-user-menu" role="menu">
                    <div style={{ padding: "6px 10px 10px", fontSize: "0.82rem", color: "#5b6684", fontWeight: 800 }}>
                      {displayName}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                    >
                      {t("dashboard.nav.common.logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <main className="oh-sa-outlet">
            <LazyRouteOutlet />
          </main>
        </div>
      </div>
    </div>
  );
}
