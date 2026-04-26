import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import {
  assignPlanToFreelancerRequest,
  adminSearchFreelancersRequest,
  getFreelancerCurrentSubscriptionAdminRequest,
  listAdminPlansRequest,
  listSubscriptionsRequest,
  updateSubscriptionRequest,
} from "../../services/api";
import { AdminInlineGridSkeleton } from "../../components/ui/Skeleton";

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
  const [confirmPlanId, setConfirmPlanId] = useState("");
  const [confirmPlanTitle, setConfirmPlanTitle] = useState("");
  const [confirmContinue, setConfirmContinue] = useState(null);

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
        setConfirmPlanId(String(planId));
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

  return (
    <section className="container page-content">
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
            <p style={{ marginBottom: 12, color: "#6f7992" }}>
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
                  <div style={{ fontWeight: 900, color: "#1b2341" }}>{x.freelancerLabel}</div>
                  <div style={{ color: "#6f7992", fontWeight: 800, fontSize: "0.92rem" }}>
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

      <div className="card">
        <h1>اشتراكات المستقلين</h1>
        <p>إسناد الباقات وإدارة حالة الاشتراك (للمدير الأعلى فقط).</p>
        {error ? <p className="auth-form-error">{error}</p> : null}
      </div>

      <div className="card">
        <h2>إسناد باقة لمستقل</h2>
        <div className="auth-form-grid">
          <label className="auth-field">
            <span>المستقل</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  value={freelancerQuery}
                  placeholder="ابحث عن المستقل بالاسم أو البريد…"
                  onChange={(e) => {
                    setFreelancerQuery(e.target.value);
                    setFreelancerOpen(true);
                  }}
                  onFocus={() => {
                    setFreelancerOpen(true);
                    // When opening with empty input, show the latest freelancers immediately.
                    if (!freelancerQuery.trim()) setFreelancerQuery("");
                  }}
                  onBlur={() => setTimeout(() => setFreelancerOpen(false), 120)}
                  disabled={submitting}
                />

                {freelancerOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      insetInline: 0,
                      zIndex: 50,
                      background: "#fff",
                      border: "1px solid rgba(56, 82, 180, 0.18)",
                      borderRadius: 14,
                      boxShadow: "0 18px 40px rgba(24, 36, 85, 0.12)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: 10, borderBottom: "1px solid rgba(56, 82, 180, 0.10)", background: "rgba(56, 82, 180, 0.02)" }}>
                      <div style={{ fontWeight: 800, color: "#6f7992", fontSize: "0.88rem" }}>
                        {freelancerBusy ? "جارٍ البحث…" : "اختر من النتائج"}
                      </div>
                    </div>
                    <div style={{ maxHeight: 260, overflow: "auto" }}>
                      {freelancerMatches.length === 0 && !freelancerBusy ? (
                        <div style={{ padding: 12, color: "#6f7992", fontWeight: 800 }}>لا توجد نتائج.</div>
                      ) : null}
                      {freelancerMatches.map((f) => (
                        <button
                          key={String(f.id)}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setForm((v) => ({
                              ...v,
                              freelancerUserIds: Array.from(
                                new Set([...(v.freelancerUserIds || []), String(f.id)]),
                              ).slice(0, 50),
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
                          style={{
                            width: "100%",
                            textAlign: "right",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: "10px 12px",
                            display: "grid",
                            gap: 2,
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ fontWeight: 900, color: "#1b2341" }}>{f.name || "—"}</div>
                          <div style={{ color: "#6f7992", fontWeight: 700, fontSize: "0.86rem" }}>
                            {f.email || ""}{f.accountId ? ` • ${f.accountId}` : ""} • ID: {String(f.id)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {(form.freelancerUserIds || []).length ? (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10 }}>
                {(form.freelancerUserIds || []).map((id) => {
                  const f = selectedFreelancersById[String(id)] || null;
                  const label = f ? `${f.name || "مستقل"} • ${f.email || ""}`.trim() : `ID: ${String(id)}`;
                  return (
                    <span
                      key={String(id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 10,
                        borderRadius: 999,
                        padding: "6px 10px",
                        border: "1px solid rgba(56, 82, 180, 0.18)",
                        background: "rgba(56, 82, 180, 0.05)",
                        fontWeight: 800,
                        color: "#223069",
                      }}
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() =>
                          setForm((v) => ({
                            ...v,
                            freelancerUserIds: (v.freelancerUserIds || []).filter((x) => String(x) !== String(id)),
                          }))
                        }
                        style={{
                          border: "1px solid rgba(56, 82, 180, 0.18)",
                          background: "#fff",
                          borderRadius: 999,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontWeight: 900,
                          color: "#223069",
                        }}
                      >
                        إزالة
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginTop: 10, color: "#6f7992", fontWeight: 800, fontSize: "0.9rem" }}>
                لم يتم اختيار أي مستقل بعد.
              </div>
            )}
          </label>

          <label className="auth-field">
            <span>الباقة</span>
            <div className="auth-input-wrap auth-input-wrap--noicon">
              <select
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
          </label>

          <Button type="button" className="auth-submit-btn" disabled={!canAssign || submitting} onClick={assign}>
            إسناد الباقة
          </Button>
        </div>
      </div>

      <div className="card">
        <h2>قائمة الاشتراكات (آخر 200)</h2>
        {loading ? <AdminInlineGridSkeleton count={3} /> : null}
        {!loading && subs.length === 0 ? <p>لا توجد اشتراكات بعد.</p> : null}

        {!loading && subs.length > 0 ? (
          <div className="cards-grid">
            {subs.map((s) => (
              <article className="card" key={s.id}>
                <h3>اشتراك #{s.id}</h3>
                <p>freelancerUserId: {s.freelancerUserId}</p>
                <p>planId: {s.planId}</p>
                <p>الحالة: {formatSubscriptionStatus(s.status)}</p>
                <p>assignedAt: {formatJoDateTime(s.assignedAt)}</p>
                <p>firstOrderDate: {formatJoDateTime(s.firstOrderDate)}</p>
                <p>actualStartDate: {formatJoDateTime(s.actualStartDate)}</p>
                <p>expiryDate: {formatJoDateTime(s.expiryDate)}</p>

                <div className="auth-actions-row auth-actions-row--split" style={{ marginTop: 10, flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => markFirstOrder(s, new Date().toISOString())}
                  >
                    تسجيل أول طلب (الآن)
                  </Button>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => setStatus(s, "inactive")}>
                    تعطيل
                  </Button>
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => setStatus(s, "cancelled")}>
                    إلغاء
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default SuperAdminSubscriptionsPage;

