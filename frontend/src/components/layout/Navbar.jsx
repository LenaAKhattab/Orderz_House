import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useClientCreateOrderModal } from "../../context/ClientCreateOrderModalContext";
import {
  getAccountSettingsPath,
  getDashboardPathByRole,
  getNotificationsPath,
  getProfilePagePath,
} from "../../constants/authRoutes";
import NotificationsBell from "../notifications/NotificationsBell";
import { useHomePageBlocking } from "../../hooks/useHomePageBlocking";
import useHowItWorksNav from "../../hooks/useHowItWorksNav";
import NavbarSkeleton from "../skeletons/NavbarSkeleton";
import "../skeletons/home-skeleton.css";
import "../../styles/servicesPage.css";
import "../../styles/howItWorksPage.css";

const publicExploreItems = [
  { label: "من نحن", to: "/about" },
  { label: "الخدمات", to: "/services" },
];

const navLinkBase =
  "inline-flex shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-[0.9rem] font-medium text-[#202020]/90 transition-[color,opacity] duration-200 hover:text-[#2f3b65] hover:opacity-100 sm:px-5 sm:text-[0.95rem] lg:px-6 lg:py-2 lg:text-[0.92rem] xl:px-7 xl:text-[0.98rem]";
const navLinkActive = "public-nav-link--active";

const drawerLinkBase = "public-nav-drawer__link";
const drawerLinkActive = "public-nav-drawer__link--active";
const drawerActionBase = "public-nav-drawer__action";

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
  const { openModal: openClientCreateOrderModal } = useClientCreateOrderModal();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const userMenuRef = useRef(null);
  const howItWorksRef = useRef(null);

  const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);

  const role = user?.primaryRole || user?.role;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isFreelancer = role === "freelancer" || roles.includes("freelancer");
  const isLoggedIn = Boolean(user) && !loading;
  const dashboardPath = user && role ? getDashboardPathByRole(role) : null;
  const notificationsPath = user && role ? getNotificationsPath(role) : "/dashboard";
  const profilePagePath = user && role ? getProfilePagePath(role) : null;
  const accountSettingsPath = user && role ? getAccountSettingsPath(role) : "/dashboard";
  const logoTo = isLoggedIn && dashboardPath ? dashboardPath : "/";
  const showAdminCreateOrderButton = role === "super_admin" || role === "admin";

  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));
  useOnClickOutside(howItWorksRef, () => setHowItWorksOpen(false));

  const { items: howItWorksItems, showNav: showHowItWorksNav } = useHowItWorksNav();

  useEffect(() => {
    const t = window.setTimeout(() => {
      setUserMenuOpen(false);
      setHowItWorksOpen(false);
      setMobileDrawerOpen(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (!mobileDrawerOpen) return undefined;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeMobileDrawer();
    };
    const onResize = () => {
      if (window.matchMedia("(min-width: 1024px)").matches) closeMobileDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [mobileDrawerOpen, closeMobileDrawer]);

  const navItems = useMemo(() => {
    const base =
      isLoggedIn && (role === "admin" || role === "super_admin")
        ? []
        : isLoggedIn && isFreelancer
          ? []
          : isLoggedIn && role === "client"
            ? []
            : [{ label: "الباقات", to: "/plans" }];
    if (!isLoggedIn) {
      return [...base, ...publicExploreItems, { label: "الطلبات", to: "/orders" }];
    }
    if (role === "super_admin") {
      return [
        ...base,
        { label: "لوحة التحكم", to: dashboardPath || "/dashboard" },
        { label: "الدورات", to: "/dashboard/super-admin/courses" },
        { label: "الاشتراكات", to: "/dashboard/super-admin/subscriptions" },
        { label: "المطالبات المالية", to: "/dashboard/super-admin/financial-claims" },
        { label: "الطلبات", to: "/dashboard/super-admin/orders" },
        { label: "تجريبي", to: "/dashboard/super-admin/training-orders" },
      ];
    }
    if (role === "admin") {
      return [
        ...base,
        { label: "لوحة التحكم", to: dashboardPath || "/dashboard" },
        { label: "إدارة الإعلانات", to: "/dashboard/admin/ads" },
        { label: "الدورات", to: "/dashboard/admin/courses" },
        { label: "تفعيل الاشتراكات", to: "/dashboard/admin/subscriptions" },
        { label: "الطلبات", to: "/dashboard/admin/orders" },
      ];
    }
    if (isFreelancer) {
      return [...base];
    }
    if (role === "client") {
      return [
        ...base,
        { label: "لوحة التحكم", to: dashboardPath || "/dashboard/client" },
        { label: "طلباتي", to: "/dashboard/client/my-orders" },
        { label: "المالية", to: "/dashboard/client/financial" },
        { label: "الطلبات", to: "/dashboard/freelancer/orders" },
      ];
    }
    return [...base, { label: "لوحة التحكم", to: dashboardPath || "/dashboard" }];
  }, [isLoggedIn, role, dashboardPath, isFreelancer]);

  const showPublicHowItWorks = showHowItWorksNav && role !== "admin" && role !== "super_admin";

  const desktopNavEntries = useMemo(() => {
    const entries = navItems.map((item) => ({ type: "link", ...item }));
    if (!showPublicHowItWorks) return entries;

    const howEntry = {
      type: "dropdown",
      id: "how-it-works",
      label: "طريقة العمل",
      items: howItWorksItems,
    };
    const ordersIdx = entries.findIndex((e) => e.type === "link" && e.to === "/orders");
    if (ordersIdx >= 0) entries.splice(ordersIdx, 0, howEntry);
    else entries.push(howEntry);
    return entries;
  }, [navItems, showPublicHowItWorks, howItWorksItems]);

  const isHowItWorksActive = howItWorksItems.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  const userName = fullNameAr(user) || user?.email || "";
  const userInitial = (user?.firstName || user?.email || "U").trim().slice(0, 1).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const linkClass = ({ isActive }) => [navLinkBase, isActive ? navLinkActive : ""].filter(Boolean).join(" ");
  const drawerLinkClass = ({ isActive }) => [drawerLinkBase, isActive ? drawerLinkActive : ""].filter(Boolean).join(" ");

  const { homeBlocking } = useHomePageBlocking();
  const showHomeNavSkeleton = pathname === "/" && homeBlocking;

  const showCreateOrderButton = role === "client" || showAdminCreateOrderButton;

  const handleCreateOrder = () => {
    openClientCreateOrderModal();
    closeMobileDrawer();
  };

  const handleDrawerLogout = () => {
    closeMobileDrawer();
    handleLogout();
  };

  return (
    <>
    <header
      dir="rtl"
      className={`public-nav-header${mobileDrawerOpen ? " public-nav-header--drawer-open" : ""}`}
    >
      <div className="public-nav-header__bar mx-auto w-full max-w-7xl px-3 py-1.5 sm:px-4 lg:px-5">
        <div className="navbar-shell public-nav-header__shell grid w-full grid-cols-[1fr_auto] items-center gap-x-3 rounded-full border border-[rgba(47,59,101,0.12)] bg-white/95 px-4 py-2.5 shadow-[0_10px_40px_rgba(47,59,101,0.09)] backdrop-blur-sm lg:min-h-[64px] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-12 lg:px-10 lg:py-2.5 xl:gap-x-14 xl:px-12">
        {showHomeNavSkeleton ? (
          <div className="relative z-[2] col-span-2 w-full min-w-0 lg:col-span-1">
            <NavbarSkeleton />
          </div>
        ) : (
          <>
        <NavLink
          to={logoTo}
          className="public-nav-header__logo-link col-start-1 row-start-1 flex min-w-0 shrink-0 items-center justify-start no-underline lg:me-9 xl:me-11"
          aria-label={isLoggedIn ? "العودة إلى لوحة التحكم" : "العودة إلى الصفحة الرئيسية"}
        >
          <img
            src="/logo.png"
            alt=""
            className="block h-11 w-auto object-contain transition-all duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] lg:h-12"
          />
        </NavLink>

        <nav
          aria-label="التنقل الرئيسي"
          className="col-start-2 row-start-1 hidden min-w-0 lg:block"
        >
          <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-5 px-1 py-0.5 md:gap-x-8 lg:gap-x-10 xl:gap-x-12">
            {desktopNavEntries.map((entry) => {
              if (entry.type === "dropdown") {
                return (
                  <li
                    key={entry.id}
                    className={`public-nav-dropdown shrink-0${howItWorksOpen ? " public-nav-dropdown--open" : ""}`}
                    ref={howItWorksRef}
                    onMouseEnter={() => setHowItWorksOpen(true)}
                    onMouseLeave={() => setHowItWorksOpen(false)}
                  >
                    <button
                      type="button"
                      className={`${navLinkBase} public-nav-dropdown__trigger${isHowItWorksActive ? ` ${navLinkActive}` : ""}`}
                      aria-haspopup="menu"
                      aria-expanded={howItWorksOpen}
                      onClick={() => setHowItWorksOpen((v) => !v)}
                    >
                      {entry.label}
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {howItWorksOpen ? (
                      <div className="public-nav-dropdown__menu" role="menu">
                        {entry.items.map((sub) => (
                          <NavLink
                            key={sub.to}
                            to={sub.to}
                            className={({ isActive }) =>
                              ["public-nav-dropdown__item", isActive ? "public-nav-dropdown__item--active" : ""]
                                .filter(Boolean)
                                .join(" ")
                            }
                            role="menuitem"
                            onClick={() => setHowItWorksOpen(false)}
                          >
                            {sub.label}
                          </NavLink>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              }

              return (
                <li key={entry.to} className="shrink-0">
                  <NavLink to={entry.to} className={linkClass} title={entry.label}>
                    {entry.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="public-nav-header__actions col-start-2 row-start-1 flex min-w-0 shrink-0 items-center justify-end gap-2 lg:col-start-3 lg:gap-6">
          <div className="hidden items-center gap-2 lg:flex lg:gap-6">
          {loading ? (
            <span className="min-h-11 min-w-[140px]" aria-hidden="true" />
          ) : user ? (
            <>
              {showCreateOrderButton ? (
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-3 rounded-full border-[1.5px] border-[rgba(56,82,180,0.35)] bg-white px-5 py-2.5 font-black text-[#223069] shadow-[0_10px_26px_rgba(56,82,180,0.08)] transition-[transform,box-shadow,border-color,background-color] duration-[180ms] hover:-translate-y-px hover:border-[rgba(56,82,180,0.5)] hover:bg-[rgba(56,82,180,0.02)] hover:shadow-[0_14px_34px_rgba(56,82,180,0.12)] focus:outline-none focus:shadow-[0_0_0_4px_rgba(56,82,180,0.14),0_14px_34px_rgba(56,82,180,0.12)] sm:px-6 sm:py-3"
                  aria-label="إنشاء طلب"
                  onClick={() => openClientCreateOrderModal()}
                >
                  <span
                    className="grid h-[30px] w-[30px] place-items-center rounded-[10px] border border-[rgba(56,82,180,0.22)] bg-[rgba(56,82,180,0.06)] text-xl font-black leading-none text-[#2f3b65]"
                    aria-hidden="true"
                  >
                    +
                  </span>
                  <span className="text-[1rem] tracking-wide sm:text-[1.05rem]">إنشاء طلب</span>
                </button>
              ) : null}
              <NotificationsBell notificationsPagePath={notificationsPath} variant="navbar" />
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-3 rounded-full border border-[rgba(56,82,180,0.16)] bg-white py-2 pe-3 ps-2.5 transition-[background-color,border-color,box-shadow] duration-200 hover:border-[rgba(56,82,180,0.28)] hover:bg-[rgba(56,82,180,0.04)] focus:outline-none focus:shadow-[0_0_0_4px_rgba(56,82,180,0.14)] sm:py-2.5 sm:pe-3.5 sm:ps-3"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}
                >
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt=""
                      className="h-[34px] w-[34px] rounded-full object-cover ring-1 ring-[rgba(56,82,180,0.2)] sm:h-[36px] sm:w-[36px]"
                    />
                  ) : (
                    <span
                      className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#2f3b65] text-[0.95rem] font-extrabold text-white sm:h-[36px] sm:w-[36px] sm:text-[1rem]"
                      aria-hidden="true"
                    >
                      {userInitial}
                    </span>
                  )}
                  <span className="hidden max-w-[7.5rem] truncate text-[0.9rem] font-extrabold text-[#243153] xl:inline xl:max-w-[9rem] xl:text-[0.95rem]">
                    {userName}
                  </span>
                </button>
                {userMenuOpen ? (
                  <div
                    className="absolute end-0 top-[calc(100%+10px)] z-[220] grid min-w-[220px] gap-1 rounded-[14px] border border-[rgba(56,82,180,0.14)] bg-white p-2 shadow-[0_18px_40px_rgba(24,36,85,0.14)]"
                    role="menu"
                  >
                    {profilePagePath ? (
                      <NavLink
                        to={profilePagePath}
                        className="block w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2.5 text-right text-[0.9rem] font-semibold text-[#202020] no-underline transition-colors hover:bg-[rgba(56,82,180,0.06)] hover:text-[#2f3b65]"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        الملف الشخصي
                      </NavLink>
                    ) : null}
                    <NavLink
                      to={accountSettingsPath}
                      className="block w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2.5 text-right text-[0.9rem] font-semibold text-[#202020] no-underline transition-colors hover:bg-[rgba(56,82,180,0.06)] hover:text-[#2f3b65]"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      إعدادات الحساب
                    </NavLink>
                    <NavLink
                      to={notificationsPath}
                      className="block w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2.5 text-right text-[0.9rem] font-semibold text-[#202020] no-underline transition-colors hover:bg-[rgba(56,82,180,0.06)] hover:text-[#2f3b65]"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      الإشعارات
                    </NavLink>
                    <button
                      type="button"
                      className="block w-full cursor-pointer rounded-xl border-0 bg-transparent px-3 py-2.5 text-right text-[0.9rem] font-semibold text-[#202020] transition-colors hover:bg-[rgba(180,50,50,0.08)] hover:text-[#8b2222]"
                      onClick={handleLogout}
                    >
                      تسجيل الخروج
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <NavLink
              to="/login"
              className="inline-flex min-h-[44px] min-w-fit items-center justify-center gap-2 rounded-full bg-[#2f3b65] px-7 py-2.5 text-[1rem] font-bold text-white no-underline shadow-[0_8px_22px_rgba(47,59,101,0.22)] transition-[background-color,transform,box-shadow] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] hover:-translate-y-px hover:bg-[#243153] hover:shadow-[0_12px_28px_rgba(47,59,101,0.28)]"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="opacity-95">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              تسجيل الدخول
            </NavLink>
          )}
          </div>
          <button
            type="button"
            className="public-nav-menu-btn lg:hidden"
            aria-label="فتح القائمة"
            aria-expanded={mobileDrawerOpen}
            aria-controls="public-nav-drawer"
            onClick={() => setMobileDrawerOpen((v) => !v)}
          >
            <span className="public-nav-menu-btn__icon" aria-hidden>
              <span className="public-nav-menu-btn__line public-nav-menu-btn__line--top" />
              <span className="public-nav-menu-btn__line public-nav-menu-btn__line--mid" />
              <span className="public-nav-menu-btn__line public-nav-menu-btn__line--bot" />
            </span>
          </button>
        </div>

        </>
        )}
        </div>
      </div>
    </header>

    {typeof document !== "undefined" && !showHomeNavSkeleton
      ? createPortal(
          <div
            className={`public-nav-mobile-layer${mobileDrawerOpen ? " public-nav-mobile-layer--open" : ""}`}
            aria-hidden={!mobileDrawerOpen}
          >
            <div
              className={`public-nav-drawer-backdrop${mobileDrawerOpen ? " public-nav-drawer-backdrop--open" : ""}`}
              onClick={closeMobileDrawer}
            />

            <aside
              id="public-nav-drawer"
              className={`public-nav-drawer${mobileDrawerOpen ? " public-nav-drawer--open" : ""}`}
              dir="rtl"
              lang="ar"
              aria-hidden={!mobileDrawerOpen}
              aria-label="قائمة التنقل"
            >
              <div className="public-nav-drawer__panel">
                <div className="public-nav-drawer__head">
                  <div className="public-nav-drawer__head-top">
                    <button
                      type="button"
                      className="public-nav-drawer__close"
                      aria-label="إغلاق القائمة"
                      onClick={closeMobileDrawer}
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden>
                        <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                    <img src="/logo.png" alt="" className="public-nav-drawer__logo" />
                  </div>
                  <div className="public-nav-drawer__intro">
                    {isLoggedIn ? (
                      <>
                        <span className="public-nav-drawer__eyebrow">أهلاً بك</span>
                        <span className="public-nav-drawer__title">{userName}</span>
                        {user?.email ? <span className="public-nav-drawer__subtitle">{user.email}</span> : null}
                      </>
                    ) : (
                      <>
                        <span className="public-nav-drawer__eyebrow">مرحباً بك</span>
                        <span className="public-nav-drawer__title">استكشف أوردرز هاوس</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="public-nav-drawer__head-divider" aria-hidden="true" />

                <div className="public-nav-drawer__body">
                  <nav className="public-nav-drawer__nav" aria-label="روابط التنقل">
                    <p className="public-nav-drawer__section-label">التنقل</p>
                    <ul className="public-nav-drawer__list">
                      {navItems.map((item) => (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            className={drawerLinkClass}
                            onClick={closeMobileDrawer}
                          >
                            <span className="public-nav-drawer__link-text">{item.label}</span>
                            <span className="public-nav-drawer__link-chevron" aria-hidden>
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                                <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          </NavLink>
                        </li>
                      ))}
                      {showPublicHowItWorks ? (
                        <li>
                          <p className="public-nav-drawer__section-label public-nav-drawer__section-label--nested">
                            طريقة العمل
                          </p>
                          <ul className="public-nav-drawer__sublist">
                            {howItWorksItems.map((sub) => (
                              <li key={sub.to}>
                                <NavLink
                                  to={sub.to}
                                  className={({ isActive }) =>
                                    ["public-nav-drawer__sublink", isActive ? "public-nav-drawer__sublink--active" : ""]
                                      .filter(Boolean)
                                      .join(" ")
                                  }
                                  onClick={closeMobileDrawer}
                                >
                                  {sub.label}
                                </NavLink>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ) : null}
                    </ul>
                  </nav>
                </div>

                <div className="public-nav-drawer__footer">
                  <div className="public-nav-drawer__account-card">
                    <div className="public-nav-drawer__account-head">
                      <span className="public-nav-drawer__account-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                          <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      <div className="public-nav-drawer__account-copy">
                        <p className="public-nav-drawer__account-title">حسابك</p>
                        <p className="public-nav-drawer__account-hint">
                          {user
                            ? "إدارة حسابك وإعداداتك من مكان واحد"
                            : "سجّل الدخول لمتابعة طلباتك وخدماتك"}
                        </p>
                      </div>
                    </div>

                    <div className="public-nav-drawer__actions">
                      {loading ? null : user ? (
                        <>
                          {showCreateOrderButton ? (
                            <button type="button" className={`${drawerActionBase} public-nav-drawer__action--primary`} onClick={handleCreateOrder}>
                              <span className="public-nav-drawer__action-icon" aria-hidden>+</span>
                              إنشاء طلب
                            </button>
                          ) : null}
                          {profilePagePath ? (
                            <NavLink to={profilePagePath} className={drawerActionBase} onClick={closeMobileDrawer}>
                              الملف الشخصي
                            </NavLink>
                          ) : null}
                          <NavLink to={accountSettingsPath} className={drawerActionBase} onClick={closeMobileDrawer}>
                            إعدادات الحساب
                          </NavLink>
                          <NavLink to={notificationsPath} className={drawerActionBase} onClick={closeMobileDrawer}>
                            الإشعارات
                          </NavLink>
                          <button type="button" className={`${drawerActionBase} public-nav-drawer__action--danger`} onClick={handleDrawerLogout}>
                            تسجيل الخروج
                          </button>
                        </>
                      ) : (
                        <NavLink to="/login" className={`${drawerActionBase} public-nav-drawer__action--primary public-nav-drawer__action--login`} onClick={closeMobileDrawer}>
                          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden className="public-nav-drawer__action-leading-icon">
                            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                            <path d="M5 20c0-4 3.5-6 7-6s7 2 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                          تسجيل الدخول
                        </NavLink>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>,
          document.body,
        )
      : null}
    </>
  );
};

export default Navbar;
