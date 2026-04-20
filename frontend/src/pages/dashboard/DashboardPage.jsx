import { NavLink, useLocation } from "react-router-dom";
import { DASHBOARD_TITLE } from "../../constants/authRoutes";
import { useAuth } from "../../context/AuthContext";

const ROLE_LABEL_AR = {
  super_admin: "مدير أعلى",
  admin: "إداري",
  freelancer: "مستقل",
  client: "عميل",
};

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function EmptyState({ title, subtitle, actionLabel, actionTo }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty__icon" aria-hidden="true">
        ◌
      </div>
      <div className="dash-empty__copy">
        <h3 className="dash-empty__title">{title}</h3>
        <p className="dash-empty__subtitle">{subtitle}</p>
      </div>
      {actionLabel && actionTo ? (
        <NavLink to={actionTo} className="btn btn-secondary dash-empty__action">
          {actionLabel}
        </NavLink>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat__top">
        <span className="dash-stat__label">{label}</span>
      </div>
      <div className="dash-stat__value">{value}</div>
      {hint ? <div className="dash-stat__hint">{hint}</div> : null}
    </div>
  );
}

function Section({ title, actionLabel, actionTo, children }) {
  return (
    <section className="dash-section">
      <div className="dash-section__head">
        <h2 className="dash-section__title">{title}</h2>
        {actionLabel && actionTo ? (
          <NavLink to={actionTo} className="dash-section__link">
            {actionLabel}
          </NavLink>
        ) : null}
      </div>
      <div className="dash-section__body">{children}</div>
    </section>
  );
}

function FreelancerHome({ user }) {
  const name = fullNameAr(user) || "مرحباً بك";
  const subtitle = "تابع طلباتك، استعرض الفرص المتاحة، وراقب مطالباتك المالية بسهولة.";

  // Structured mock state (hidden behind empty states for now)
  const myRecentOrders = [];
  const availableOrders = [];
  const claims = [];

  return (
    <div className="dash">
      <header className="dash-hero">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title">مرحباً، {name}</h1>
          <p className="dash-hero__subtitle">{subtitle}</p>
        </div>
        <div className="dash-hero__badges" aria-label="ملخص سريع">
          <span className="dash-badge">حساب نشط</span>
          <span className="dash-badge dash-badge--soft">مستقل</span>
        </div>
      </header>

      <div className="dash-stats" role="list" aria-label="إحصاءات سريعة">
        <div role="listitem">
          <StatCard label="عدد طلباتي" value="0" hint="طلبات مسندة أو قيد التنفيذ" />
        </div>
        <div role="listitem">
          <StatCard label="الطلبات المتاحة" value="0" hint="فرص جديدة يمكنك قبولها" />
        </div>
        <div role="listitem">
          <StatCard label="المطالبات المالية" value="0" hint="قيد المراجعة أو بانتظار الصرف" />
        </div>
        <div role="listitem">
          <StatCard label="المستحقات القادمة" value="—" hint="سيظهر عند توفر بيانات مالية" />
        </div>
      </div>

      <div className="dash-grid">
        <Section title="طلباتي الأخيرة" actionLabel="عرض الكل" actionTo="/dashboard/freelancer/my-orders">
          {myRecentOrders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات بعد"
              subtitle="عند إسناد طلب لك أو قبولك لطلب، ستظهر التفاصيل هنا."
              actionLabel="استعرض الطلبات المتاحة"
              actionTo="/dashboard/freelancer/orders"
            />
          ) : null}
        </Section>

        <Section title="الطلبات المتاحة" actionLabel="استعراض" actionTo="/dashboard/freelancer/orders">
          {availableOrders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات متاحة حالياً"
              subtitle="تابع هذه الصفحة لاحقاً، أو فعّل تنبيهاتك عندما تتوفر."
            />
          ) : null}
        </Section>

        <Section title="المطالبات المالية" actionLabel="عرض التفاصيل" actionTo="/dashboard/freelancer/financial-claims">
          {claims.length === 0 ? (
            <EmptyState
              title="لا توجد مطالبات مالية"
              subtitle="عند إنشاء مطالبة أو تحديث حالتها، ستجد ملخصاً واضحاً هنا."
            />
          ) : null}
        </Section>
      </div>
    </div>
  );
}

function FreelancerSubPage({ title, description, emptyTitle, emptySubtitle, actionLabel, actionTo }) {
  return (
    <div className="dash">
      <header className="dash-hero dash-hero--compact">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title">{title}</h1>
          <p className="dash-hero__subtitle">{description}</p>
        </div>
      </header>
      <div className="dash-grid">
        <Section title={title}>
          <EmptyState title={emptyTitle} subtitle={emptySubtitle} actionLabel={actionLabel} actionTo={actionTo} />
        </Section>
      </div>
    </div>
  );
}

const DashboardPage = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const title = DASHBOARD_TITLE[pathname] || "لوحة التحكم";
  const roleLabel = user?.role ? ROLE_LABEL_AR[user.role] || user.role : "";

  const isFreelancerRoute = pathname.startsWith("/dashboard/freelancer");
  if (user?.role === "freelancer" && isFreelancerRoute) {
    if (pathname === "/dashboard/freelancer") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerHome user={user} />
        </section>
      );
    }
    if (pathname === "/dashboard/freelancer/my-orders") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerSubPage
            title="طلباتي"
            description="قائمة الطلبات المسندة لك أو التي قمت بقبولها."
            emptyTitle="لا توجد طلبات حالياً"
            emptySubtitle="ستظهر طلباتك هنا بمجرد إسنادها لك أو قبولك لها."
            actionLabel="استعرض الطلبات المتاحة"
            actionTo="/dashboard/freelancer/orders"
          />
        </section>
      );
    }
    if (pathname === "/dashboard/freelancer/orders") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerSubPage
            title="الطلبات"
            description="استعرض الطلبات المتاحة واختر ما يناسبك."
            emptyTitle="لا توجد طلبات متاحة"
            emptySubtitle="عند توفر طلبات جديدة ستظهر هنا مع إمكانية العرض والقبول."
          />
        </section>
      );
    }
    if (pathname === "/dashboard/freelancer/financial-claims") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerSubPage
            title="المطالبات المالية"
            description="تابع المطالبات المالية وحالاتها ومجموع المستحقات."
            emptyTitle="لا توجد مطالبات"
            emptySubtitle="عند إنشاء مطالبة أو تحديث حالتها ستظهر هنا."
          />
        </section>
      );
    }
  }

  // Other roles: keep a clean, non-placeholder shell for now (scalable).
  return (
    <section className="container page-content dash-shell">
      <div className="dash">
        <header className="dash-hero dash-hero--compact">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة التحكم</p>
            <h1 className="dash-hero__title">{title}</h1>
            {user ? <p className="dash-hero__subtitle">الدور: {roleLabel}</p> : null}
          </div>
        </header>
        <div className="dash-grid">
          <Section title="قريباً">
            <EmptyState
              title="هذه الصفحة قيد الإعداد"
              subtitle="سيتم إضافة محتوى لوحة التحكم حسب الدور قريباً."
            />
          </Section>
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
