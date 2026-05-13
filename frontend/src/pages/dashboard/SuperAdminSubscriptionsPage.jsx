import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import {
  activateSubscriptionCompanyRequest,
  assignPlanToFreelancerRequest,
  adminSearchFreelancersRequest,
  getFreelancerCurrentSubscriptionAdminRequest,
  listAdminPlansRequest,
  listSubscriptionsRequest,
  updateSubscriptionRequest,
} from "../../services/api";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../components/dashboard/DashboardToolbar";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import "./superAdminSubscriptionsPage.css";

/** Shared control styling — matches Step 2 dash tokens + RTL-safe `text-start`. */
const controlClass =
  "w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[color:var(--primary,#2f3b65)]/20 disabled:opacity-60";

const subscriptionCardClass =
  "flex min-h-0 min-w-0 flex-col rounded-[length:var(--dash-surface-radius,18px)] border border-[color:var(--dash-card-border)] bg-white p-5 shadow-[var(--dash-card-shadow)] transition-[box-shadow,border-color] duration-200 hover:border-slate-300/90 hover:shadow-[0_14px_38px_-14px_rgba(15,23,42,0.12)]";

function errorMessage(err) {
  const apiMsg = err?.response?.data?.message;
  return apiMsg || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function formatJoDateTime(iso) {
  if (!iso) return "—";
  try {
    // Jordan local time (Asia/Amman) with Arabic text and English digits
    return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
      timeZone: "Asia/Amman",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

function formatSubscriptionStatus(status) {
  const s = String(status || "").trim();
  if (s === "assigned_not_started") return "تم الإسناد (لم يبدأ بعد)";
  if (s === "active") return "نشط";
  if (s === "expired") return "منتهي";
  if (s === "inactive") return "غير نشط";
  if (s === "cancelled") return "ملغي";
  return s || "—";
}

function formatFreelancerDisplay(sub) {
  const f = sub?.freelancer;
  if (!f) return `مستقل · ${sub.freelancerUserId}`;
  const name = [f.firstName, f.fatherName, f.familyName].filter(Boolean).join(" ").trim();
  if (name) return f.accountId ? `${name} · ${f.accountId}` : name;
  if (f.email) return `${f.email}`;
  return `مستقل · ${sub.freelancerUserId}`;
}

function planDisplayName(sub, planTitleById) {
  return sub?.plan?.title || planTitleById[String(sub?.planId || "")] || "—";
}

function subscriptionStatusBadge(sub) {
  const st = String(sub?.status || "");
  if (st === "active") return { text: "نشط", variant: "active" };
  if (st === "expired") return { text: "منتهي", variant: "expired" };
  if (st === "assigned_not_started") return { text: "لم يبدأ بعد", variant: "inactive" };
  if (st === "inactive") return { text: "غير نشط", variant: "inactive" };
  if (st === "cancelled") return { text: "ملغي", variant: "cancelled" };
  return { text: formatSubscriptionStatus(sub?.status), variant: "inactive" };
}

/** Maps legacy badge variant to `StatusBadge` tone */
function subscriptionStatusTone(variant) {
  if (variant === "active") return "active";
  if (variant === "cancelled") return "danger";
  if (variant === "expired") return "warning";
  return "inactive";
}

function paymentStatusPill(paymentStatus) {
  const p = String(paymentStatus || "").trim().toLowerCase();
  if (p === "pending") return { label: "قيد الانتظار", mod: "pending" };
  if (p === "not_required") return { label: "لا يتطلب دفعًا", mod: "" };
  if (p === "paid") return { label: "مدفوع", mod: "paid" };
  if (p === "failed" || p === "unpaid") return { label: "غير مكتمل", mod: "" };
  return { label: paymentStatus || "—", mod: "" };
}

function paymentStatusTone(mod) {
  if (mod === "pending") return "pending";
  if (mod === "paid") return "success";
  return "neutral";
}

const SuperAdminSubscriptionsPage = () => {
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    freelancerUserIds: [],
    planId: "",
  });

  const [freelancerQuery, setFreelancerQuery] = useState("");
  const [freelancerBusy, setFreelancerBusy] = useState(false);
  const [freelancerMatches, setFreelancerMatches] = useState([]);
  const [freelancerOpen, setFreelancerOpen] = useState(false);
  const [selectedFreelancersById, setSelectedFreelancersById] = useState({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmItems, setConfirmItems] = useState([]);
  const [confirmPlanTitle, setConfirmPlanTitle] = useState("");
  const [confirmContinue, setConfirmContinue] = useState(null);

  const [listSearch, setListSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPlanId, setFilterPlanId] = useState("");

  const planTitleById = useMemo(() => {
    const map = {};
    for (const p of plans || []) map[String(p.id)] = p.title || String(p.id);
    return map;
  }, [plans]);

  useEffect(() => {
    let cancelled = false;
    const q = freelancerQuery.trim();
    async function run() {
      setFreelancerBusy(true);
      try {
        const res = await adminSearchFreelancersRequest({ q, limit: 20 });
        if (!cancelled) setFreelancerMatches(res?.data?.freelancers || []);
      } catch {
        if (!cancelled) setFreelancerMatches([]);
      } finally {
        if (!cancelled) setFreelancerBusy(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [freelancerQuery]);

  const canAssign = useMemo(() => {
    return (form.freelancerUserIds || []).length > 0 && Number(form.planId) > 0;
  }, [form.freelancerUserIds, form.planId]);

  const filteredSubs = useMemo(() => {
    let list = subs;
    if (filterStatus) list = list.filter((s) => String(s.status) === filterStatus);
    if (filterPlanId) list = list.filter((s) => String(s.planId) === filterPlanId);
    const q = listSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => {
      const f = s.freelancer;
      const blob = [f?.firstName, f?.fatherName, f?.familyName, f?.email, f?.accountId, s.freelancerUserId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [subs, listSearch, filterStatus, filterPlanId]);

  const refresh = async () => {
    setError("");
    setLoading(true);
    try {
      const [plansRes, subsRes] = await Promise.all([listAdminPlansRequest(false), listSubscriptionsRequest({})]);
      setPlans(plansRes?.data?.plans || []);
      setSubs(subsRes?.data?.subscriptions || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const assign = async () => {
    setError("");
    setSubmitting(true);
    try {
      const freelancerIds = (form.freelancerUserIds || []).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
      const planId = Number(form.planId);

      // Preflight: if any selected freelancer already has a current subscription, ask admin to confirm changing plan.
      const existing = [];
      for (const freelancerUserId of freelancerIds) {
        try {
          const res = await getFreelancerCurrentSubscriptionAdminRequest(freelancerUserId);
          const sub = res?.data?.subscription || null;
          if (sub?.id) {
            const uid = String(freelancerUserId);
            const f = selectedFreelancersById[uid] || null;
            existing.push({
              freelancerUserId: uid,
              freelancerLabel: f ? `${f.name || "مستقل"} • ${f.email || ""}`.trim() : `ID: ${uid}`,
              currentPlanId: String(sub.planId || ""),
              currentPlanTitle: planTitleById[String(sub.planId || "")] || String(sub.planId || ""),
            });
          }
        } catch {
          // If this check fails, we still proceed (backend will handle safely).
        }
      }

      if (existing.length) {
        setSubmitting(false);
        setConfirmItems(existing);
        setConfirmPlanTitle(planTitleById[String(planId)] || `planId: ${String(planId)}`);
        const ok = await new Promise((resolve) => {
          setConfirmContinue(() => resolve);
          setConfirmOpen(true);
        });
        if (!ok) return;
      }

      const failures = [];
      for (const freelancerUserId of freelancerIds) {
        try {
          // Reuse existing endpoint (one freelancer at a time).
          // Sequential to keep UX predictable and avoid rate spikes.
          await assignPlanToFreelancerRequest({ freelancerUserId, planId, notes: null });
        } catch (e) {
          failures.push({ freelancerUserId: String(freelancerUserId), message: errorMessage(e) });
        }
      }

      if (failures.length) {
        setError(`تعذر إسناد الباقة لبعض المستخدمين: ${failures.map((f) => `ID ${f.freelancerUserId}`).join("، ")}`);
      } else {
        setForm({ freelancerUserIds: [], planId: "" });
      }
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const markFirstOrder = async (sub, isoDate) => {
    setError("");
    setSubmitting(true);
    try {
      await updateSubscriptionRequest(sub.id, { hasFirstOrder: true, firstOrderDate: isoDate });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (sub, status) => {
    setError("");
    setSubmitting(true);
    try {
      await updateSubscriptionRequest(sub.id, { status });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const companyActivate = async (sub) => {
    setError("");
    setSubmitting(true);
    try {
      await activateSubscriptionCompanyRequest(sub.id);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const closeConfirm = (value) => {
    setConfirmOpen(false);
    const c = confirmContinue;
    setConfirmContinue(null);
    c?.(value);
  };

  const confirmDialogBody = (
    <>
      <p className="m-0 mb-3 text-sm leading-relaxed text-slate-600">
        بعض المستقلين لديهم اشتراك حالي. إذا أكملت، سيتم <strong className="text-slate-900">تغيير باقتهم</strong> إلى:{" "}
        <strong className="text-[color:var(--primary,#2f3b65)]">{confirmPlanTitle}</strong>
      </p>
      <div className="mt-1 grid gap-2.5">
        {confirmItems.map((x) => (
          <div
            key={x.freelancerUserId}
            className="grid gap-1 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3 sm:p-4 dark:border-slate-600/50 dark:bg-slate-900/30"
          >
            <div className="text-sm font-bold text-[color:var(--primary,#2f3b65)]">{x.freelancerLabel}</div>
            <div className="text-xs font-bold text-slate-500">
              الباقة الحالية:{" "}
              <span className="font-bold text-slate-800 dark:text-slate-200">{x.currentPlanTitle || x.currentPlanId || "—"}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  const fieldLabelClass = "text-xs font-bold text-slate-600";

  return (
    <DashboardShell className="oh-sa-subs flex min-h-0 w-full min-w-0 flex-col text-start">
      <ConfirmDialog
        open={confirmOpen}
        title="تأكيد تغيير الباقة"
        body={confirmDialogBody}
        confirmLabel="نعم، غيّر الباقة"
        cancelLabel="إلغاء"
        confirmFirst
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />

      <DashboardPageHeader
        eyebrow="لوحة المدير الأعلى"
        title="اشتراكات المستقلين"
        description="إسناد الباقات ومتابعة حالة الاشتراك (للمدير الأعلى فقط)."
        breadcrumbs={superAdminBreadcrumbs("الاشتراكات")}
      />

      {error ? (
        <DashboardErrorState
          message={error}
          actions={
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              إعادة المحاولة
            </Button>
          }
        />
      ) : null}

      <DashboardSection title="إسناد باقة لمستقل">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={fieldLabelClass}>البحث عن مستقل</span>
            <div className="relative">
              <input
                className={controlClass}
                type="text"
                value={freelancerQuery}
                placeholder="ابحث بالاسم أو البريد أو رقم الحساب…"
                onChange={(e) => {
                  setFreelancerQuery(e.target.value);
                  setFreelancerOpen(true);
                }}
                onFocus={() => setFreelancerOpen(true)}
                onBlur={() => setTimeout(() => setFreelancerOpen(false), 120)}
                disabled={submitting}
              />
              {freelancerOpen ? (
                <div className="absolute end-0 start-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-[color:var(--dash-card-border)] bg-white shadow-[var(--dash-card-shadow)]">
                  <div className="border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-xs font-bold text-slate-500">
                    {freelancerBusy ? "جارٍ البحث…" : "اختر من النتائج"}
                  </div>
                  <div className="max-h-[260px] overflow-y-auto overscroll-contain">
                    {freelancerMatches.length === 0 && !freelancerBusy ? (
                      <div className="px-3 py-3 text-sm font-bold text-slate-500">لا توجد نتائج.</div>
                    ) : null}
                    {freelancerMatches.map((f) => (
                      <button
                        key={String(f.id)}
                        type="button"
                        className="grid w-full cursor-pointer gap-0.5 border-0 bg-transparent px-3 py-2.5 text-start font-inherit transition-colors hover:bg-slate-50"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setForm((v) => ({
                            ...v,
                            freelancerUserIds: Array.from(new Set([...(v.freelancerUserIds || []), String(f.id)])).slice(0, 50),
                          }));
                          setSelectedFreelancersById((p) => ({
                            ...p,
                            [String(f.id)]: {
                              id: String(f.id),
                              name: f.name || "",
                              email: f.email || "",
                              accountId: f.accountId || "",
                            },
                          }));
                          setFreelancerQuery("");
                        }}
                      >
                        <div className="text-sm font-bold text-[color:var(--primary,#2f3b65)]">{f.name || "—"}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          {f.email || ""}
                          {f.accountId ? ` • ${f.accountId}` : ""} • ID: {String(f.id)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {(form.freelancerUserIds || []).length > 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/60 p-4 dark:border-slate-600/60 dark:bg-slate-900/25">
              <div className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">تم اختيار:</div>
              <div className="flex flex-wrap gap-2">
                {(form.freelancerUserIds || []).map((id) => {
                  const f = selectedFreelancersById[String(id)] || null;
                  const label = f
                    ? `${f.name || "مستقل"}${f.accountId ? ` · ${f.accountId}` : ""}${f.email ? ` · ${f.email}` : ""}`.trim()
                    : `ID: ${String(id)}`;
                  return (
                    <span
                      key={String(id)}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--dash-card-border)] bg-[color:var(--dash-icon-chip-bg)] px-3 py-1.5 text-xs font-bold text-[color:var(--primary,#2f3b65)]"
                    >
                      <span className="min-w-0 truncate">{label}</span>
                      <button
                        type="button"
                        className="inline-flex h-6 shrink-0 items-center justify-center rounded-full border border-slate-200/80 bg-white px-2 text-sm font-bold leading-none text-slate-600 transition-colors hover:bg-slate-100"
                        onClick={() =>
                          setForm((v) => ({
                            ...v,
                            freelancerUserIds: (v.freelancerUserIds || []).filter((x) => String(x) !== String(id)),
                          }))
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="help m-0 text-sm text-slate-500">لم يتم اختيار أي مستقل بعد. استخدم البحث أعلاه ثم اضغط على النتيجة.</p>
          )}

          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={fieldLabelClass}>اختيار الباقة</span>
            <select
              className={controlClass}
              value={form.planId}
              onChange={(e) => setForm((v) => ({ ...v, planId: e.target.value }))}
              disabled={submitting}
            >
              <option value="">اختر باقة…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.durationDays} يوم)
                </option>
              ))}
            </select>
          </div>

          <Button type="button" variant="primary" className="self-start" disabled={!canAssign || submitting} onClick={assign}>
            إسناد الباقة
          </Button>
        </div>
      </DashboardSection>

      <DashboardSection title="قائمة الاشتراكات" description="آخر 200 اشتراك. استخدم البحث والتصفية لتضييق النتائج.">
        {loading ? (
          <DashboardLoadingState label="جارٍ تحميل الاشتراكات…">
            <AdminInlineGridSkeleton count={3} />
          </DashboardLoadingState>
        ) : null}

        {!loading && subs.length > 0 ? (
          <DashboardToolbar>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 md:max-w-md">
              <span className={fieldLabelClass}>بحث في القائمة</span>
              <input
                className={controlClass}
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="ابحث باسم المستقل أو رقم الحساب"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:gap-3">
              <select
                className={`${controlClass} min-w-[10.5rem] sm:min-w-[11rem]`}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                aria-label="تصفية حسب الحالة"
              >
                <option value="">كل الحالات</option>
                <option value="active">نشط</option>
                <option value="assigned_not_started">لم يبدأ بعد</option>
                <option value="inactive">غير نشط</option>
                <option value="expired">منتهي</option>
                <option value="cancelled">ملغي</option>
              </select>
              <select
                className={`${controlClass} min-w-[10.5rem] sm:min-w-[11rem]`}
                value={filterPlanId}
                onChange={(e) => setFilterPlanId(e.target.value)}
                aria-label="تصفية حسب الباقة"
              >
                <option value="">كل الباقات</option>
                {plans.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </DashboardToolbar>
        ) : null}

        {!loading && subs.length === 0 ? (
          <DashboardEmptyState title="لا توجد اشتراكات حالياً" description="ستظهر الاشتراكات هنا بعد الإسناد أو عند توفر بيانات من الخادم." />
        ) : null}

        {!loading && subs.length > 0 && filteredSubs.length === 0 ? (
          <DashboardEmptyState
            title="لا توجد نتائج مطابقة"
            description="جرّب تعديل البحث أو إعادة ضبط التصفية لعرض المزيد من الاشتراكات."
          />
        ) : null}

        {!loading && filteredSubs.length > 0 ? (
          <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(288px,1fr))] md:gap-5">
            {filteredSubs.map((s) => {
              const hasFirstOrderRecorded = Boolean(s?.hasFirstOrder || s?.firstOrderDate || s?.actualStartDate);
              const badge = subscriptionStatusBadge(s);
              const pay = paymentStatusPill(s.paymentStatus);
              return (
                <article key={s.id} className={subscriptionCardClass}>
                  <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <span className="text-xs font-bold tracking-wide text-slate-400">اشتراك #{s.id}</span>
                    <StatusBadge tone={subscriptionStatusTone(badge.variant)}>{badge.text}</StatusBadge>
                  </div>

                  <div className="mb-4 flex flex-col gap-2.5">
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
                      <span className="text-xs font-bold text-slate-500">المستقل</span>
                      <span className="min-w-0 break-words font-bold text-slate-900">{formatFreelancerDisplay(s)}</span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-sm">
                      <span className="text-xs font-bold text-slate-500">الباقة</span>
                      <span className="min-w-0 break-words font-bold text-slate-900">{planDisplayName(s, planTitleById)}</span>
                    </div>
                    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-xs font-bold text-slate-500">حالة الدفع</span>
                      <span className="min-w-0">
                        <StatusBadge tone={paymentStatusTone(pay.mod)}>{pay.label}</StatusBadge>
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-2 sm:gap-x-4 dark:border-slate-700/60 dark:bg-slate-900/20">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[0.7rem] font-bold tracking-wide text-slate-400">تاريخ الإسناد</span>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-200">{formatJoDateTime(s.assignedAt)}</span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-[0.7rem] font-bold tracking-wide text-slate-400">تاريخ البداية الفعلية</span>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-200">{formatJoDateTime(s.actualStartDate)}</span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                      <span className="text-[0.7rem] font-bold tracking-wide text-slate-400">تاريخ الانتهاء</span>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums dark:text-slate-200">{formatJoDateTime(s.expiryDate)}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      className="btn btn-secondary inline-flex min-w-0 flex-1 basis-[7.5rem] justify-center"
                      disabled={submitting}
                      onClick={() => setStatus(s, "inactive")}
                    >
                      تعطيل
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary inline-flex min-w-0 flex-1 basis-[7.5rem] justify-center !border-red-200 !text-red-700 hover:!border-red-300 hover:!bg-red-50"
                      disabled={submitting}
                      onClick={() => setStatus(s, "cancelled")}
                    >
                      إلغاء
                    </button>
                    {!hasFirstOrderRecorded ? (
                      <button type="button" className="btn btn-primary inline-flex min-w-0 flex-1 basis-[7.5rem] justify-center" disabled={submitting} onClick={() => markFirstOrder(s, new Date().toISOString())}>
                        تسجيل أول طلب
                      </button>
                    ) : null}
                    {s.paymentStatus === "paid" && s.activationStatus !== "company_approved" ? (
                      <button
                        type="button"
                        className="btn btn-secondary inline-flex min-w-0 flex-1 basis-[7.5rem] justify-center"
                        disabled={submitting}
                        onClick={() => companyActivate(s)}
                      >
                        تفعيل الشركة
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
};

export default SuperAdminSubscriptionsPage;
