import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { getMyAssignedOrderByIdRequest, submitFreelancerOrderDeliveryRequest } from "../../services/api";
import { arabicDurationUnit } from "../../utils/arTime";
import { OrderDetailsPageSkeleton } from "../../components/ui/Skeleton";
import OrderDeliveryTimingBanner from "../../components/orders/OrderDeliveryTimingBanner";
import "../../components/orders/order-details/order-details-page.css";
import OrderSummaryCard from "../../components/orders/order-details/OrderSummaryCard";
import OrderSection from "../../components/orders/order-details/OrderSection";
import OrderTitleCard from "../../components/orders/order-details/OrderTitleCard";
import OrderDescriptionCard from "../../components/orders/order-details/OrderDescriptionCard";
import OrderFilesCard from "../../components/orders/order-details/OrderFilesCard";
import OrderMetadataBlock from "../../components/orders/order-details/OrderMetadataBlock";
import FileList from "../../components/orders/order-details/FileList";
import SubmissionHistoryTimeline from "../../components/orders/submission-history/SubmissionHistoryTimeline";
import {
  formatJoDateTime,
  formatMoneyJod,
} from "../../components/orders/order-details/orderDetailsUtils";
import {
  ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR,
  ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR,
  validateOrderFilesSize,
} from "../../utils/orderUploadLimits";

function typeLabel(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function revisionRequesterAr(order) {
  if (order?.revisionRequestedBy === "admin") return "الإدارة";
  if (order?.revisionRequestedBy === "client") return "العميل";
  return order?.sourceType === "admin_created" || order?.sourceType === "super_admin_created" ? "الإدارة" : "العميل";
}

function revisionStatusAr(order) {
  const s = String(order?.orderStatus || "");
  if (s === "pending_client_review") return "تم تسليم التعديل";
  if (s === "in_progress" || s === "ready_for_work") return "قيد تنفيذ التعديل";
  return "بانتظار تنفيذ التعديل";
}

function durationLabel(order) {
  if (!order?.durationValue || !order?.durationUnit) return "—";
  return `${order.durationValue} ${arabicDurationUnit(order.durationValue, order.durationUnit)}`;
}

const DELIVERY_UPLOAD_ALLOWED_STATUSES = new Set(["in_progress", "assigned", "ready_for_work"]);

export default function FreelancerMyOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();

  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(true);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryFiles, setDeliveryFiles] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const res = await getMyAssignedOrderByIdRequest(id);
        if (!cancelled) setOrder(res?.data?.order || null);
      } catch (e) {
        if (!cancelled) {
          push({ type: "error", title: "تعذر تحميل تفاصيل الطلب", message: e?.response?.data?.message || e?.message });
          navigate("/dashboard/freelancer/my-orders", { replace: true });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, push, navigate]);

  useEffect(() => {
    if (busy || !id || !order) return undefined;
    const s = order.orderStatus;
    if (s === "completed" || s === "cancelled") return undefined;

    let cancelled = false;
    async function pull() {
      try {
        const res = await getMyAssignedOrderByIdRequest(id);
        if (cancelled) return;
        const next = res?.data?.order;
        if (next) setOrder(next);
      } catch (e) {
        if (cancelled) return;
        if (e?.response?.status === 404) {
          navigate("/dashboard/freelancer/my-orders", { replace: true });
        }
      }
    }

    const intervalMs = 12_000;
    void pull();
    const timer = setInterval(() => {
      void pull();
    }, intervalMs);

    const onVis = () => {
      if (document.visibilityState === "visible") void pull();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [busy, id, order?.orderStatus, navigate]);

  const briefFiles = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => !f.purpose || f.purpose === "brief") : []),
    [order?.files],
  );
  const submittedDeliveryFiles = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => f.purpose === "delivery") : []),
    [order?.files],
  );
  const requestAttachments = useMemo(
    () => (Array.isArray(order?.files) ? order.files.filter((f) => f.purpose === "revision_request") : []),
    [order?.files],
  );

  const orderPhaseLabel = useMemo(() => {
    const s = order?.orderStatus;
    if (order?.clientRevisionNote && (s === "in_progress" || s === "ready_for_work")) {
      return "قيد تنفيذ التعديل";
    }
    if (s === "pending_client_review") return "بانتظار اعتماد العميل على التسليم";
    if (s === "completed") return "مكتمل";
    if (s === "in_progress") return "قيد التنفيذ — يمكنك تسليم الملفات";
    return s || "—";
  }, [order?.orderStatus, order?.clientRevisionNote]);

  const deliveryFilesSizeOk = useMemo(
    () => (deliveryFiles.length ? validateOrderFilesSize(deliveryFiles).ok : true),
    [deliveryFiles],
  );

  const submitDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryFiles.length) {
      push({ type: "error", title: "تنبيه", message: "اختر ملفاً واحداً على الأقل." });
      return;
    }
    if (!validateOrderFilesSize(deliveryFiles).ok) {
      push({ type: "error", title: "حجم الملفات", message: ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR });
      return;
    }
    setDeliveryBusy(true);
    try {
      const fd = new FormData();
      for (const f of deliveryFiles) fd.append("files", f);
      const res = await submitFreelancerOrderDeliveryRequest(id, fd);
      const next = res?.data?.order ?? res?.order;
      if (next) setOrder(next);
      setDeliveryFiles([]);
      push({ type: "success", title: "تم التسليم", message: "أُرسلت المرفقات للعميل للمراجعة." });
    } catch (err) {
      push({ type: "error", title: "تعذّر التسليم", message: err?.response?.data?.message || err?.message });
    } finally {
      setDeliveryBusy(false);
    }
  };

  const categoryText = useMemo(() => {
    if (!order) return "—";
    return `${order?.category?.name || "—"} — ${order?.subSubcategory?.name || "—"}`;
  }, [order]);

  const typeAndBudgetText = useMemo(() => {
    if (!order) return "—";
    const budgetLine = order?.projectType === "bidding" ? "—" : formatMoneyJod(order?.budget);
    return order?.projectType === "bidding" ? `${typeLabel(order?.projectType)}` : `${typeLabel(order?.projectType)} — ${budgetLine}`;
  }, [order]);

  const summaryRows = useMemo(() => {
    if (!order) return [];
    const receivedAt = order?.receivedAt || null;
    const rows = [
      { label: "مدة التسليم", value: durationLabel(order) },
      { label: "التصنيف", value: categoryText },
      { label: "تاريخ الاستلام", value: formatJoDateTime(receivedAt) },
      { label: "حالة التنفيذ", value: orderPhaseLabel },
    ];
    if (Array.isArray(order?.extraCategories) && order.extraCategories.length) {
      rows.push({
        label: "تصنيفات إضافية",
        value: order.extraCategories
          .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
          .join(" | "),
      });
    }
    return rows;
  }, [order, categoryText, orderPhaseLabel]);

  const skillsLine = useMemo(() => {
    if (!order) return "لا توجد مهارات مفضلة لهذا المشروع.";
    const names = Array.isArray(order.preferredSkills) ? order.preferredSkills.map((s) => s.name).filter(Boolean) : [];
    return names.length ? names.join("، ") : "لا توجد مهارات مفضلة لهذا المشروع.";
  }, [order]);

  return (
    <main className="container page-content dash-shell od-page od-page--pool od-page--pool-has-main" dir="rtl">
      <div className="od-pool-toolbar od-pool-toolbar--bare">
        <Link className="btn btn-secondary" to="/dashboard/freelancer/my-orders">
          العودة لطلباتي
        </Link>
      </div>

      <p className="od-pool-hint" style={{ margin: 0 }}>
        لوحة المستقل • طلباتي
      </p>

      {!busy && order ? <OrderDeliveryTimingBanner order={order} className="od-delivery-banner" /> : null}

      {busy ? (
        <OrderDetailsPageSkeleton />
      ) : order ? (
        <div className="od-pool-shell">
          <div className="od-pool-title">
            <div className="od-title-desc-group">
              <OrderTitleCard title={order.title} />
              <OrderDescriptionCard text={order.description} />
              <OrderDescriptionCard label="المهارات المطلوبة" text={skillsLine} />
            </div>
          </div>

          <div className="od-pool-summary">
            <div className="od-aside-col">
              <OrderSummaryCard
                title="ملخص الطلب"
                primaryBlock={{ label: "نوع المشروع / السعر", value: typeAndBudgetText, dir: "ltr" }}
                rows={summaryRows}
              />
              <OrderFilesCard
                title="مرفقات وصف الطلب"
                orderId={String(id)}
                fileAccess="freelancer"
                files={briefFiles}
                emptyText="لا توجد ملفات في الوصف"
              />
            </div>
          </div>

          <div className="od-pool-main">
            {order?.clientRevisionNote ? (
              <OrderSection title="تفاصيل طلب التعديل / المراجعة" accent>
                <OrderMetadataBlock
                  rows={[
                    { label: "الجهة الطالبة", value: revisionRequesterAr(order) },
                    { label: "رسالة الطلب", value: order.clientRevisionNote },
                    { label: "تاريخ الطلب", value: formatJoDate(order?.revisionRequestedAt || order?.updatedAt) },
                    { label: "الموعد النهائي", value: formatJoDate(order?.revisionDeadlineAt || order?.dueAt) },
                    { label: "الحالة", value: revisionStatusAr(order) },
                  ]}
                />
                <div style={{ marginTop: "0.85rem" }}>
                  <p className="od-meta-label" style={{ marginBottom: "0.35rem" }}>
                    مرفقات مرتبطة
                  </p>
                  <FileList orderId={String(id)} fileAccess="freelancer" files={requestAttachments} emptyText="لا توجد مرفقات إضافية." />
                </div>
              </OrderSection>
            ) : null}

            {order?.submissionHistory?.submissions?.length ? (
              <OrderSection title="سجل التسليمات والتعديلات" accent>
                <SubmissionHistoryTimeline
                  submissionHistory={order.submissionHistory}
                  orderId={String(id)}
                  fileAccess="freelancer"
                />
              </OrderSection>
            ) : submittedDeliveryFiles.length ? (
              <OrderSection title="ما قمت بتسليمه">
                <FileList orderId={String(id)} fileAccess="freelancer" files={submittedDeliveryFiles} emptyText="—" />
              </OrderSection>
            ) : null}

            {DELIVERY_UPLOAD_ALLOWED_STATUSES.has(String(order?.orderStatus || "")) ? (
              <OrderSection title="تسليم الطلب">
                <p className="od-muted" style={{ marginTop: 0 }}>
                  ارفع الملفات أو الصور النهائية (حتى خمس ملفات). {ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR}
                </p>
                <form onSubmit={submitDelivery}>
                  <div className="field">
                    <label className="label" htmlFor="delivery-input">
                      اختيار الملفات
                    </label>
                    <input
                      id="delivery-input"
                      type="file"
                      className="input"
                      multiple
                      disabled={deliveryBusy}
                      onChange={(ev) => {
                        const list = ev.target.files ? Array.from(ev.target.files) : [];
                        setDeliveryFiles(list.slice(0, 5));
                      }}
                    />
                    {deliveryFiles.length > 0 && !deliveryFilesSizeOk ? (
                      <p className="help" style={{ color: "#b91c1c", marginTop: 6, marginBottom: 0 }}>
                        {ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={deliveryBusy || !deliveryFiles.length || !deliveryFilesSizeOk}
                  >
                    {deliveryBusy ? "جارٍ الإرسال…" : "تسليم الطلب"}
                  </button>
                </form>
              </OrderSection>
            ) : null}

            {order?.orderStatus === "pending_client_review" ? (
              <OrderSection title="حالة التسليم">
                <p className="od-muted" style={{ margin: 0 }}>
                  تم إرسال تسليمك للمراجعة. بانتظار الاعتماد النهائي (عميل/إدارة).
                </p>
              </OrderSection>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
