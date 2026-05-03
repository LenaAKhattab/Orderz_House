import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { useToast } from "../../components/ui/toastContext";
import { useAuth } from "../../context/useAuth";
import BidAmountModal from "../../components/orders/BidAmountModal";
import {
  getMyEligibilityRequest,
  getMySubscriptionRequest,
  getPoolOrderByIdRequest,
  submitPoolOrderBidRequest,
  takePoolOrderRequest,
} from "../../services/api";
import { arabicDurationUnit } from "../../utils/arTime";
import { OrderDetailsPageSkeleton } from "../../components/ui/Skeleton";
import { getFreelancerOrderEligibilityMessage } from "../../utils/freelancerEligibilityUi";

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

function typeLabel(projectType) {
  if (projectType === "fixed") return "سعر ثابت";
  if (projectType === "bidding") return "مزايدة";
  return "—";
}

function durationLabel(order) {
  if (!order?.durationValue || !order?.durationUnit) return "—";
  return `${order.durationValue} ${arabicDurationUnit(order.durationValue, order.durationUnit)}`;
}

export default function FreelancerOrderDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { push } = useToast();
  const { user, loading } = useAuth();
  const role = user?.primaryRole || user?.role;
  const isFreelancer = role === "freelancer";
  const backTo = "/dashboard/freelancer/orders";

  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(true);
  const [taking, setTaking] = useState(false);
  const [bidOpen, setBidOpen] = useState(false);
  const [bidBusy, setBidBusy] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [subscription, setSubscription] = useState(null);

  const canTake = useMemo(() => isFreelancer && Boolean(eligibility?.eligible), [isFreelancer, eligibility]);
  const ineligibleMessage = useMemo(() => {
    if (!isFreelancer || eligibility?.eligible !== false) return "";
    return getFreelancerOrderEligibilityMessage(eligibility, subscription);
  }, [isFreelancer, eligibility, subscription]);
  const isPricedBidding = useMemo(
    () => order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null,
    [order],
  );
  const fakeClaimOrBidPending = useMemo(
    () =>
      order?.orderSource === "fake" &&
      !isPricedBidding &&
      (order?.myBid?.status === "pending" || order?.myBid?.status === "accepted"),
    [order, isPricedBidding],
  );
  const isPoolAvailable = useMemo(() => {
    if (!order) return false;
    if (order.orderSource === "fake") {
      return Boolean(
        order?.isPublished &&
          order?.isOpenForPool &&
          !order?.assignedFreelancerId &&
          ["published", "open_for_freelancers", "open_for_bids"].includes(String(order?.orderStatus || "")),
      );
    }
    const sourceOk = ["admin_created", "super_admin_created", "client_created"].includes(order?.sourceType);
    return Boolean(
      sourceOk && order?.isPublished && order?.isOpenForPool && !order?.assignedFreelancerId && order?.orderStatus === "published",
    );
  }, [order]);

  const orderSourceForApi =
    searchParams.get("source") === "fake" || location.state?.orderSource === "fake" ? "fake" : null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy(true);
      try {
        const resPool = await getPoolOrderByIdRequest(id, { orderSource: orderSourceForApi });
        if (!cancelled) setOrder(resPool?.data?.order || null);
      } catch (e) {
        if (!cancelled) {
          push({ type: "error", title: "تعذر تحميل تفاصيل الطلب", message: e?.response?.data?.message || e?.message });
          navigate("/dashboard/freelancer/orders", { replace: true });
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, push, navigate, orderSourceForApi]);

  useEffect(() => {
    if (order?.orderSource === "fake" && searchParams.get("source") !== "fake") {
      setSearchParams({ source: "fake" }, { replace: true });
    }
  }, [order?.orderSource, searchParams, setSearchParams]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadSubscription() {
      if (!user || loading || !isFreelancer) {
        if (!cancelled) setSubscription(null);
        return;
      }
      try {
        const res = await getMySubscriptionRequest();
        if (!cancelled) setSubscription(res?.data?.subscription || null);
      } catch {
        if (!cancelled) setSubscription(null);
      }
    }
    loadSubscription();
    return () => {
      cancelled = true;
    };
  }, [user, loading, isFreelancer]);

  const take = async () => {
    setTaking(true);
    try {
      await takePoolOrderRequest(id, { orderSource: order?.orderSource === "fake" ? "fake" : undefined });
      push({
        type: "success",
        title: "تم تقديم الطلب",
        message: "تم تسجيل طلبك. سيراجع العميل الطلبات ثم يختار مستقلاً؛ راقب صفحة «طلباتي» بعد اعتماده.",
      });
      navigate("/dashboard/freelancer/my-orders");
    } catch (e) {
      push({ type: "error", title: "تعذر استلام الطلب", message: e?.response?.data?.message || e?.message });
      // If it was taken by someone else, get out of this page.
      navigate(backTo, { replace: true });
    } finally {
      setTaking(false);
    }
  };

  const submitBid = async (amount) => {
    setBidBusy(true);
    try {
      await submitPoolOrderBidRequest(id, { amount }, { orderSource: order?.orderSource === "fake" ? "fake" : undefined });
      push({ type: "success", title: "تم إرسال العرض", message: "سيتمكن العميل لاحقاً من مراجعة العروض." });
      setBidOpen(false);
      const resPool = await getPoolOrderByIdRequest(id, { orderSource: order?.orderSource === "fake" ? "fake" : orderSourceForApi });
      setOrder(resPool?.data?.order || null);
    } catch (e) {
      push({ type: "error", title: "تعذر إرسال العرض", message: e?.response?.data?.message || e?.message });
    } finally {
      setBidBusy(false);
    }
  };

  const metaRows = useMemo(() => {
    if (!order) return [];
    const categoryText = `${order?.category?.name || "—"} — ${order?.subSubcategory?.name || "—"}`;
    const budgetText =
      order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null
        ? `${formatMoney(order.bidBudgetMin)} – ${formatMoney(order.bidBudgetMax)} JOD`.trim()
        : order?.projectType === "bidding"
          ? "—"
          : `${formatMoney(order?.budget)} JOD`.trim();
    const typeAndBudgetText =
      order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null
        ? `${typeLabel(order?.projectType)} — ${budgetText}`
        : order?.projectType === "bidding"
          ? `${typeLabel(order?.projectType)}`
          : `${typeLabel(order?.projectType)} — ${budgetText}`;

    const base = [
      { label: "نوع المشروع / السعر", value: typeAndBudgetText, dir: "ltr" },
      { label: "مدة التسليم", value: durationLabel(order) },
      { label: "التصنيف / التصنيف الفرعي", value: categoryText },
      { label: "تاريخ الإنشاء", value: formatJoDate(order?.createdAt) },
    ];

    const extras = Array.isArray(order?.extraCategories) && order.extraCategories.length
      ? [{
        label: "تصنيفات إضافية",
        value: order.extraCategories
          .map((x) => `${x?.category?.name || "—"}${x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : ""}`)
          .join(" | "),
      }]
      : [];

    return [...base, ...extras];
  }, [order]);

  return (
    <main className="container page-content dash-shell order-details" dir="rtl">
      <header className="order-details__top">
        <div className="order-details__top-title">
          <h1 className="order-details__title">{busy ? "تفاصيل الطلب" : (order?.title || "تفاصيل الطلب")}</h1>
          {!busy && order?.trainingLabel ? (
            <p className="help" style={{ margin: "6px 0 0", opacity: 0.88 }}>
              {order.trainingLabel}
            </p>
          ) : null}
        </div>
        <div className="order-details__top-actions">
          <Link className="btn btn-secondary" to={backTo}>
            العودة للقائمة
          </Link>
          {isPoolAvailable && isPricedBidding ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canTake || bidBusy || order?.myBid?.status === "pending"}
              title={order?.myBid?.status === "pending" ? "لقد قدمت عرضاً لهذا الطلب." : ""}
              onClick={() => setBidOpen(true)}
            >
              {bidBusy ? "جارٍ الإرسال…" : order?.myBid?.status === "pending" ? "عرضك مُرسل" : "تقديم عرض سعر"}
            </button>
          ) : null}
          {isPoolAvailable && !isPricedBidding ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canTake || taking || order?.myClaim?.status === "pending" || fakeClaimOrBidPending}
              title={
                fakeClaimOrBidPending
                  ? "سبق أن سجّلت مشاركتك في هذا الطلب التجريبي."
                  : order?.myClaim?.status
                    ? order.myClaim.status === "pending"
                      ? "سبق أن تقدمت لهذا الطلب وهو قيد المراجعة."
                      : order.myClaim.status === "withdrawn"
                        ? "سبق أن تقدمت لهذا الطلب ثم قمت بسحبه."
                        : order.myClaim.status === "rejected"
                          ? "سبق أن تقدمت لهذا الطلب وتم رفض الطلب."
                          : `سبق أن تقدمت لهذا الطلب (الحالة: ${order.myClaim.status}).`
                    : !canTake
                      ? ineligibleMessage
                      : ""
              }
              onClick={take}
            >
              {taking ? "جارٍ الاستلام…" : fakeClaimOrBidPending ? "تم التسجيل" : "استلام الطلب"}
            </button>
          ) : null}
        </div>
      </header>

      {isFreelancer && eligibility?.eligible === false ? (
        <section className="card order-details__notice">
          <p className="help" style={{ margin: 0 }}>
            {ineligibleMessage}
          </p>
        </section>
      ) : null}

      {busy ? (
        <div style={{ marginTop: 12 }}>
          <OrderDetailsPageSkeleton />
        </div>
      ) : order ? (
        <section className="order-details__grid">
          <section className="order-details__main">
            <div className="order-details__desc">
              <div className="order-details__desc-head">
                <div className="order-details__desc-k">وصف المشروع</div>
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

      <BidAmountModal
        open={bidOpen}
        title={order ? `عرض سعر: ${order.title}` : ""}
        min={order?.bidBudgetMin}
        max={order?.bidBudgetMax}
        currency="JOD"
        busy={bidBusy}
        onClose={() => {
          if (!bidBusy) setBidOpen(false);
        }}
        onSubmit={submitBid}
      />
    </main>
  );
}

