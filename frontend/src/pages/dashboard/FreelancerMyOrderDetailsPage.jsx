import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { getMyAssignedOrderByIdRequest, submitFreelancerOrderDeliveryRequest } from "../../services/api";
import { arabicDurationUnit } from "../../utils/arTime";
import { OrderDetailsPageSkeleton } from "../../components/ui/Skeleton";
import OrderDeliveryTimingBanner from "../../components/orders/OrderDeliveryTimingBanner";

function fileHref(fileUrl) {
  if (!fileUrl) return "";
  const raw = String(fileUrl).trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api").replace(/\/api\/?$/, "");
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function formatJoDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function typeLabel(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function durationLabel(order) {
  if (!order?.durationValue || !order?.durationUnit) return "—";
  return `${order.durationValue} ${arabicDurationUnit(order.durationValue, order.durationUnit)}`;
}

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

  /** Keep order (incl. submittedAt / dueAt) fresh without full page reload — timing banner and status stay current. */
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

  const orderPhaseLabel = useMemo(() => {
    if (order?.myClaim?.status === "pending" && !order?.assignedFreelancerId) {
      return "تقدمت على الطلب — بانتظار موافقة صاحب الطلب أو الإدارة";
    }
    const s = order?.orderStatus;
    if (s === "pending_client_review") return "بانتظار اعتماد العميل على التسليم";
    if (s === "completed") return "مكتمل";
    if (s === "in_progress") return "قيد التنفيذ — يمكنك تسليم الملفات";
    return s || "—";
  }, [order?.orderStatus, order?.myClaim, order?.assignedFreelancerId]);

  const submitDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryFiles.length) {
      push({ type: "error", title: "تنبيه", message: "اختر ملفاً واحداً على الأقل." });
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

  const metaRows = useMemo(() => {
    if (!order) return [];
    const categoryText = `${order?.category?.name || "—"} — ${order?.subSubcategory?.name || "—"}`;
    const budgetText =
      order?.projectType === "bidding"
        ? "—"
        : `${formatMoney(order?.budget)}${order?.currencyCode ? ` ${order.currencyCode}` : ""}`.trim();
    const typeAndBudgetText =
      order?.projectType === "bidding" ? `${typeLabel(order?.projectType)}` : `${typeLabel(order?.projectType)} — ${budgetText}`;
    const receivedAt = order?.receivedAt || null;
    const receivedLabel =
      order?.myClaim?.status === "pending" && !order?.assignedFreelancerId
        ? "لم يبدأ بعد (بانتظار الموافقة على التقديم)"
        : formatJoDateTime(receivedAt);

    const base = [
      { label: "نوع المشروع / السعر", value: typeAndBudgetText, dir: "ltr" },
      { label: "مدة التسليم", value: durationLabel(order) },
      { label: "التصنيف / التصنيف الفرعي", value: categoryText },
      { label: "تاريخ الاستلام", value: receivedLabel },
      { label: "حالة التنفيذ", value: orderPhaseLabel },
    ];

    const extras =
      Array.isArray(order?.extraCategories) && order.extraCategories.length
        ? [
            {
              label: "تصنيفات إضافية",
              value: order.extraCategories
                .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
                .join(" | "),
            },
          ]
        : [];

    return [...base, ...extras];
  }, [order, orderPhaseLabel]);

  return (
    <main className="container page-content dash-shell order-details" dir="rtl">
      <header className="order-details__top">
        <div className="order-details__top-title">
          <div className="help" style={{ margin: 0, fontWeight: 900 }}>
            لوحة المستقل • طلباتي
          </div>
          <h1 className="order-details__title">تفاصيل الطلب</h1>
          <p className="help" style={{ margin: "6px 0 0" }}>
            عرض كامل لتفاصيل الطلب.
          </p>
        </div>

        <div className="order-details__top-actions">
          <Link className="btn btn-secondary" to="/dashboard/freelancer/my-orders">
            العودة لطلباتي
          </Link>
        </div>
      </header>

      {busy ? (
        <div style={{ marginTop: 12 }}>
          <OrderDetailsPageSkeleton />
        </div>
      ) : order ? (
        <section className="order-details__grid">
          <section className="order-details__main">
            <OrderDeliveryTimingBanner order={order} />

            {order?.clientRevisionNote ? (
              <section className="order-details__block" style={{ borderColor: "rgba(59, 130, 246, 0.35)" }}>
                <div className="order-details__block-title">ملاحظة من العميل</div>
                <div className="order-details__block-body">{order.clientRevisionNote}</div>
              </section>
            ) : null}

            <div className="order-details__desc">
              <div className="order-details__desc-head">
                <div className="order-details__desc-k">{order?.title || "—"}</div>
              </div>
              <div className="order-details__desc-v">{order?.description || "—"}</div>
            </div>

            {Array.isArray(order?.preferredSkills) && order.preferredSkills.length ? (
              <section className="order-details__block">
                <div className="order-details__block-title">المهارات المطلوبة</div>
                <div className="order-details__block-body">
                  {order.preferredSkills.map((s) => s.name).filter(Boolean).join("، ")}
                </div>
              </section>
            ) : null}

            <section className="order-details__block">
              <div className="order-details__block-title">مرفقات وصف الطلب</div>
              <div className="order-details__block-body">
                {briefFiles.length ? (
                  <ul className="order-details__attachments">
                    {briefFiles.map((f) => (
                      <li key={f.id} className="order-details__attachment">
                        {f.fileUrl ? (
                          <a className="order-details__attachment-link" href={fileHref(f.fileUrl)} target="_blank" rel="noreferrer">
                            {f.originalName || f.filePath}
                          </a>
                        ) : (
                          <span>{f.originalName || f.filePath}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="help">لا توجد ملفات في الوصف</span>
                )}
              </div>
            </section>

            {submittedDeliveryFiles.length ? (
              <section className="order-details__block">
                <div className="order-details__block-title">ما قمت بتسليمه</div>
                <div className="order-details__block-body">
                  <ul className="order-details__attachments">
                    {submittedDeliveryFiles.map((f) => (
                      <li key={f.id} className="order-details__attachment">
                        {f.fileUrl ? (
                          <a className="order-details__attachment-link" href={fileHref(f.fileUrl)} target="_blank" rel="noreferrer">
                            {f.originalName || f.filePath}
                          </a>
                        ) : (
                          <span>{f.originalName || f.filePath}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}

            {order?.orderStatus === "in_progress" ? (
              <section className="order-details__block">
                <div className="order-details__block-title">تسليم الطلب</div>
                <div className="order-details__block-body">
                  <p className="help" style={{ marginTop: 0 }}>
                    ارفع الملفات أو الصور النهائية (حتى خمس ملفات، عشرة ميغابايت لكل ملف).
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
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={deliveryBusy || !deliveryFiles.length}>
                      {deliveryBusy ? "جارٍ الإرسال…" : "تسليم الطلب"}
                    </button>
                  </form>
                </div>
              </section>
            ) : null}

            {order?.orderStatus === "pending_client_review" ? (
              <section className="order-details__block">
                <div className="order-details__block-title">حالة التسليم</div>
                <div className="order-details__block-body">
                  <p className="help" style={{ margin: 0 }}>
                    تم إرسال تسليمك للعميل. بانتظار اعتماده على المرفقات.
                  </p>
                </div>
              </section>
            ) : null}
          </section>

          <aside className="order-details__side">
            <section className="order-details__meta card">
              <div className="order-details__meta-title">تفاصيل المشروع</div>
              <div className="order-details__meta-list">
                {metaRows.map((r) => (
                  <div key={r.label} className="order-details__meta-row">
                    <div className="order-details__meta-label">{r.label}</div>
                    <div className="order-details__meta-value" dir={r.dir || "rtl"} style={r.dir ? { unicodeBidi: "plaintext" } : undefined}>
                      {r.value || "—"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      ) : null}
    </main>
  );
}

