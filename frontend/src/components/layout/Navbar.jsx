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

const publicExploreItems = [
  { label: "من نحن", to: "/about" },
  { label: "الخدمات", to: "/services" },
];

const navLinkBase =
  "rounded-lg px-2.5 py-1.5 text-[0.9rem] font-medium text-[#202020]/90 transition-[color,opacity,font-size,padding] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] hover:text-[#2f3b65] hover:opacity-100";
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
        { label: "الدورات", to: "/dashboard/admin/courses" },
        { label: "تفعيل الاشتراكات", to: "/dashboard/admin/subscriptions" },
        { label: "الطلبات", to: "/dashboard/admin/orders" },
      ];
    }
    if (isFreelancer) {
      return [
        ...base,
        { label: "لوحة التحكم", to: "/dashboard/freelancer" },
        { label: "الطلبات المتاحة", to: "/dashboard/freelancer/orders" },
        { label: "طلباتي", to: "/dashboard/freelancer/my-orders" },
        { label: "المطالبات المالية", to: "/dashboard/freelancer/financial-claims" },
        { label: "الدورات", to: "/dashboard/freelancer/courses" },
      ];
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

  return (
    <header className="sticky top-0 z-50 bg-transparent py-[clamp(6px,1.2vw,12px)] pb-[clamp(6px,1vw,10px)] transition-[padding,background,box-shadow,border-color] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]">
      <div className="navbar-shell mx-auto w-full max-w-[min(1120px,calc(100%-24px))] rounded-full border border-[rgba(47,59,101,0.2)] bg-white px-[clamp(16px,3vw,36px)] py-[clamp(5px,0.9vw,9px)] shadow-[0_8px_24px_rgba(47,59,101,0.08)] transition-all duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]">
        <div className="flex min-h-[clamp(48px,5.5vw,56px)] items-center justify-between gap-[clamp(14px,2.5vw,26px)] p-0 transition-all duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]">
          <NavLink
            to={logoTo}
            className="flex min-w-[120px] items-center justify-center no-underline"
            aria-label={isLoggedIn ? "العودة إلى لوحة التحكم" : "العودة إلى الصفحة الرئيسية"}
          >
            <img src="/logo.png" alt="" className="block h-[clamp(44px,5.2vw,56px)] w-auto object-contain transition-all duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]" />
          </NavLink>

          <nav aria-label="التنقل الرئيسي">
            <ul className="m-0 flex list-none flex-wrap items-center gap-x-[clamp(12px,2vw,28px)] gap-y-2 p-0 transition-[gap] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)]">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink to={item.to} className={linkClass}>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-wrap items-center justify-end gap-2.5">
            {loading ? (
              <span className="min-h-10 min-w-[120px]" aria-hidden="true" />
            ) : user ? (
              <>
                {role === "client" || showAdminCreateOrderButton ? (
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border-[1.5px] border-[rgba(56,82,180,0.35)] bg-white px-4 py-2 font-black text-[#223069] shadow-[0_10px_26px_rgba(56,82,180,0.08)] transition-[transform,box-shadow,border-color,background-color] duration-[180ms] hover:-translate-y-px hover:border-[rgba(56,82,180,0.5)] hover:bg-[rgba(56,82,180,0.02)] hover:shadow-[0_14px_34px_rgba(56,82,180,0.12)] focus:outline-none focus:shadow-[0_0_0_4px_rgba(56,82,180,0.14),0_14px_34px_rgba(56,82,180,0.12)]"
                    aria-label="إنشاء طلب"
                    onClick={() => openClientCreateOrderModal()}
                  >
                    <span
                      className="grid h-[26px] w-[26px] place-items-center rounded-[9px] border border-[rgba(56,82,180,0.22)] bg-[rgba(56,82,180,0.06)] text-lg font-black leading-none text-[#2f3b65]"
                      aria-hidden="true"
                    >
                      +
                    </span>
                    <span className="text-[0.92rem] tracking-wide">إنشاء طلب</span>
                  </button>
                ) : null}
                <NotificationsBell notificationsPagePath={notificationsPath} variant="navbar" />
                <div className="relative" ref={userMenuRef}>
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-[rgba(56,82,180,0.16)] bg-white py-1.5 pe-2.5 ps-2 transition-[background-color,border-color,box-shadow] duration-200 hover:border-[rgba(56,82,180,0.28)] hover:bg-[rgba(56,82,180,0.04)] focus:outline-none focus:shadow-[0_0_0_4px_rgba(56,82,180,0.14)]"
                    aria-haspopup="menu"
                    aria-expanded={userMenuOpen}
                    onClick={() => setUserMenuOpen((v) => !v)}
                  >
                    {user?.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="h-[30px] w-[30px] rounded-full object-cover ring-1 ring-[rgba(56,82,180,0.2)]"
                      />
                    ) : (
                      <span
                        className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#2f3b65] text-[0.9rem] font-extrabold text-white"
                        aria-hidden="true"
                      >
                        {userInitial}
                      </span>
                    )}
                    <span className="max-w-[180px] truncate text-[0.88rem] font-extrabold text-[#243153] sm:max-w-[120px]">
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
                className="inline-flex min-h-[34px] min-w-fit items-center justify-center rounded-full bg-[#2f3b65] px-4 py-2 text-[0.85rem] font-bold text-white no-underline transition-[background-color,transform,min-height,padding,font-size] duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] hover:-translate-y-px hover:bg-[#d87929]"
              >
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
