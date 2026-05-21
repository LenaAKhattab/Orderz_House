import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { PanelRightClose, PanelRightOpen } from "lucide-react";

import { useAuth } from "../context/useAuth";

import {

  getAccountSettingsPath,

  getNotificationsPath,

  getProfilePagePath,

  ROLE,

} from "../constants/authRoutes";

import { FREELANCER_NAV_FOOTER, FREELANCER_NAV_MAIN } from "../constants/freelancerNav";

import {

  CLIENT_NAV_FOOTER,

  CLIENT_NAV_MAIN,

  clientPageTitle,

} from "../constants/clientNav";

import FreelancerNavIcon from "../components/layout/FreelancerNavIcon";

import NotificationsBell from "../components/notifications/NotificationsBell";

import useUnreadNotificationsCount from "../hooks/useUnreadNotificationsCount";

import "../styles/freelancerDashboardShell.css";

import "../styles/dashboardHub.css";



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



function freelancerPageTitle(pathname) {

  const item = FREELANCER_NAV_MAIN.find((n) =>

    n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`),

  );

  if (item) return item.label;

  if (pathname.includes("/settings")) return "الإعدادات";

  if (pathname.includes("/financial-claims")) return "المحفظة";

  if (pathname.includes("/orders/")) return "تفاصيل الطلب";

  if (pathname.includes("/my-orders/")) return "طلباتي";

  if (pathname.includes("/courses/")) return "الدورة";

  return "لوحة المستقل";

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

        roleLabel: "عميل",

        sidebarAria: "قائمة لوحة العميل",

        sidebarCollapsedKey: "clientSidebarCollapsed",

        pageTitle: clientPageTitle,

      };

    }

    return {

      navMain: FREELANCER_NAV_MAIN,

      navFooter: FREELANCER_NAV_FOOTER,

      homePath: "/dashboard/freelancer",

      roleLabel: "مستقل",

      sidebarAria: "قائمة لوحة المستقل",

      sidebarCollapsedKey: "freelancerSidebarCollapsed",

      pageTitle: freelancerPageTitle,

    };

  }, [isClient]);



  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>

    readSidebarCollapsedPreference(shellConfig.sidebarCollapsedKey),

  );

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userMenuRef = useRef(null);

  const { count: unreadCount } = useUnreadNotificationsCount(Boolean(user));



  useEffect(() => {

    setSidebarCollapsed(readSidebarCollapsedPreference(shellConfig.sidebarCollapsedKey));

  }, [shellConfig.sidebarCollapsedKey]);



  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));



  useEffect(() => {

    setSidebarOpen(false);

    setUserMenuOpen(false);

  }, [pathname]);



  useEffect(() => {

    document.body.style.overflow = sidebarOpen ? "hidden" : "";

    return () => {

      document.body.style.overflow = "";

    };

  }, [sidebarOpen]);



  const displayName = useMemo(

    () => fullNameAr(user) || user?.email || (isClient ? "عميل" : "مستقل"),

    [user, isClient],

  );

  const initial = (user?.firstName || user?.email || (isClient ? "C" : "F")).trim().slice(0, 1).toUpperCase();

  const title = useMemo(() => shellConfig.pageTitle(pathname), [pathname, shellConfig]);

  const notificationsPath = getNotificationsPath(role);

  const profilePath = getProfilePagePath(role);

  const settingsPath = getAccountSettingsPath(role);



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

    <div className={shellClassName} dir="rtl" lang="ar">

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

            aria-label={sidebarCollapsed ? "فتح القائمة الجانبية" : "طي القائمة الجانبية"}

            aria-expanded={!sidebarCollapsed}

          >

            {sidebarCollapsed ? (

              <PanelRightOpen className="fdl-sidebar__collapse-icon" size={22} strokeWidth={1.75} aria-hidden />

            ) : (

              <PanelRightClose className="fdl-sidebar__collapse-icon" size={22} strokeWidth={1.75} aria-hidden />

            )}

          </button>



          <aside className={sidebarClassName} aria-label={shellConfig.sidebarAria}>

            <div className="fdl-sidebar__brand">

              <NavLink to={shellConfig.homePath} onClick={() => setSidebarOpen(false)}>

                <img src="/hero/fullLogp.png" alt="أوردرز هاوس" className="fdl-sidebar__logo" decoding="async" />

              </NavLink>

            </div>



            <ul className="fdl-sidebar__nav">

              {shellConfig.navMain.map((item) => {

                const active = isActive(item);

                const badge = navBadge(item.badgeKey);

                return (

                  <li key={`${item.to}-${item.label}`}>

                    <NavLink

                      to={item.to}

                      end={Boolean(item.end)}

                      className={`fdl-navlink${active ? " fdl-navlink--active" : ""}`}

                      title={item.label}

                      onClick={() => setSidebarOpen(false)}

                    >

                      <FreelancerNavIcon name={item.icon} active={active} />

                      <span className="fdl-navlink__label">{item.label}</span>

                      {badge ? <span className="fdl-nav-badge">{badge}</span> : null}

                    </NavLink>

                  </li>

                );

              })}

            </ul>



            <ul className="fdl-sidebar__nav fdl-sidebar__nav--foot">

              {shellConfig.navFooter.map((item) => (

                <li key={item.to}>

                  <NavLink

                    to={item.to}

                    className={({ isActive: active }) => `fdl-navlink${active ? " fdl-navlink--active" : ""}`}

                    title={item.label}

                    onClick={() => setSidebarOpen(false)}

                  >

                    {({ isActive: active }) => (

                      <>

                        <FreelancerNavIcon name={item.icon} active={active} />

                        <span className="fdl-navlink__label">{item.label}</span>

                      </>

                    )}

                  </NavLink>

                </li>

              ))}

            </ul>

          </aside>

        </div>



        <div className="fdl-workspace">

          <header className="fdl-topbar fdl-topbar-3d fdl-surface-3d">

            <div className="fdl-topbar__start">

              <button

                type="button"

                className="fdl-topbar__menu fdl-icon-button-3d"

                aria-label="فتح القائمة"

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

                    <span className="fdl-topbar__role">{shellConfig.roleLabel}</span>

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

                        الملف الشخصي

                      </NavLink>

                    ) : null}

                    <NavLink to={settingsPath} role="menuitem" onClick={() => setUserMenuOpen(false)}>

                      الإعدادات

                    </NavLink>

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



          <main className="fdl-outlet">

            <Outlet />

          </main>

        </div>

      </div>

    </div>

  );

}


