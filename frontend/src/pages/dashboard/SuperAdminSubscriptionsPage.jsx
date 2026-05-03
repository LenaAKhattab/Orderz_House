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
import "./superAdminSubscriptionsPage.css";

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

function paymentStatusPill(paymentStatus) {
  const p = String(paymentStatus || "").trim().toLowerCase();
  if (p === "pending") return { label: "قيد الانتظار", mod: "pending" };
  if (p === "not_required") return { label: "لا يتطلب دفعًا", mod: "" };
  if (p === "paid") return { label: "مدفوع", mod: "paid" };
  if (p === "failed" || p === "unpaid") return { label: "غير مكتمل", mod: "" };
  return { label: paymentStatus || "—", mod: "" };
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
      const blob = [
        f?.firstName,
        f?.fatherName,
        f?.familyName,
        f?.email,
        f?.accountId,
        s.freelancerUserId,
      ]
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
      const [plansRes, subsRes] = await Promise.all([
        listAdminPlansRequest(false),
        listSubscriptionsRequest({}),
      ]);
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
          // eslint-disable-next-line no-await-in-loop
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
          // eslint-disable-next-line no-await-in-loop
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

  return (
    <section className="container page-content oh-sa-subs">
      {confirmOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999,
            background: "rgba(0,0,0,0.35)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmOpen(false);
              const c = confirmContinue;
              setConfirmContinue(null);
              c?.(false);
            }
          }}
        >
          <div
            className="card"
            style={{
              width: "min(720px, 100%)",
              borderRadius: 18,
              boxShadow: "0 30px 60px rgba(24, 36, 85, 0.18)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 6 }}>تأكيد تغيير الباقة</h2>
            <p style={{ marginBottom: 12, color: "var(--text-muted)" }}>
              بعض المستقلين لديهم اشتراك حالي. إذا أكملت، سيتم **تغيير باقتهم** إلى:{" "}
              <strong>{confirmPlanTitle}</strong>
            </p>

            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {confirmItems.map((x) => (
                <div
                  key={x.freelancerUserId}
                  style={{
                    border: "1px solid rgba(56, 82, 180, 0.14)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(56, 82, 180, 0.03)",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 900, color: "var(--primary)" }}>{x.freelancerLabel}</div>
                  <div style={{ color: "var(--text-muted)", fontWeight: 800, fontSize: "0.92rem" }}>
                    الباقة الحالية: <strong>{x.currentPlanTitle || x.currentPlanId || "—"}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-start", marginTop: 14, flexWrap: "wrap" }}>
              <Button
                type="button"
                className="auth-submit-btn"
                style={{ minHeight: 40, width: "auto", paddingInline: 16 }}
                onClick={() => {
                  setConfirmOpen(false);
                  const c = confirmContinue;
                  setConfirmContinue(null);
                  c?.(true);
                }}
              >
                نعم، غيّر الباقة
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={false}
                onClick={() => {
                  setConfirmOpen(false);
                  const c = confirmContinue;
                  setConfirmContinue(null);
                  c?.(false);
                }}
              >
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="oh-sa-subs__card-shell">
        <h1 className="oh-sa-subs__title">اشتراكات المستقلين</h1>
        <p className="oh-sa-subs__lead">إسناد الباقات ومتابعة حالة الاشتراك (للمدير الأعلى فقط).</p>
        {error ? <p className="auth-form-error oh-sa-subs__error">{error}</p> : null}
      </header>

      <div className="oh-sa-subs__card-shell">
        <h2 className="oh-sa-subs__section-title">إسناد باقة لمستقل</h2>
        <div className="oh-sa-subs__assign-form">
          <div className="oh-sa-subs__field">
            <span>البحث عن مستقل</span>
            <div className="auth-input-wrap auth-input-wrap--noicon oh-sa-subs__dropdown">
              <input
                className="oh-sa-subs__input"
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
                <div className="oh-sa-subs__dropdown-panel">
                  <div className="oh-sa-subs__dropdown-head">{freelancerBusy ? "جارٍ البحث…" : "اختر من النتائج"}</div>
                  <div className="oh-sa-subs__dropdown-list">
                    {freelancerMatches.length === 0 && !freelancerBusy ? (
                      <div style={{ padding: 12, color: "var(--text-muted)", fontWeight: 800 }}>لا توجد نتائج.</div>
                    ) : null}
                    {freelancerMatches.map((f) => (
                      <button
                        key={String(f.id)}
                        type="button"
                        className="oh-sa-subs__dropdown-item"
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
                        <div className="oh-sa-subs__dropdown-name">{f.name || "—"}</div>
                        <div className="oh-sa-subs__dropdown-meta">
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
            <div className="oh-sa-subs__selected-banner">
              <div style={{ fontWeight: 800, marginBottom: 10, color: "#334155" }}>تم اختيار:</div>
              <div className="oh-sa-subs__chips">
                {(form.freelancerUserIds || []).map((id) => {
                  const f = selectedFreelancersById[String(id)] || null;
                  const label = f ? `${f.name || "مستقل"}${f.accountId ? ` · ${f.accountId}` : ""}${f.email ? ` · ${f.email}` : ""}`.trim() : `ID: ${String(id)}`;
                  return (
                    <span key={String(id)} className="oh-sa-subs__chip">
                      {label}
                      <button
                        type="button"
                        className="oh-sa-subs__chip-remove"
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
            <p className="help" style={{ margin: 0 }}>
              لم يتم اختيار أي مستقل بعد. استخدم البحث أعلاه ثم اضغط على النتيجة.
            </p>
          )}

          <div className="oh-sa-subs__field">
            <span>اختيار الباقة</span>
            <select
              className="oh-sa-subs__select"
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

          <Button type="button" className="auth-submit-btn" disabled={!canAssign || submitting} onClick={assign} style={{ alignSelf: "flex-start" }}>
            إسناد الباقة
          </Button>
        </div>
      </div>

      <div className="oh-sa-subs__card-shell">
        <h2 className="oh-sa-subs__section-title">قائمة الاشتراكات</h2>
        <p className="oh-sa-subs__lead" style={{ marginTop: -8, marginBottom: 16 }}>
          آخر 200 اشتراك. استخدم البحث والتصفية لتضييق النتائج.
        </p>

        {loading ? <AdminInlineGridSkeleton count={3} /> : null}

        {!loading && subs.length > 0 ? (
          <div className="oh-sa-subs__toolbar">
            <div className="oh-sa-subs__toolbar-search oh-sa-subs__field" style={{ marginBottom: 0 }}>
              <span>بحث في القائمة</span>
              <input
                className="oh-sa-subs__input"
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="ابحث باسم المستقل أو رقم الحساب"
                autoComplete="off"
              />
            </div>
            <div className="oh-sa-subs__toolbar-filters">
              <select
                className="oh-sa-subs__select"
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
                className="oh-sa-subs__select"
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
          </div>
        ) : null}

        {!loading && subs.length === 0 ? <div className="oh-sa-subs__empty">لا توجد اشتراكات حالياً</div> : null}

        {!loading && subs.length > 0 && filteredSubs.length === 0 ? (
          <div className="oh-sa-subs__empty">لا توجد نتائج مطابقة للبحث أو التصفية</div>
        ) : null}

        {!loading && filteredSubs.length > 0 ? (
          <div className="oh-sa-subs__grid">
            {filteredSubs.map((s) => {
              const hasFirstOrderRecorded = Boolean(s?.hasFirstOrder || s?.firstOrderDate || s?.actualStartDate);
              const badge = subscriptionStatusBadge(s);
              const pay = paymentStatusPill(s.paymentStatus);
              const badgeClass = `oh-sa-subs__badge oh-sa-subs__badge--${badge.variant}`;
              const payClass = `oh-sa-subs__pay-pill${pay.mod ? ` oh-sa-subs__pay-pill--${pay.mod}` : ""}`;
              return (
                <article className="oh-sa-subs__sub-card" key={s.id}>
                  <div className="oh-sa-subs__sub-top">
                    <span className="oh-sa-subs__sub-id">اشتراك #{s.id}</span>
                    <span className={badgeClass}>{badge.text}</span>
                  </div>

                  <div className="oh-sa-subs__main-block">
                    <div className="oh-sa-subs__kv">
                      <span className="oh-sa-subs__kv-label">المستقل</span>
                      <span className="oh-sa-subs__kv-value">{formatFreelancerDisplay(s)}</span>
                    </div>
                    <div className="oh-sa-subs__kv">
                      <span className="oh-sa-subs__kv-label">الباقة</span>
                      <span className="oh-sa-subs__kv-value">{planDisplayName(s, planTitleById)}</span>
                    </div>
                    <div className="oh-sa-subs__kv">
                      <span className="oh-sa-subs__kv-label">حالة الدفع</span>
                      <span className={payClass}>{pay.label}</span>
                    </div>
                  </div>

                  <div className="oh-sa-subs__dates-grid">
                    <div className="oh-sa-subs__date-cell">
                      <span className="oh-sa-subs__date-label">تاريخ الإسناد</span>
                      <span className="oh-sa-subs__date-value">{formatJoDateTime(s.assignedAt)}</span>
                    </div>
                    <div className="oh-sa-subs__date-cell">
                      <span className="oh-sa-subs__date-label">تاريخ البداية الفعلية</span>
                      <span className="oh-sa-subs__date-value">{formatJoDateTime(s.actualStartDate)}</span>
                    </div>
                    <div className="oh-sa-subs__date-cell oh-sa-subs__date-cell--span">
                      <span className="oh-sa-subs__date-label">تاريخ الانتهاء</span>
                      <span className="oh-sa-subs__date-value">{formatJoDateTime(s.expiryDate)}</span>
                    </div>
                  </div>

                  <div className="oh-sa-subs__actions">
                    <button
                      type="button"
                      className="btn oh-sa-subs__btn-outline"
                      disabled={submitting}
                      onClick={() => setStatus(s, "inactive")}
                    >
                      تعطيل
                    </button>
                    <button
                      type="button"
                      className="btn oh-sa-subs__btn-danger"
                      disabled={submitting}
                      onClick={() => setStatus(s, "cancelled")}
                    >
                      إلغاء
                    </button>
                    {!hasFirstOrderRecorded ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={submitting}
                        onClick={() => markFirstOrder(s, new Date().toISOString())}
                      >
                        تسجيل أول طلب
                      </button>
                    ) : null}
                    {s.paymentStatus === "paid" && s.activationStatus !== "company_approved" ? (
                      <button
                        type="button"
                        className="btn oh-sa-subs__btn-outline"
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
      </div>
    </section>
  );
};

export default SuperAdminSubscriptionsPage;

