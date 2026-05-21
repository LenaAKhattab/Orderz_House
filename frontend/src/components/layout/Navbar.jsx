import { useEffect, useMemo, useRef, useState } from "react";
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
import { useHomePageBlocking } from "../../context/HomePageBlockingContext";
import NavbarSkeleton from "../skeletons/NavbarSkeleton";
import "../skeletons/home-skeleton.css";

const publicExploreItems = [
  { label: "من نحن", to: "/about" },
  { label: "الخدمات", to: "/services" },
];

const navLinkBase =
  "inline-flex shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-[0.9rem] font-medium text-[#202020]/90 transition-[color,opacity] duration-200 hover:text-[#2f3b65] hover:opacity-100 sm:px-5 sm:text-[0.95rem] lg:px-6 lg:py-2 lg:text-[0.92rem] xl:px-7 xl:text-[0.98rem]";
const navLinkActive = "font-bold text-[#2f3b65] opacity-100";

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
  const userMenuRef = useRef(null);

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

  useEffect(() => {
    const t = window.setTimeout(() => {
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
        { label: "تجريبي", to: "/dashboard/super-admin/training-orders/settings" },
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

  const userName = fullNameAr(user) || user?.email || "";
  const userInitial = (user?.firstName || user?.email || "U").trim().slice(0, 1).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const linkClass = ({ isActive }) => [navLinkBase, isActive ? navLinkActive : ""].filter(Boolean).join(" ");

  const { homeBlocking } = useHomePageBlocking();
  const showHomeNavSkeleton = pathname === "/" && homeBlocking;

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 bg-transparent py-1.5 transition-[padding,background,box-shadow,border-color] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]"
    >
      <div className="navbar-shell mx-auto grid w-full max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1.5 rounded-full border border-[rgba(47,59,101,0.12)] bg-white/95 px-5 py-2 shadow-[0_10px_40px_rgba(47,59,101,0.09)] backdrop-blur-sm sm:min-h-[60px] sm:gap-x-8 sm:px-7 lg:min-h-[64px] lg:gap-x-12 lg:px-10 lg:py-2.5 xl:gap-x-14 xl:px-12">
        {showHomeNavSkeleton ? (
          <div className="relative z-[2] w-full min-w-0">
            <NavbarSkeleton />
          </div>
        ) : (
          <>
        <NavLink
          to={logoTo}
          className="col-start-1 row-start-1 me-4 flex min-w-0 shrink-0 items-center justify-start no-underline sm:me-6 lg:me-9 xl:me-11"
          aria-label={isLoggedIn ? "العودة إلى لوحة التحكم" : "العودة إلى الصفحة الرئيسية"}
        >
          <img
            src="/logo.png"
            alt=""
            className="block h-10 w-auto object-contain transition-all duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] sm:h-11 lg:h-12"
          />
        </NavLink>

        <nav
          aria-label="التنقل الرئيسي"
          className="col-span-3 row-start-2 min-w-0 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:col-span-1 sm:col-start-2 sm:row-start-1 [&::-webkit-scrollbar]:hidden"
        >
          <ul className="m-0 flex w-max min-w-full list-none flex-nowrap items-center justify-center gap-x-5 px-1 py-0.5 sm:gap-x-6 md:gap-x-8 lg:gap-x-10 xl:gap-x-12">
            {navItems.map((item) => (
              <li key={item.to} className="shrink-0">
                <NavLink to={item.to} className={linkClass} title={item.label}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="col-start-3 row-start-1 flex min-w-0 shrink-0 items-center justify-end gap-4 sm:gap-5 lg:gap-6">
          {loading ? (
            <span className="min-h-11 min-w-[140px]" aria-hidden="true" />
          ) : user ? (
            <>
              {role === "client" || showAdminCreateOrderButton ? (
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
              className="inline-flex min-h-[42px] min-w-fit items-center justify-center rounded-full bg-[#2f3b65] px-6 py-2.5 text-[0.95rem] font-bold text-white no-underline shadow-[0_8px_22px_rgba(47,59,101,0.22)] transition-[background-color,transform,min-height,padding,font-size,box-shadow] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] hover:-translate-y-px hover:bg-[#243153] hover:shadow-[0_12px_28px_rgba(47,59,101,0.28)] sm:min-h-[44px] sm:px-7 sm:text-[1rem]"
            >
              تسجيل الدخول
            </NavLink>
          )}
        </div>
          </>
        )}
      </div>
    </header>
  );
};

export default Navbar;
