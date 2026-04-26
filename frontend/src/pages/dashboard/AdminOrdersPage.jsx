import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import OrderCard from "../../components/orders/OrderCard";
import AdminFreelancerRegistrationModal from "../../components/orders/AdminFreelancerRegistrationModal";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import { adminAcceptTakenOrderRequest, adminListInternalOrdersRequest, adminListOrderClaimsRequest } from "../../services/api";
import { OrderCardsGridSkeleton } from "../../components/ui/Skeleton";
import { getOrderDeliveryTiming } from "../../utils/orderDeliveryTiming";
import { orderStatusLabelAr } from "../../utils/orderFlowUi";

function fullNameAr(f) {
  const parts = [f?.firstName, f?.fatherName, f?.familyName].filter(Boolean);
  return parts.join(" ").trim();
}

function ClaimsSkeleton() {
  return (
    <div aria-hidden style={{ display: "grid", gap: 8, padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(56,82,180,0.10)" }}>
      <div className="oh-skel oh-skel-line" style={{ height: 12, width: "44%" }} />
      <div className="oh-skel oh-skel-line" style={{ height: 10, width: "92%" }} />
      <div className="oh-skel oh-skel-line" style={{ height: 10, width: "78%" }} />
    </div>
  );
}

export default function AdminOrdersPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const role = user?.primaryRole || user?.role;
  const createPath = role === "super_admin" ? "/dashboard/super-admin/orders/create" : "/dashboard/admin/orders/create";

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [view, setView] = useState("cards"); // cards | table
  const [claimsByOrderId, setClaimsByOrderId] = useState({});
  const [approvingClaimId, setApprovingClaimId] = useState(null);
  const [registrationModalUserId, setRegistrationModalUserId] = useState(null);

  const rows = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
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

  const reloadOrders = async () => {
    try {
      const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
      setOrders(res?.data?.orders || []);
    } catch {
      // ignore
    }
  };

  const loadClaims = useCallback(async (orderId) => {
    const key = String(orderId);
    try {
      const res = await adminListOrderClaimsRequest(orderId);
      const claims = res?.data?.claims || res?.data?.data?.claims || [];
      setClaimsByOrderId((p) => ({ ...p, [key]: Array.isArray(claims) ? claims : [] }));
    } catch {
      setClaimsByOrderId((p) => ({ ...p, [key]: [] }));
    }
  }, []);

  const claimantOrderIds = useMemo(
    () =>
      rows
        .filter((o) => Boolean(o?.isOpenForPool) && !o?.assignedFreelancerId && !o?.receivedAt && !o?.isArchived)
        .map((o) => o.id)
        .filter(Boolean),
    [rows],
  );

  /** Auto-load and poll claims for open pool orders (cards view only). */
  useEffect(() => {
    if (busy || view !== "cards" || claimantOrderIds.length === 0) return undefined;

    let cancelled = false;
    const fetchAll = () => {
      if (cancelled) return;
      claimantOrderIds.forEach((id) => {
        void loadClaims(id);
      });
    };

    fetchAll();
    const intervalMs = 15_000;
    const timer = setInterval(fetchAll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [busy, view, claimantOrderIds, loadClaims]);

  /** Orders list (incl. delivery timing on cards) updates without manual refresh. */
  useEffect(() => {
    if (busy) return undefined;
    async function tick() {
      try {
        const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
        setOrders(res?.data?.orders || []);
      } catch {
        /* ignore */
      }
    }
    const t = setInterval(() => {
      void tick();
    }, 25_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [busy]);

  const approveClaim = async ({ orderId, claimId }) => {
    setApprovingClaimId(String(claimId));
    try {
      await adminAcceptTakenOrderRequest(orderId, { claimId });
      push({ type: "success", title: "تم قبول المتقدم", message: "تم بدء مدة المشروع من لحظة القبول." });
      await reloadOrders();
      await loadClaims(orderId);
    } catch (e) {
      push({ type: "error", title: "تعذر القبول", message: e?.response?.data?.message || e?.message });
    } finally {
      setApprovingClaimId(null);
    }
  };

  return (
    <main className="container page-content">
      <section className="card" style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>الطلبات الداخلية</h1>
          <p style={{ margin: 0 }}>طلبات تم إنشاؤها بواسطة الإدارة/السوبر أدمن (بدون دفع).</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-secondary ${view === "cards" ? "nav-link-active" : ""}`.trim()}
            onClick={() => setView("cards")}
          >
            عرض بطاقات
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${view === "table" ? "nav-link-active" : ""}`.trim()}
            onClick={() => setView("table")}
          >
            عرض جدول
          </button>
          <Link className="btn btn-primary" to={createPath}>
            إنشاء طلب
          </Link>
        </div>
      </section>

      <section className="cards-grid" aria-busy={busy}>
        {busy ? (
          <OrderCardsGridSkeleton count={4} />
        ) : orders.length === 0 ? (
          <section className="oh-empty">
            <div className="oh-empty__icon">📦</div>
            <div>
              <h2 className="oh-empty__title">لا توجد طلبات داخلية بعد</h2>
              <p className="oh-empty__subtitle">ابدأ بإنشاء طلب إداري وسيظهر هنا فوراً، ويمكنك إسناده لفريلانسر أو نشره في الحوض.</p>
              <div className="oh-empty__actions">
                <Link className="btn btn-primary" to={createPath}>
                  إنشاء أول طلب
                </Link>
              </div>
            </div>
          </section>
        ) : view === "cards" ? (
          rows.map((o) => {
            const shouldShowApplicants = Boolean(o?.isOpenForPool) && !o?.assignedFreelancerId && !o?.receivedAt && !o?.isArchived;
            const orderKey = String(o?.id);
            const claims = Array.isArray(claimsByOrderId[orderKey]) ? claimsByOrderId[orderKey] : null;
            return (
              <OrderCard
                key={o.id}
                order={o}
                footer={
                  shouldShowApplicants ? (
                    <div style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "grid" }}>
                        <div style={{ fontWeight: 950 }}>المتقدمون على الطلب</div>
                        <div className="help" style={{ margin: 0 }}>
                          اختر متقدماً واحداً لبدء العمل. تُحدَّث القائمة تلقائياً.
                        </div>
                      </div>

                      {claims == null ? (
                        <ClaimsSkeleton />
                      ) : claims.length === 0 ? (
                        <div className="help" style={{ margin: 0 }}>
                          لا يوجد متقدمون حالياً.
                        </div>
                      ) : (
                          <div style={{ display: "grid", gap: 8 }}>
                            {claims.map((c) => {
                              const name = fullNameAr(c?.freelancer) || c?.freelancer?.email || `#${c?.freelancerUserId || ""}`;
                              const status = String(c?.status || "").trim();
                              const canApprove = status === "pending";
                              return (
                                <div
                                  key={String(c.id)}
                                  style={{
                                    display: "flex",
                                    gap: 10,
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "10px 12px",
                                    borderRadius: 14,
                                    border: "1px solid rgba(56,82,180,0.12)",
                                    background: "rgba(56,82,180,0.03)",
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <button
                                      type="button"
                                      onClick={() => setRegistrationModalUserId(String(c.freelancerUserId || c?.freelancer?.id || ""))}
                                      style={{
                                        fontWeight: 950,
                                        display: "block",
                                        maxWidth: "100%",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        textAlign: "inherit",
                                        color: "var(--color-primary, #1d4ed8)",
                                        textDecoration: "underline",
                                      }}
                                      title="عرض بيانات التسجيل"
                                    >
                                      {name}
                                    </button>
                                    <div className="help" style={{ margin: 0 }}>
                                      {c?.freelancer?.accountId ? `ID: ${c.freelancer.accountId}` : c?.freelancer?.email || ""}
                                      {status ? ` • الحالة: ${status}` : ""}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-primary"
                                    disabled={!canApprove || approvingClaimId === String(c.id)}
                                    title={!canApprove ? "لا يمكن قبول هذا المتقدم" : ""}
                                    onClick={() => approveClaim({ orderId: o.id, claimId: c.id })}
                                  >
                                    {approvingClaimId === String(c.id) ? "جارٍ القبول…" : "قبول"}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                      )}
                    </div>
                  ) : null
                }
              />
            );
          })
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
              <thead>
                <tr>
                  {[
                    "رقم الطلب",
                    "العنوان",
                    "الوصف",
                    "التصنيف",
                    "التصنيف التفصيلي",
                    "تصنيفات إضافية",
                    "النوع",
                    "الميزانية",
                    "العملة",
                    "المدة",
                    "الحالة",
                    "التسليم مقابل الموعد",
                    "في الحوض",
                    "مؤرشف",
                    "assignedFreelancerId",
                    "createdAt",
                    "files",
                    "skills",
                  ].map((h) => (
                    <th key={h} style={{ textAlign: "right", padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.18)", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const extra = Array.isArray(o.extraCategories)
                    ? o.extraCategories
                        .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
                        .join(" | ")
                    : "";
                  const files = Array.isArray(o.files) ? o.files.map((f) => f.originalName || f.filePath).filter(Boolean).join(" | ") : "";
                  const skills = Array.isArray(o.preferredSkills) ? o.preferredSkills.map((s) => s.name).filter(Boolean).join(" | ") : "";
                  const deliveryTiming = getOrderDeliveryTiming(o);
                  return (
                    <tr key={o.id}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.orderCode || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.title || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 420 }}>{o.description || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.category?.name || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.subSubcategory?.name || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{extra || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType === "bidding" ? "—" : (o.budget ?? "—")}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType === "bidding" ? "—" : (o.currencyCode || "—")}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.durationValue ? `${o.durationValue} ${o.durationUnit || ""}` : "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{orderStatusLabelAr(o.orderStatus)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 360 }}>
                        {deliveryTiming ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            <span>{deliveryTiming.message}</span>
                            {deliveryTiming.completionMessage ? (
                              <span style={{ fontSize: "0.88em", color: "#475569" }}>{deliveryTiming.completionMessage}</span>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{String(Boolean(o.isOpenForPool))}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{String(Boolean(o.isArchived))}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.assignedFreelancerId || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.createdAt || "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 420 }}>
                        {files || "لا توجد ملفات مضافة"}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 320 }}>{skills || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AdminFreelancerRegistrationModal
        open={Boolean(registrationModalUserId)}
        freelancerUserId={registrationModalUserId}
        onClose={() => setRegistrationModalUserId(null)}
      />
    </main>
  );
}

