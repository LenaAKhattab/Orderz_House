import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NavLink, useLocation, useNavigate } from "react-router-dom";
import LazyRouteOutlet from "../components/layout/LazyRouteOutlet";

import { PanelRightClose, PanelRightOpen, X } from "lucide-react";

import { useAuth } from "../context/useAuth";

import {

  getAccountSettingsPath,

  getNotificationsPath,

  getProfilePagePath,

  ROLE,

} from "../constants/authRoutes";

import { FREELANCER_NAV_FOOTER, FREELANCER_NAV_MAIN, freelancerPageTitle } from "../constants/freelancerNav";

import {

  CLIENT_NAV_FOOTER,

  CLIENT_NAV_MAIN,

  clientPageTitle,

} from "../constants/clientNav";

import FreelancerNavIcon from "../components/layout/FreelancerNavIcon";

import NotificationsBell from "../components/notifications/NotificationsBell";

import useUnreadNotificationsCount from "../hooks/useUnreadNotificationsCount";
import {
  ensureFreelancerCoursesFocus,
  getFreelancerCoursesFocusCached,
  subscribeFreelancerCoursesFocus,
} from "../utils/freelancerCoursesFocusCache";

import { useTranslation } from "../i18n/LanguageProvider";
import { resolveNavLabel } from "../lib/i18n/resolveNavLabel";

import "../styles/freelancerDashboardShell.css";

import "../styles/dashboardHub.css";

const FREELANCER_COURSES_PATH = "/dashboard/freelancer/courses";

/** Settings route remains available; hidden from profile menu for now. */
const SHOW_PROFILE_MENU_SETTINGS = false;

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



function readSidebarCollapsedPreference(storageKey) {

  try {

    return localStorage.getItem(storageKey) === "true";

  } catch {

    return false;

  }

}



export default function FreelancerDashboardLayout() {

  const { user, logout } = useAuth();

  const { t, dir, locale } = useTranslation();

  const { pathname } = useLocation();

  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const role = user?.primaryRole || user?.role;

  const isClient = role === ROLE.CLIENT;



  const shellConfig = useMemo(() => {

    if (isClient) {

      return {

        navMain: CLIENT_NAV_MAIN,

        navFooter: CLIENT_NAV_FOOTER,

        homePath: "/dashboard/client",

        roleLabelKey: "dashboard.roles.client",

        sidebarAriaKey: "dashboard.nav.client.sidebarAria",

        sidebarCollapsedKey: "clientSidebarCollapsed",

      };

    }

    return {

      navMain: FREELANCER_NAV_MAIN,

      navFooter: FREELANCER_NAV_FOOTER,

      homePath: "/dashboard/freelancer",

      roleLabelKey: "dashboard.roles.freelancer",

      sidebarAriaKey: "dashboard.nav.freelancer.sidebarAria",

      sidebarCollapsedKey: "freelancerSidebarCollapsed",

    };

  }, [isClient]);



  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>

    readSidebarCollapsedPreference(shellConfig.sidebarCollapsedKey),

  );

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userMenuRef = useRef(null);

  const { count: unreadCount } = useUnreadNotificationsCount(Boolean(user));
  const [coursesNavBadgeKey, setCoursesNavBadgeKey] = useState(
    () => getFreelancerCoursesFocusCached()?.sidebarBadgeKey || null,
  );

  useEffect(() => {
    if (isClient) return undefined;
    const sync = (focus) => setCoursesNavBadgeKey(focus?.sidebarBadgeKey || null);
    const unsub = subscribeFreelancerCoursesFocus(sync);
    sync(getFreelancerCoursesFocusCached());

    let cancelled = false;
    const loadFocus = () => {
      if (cancelled) return;
      void ensureFreelancerCoursesFocus().then(sync);
    };

    let idleId = null;
    let timerId = null;
    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(loadFocus, { timeout: 4000 });
    } else if (typeof window !== "undefined") {
      timerId = window.setTimeout(loadFocus, 1500);
    }

    return () => {
      cancelled = true;
      unsub();
      if (idleId != null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timerId != null) window.clearTimeout(timerId);
    };
  }, [isClient]);

  const coursesNavBadge = coursesNavBadgeKey ? t(coursesNavBadgeKey) : null;

  useEffect(() => {
    queueMicrotask(() => {
      setSidebarCollapsed(readSidebarCollapsedPreference(shellConfig.sidebarCollapsedKey));
    });
  }, [shellConfig.sidebarCollapsedKey]);



  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));



  useEffect(() => {
    queueMicrotask(() => {
      setSidebarOpen(false);
      setUserMenuOpen(false);
    });
  }, [pathname]);



  useEffect(() => {

    document.body.style.overflow = sidebarOpen ? "hidden" : "";

    return () => {

      document.body.style.overflow = "";

    };

  }, [sidebarOpen]);



  const displayName = useMemo(

    () => fullNameAr(user) || user?.email || t(isClient ? "dashboard.roles.client" : "dashboard.roles.freelancer"),

    [user, isClient, t],

  );

  const initial = (user?.firstName || user?.email || (isClient ? "C" : "F")).trim().slice(0, 1).toUpperCase();

  const title = useMemo(() => {
    if (isClient) return clientPageTitle(pathname, t);
    return freelancerPageTitle(pathname, t);
  }, [pathname, isClient, t]);

  const notificationsPath = getNotificationsPath(role);

  const profilePath = getProfilePagePath(role);

  const settingsPath = SHOW_PROFILE_MENU_SETTINGS ? getAccountSettingsPath(role) : null;



  const navBadge = (key) => {

    if (key === "notifications" && unreadCount > 0) {

      return unreadCount > 99 ? "99+" : String(unreadCount);

    }

    return null;

  };



  const isActive = (item) => {

    if (item.matchPrefix) {

      return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);

    }

    if (item.end) return pathname === item.to;

    return pathname === item.to || pathname.startsWith(`${item.to}/`);

  };



  const toggleSidebarCollapsed = useCallback(() => {

    setSidebarCollapsed((prev) => {

      const next = !prev;

      try {

        localStorage.setItem(shellConfig.sidebarCollapsedKey, String(next));

      } catch {

        /* ignore storage errors */

      }

      return next;

    });

  }, [shellConfig.sidebarCollapsedKey]);



  const shellClassName = `fdl-shell${sidebarCollapsed ? " fdl-shell--sidebar-collapsed" : ""}${

    isClient ? " fdl-shell--client" : ""

  }`;

  const sidebarClassName = [

    "fdl-sidebar",

    "fdl-sidebar-3d",

    "fdl-surface-3d",

    sidebarCollapsed ? "fdl-sidebar--collapsed" : "",

  ]

    .filter(Boolean)

    .join(" ");



  const sidebarWrapClassName = ["fdl-sidebar-wrap", sidebarOpen ? "fdl-sidebar-wrap--open" : ""]

    .filter(Boolean)

    .join(" ");



  return (

    <div className={shellClassName} dir={dir} lang={locale}>

      <div

        className={`fdl-backdrop${sidebarOpen ? " fdl-backdrop--open" : ""}`}

        aria-hidden={!sidebarOpen}

        onClick={() => setSidebarOpen(false)}

      />



      <div className="fdl-shell__grid">

        <div className={sidebarWrapClassName}>

          <button

            type="button"

            className="fdl-sidebar__collapse fdl-icon-button-3d"

            onClick={toggleSidebarCollapsed}

            aria-label={sidebarCollapsed ? t("dashboard.nav.common.expandSidebar") : t("dashboard.nav.common.collapseSidebar")}

            aria-expanded={!sidebarCollapsed}

          >

            {sidebarCollapsed ? (

              <PanelRightOpen className="fdl-sidebar__collapse-icon" size={22} strokeWidth={1.75} aria-hidden />

            ) : (

              <PanelRightClose className="fdl-sidebar__collapse-icon" size={22} strokeWidth={1.75} aria-hidden />

            )}

          </button>



          <aside className={sidebarClassName} aria-label={t(shellConfig.sidebarAriaKey)}>

            <button
              type="button"
              className="fdl-sidebar__close fdl-icon-button-3d"
              aria-label={t("dashboard.nav.common.closeMenu")}
              onClick={() => setSidebarOpen(false)}
            >
              <X className="fdl-sidebar__close-icon" size={20} strokeWidth={2} aria-hidden />
            </button>

            <div className="fdl-sidebar__brand">

              <NavLink to={shellConfig.homePath} onClick={() => setSidebarOpen(false)}>

                <img src="/hero/fullLogp.png" alt={t("common.brand")} className="fdl-sidebar__logo" decoding="async" />

              </NavLink>

            </div>



            <ul className="fdl-sidebar__nav">

              {shellConfig.navMain.map((item) => {

                const active = isActive(item);

                const badge = navBadge(item.badgeKey);

                const label = resolveNavLabel(item, t);

                return (

                  <li key={`${item.to}-${item.labelKey || item.to}`}>

                    <NavLink

                      to={item.to}

                      end={Boolean(item.end)}

                      className={`fdl-navlink${active ? " fdl-navlink--active" : ""}`}

                      title={label}

                      onClick={() => setSidebarOpen(false)}

                    >

                      <FreelancerNavIcon name={item.icon} active={active} />

                      <span className="fdl-navlink__label">{label}</span>

                      {!isClient && item.to === FREELANCER_COURSES_PATH && coursesNavBadge ? (
                        <span className="fdl-nav-badge fdl-nav-badge--courses">{coursesNavBadge}</span>
                      ) : badge ? (
                        <span className="fdl-nav-badge">{badge}</span>
                      ) : null}

                    </NavLink>

                  </li>

                );

              })}

            </ul>



            <ul className="fdl-sidebar__nav fdl-sidebar__nav--foot">

              {shellConfig.navFooter.map((item) => {

                const label = resolveNavLabel(item, t);

                return (

                <li key={item.to}>

                  <NavLink

                    to={item.to}

                    className={({ isActive: active }) => `fdl-navlink${active ? " fdl-navlink--active" : ""}`}

                    title={label}

                    onClick={() => setSidebarOpen(false)}

                  >

                    {({ isActive: active }) => (

                      <>

                        <FreelancerNavIcon name={item.icon} active={active} />

                        <span className="fdl-navlink__label">{label}</span>

                      </>

                    )}

                  </NavLink>

                </li>

                );

              })}

            </ul>

          </aside>

        </div>



        <div className="fdl-workspace">

          <header className="fdl-topbar fdl-topbar-3d fdl-surface-3d">

            <div className="fdl-topbar__start">

              <button

                type="button"

                className="fdl-topbar__menu fdl-icon-button-3d"

                aria-label={t("dashboard.nav.common.openMenu")}

                aria-expanded={sidebarOpen}

                onClick={() => setSidebarOpen((v) => !v)}

              >

                ☰

              </button>

              <h1 className="fdl-topbar__title">{title}</h1>

            </div>



            <div className="fdl-topbar__actions">

              <div className="fdl-topbar__icon-slot">

                <NotificationsBell notificationsPagePath={notificationsPath} variant="superadmin" />

              </div>

              <div className="fdl-topbar__user" ref={userMenuRef}>

                <button

                  type="button"

                  className="fdl-topbar__user-btn"

                  aria-expanded={userMenuOpen}

                  aria-haspopup="menu"

                  onClick={() => setUserMenuOpen((v) => !v)}

                >

                  <span className="fdl-topbar__avatar-wrap">

                    <span className="fdl-topbar__avatar">

                      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initial}

                    </span>

                    <span className="fdl-topbar__status-dot" aria-hidden />

                  </span>

                  <span className="fdl-topbar__identity">

                    <span className="fdl-topbar__name">{displayName}</span>

                    <span className="fdl-topbar__role">{t(shellConfig.roleLabelKey)}</span>

                  </span>

                  <span className="fdl-topbar__chevron" aria-hidden>

                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">

                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />

                    </svg>

                  </span>

                </button>

                {userMenuOpen ? (

                  <div className="fdl-topbar__menu-dropdown" role="menu">

                    {profilePath ? (

                      <NavLink to={profilePath} role="menuitem" onClick={() => setUserMenuOpen(false)}>

                        {t("dashboard.nav.common.profile")}

                      </NavLink>

                    ) : null}

                    {settingsPath ? (
                      <NavLink to={settingsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>
                        {t("dashboard.nav.common.settings")}
                      </NavLink>
                    ) : null}

                    <NavLink to={notificationsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>

                      {t("dashboard.nav.common.notifications")}

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



          <main className="fdl-outlet">

            <LazyRouteOutlet />

          </main>

        </div>

      </div>

    </div>

  );

}


