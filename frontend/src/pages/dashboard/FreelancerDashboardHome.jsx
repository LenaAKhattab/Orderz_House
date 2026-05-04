import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import DashboardHomeAside from "../../components/dashboard/DashboardHomeAside";
import { useToast } from "../../components/ui/toastContext";
import { SubscriptionCardSkeleton } from "../../components/ui/Skeleton";
import {
  freelancerListMyCoursesRequest,
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  listMyAssignedOrdersRequest,
  listMyNotificationsRequest,
  listPoolOrdersRequest,
  listPortalFinancialClaimsRequest,
} from "../../services/api";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";
import { orderStatusLabelAr } from "../../utils/orderFlowUi";

function fullNameAr(user) {
  const parts = [user?.firstName, user?.fatherName, user?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function typeLabelAr(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function categoryLine(order) {
  const c = String(order?.category?.name || "").trim();
  const ss = String(order?.subSubcategory?.name || "").trim();
  if (c && ss) return `${c} / ${ss}`;
  return c || ss || "—";
}

function orderPriceText(order) {
  if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
    return `${formatMoney(order.bidBudgetMin)} – ${formatMoney(order.bidBudgetMax)} JOD`;
  }
  if (order?.projectType === "bidding") return "—";
  return `${formatMoney(order?.budget)} JOD`;
}

function subscriptionStatusLabel(status) {
  if (status === "active") return "نشط";
  if (status === "assigned_not_started") return "تم الإسناد (لم يبدأ بعد)";
  if (status === "expired") return "منتهي";
  if (status === "inactive") return "غير نشط";
  if (status === "cancelled") return "ملغي";
  return status || "—";
}

function subscriptionDisplayStatus(subscription) {
  if (!subscription) return "غير مشترك";
  const payment = String(subscription.paymentStatus || "");
  const activation = String(subscription.activationStatus || "");
  const status = String(subscription.status || "");

  if ((payment === "paid" || payment === "pending") && activation === "company_pending") {
    return "مدفوع - بانتظار تفعيل الشركة";
  }
  if (status === "assigned_not_started" && activation === "company_approved") {
    return "مفعّل - بانتظار أول طلب مقبول";
  }
  if (status === "active") return "نشط";
  if (status === "expired") return "منتهي";
  if (payment === "pending" && activation !== "company_approved") return "الدفع قيد المعالجة";
  if (status === "inactive" || status === "cancelled") return "غير مشترك";
  return subscriptionStatusLabel(status);
}

function hasSubscriptionDurationStarted(subscription) {
  if (!subscription) return false;
  if (!subscription.actualStartDate || !subscription.expiryDate) return false;
  const status = String(subscription.status || "");
  return status === "active" || status === "expired";
}

function subscriptionStateHint(subscription) {
  if (!subscription) return "";
  const payment = String(subscription.paymentStatus || "");
  const activation = String(subscription.activationStatus || "");
  const status = String(subscription.status || "");
  // Pending row while admin already approved — show activation message, not “payment processing”.
  if (payment === "pending" && activation === "company_approved") {
    if (status === "assigned_not_started") {
      return "تم التفعيل، وسيبدأ احتساب المدة عند أول طلب مقبول.";
    }
    return "تم تفعيل الاشتراك من الشركة.";
  }
  if (payment === "pending") return "الدفع قيد المعالجة.";
  if (payment === "failed") return "فشل الدفع. يرجى إعادة الاشتراك.";
  if (payment === "paid" && activation === "company_pending") return "تم استلام الدفع وبانتظار تفعيل الشركة.";
  if (payment === "paid" && activation === "company_approved" && status === "assigned_not_started") {
    return "تم التفعيل، وسيبدأ احتساب المدة عند أول طلب مقبول.";
  }
  return "";
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
  const hasHead = Boolean(title || (actionLabel && actionTo));
  return (
    <section className="dash-section">
      {hasHead ? (
        <div className="dash-section__head">
          {title ? <h2 className="dash-section__title">{title}</h2> : <span />}
          {actionLabel && actionTo ? (
            <NavLink to={actionTo} className="dash-section__link">
              {actionLabel}
            </NavLink>
          ) : null}
        </div>
      ) : null}
      <div className="dash-section__body">{children}</div>
    </section>
  );
}

function notificationPreviewLine(n) {
  const title = String(n?.title || "").trim();
  const body = String(n?.body || n?.message || "").trim();
  return title || body || "إشعار";
}

export default function FreelancerDashboardHome({ user }) {
  const { push } = useToast();
  const name = fullNameAr(user) || user?.email || "مرحباً بك";
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [subBusy, setSubBusy] = useState(true);
  const [eligibility, setEligibility] = useState(null);
  const [assignedOrders, setAssignedOrders] = useState([]);
  const [poolOrders, setPoolOrders] = useState([]);
  const [claims, setClaims] = useState([]);
  const [courses, setCourses] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    setError("");
    setSubBusy(true);
    const results = await Promise.allSettled([
      getMySubscriptionRequest(),
      getMyEligibilityRequest(),
      listMyAssignedOrdersRequest({ page: 1, limit: 100, status: "all", sort: "newest" }),
      listPoolOrdersRequest({ page: 1, limit: 5, sort: "newest" }),
      listPortalFinancialClaimsRequest({}),
      freelancerListMyCoursesRequest(),
      listMyNotificationsRequest({ limit: 6, offset: 0 }),
    ]);

    const [subR, eligR, assignedR, poolR, claimsR, coursesR, notifR] = results;

    if (subR.status === "fulfilled") {
      setSubscription(subR.value?.data?.subscription ?? subR.value?.subscription ?? null);
    } else {
      setSubscription(null);
      push({ type: "error", title: "تعذر تحميل الاشتراك", message: subR.reason?.response?.data?.message || subR.reason?.message });
    }
    setSubBusy(false);

    if (eligR.status === "fulfilled") {
      setEligibility(eligR.value?.data ?? eligR.value ?? null);
    } else {
      setEligibility(null);
    }

    if (assignedR.status === "fulfilled") {
      const o = assignedR.value?.data?.orders ?? [];
      setAssignedOrders(Array.isArray(o) ? o : []);
    } else {
      setAssignedOrders([]);
      push({ type: "error", title: "تعذر تحميل طلباتك", message: assignedR.reason?.response?.data?.message || assignedR.reason?.message });
    }

    if (poolR.status === "fulfilled") {
      const list = poolR.value?.data?.orders ?? poolR.value?.orders ?? [];
      setPoolOrders(Array.isArray(list) ? list : []);
    } else {
      setPoolOrders([]);
    }

    if (claimsR.status === "fulfilled") {
      const list = claimsR.value?.data?.claims ?? claimsR.value?.claims ?? [];
      setClaims(Array.isArray(list) ? list : []);
    } else {
      setClaims([]);
    }

    if (coursesR.status === "fulfilled") {
      const list = coursesR.value?.data?.courses ?? coursesR.value?.courses ?? [];
      setCourses(Array.isArray(list) ? list : []);
    } else {
      setCourses([]);
    }

    if (notifR.status === "fulfilled") {
      const raw = notifR.value?.data?.notifications ?? notifR.value?.notifications;
      setNotifications(Array.isArray(raw) ? raw.slice(0, 3) : []);
    } else {
      setNotifications([]);
    }

    const hardFail = assignedR.status === "rejected";
    if (hardFail) {
      setError(assignedR.reason?.response?.data?.message || assignedR.reason?.message || "تعذر تحميل البيانات.");
    }
  }, [push]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const isFreelancerEligible = Boolean(eligibility?.eligible);
  const ineligibleMessage = useMemo(() => {
    if (!eligibility || eligibility.eligible !== false) return "";
    return getFreelancerOrderEligibilityMessage(eligibility, subscription);
  }, [eligibility, subscription]);

  const claimsSummary = useMemo(() => {
    const pendingClaims = claims.filter((c) => c.status === "pending" || c.status === "requires_in_person_review").length;
    const acceptedClaims = claims.filter((c) => c.status === "accepted").length;
    const paidClaims = claims.filter((c) => c.status === "paid").length;
    return { pendingClaims, acceptedClaims, paidClaims };
  }, [claims]);

  const recentAssigned = useMemo(() => {
    const sorted = [...assignedOrders].sort((a, b) => {
      const ta = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
      const tb = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
      return tb - ta;
    });
    return sorted.slice(0, 5);
  }, [assignedOrders]);

  const completedAssigned = useMemo(
    () => assignedOrders.filter((o) => String(o?.orderStatus) === "completed").length,
    [assignedOrders],
  );

  const profilePct = useMemo(() => {
    if (assignedOrders.length === 0) return 20;
    return Math.round((completedAssigned / assignedOrders.length) * 100);
  }, [assignedOrders.length, completedAssigned]);

  const userInitials = useMemo(() => {
    const n = fullNameAr(user) || user?.email || "?";
    const parts = n.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }, [user]);

  if (loading) {
    return (
      <div className="dash" dir="rtl">
        <header className="dash-hero dash-hero--compact">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">جارٍ التحميل…</h1>
        </header>
        <SubscriptionCardSkeleton />
      </div>
    );
  }

  if (error && assignedOrders.length === 0) {
    return (
      <div className="dash" dir="rtl">
        <header className="dash-hero dash-hero--compact">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">تعذر التحميل</h1>
        </header>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash" dir="rtl">
      <header className="dash-hero dash-hero--elevated">
        <div className="dash-hero__copy">
          <p className="dash-hero__kicker">لوحة المستقل</p>
          <h1 className="dash-hero__title oh-orders-sidebar-title">مرحباً، {name}</h1>
          <p className="dash-hero__subtitle">مركز عملك: اشتراكك، طلباتك، والفرص المتاحة في المعرض.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
            <NavLink to="/dashboard/freelancer/orders" className="btn btn-primary">
              استعراض الطلبات المتاحة
            </NavLink>
            <NavLink to="/dashboard/freelancer/my-orders" className="btn btn-secondary">
              طلباتي الحالية
            </NavLink>
          </div>
        </div>
        <div className="dash-hero__badges" aria-label="حالة سريعة">
          <span className="dash-badge">{subscriptionDisplayStatus(subscription)}</span>
          <span className="dash-badge dash-badge--soft">{isFreelancerEligible ? "مؤهل لاستلام الطلبات" : "غير مؤهل حالياً"}</span>
        </div>
      </header>

      <div className="dash-layout">
        <div className="dash-layout__main">
          <div className="dash-grid">
        <Section title="الاشتراك والأهلية">
          {subBusy ? (
            <SubscriptionCardSkeleton />
          ) : (
            <div className="card" style={{ display: "grid", gap: 10 }}>
              {!isFreelancerEligible ? (
                <div className="help" style={{ margin: 0, color: "var(--text-main)" }}>
                  {ineligibleMessage || "لا يمكنك استلام طلبات من المعرض حالياً."}
                </div>
              ) : (
                <p className="help" style={{ margin: 0 }}>
                  يمكنك التقديم على الطلبات المتاحة وفق شروط المنصة وحالة اشتراكك.
                </p>
              )}
              {subscription ? (
                <>
                  {(() => {
                    const payment = String(subscription.paymentStatus || "");
                    const activation = String(subscription.activationStatus || "");
                    const shouldShowActivationNotice =
                      (payment === "paid" || payment === "pending") && activation === "company_pending";
                    return shouldShowActivationNotice ? (
                      <div className="dash-subscription-info-box">
                        <p className="dash-subscription-info-box__text">
                          أنت مشترك حاليًا، وتم استلام طلب اشتراكك بنجاح.
                          <br />
                          لتفعيل حسابك والبدء باستخدام المنصة، يجب زيارة الشركة وإكمال إجراءات التفعيل.
                          <br />
                          يرجى حجز موعد من خلال الرابط التالي:{" "}
                          <a
                            href="https://appointments.battechno.com/survey"
                            target="_blank"
                            rel="noreferrer"
                            className="dash-subscription-info-box__inline-link"
                          >
                            https://appointments.battechno.com/survey
                          </a>
                        </p>
                        <a
                          href="https://appointments.battechno.com/survey"
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary dash-subscription-info-box__btn"
                        >
                          حجز موعد التفعيل
                        </a>
                      </div>
                    ) : null;
                  })()}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                    <div>
                      <div className="help" style={{ marginBottom: 4 }}>
                        الباقة
                      </div>
                      <div style={{ fontWeight: 900 }}>
                        {subscription?.plan?.title || subscription?.plan?.name || `#${subscription?.planId || "—"}`}
                      </div>
                    </div>
                    <div>
                      <div className="help" style={{ marginBottom: 4 }}>
                        الحالة
                      </div>
                      <div style={{ fontWeight: 900 }}>{subscriptionDisplayStatus(subscription)}</div>
                    </div>
                    <div>
                      <div className="help" style={{ marginBottom: 4 }}>
                        تاريخ البداية
                      </div>
                      <div style={{ fontWeight: 800 }}>
                        {hasSubscriptionDurationStarted(subscription) ? formatJoDateTime(subscription?.actualStartDate) : "لم تبدأ بعد"}
                      </div>
                    </div>
                    <div>
                      <div className="help" style={{ marginBottom: 4 }}>
                        تاريخ الانتهاء
                      </div>
                      <div style={{ fontWeight: 800 }}>
                        {hasSubscriptionDurationStarted(subscription) ? formatJoDateTime(subscription?.expiryDate) : "لم تبدأ بعد"}
                      </div>
                    </div>
                  </div>
                  <div className="help" style={{ margin: 0 }}>
                    مدة الاشتراك لا تبدأ إلا بعد قبولك رسميًا في أول طلب من قبل الإدارة أو العميل.
                  </div>
                  {subscription?.expiryDate && hasSubscriptionDurationStarted(subscription) ? (
                    <div className="help" style={{ margin: 0 }}>
                      {formatTimeRemainingAr(subscription.expiryDate, nowMs) || ""}
                    </div>
                  ) : null}
                  {subscriptionStateHint(subscription) ? <div className="help" style={{ margin: 0 }}>{subscriptionStateHint(subscription)}</div> : null}
                </>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  <p className="help" style={{ margin: 0 }}>لا يوجد اشتراك فعّال مسجّل حالياً.</p>
                  <NavLink to="/plans" className="btn btn-primary" style={{ justifySelf: "start" }}>
                    تجديد / اختيار خطة
                  </NavLink>
                </div>
              )}
            </div>
          )}
        </Section>

        <Section title="فرص مناسبة لك" actionLabel="كل الطلبات المتاحة" actionTo="/dashboard/freelancer/orders">
          {!isFreelancerEligible ? (
            <div className="card" style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0 }}>لا يمكنك استلام طلبات حالياً بسبب الاشتراك أو الأهلية.</p>
              <p className="help" style={{ margin: 0 }}>{ineligibleMessage}</p>
              <NavLink to="/plans" className="btn btn-secondary" style={{ justifySelf: "start" }}>
                الانتقال إلى الباقات
              </NavLink>
            </div>
          ) : poolOrders.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>لا توجد طلبات في المعرض تطابق العرض حالياً.</p>
          ) : (
            <ul className="dash-home-list">
              {poolOrders.map((o) => (
                <li key={o.id} className="dash-home-list__item card">
                  <div className="dash-home-list__row">
                    <div>
                      <div style={{ fontWeight: 800 }}>{o.title || "—"}</div>
                      <div className="help" style={{ marginTop: 4 }}>{categoryLine(o)}</div>
                      <div className="help" style={{ marginTop: 4 }} dir="ltr">
                        {orderPriceText(o)} · {typeLabelAr(o.projectType)}
                      </div>
                    </div>
                    <NavLink to={`/dashboard/freelancer/orders/${o.id}`} className="btn btn-secondary" style={{ alignSelf: "center" }}>
                      عرض الطلب
                    </NavLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="طلباتي الحالية" actionLabel="عرض الكل" actionTo="/dashboard/freelancer/my-orders">
          {recentAssigned.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>لا توجد طلبات مسندة بعد.</p>
          ) : (
            <ul className="dash-home-list">
              {recentAssigned.map((o) => {
                const st = String(o?.orderStatus || "");
                const needsWork = ["assigned", "in_progress", "ready_for_work"].includes(st);
                const needsRev = Boolean(o?.clientRevisionNote) || st === "revision_required";
                return (
                  <li key={o.id} className="dash-home-list__item card">
                    <div className="dash-home-list__row">
                      <div>
                        <div style={{ fontWeight: 800 }}>{o.title || "—"}</div>
                        <div className="help" style={{ marginTop: 4 }}>
                          {orderStatusLabelAr(st)} · {formatJoDateTime(o.updatedAt || o.createdAt)}
                        </div>
                        <div className="help" style={{ marginTop: 4 }}>
                          {needsWork ? "يحتاج متابعة تنفيذ/تسليم" : "—"}
                          {needsRev ? " · تعديل مطلوب" : ""}
                        </div>
                      </div>
                      <NavLink to={`/dashboard/freelancer/my-orders/${o.id}`} className="btn btn-secondary" style={{ alignSelf: "center" }}>
                        متابعة
                      </NavLink>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="الدورات والتأهيل" actionLabel="عرض الدورات" actionTo="/dashboard/freelancer/courses">
          {courses.length === 0 ? (
            <p className="help" style={{ margin: 0 }}>لا توجد دورات مسندة لك حالياً.</p>
          ) : (
            <ul className="dash-home-list">
              {courses.slice(0, 4).map((c) => (
                <li key={c.id} className="dash-home-list__item card">
                  <div className="dash-home-list__row">
                    <div>
                      <div style={{ fontWeight: 800 }}>{c.title || "—"}</div>
                      <div className="help" style={{ marginTop: 4 }}>
                        التقدم: {c?.progress?.completedLessons ?? 0}/{c?.progress?.totalLessons ?? 0} ({c?.progress?.percentage ?? 0}%)
                      </div>
                    </div>
                    <NavLink to={`/dashboard/freelancer/courses/${c.id}`} className="btn btn-secondary" style={{ alignSelf: "center" }}>
                      متابعة
                    </NavLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
          </div>
        </div>

        <div className="dash-layout__aside-column">
          <DashboardHomeAside
            variant="freelancer"
            userInitials={userInitials}
            profilePct={profilePct}
            freelancer={{
              subscriptionLabel: subscriptionDisplayStatus(subscription),
              poolCount: poolOrders.length,
              assignedCount: assignedOrders.length,
              claimsPending: claimsSummary.pendingClaims,
            }}
          />

          <section className="dash-aside-panel" aria-labelledby="dash-aside-claims-title">
            <div className="dash-aside-panel__head">
              <h2 id="dash-aside-claims-title" className="dash-aside-panel__title">
                المطالبات المالية
              </h2>
              <NavLink to="/dashboard/freelancer/financial-claims" className="dash-aside-panel__link">
                عرض المطالبات
              </NavLink>
            </div>
            <div className="dash-aside-panel__body">
              <div className="dash-aside-panel__card">
                <div className="dash-aside-panel__row">
                  <span className="help">قيد المراجعة</span>
                  <strong>{claimsSummary.pendingClaims}</strong>
                </div>
                <div className="dash-aside-panel__row">
                  <span className="help">مقبولة</span>
                  <strong>{claimsSummary.acceptedClaims}</strong>
                </div>
                <div className="dash-aside-panel__row">
                  <span className="help">مدفوعة</span>
                  <strong>{claimsSummary.paidClaims}</strong>
                </div>
              </div>
              {claims.length === 0 ? (
                <p className="help dash-aside-panel__foot">لا توجد مطالبات مسجّلة.</p>
              ) : null}
            </div>
          </section>

          <section className="dash-aside-panel" aria-labelledby="dash-aside-notif-title">
            <div className="dash-aside-panel__head">
              <h2 id="dash-aside-notif-title" className="dash-aside-panel__title">
                إشعارات مهمة
              </h2>
              <NavLink to="/dashboard/freelancer/notifications" className="dash-aside-panel__link">
                كل الإشعارات
              </NavLink>
            </div>
            <div className="dash-aside-panel__body">
              {notifications.length === 0 ? (
                <p className="help" style={{ margin: 0 }}>
                  لا توجد إشعارات حديثة.
                </p>
              ) : (
                <ul className="dash-home-list dash-home-list--aside">
                  {notifications.map((n) => (
                    <li key={n.id} className="dash-home-list__item card">
                      <div style={{ fontWeight: 700 }}>{notificationPreviewLine(n)}</div>
                      <div className="help" style={{ marginTop: 4 }}>
                        {formatJoDateTime(n.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
