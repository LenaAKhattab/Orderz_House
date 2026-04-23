import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { getMyAssignedOrderByIdRequest } from "../../services/api";
import { arabicDurationUnit } from "../../utils/arTime";
import { OrderDetailsPageSkeleton } from "../../components/ui/Skeleton";

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

    const base = [
      { label: "نوع المشروع / السعر", value: typeAndBudgetText, dir: "ltr" },
      { label: "مدة التسليم", value: durationLabel(order) },
      { label: "التصنيف / التصنيف الفرعي", value: categoryText },
      { label: "تاريخ الاستلام", value: formatJoDateTime(receivedAt) },
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
  }, [order]);

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
              <div className="order-details__block-title">الملفات</div>
              <div className="order-details__block-body">
                {Array.isArray(order?.files) && order.files.length ? (
                  <ul className="order-details__attachments">
                    {order.files.map((f) => (
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
                  <span className="help">لا توجد ملفات مضافة</span>
                )}
              </div>
            </section>
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

