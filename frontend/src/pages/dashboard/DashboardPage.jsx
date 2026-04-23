import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { DASHBOARD_TITLE } from "../../constants/authRoutes";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import PoolOrderCardCompact from "../../components/orders/PoolOrderCardCompact";
import AssignedOrderCardCompact from "../../components/orders/AssignedOrderCardCompact";
import { getMyEligibilityRequest, getMySubscriptionRequest, listMyAssignedOrdersRequest, listPoolOrdersRequest, takePoolOrderRequest } from "../../services/api";
import { AssignedOrderListSkeleton, PoolOrderListSkeleton, SubscriptionCardSkeleton } from "../../components/ui/Skeleton";

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

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function subscriptionStatusLabel(status) {
  if (status === "active") return "نشط";
  if (status === "assigned_not_started") return "تم الإسناد (لم يبدأ بعد)";
  if (status === "expired") return "منتهي";
  if (status === "inactive") return "غير نشط";
  if (status === "cancelled") return "ملغي";
  return status || "—";
}

function daysRemaining(expiryDate) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;
  const now = Date.now();
  const diffMs = exp.getTime() - now;
  const d = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return Number.isFinite(d) ? d : null;
}

function formatTimeRemainingAr(expiryDate, nowMs) {
  if (!expiryDate) return null;
  const exp = new Date(expiryDate);
  if (!Number.isFinite(exp.getTime())) return null;

  const diffMs = exp.getTime() - nowMs;
  if (diffMs < 0) return "الاشتراك منتهي.";

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const nf = new Intl.NumberFormat("en-US");
  const parts = [];
  if (days > 0) parts.push(`${nf.format(days)} يوم`);
  if (hours > 0 || days > 0) parts.push(`${nf.format(hours)} ساعة`);
  parts.push(`${nf.format(minutes)} دقيقة`);
  return `متبقي ${parts.join(" و ")}.`;
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

  const { push } = useToast();
  const [subscription, setSubscription] = useState(null);
  const [subBusy, setSubBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const role = user?.primaryRole || user?.role;
      if (role !== "freelancer") return;
      setSubBusy(true);
      try {
        const res = await getMySubscriptionRequest();
        if (!cancelled) setSubscription(res?.data?.subscription || null);
      } catch (e) {
        if (!cancelled) {
          setSubscription(null);
          push({ type: "error", title: "تعذر تحميل الاشتراك", message: e?.response?.data?.message || e?.message });
        }
      } finally {
        if (!cancelled) setSubBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, push]);

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
        <Section title="تفاصيل الاشتراك">
          {subBusy ? (
            <SubscriptionCardSkeleton />
          ) : subscription ? (
            <div className="card" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>الباقة</div>
                  <div style={{ fontWeight: 900 }}>
                    {subscription?.plan?.title || subscription?.plan?.name || `#${subscription?.planId || "—"}`}
                  </div>
                </div>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>الحالة</div>
                  <div style={{ fontWeight: 900 }}>{subscriptionStatusLabel(subscription?.status)}</div>
                </div>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>تاريخ البداية</div>
                  <div style={{ fontWeight: 800 }}>
                    {subscription?.status === "assigned_not_started" ? "—" : formatJoDateTime(subscription?.actualStartDate)}
                  </div>
                </div>
                <div>
                  <div className="help" style={{ marginBottom: 4 }}>تاريخ الانتهاء</div>
                  <div style={{ fontWeight: 800 }}>
                    {subscription?.status === "assigned_not_started" ? "—" : formatJoDateTime(subscription?.expiryDate)}
                  </div>
                </div>
              </div>
              {subscription?.status === "assigned_not_started" ? (
                <div className="help" style={{ margin: 0 }}>
                  سيبدأ الاشتراك عند استلام أو إسناد أول طلب فعلي
                </div>
              ) : subscription?.expiryDate ? (
                <div className="help" style={{ margin: 0 }}>
                  {(() => {
                    const label = formatTimeRemainingAr(subscription.expiryDate, nowMs);
                    if (label) return label;
                    const d = daysRemaining(subscription.expiryDate);
                    if (d === null) return null;
                    if (d < 0) return "الاشتراك منتهي.";
                    return `متبقي ${new Intl.NumberFormat("en-US").format(d)} يوم.`;
                  })()}
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="لا يوجد اشتراك حالياً"
              subtitle="عند إسناد باقة لك، ستظهر تفاصيلها هنا."
              actionLabel="عرض الباقات"
              actionTo="/plans"
            />
          )}
        </Section>

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

function FreelancerMyOrders() {
  const { user, loading } = useAuth();
  const { push } = useToast();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || loading || !isFreelancer) return;
      setBusy(true);
      try {
        const res = await listMyAssignedOrdersRequest({ limit: 50, offset: 0 });
        if (!cancelled) setOrders(res?.data?.orders || []);
      } catch (e) {
        if (!cancelled) push({ type: "error", title: "تعذر تحميل طلباتي", message: e?.response?.data?.message || e?.message });
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, loading, isFreelancer, push]);

  return (
    <div className="dash">
      <header className="dash-hero dash-hero--compact">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة مستقل</p>
          <h1 className="dash-hero__title">طلباتي</h1>
          <p className="dash-hero__subtitle">قائمة الطلبات المسندة لك أو التي قمت بقبولها.</p>
        </div>
      </header>

      <div className="dash-grid">
        <Section title="طلباتي">
          {busy ? (
            <AssignedOrderListSkeleton count={4} />
          ) : orders.length === 0 ? (
            <EmptyState
              title="لا توجد طلبات حالياً"
              subtitle="ستظهر طلباتك هنا بمجرد إسنادها لك أو قبولك لها."
              actionLabel="استعرض الطلبات المتاحة"
              actionTo="/dashboard/freelancer/orders"
            />
          ) : (
            <div className="oh-assigned-list" style={{ marginTop: 0 }}>
              {orders.map((order) => (
                <AssignedOrderCardCompact
                  key={order.id}
                  order={order}
                  onOpenDetails={() =>
                    navigate(`/dashboard/freelancer/my-orders/${order.id}`)
                  }
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function FreelancerPoolOrders() {
  const { user, loading } = useAuth();
  const { push } = useToast();
  const { pathname } = useLocation();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [takingId, setTakingId] = useState(null);
  const [eligibility, setEligibility] = useState(null);

  const canTake = useMemo(() => {
    if (!isFreelancer) return false;
    return Boolean(eligibility?.eligible);
  }, [isFreelancer, eligibility]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const res = await listPoolOrdersRequest({ limit: 50, offset: 0 });
        if (!cancelled) setOrders(res?.data?.orders || []);
      } catch (e) {
        if (!cancelled) push({ type: "error", title: "تعذر تحميل الطلبات", message: e?.response?.data?.message || e?.message });
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [push]);

  useEffect(() => {
    let cancelled = false;
    async function loadEligibility() {
      if (!user || loading || !isFreelancer) return;
      try {
        const res = await getMyEligibilityRequest();
        if (!cancelled) setEligibility(res?.data || null);
      } catch {
        if (!cancelled) setEligibility(null);
      }
    }
    loadEligibility();
    return () => {
      cancelled = true;
    };
  }, [user, loading, isFreelancer]);

  const take = async (orderId) => {
    setTakingId(orderId);
    try {
      await takePoolOrderRequest(orderId);
      push({ type: "success", title: "تم استلام الطلب", message: "تم إسناد الطلب لك بنجاح." });
      const res = await listPoolOrdersRequest({ limit: 50, offset: 0 });
      setOrders(res?.data?.orders || []);
    } catch (e) {
      push({ type: "error", title: "تعذر استلام الطلب", message: e?.response?.data?.message || e?.message });
    } finally {
      setTakingId(null);
    }
  };

  return (
    <div className="dash">
      <header className="dash-hero dash-hero--compact">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة مستقل</p>
          <h1 className="dash-hero__title">الطلبات</h1>
          <p className="dash-hero__subtitle">استعرض الطلبات المتاحة من الحوض واستلم ما يناسبك.</p>
        </div>
      </header>

      <div className="dash-grid">
        <Section title="الطلبات المتاحة">
          {isFreelancer ? (
            <p className="help" style={{ marginTop: 0 }}>
              {eligibility?.eligible
                ? null
                : "حسابك غير مؤهل حالياً لاستلام طلبات من الحوض (تحقق من الاشتراك)."}
            </p>
          ) : (
            <p className="help" style={{ marginTop: 0 }}>هذه الصفحة متاحة للمستقل فقط.</p>
          )}

          <div className="oh-pool-grid" style={{ marginTop: 12 }}>
            {busy ? (
              <PoolOrderListSkeleton count={5} />
            ) : orders.length === 0 ? (
              <EmptyState
                title="لا توجد طلبات متاحة"
                subtitle="عند توفر طلبات جديدة ستظهر هنا مع إمكانية العرض والقبول."
              />
            ) : (
              orders.map((order) => (
                <PoolOrderCardCompact
                  key={order.id}
                  order={order}
                  onOpenDetails={() =>
                    navigate(`/dashboard/freelancer/orders/${order.id}`, {
                      state: { from: { pathname: "/dashboard/freelancer/orders" } },
                    })
                  }
                  canTake={Boolean(user) && isFreelancer && canTake}
                  taking={takingId === order.id}
                  onTake={() => take(order.id)}
                  disabledReason={!canTake ? "غير مؤهل (اشتراك غير نشط)" : ""}
                />
              ))
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

const DashboardPage = () => {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const title = DASHBOARD_TITLE[pathname] || "لوحة التحكم";
  const role = user?.primaryRole || user?.role;
  const roleLabel = role ? ROLE_LABEL_AR[role] || role : "";

  const isFreelancerRoute = pathname.startsWith("/dashboard/freelancer");
  if (role === "freelancer" && isFreelancerRoute) {
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
          <FreelancerMyOrders />
        </section>
      );
    }
    if (pathname === "/dashboard/freelancer/orders") {
      return (
        <section className="container page-content dash-shell">
          <FreelancerPoolOrders />
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
