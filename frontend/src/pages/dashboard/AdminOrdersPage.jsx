import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import ClientDeliveryReviewModal from "../../components/orders/ClientDeliveryReviewModal";
import OrderCard from "../../components/orders/OrderCard";
import AdminFreelancerRegistrationModal from "../../components/orders/AdminFreelancerRegistrationModal";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../components/ui/toastContext";
import {
  adminAcceptTakenOrderRequest,
  adminGetInternalOrderRequest,
  adminListInternalOrdersRequest,
  adminListOrderClaimsRequest,
} from "../../services/api";
import { INTERNAL_ORDERS_LIST_REFRESH } from "../../constants/authRoutes";
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
  const location = useLocation();
  const role = user?.primaryRole || user?.role;
  const createPath = role === "super_admin" ? "/dashboard/super-admin/orders/create" : "/dashboard/admin/orders/create";

  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(true);
  const [view, setView] = useState("cards"); // cards | table
  const [claimsByOrderId, setClaimsByOrderId] = useState({});
  const [claimsBusyByOrderId, setClaimsBusyByOrderId] = useState({});
  const [approvingClaimId, setApprovingClaimId] = useState(null);
  const [claimsModalOrderId, setClaimsModalOrderId] = useState(null);
  const [deliveryModal, setDeliveryModal] = useState({ open: false, order: null, variant: "workflow" });
  const [deliveryOpeningId, setDeliveryOpeningId] = useState(null);

  const rows = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  const claimsModalOrder = useMemo(() => {
    if (claimsModalOrderId == null) return null;
    return rows.find((x) => String(x?.id) === String(claimsModalOrderId)) || null;
  }, [claimsModalOrderId, rows]);

  const claimsModalKey = claimsModalOrder ? String(claimsModalOrder.id) : "";
  const claimsModalList = claimsModalKey && Array.isArray(claimsByOrderId[claimsModalKey]) ? claimsByOrderId[claimsModalKey] : null;
  const claimsModalBusy = claimsModalKey ? Boolean(claimsBusyByOrderId[claimsModalKey]) : false;

  const reloadOrders = useCallback(async () => {
    try {
      const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
      const list = res?.data?.orders ?? res?.orders;
      setOrders(Array.isArray(list) ? list : []);
    } catch (e) {
      push({ type: "error", title: "تعذر تحديث القائمة", message: e?.response?.data?.message || e?.message });
    }
  }, [push]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await adminListInternalOrdersRequest({ limit: 50, offset: 0 });
        const list = res?.data?.orders ?? res?.orders;
        if (!cancelled) setOrders(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) push({ type: "error", title: "تعذر تحميل الطلبات", message: e?.response?.data?.message || e?.message });
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.key, push]);

  useEffect(() => {
    window.addEventListener(INTERNAL_ORDERS_LIST_REFRESH, reloadOrders);
    return () => window.removeEventListener(INTERNAL_ORDERS_LIST_REFRESH, reloadOrders);
  }, [reloadOrders]);

  useEffect(() => {
    if (claimsModalOrderId == null) return;
    if (!rows.some((x) => String(x?.id) === String(claimsModalOrderId))) setClaimsModalOrderId(null);
  }, [claimsModalOrderId, rows]);

  useEffect(() => {
    if (!claimsModalOrder) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !approvingClaimId) setClaimsModalOrderId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [claimsModalOrder, approvingClaimId]);

  const loadClaims = useCallback(async (orderId) => {
    const key = String(orderId);
    setClaimsBusyByOrderId((p) => ({ ...p, [key]: true }));
    try {
      const res = await adminListOrderClaimsRequest(orderId);
      const claims = res?.data?.claims || res?.data?.data?.claims || [];
      setClaimsByOrderId((p) => ({ ...p, [key]: Array.isArray(claims) ? claims : [] }));
    } catch {
      setClaimsByOrderId((p) => ({ ...p, [key]: [] }));
    } finally {
      setClaimsBusyByOrderId((p) => ({ ...p, [key]: false }));
    }
  }, []);

  // Claims are loaded on-demand (when opening the applicants modal) to avoid
  // flooding the backend with background requests and triggering timeouts.

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

  const openAdminDeliveryModal = async (orderId, variant) => {
    const key = String(orderId);
    setDeliveryOpeningId(key);
    try {
      const res = await adminGetInternalOrderRequest(orderId);
      const order = res?.data?.order ?? res?.order;
      if (!order) throw new Error("تعذّر تحميل بيانات الطلب.");
      setDeliveryModal({ open: true, order, variant });
    } catch (e) {
      push({
        type: "error",
        title: "تعذّر فتح الاستلام",
        message: e?.response?.data?.message || e?.message || String(e?.message || ""),
      });
    } finally {
      setDeliveryOpeningId(null);
    }
  };

  const approveClaim = async ({ orderId, claimId }) => {
    setApprovingClaimId(String(claimId));
    try {
      await adminAcceptTakenOrderRequest(orderId, { claimId });
      push({ type: "success", title: "تم قبول المتقدم", message: "تم بدء مدة المشروع من لحظة القبول." });
      setClaimsModalOrderId(null);
      await reloadOrders();
      await loadClaims(orderId);
    } catch (e) {
      push({ type: "error", title: "تعذر القبول", message: e?.response?.data?.message || e?.message });
    } finally {
      setApprovingClaimId(null);
    }
  };

  return (
    <main className="container page-content oh-internal-orders">
      <section className="card oh-internal-orders__toolbar">
        <div className="oh-internal-orders__intro">
          <h1 className="oh-internal-orders__title">الطلبات الداخلية</h1>
          <p className="oh-internal-orders__lead">طلبات تم إنشاؤها بواسطة الإدارة/السوبر أدمن (بدون دفع).</p>
        </div>
        <div className="oh-internal-orders__actions">
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

      <section className="oh-internal-orders__list" aria-busy={busy}>
        {busy ? (
          <OrderCardsGridSkeleton count={4} />
        ) : orders.length === 0 ? (
          <section className="oh-empty oh-internal-orders__empty">
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
            const claimsBusy = Boolean(claimsBusyByOrderId[orderKey]);
            const claimsCountSuffix = claims !== null && !claimsBusy ? ` (${claims.length})` : "";
            const showDeliveryReceive =
              Boolean(o?.assignedFreelancerId) &&
              Boolean(o?.receivedAt) &&
              !o?.isArchived &&
              o?.orderStatus !== "completed" &&
              o?.orderStatus !== "cancelled";
            const showDeliveryArchive =
              Boolean(o?.assignedFreelancerId) && !o?.isArchived && o?.orderStatus === "completed";
            return (
              <OrderCard
                key={o.id}
                order={o}
                compactSummary
                footerInline={
                  <>
                    {shouldShowApplicants ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setClaimsModalOrderId(o.id);
                          void loadClaims(o.id);
                        }}
                      >
                        طلبات المستقلين{claimsCountSuffix}
                      </button>
                    ) : null}
                    {showDeliveryReceive ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={deliveryOpeningId === String(o.id)}
                        onClick={() => void openAdminDeliveryModal(o.id, "workflow")}
                      >
                        {deliveryOpeningId === String(o.id) ? "جارٍ التحميل…" : "استلام الطلب"}
                      </button>
                    ) : null}
                    {showDeliveryArchive ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={deliveryOpeningId === String(o.id)}
                        onClick={() => void openAdminDeliveryModal(o.id, "archive")}
                      >
                        {deliveryOpeningId === String(o.id) ? "جارٍ التحميل…" : "ملفات تسليم المستقل"}
                      </button>
                    ) : null}
                  </>
                }
              />
            );
          })
        ) : (
          <div className="card oh-internal-orders__table-card" style={{ overflowX: "auto" }}>
            <table className="oh-internal-orders__table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1200 }}>
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
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.projectType === "bidding" ? "—" : "JOD"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{o.durationValue ? `${o.durationValue} ${o.durationUnit || ""}` : "—"}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)" }}>{orderStatusLabelAr(o.orderStatus)}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(56,82,180,0.10)", maxWidth: 360 }}>
                        {deliveryTiming ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            <span>{deliveryTiming.message}</span>
                            {deliveryTiming.completionMessage ? (
                              <span style={{ fontSize: "0.88em", color: "var(--text-muted)" }}>{deliveryTiming.completionMessage}</span>
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

      {claimsModalOrder ? (
        <div
          role="presentation"
          onMouseDown={() => {
            if (!approvingClaimId) setClaimsModalOrderId(null);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.45)",
          }}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-claims-modal-title"
            onMouseDown={(ev) => ev.stopPropagation()}
            style={{ maxWidth: 560, width: "100%", maxHeight: "min(88vh, 720px)", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="admin-claims-modal-title" style={{ margin: "0 0 6px" }}>
                  طلبات المستقلين
                </h2>
                <p className="help" style={{ margin: 0 }}>
                  {claimsModalOrder.orderCode ? `${claimsModalOrder.orderCode} — ` : ""}
                  {claimsModalOrder.title || "—"}
                </p>
                <p className="help" style={{ margin: "8px 0 0" }}>
                  اختر متقدماً واحداً لبدء العمل.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={claimsModalBusy || Boolean(approvingClaimId)}
                  onClick={() => loadClaims(claimsModalOrder.id)}
                >
                  {claimsModalBusy ? "جارٍ التحميل…" : "تحديث القائمة"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={Boolean(approvingClaimId)}
                  onClick={() => setClaimsModalOrderId(null)}
                >
                  إغلاق
                </button>
              </div>
            </div>

            <div style={{ marginTop: 14, overflow: "auto", flex: 1, minHeight: 0 }}>
              {claimsModalList === null && claimsModalBusy ? <ClaimsSkeleton /> : null}

              {claimsModalList !== null ? (
                claimsModalBusy ? (
                  <ClaimsSkeleton />
                ) : claimsModalList.length === 0 ? (
                  <div className="help" style={{ margin: 0 }}>
                    لا يوجد متقدمون حالياً.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {claimsModalList.map((c) => {
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
                            <div style={{ fontWeight: 950, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
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
                            onClick={() => approveClaim({ orderId: claimsModalOrder.id, claimId: c.id })}
                          >
                            {approvingClaimId === String(c.id) ? "جارٍ القبول…" : "قبول"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {deliveryModal.open && deliveryModal.order ? (
        <ClientDeliveryReviewModal
          key={String(deliveryModal.order.id)}
          open
          order={deliveryModal.order}
          variant={deliveryModal.variant}
          audience="admin"
          onClose={() => setDeliveryModal({ open: false, order: null, variant: "workflow" })}
          onApprove={() => {
            void reloadOrders();
          }}
          onRevised={() => {
            push({ type: "success", title: "تم إرسال طلب التعديل", message: "سيظهر للمستقل ويمكنه إعادة التسليم بعد التعديل." });
            void reloadOrders();
          }}
        />
      ) : null}
    </main>
  );
}

