import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useClientCreateOrderModal } from "../context/ClientCreateOrderModalContext";
import "./SuperAdminLayout.css";
import "./superAdminOutletCompact.css";

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

function breadcrumbLabel(pathname) {
  const base = ["الرئيسية"];
  if (pathname.includes("/plans")) base.push("الباقات");
  else if (pathname.includes("/subscriptions")) base.push("اشتراكات المستقلين");
  else if (pathname.includes("/orders/create")) base.push("الطلبات الداخلية", "إنشاء طلب");
  else if (pathname.includes("/orders")) base.push("الطلبات الداخلية");
  return base.join(" › ");
}

const NAV_MAIN = [
  { to: "/dashboard/super-admin", label: "نظرة عامة", icon: "⌂", end: true },
  { to: "/dashboard/super-admin/plans", label: "الباقات", icon: "◆" },
  { to: "/dashboard/super-admin/subscriptions", label: "الاشتراكات", icon: "◎" },
  { to: "/dashboard/super-admin/orders", label: "الطلبات", icon: "▣" },
];

export default function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { openModal: openClientCreateOrderModal } = useClientCreateOrderModal();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useOnClickOutside(userMenuRef, () => setUserMenuOpen(false));

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  const displayName = useMemo(() => fullNameAr(user) || user?.email || "مدير", [user]);
  const initial = (user?.firstName || user?.email || "S").trim().slice(0, 1).toUpperCase();
  const crumb = useMemo(() => breadcrumbLabel(pathname), [pathname]);

  return (
    <div className="oh-sa-shell" dir="rtl" lang="ar">
      <aside className="oh-sa-nav" aria-label="قائمة المدير الأعلى">
        <div className="oh-sa-brand">
          <div className="oh-sa-brand__mark" aria-hidden>
            OH
          </div>
          <div className="oh-sa-brand__text">
            <div className="oh-sa-brand__title">أوردرز هاوس</div>
            <div className="oh-sa-brand__sub">لوحة المدير الأعلى</div>
          </div>
        </div>

        <ul className="oh-sa-nav__list">
          {NAV_MAIN.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={Boolean(item.end)}
                className={({ isActive }) => `oh-sa-navlink${isActive ? " oh-sa-navlink--active" : ""}`.trim()}
              >
                <span className="oh-sa-navlink__icon" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <button type="button" className="oh-sa-navlink" style={{ width: "100%", border: "none", cursor: "pointer" }} onClick={() => openClientCreateOrderModal()}>
              <span className="oh-sa-navlink__icon" aria-hidden>
                +
              </span>
              إنشاء طلب
            </button>
          </li>
        </ul>

        <ul className="oh-sa-nav__list oh-sa-nav__list--muted">
          <li>
            <NavLink to="/" className="oh-sa-navlink">
              <span className="oh-sa-navlink__icon" aria-hidden>
                ↗
              </span>
              الموقع العام
            </NavLink>
          </li>
        </ul>

        <div className="oh-sa-storage" aria-hidden>
          <div className="oh-sa-storage__label">سعة المنصة (تجريبي)</div>
          <div className="oh-sa-storage__bar">
            <span />
          </div>
          <div className="oh-sa-storage__hint">مؤشرات تشغيل — للعرض فقط ضمن التصميم الجديد.</div>
        </div>
      </aside>

      <div className="oh-sa-workspace">
        <header className="oh-sa-topbar">
          <div className="oh-sa-tabs" role="tablist" aria-label="أقسام سريعة">
            <NavLink to="/dashboard/super-admin" end className={({ isActive }) => `oh-sa-tab${isActive ? " oh-sa-tab--active" : ""}`.trim()}>
              نظرة عامة
            </NavLink>
            <NavLink to="/dashboard/super-admin/plans" className={({ isActive }) => `oh-sa-tab${isActive ? " oh-sa-tab--active" : ""}`.trim()}>
              الباقات
            </NavLink>
            <NavLink to="/dashboard/super-admin/subscriptions" className={({ isActive }) => `oh-sa-tab${isActive ? " oh-sa-tab--active" : ""}`.trim()}>
              النشاط
            </NavLink>
            <NavLink to="/dashboard/super-admin/orders" className={({ isActive }) => `oh-sa-tab${isActive ? " oh-sa-tab--active" : ""}`.trim()}>
              الطلبات
            </NavLink>
          </div>

          <label className="oh-sa-search">
            <span aria-hidden style={{ opacity: 0.55 }}>
              🔍
            </span>
            <input type="search" placeholder="ابحث في لوحة التحكم…" readOnly aria-readonly="true" />
          </label>

          <div className="oh-sa-topbar__actions">
            <button type="button" className="oh-sa-icon-btn" aria-label="تنبيهات" title="قريباً">
              🔔
            </button>
            <div className="oh-sa-user" ref={userMenuRef}>
              <button type="button" className="oh-sa-avatar" aria-expanded={userMenuOpen} aria-haspopup="true" onClick={() => setUserMenuOpen((v) => !v)}>
                {initial}
              </button>
              {userMenuOpen ? (
                <div className="oh-sa-user-menu" role="menu">
                  <div style={{ padding: "6px 10px 10px", fontSize: "0.82rem", color: "#5b6684", fontWeight: 800 }}>{displayName}</div>
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

          <div className="oh-sa-breadcrumb">
            <span>{crumb}</span>
          </div>
        </header>

        <div className="oh-sa-outlet">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
