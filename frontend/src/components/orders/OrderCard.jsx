import { useEffect, useMemo, useState } from "react";
import { arabicDurationUnit } from "../../utils/arTime";
import { orderHasAssignment } from "../../utils/orderPrivacyUi";

const ORDER_CURRENCY = "JOD";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function priceLabel(order) {
  if (order?.projectType === "bidding" && (order?.paymentAmount != null || order?.paymentCurrency)) {
    const paid = order?.paymentAmount != null ? formatMoney(order.paymentAmount) : "—";
    const cur = ORDER_CURRENCY;
    return `${paid}${cur ? ` ${cur}` : ""}`.trim();
  }
  if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
    const a = formatMoney(order.bidBudgetMin);
    const b = formatMoney(order.bidBudgetMax);
    const cur = ORDER_CURRENCY;
    return `${a} – ${b}${cur ? ` ${cur}` : ""}`.trim();
  }
  if (order?.projectType === "bidding") return "—";
  const amt = order?.budget != null ? formatMoney(order.budget) : "";
  const cur = ORDER_CURRENCY;
  if (!amt && !cur) return "—";
  return `${amt || "—"}${cur ? ` ${cur}` : ""}`.trim();
}

function shortText(text, max = 140) {
  const s = String(text || "").trim();
  if (!s) return "—";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

function showValue(v) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function yn(v) {
  if (v === true) return "نعم";
  if (v === false) return "لا";
  return "—";
}

/** Same labels as `PoolOrderCardCompact` (طلبات المعرض / صفحة الطلبات). */
function poolStatusBadge(order) {
  const s = order?.orderStatus;
  if (order?.isArchived) return { label: "مؤرشف", className: "oh-badge oh-badge--neutral" };
  if (s === "published") return { label: "متاح", className: "oh-badge oh-badge--warning" };
  if (s === "assigned") return { label: "مُسند", className: "oh-badge oh-badge--success" };
  if (s === "draft") return { label: "مسودة", className: "oh-badge oh-badge--neutral" };
  return { label: s || "—", className: "oh-badge oh-badge--neutral" };
}

function adminStatusBadge(order) {
  const s = order?.orderStatus;
  if (order?.isArchived) return { label: "مؤرشف", className: "oh-badge oh-badge--neutral" };
  if (s === "assigned") return { label: "مُسند", className: "oh-badge oh-badge--success" };
  if (s === "published") return { label: "منشور", className: "oh-badge oh-badge--warning" };
  if (s === "in_progress") return { label: "قيد التنفيذ", className: "oh-badge oh-badge--info" };
  if (s === "completed") return { label: "مكتمل", className: "oh-badge oh-badge--success" };
  if (s === "cancelled") return { label: "ملغي", className: "oh-badge oh-badge--danger" };
  if (s === "draft") return { label: "مسودة", className: "oh-badge oh-badge--neutral" };
  return { label: s || "—", className: "oh-badge oh-badge--neutral" };
}

function assignmentBadge(order) {
  if (orderHasAssignment(order)) return { label: "مُسند لفريلانسر", className: "oh-pill oh-pill--assigned" };
  return { label: "في المعرض", className: "oh-pill oh-pill--pool" };
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

function isPricedBiddingOrder(order) {
  return order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null;
}

function bidderDisplayName(bidUser) {
  if (bidUser?.displayName) return bidUser.displayName;
  const u = bidUser?.user || {};
  const full = [u.firstName, u.fatherName, u.familyName].filter(Boolean).join(" ").trim();
  return full || "—";
}

function timeLeftLabel(order) {
  const due = order?.dueAt ? new Date(order.dueAt) : null;
  if (!due || !Number.isFinite(due.getTime())) return null;

  const diffMs = due.getTime() - Date.now();
  if (diffMs <= 0) return "انتهت مدة المشروع.";

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

export default function OrderCard({
  order,
  footer,
  /** أزرار بجانب «عرض التفاصيل» (مثل استلام الطلب في صفحة الطلبات). */
  footerInline,
  showOrderCode = false,
  showAssignmentBadge = true,
  showAdminBadge = true,
  /** لوحة الإدارة: يظهر العنوان + السعر + مدة التسليم فقط حتى فتح «عرض التفاصيل». */
  compactSummary = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const showFull = !compactSummary || expanded;
  const badge = useMemo(
    () => (showAdminBadge ? adminStatusBadge(order) : poolStatusBadge(order)),
    [order, showAdminBadge],
  );
  const assign = useMemo(() => assignmentBadge(order), [order]);
  const skills = Array.isArray(order?.preferredSkills) ? order.preferredSkills : [];
  const skillsClean = skills.filter((s) => s != null);
  const extraCats = Array.isArray(order?.extraCategories) ? order.extraCategories : [];
  const [nowMs, setNowMs] = useState(() => Date.now());

  const categoryText = `${order?.category?.name || "—"}${order?.subSubcategory?.name ? ` • ${order.subSubcategory.name}` : ""}`;
  const pricedBidding = useMemo(() => isPricedBiddingOrder(order), [order]);
  const filesCount =
    Array.isArray(order?.files) && order.files.length
      ? order.files.length
      : Number(order?.filesCount ?? 0) || 0;
  const bidUsers = Array.isArray(order?.bidUsers) ? order.bidUsers : [];
  const applicantPoolCount =
    Number(order?.applicantsCount ?? order?.bidsCount ?? 0) ||
    (bidUsers.length ? bidUsers.length : 0);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    void nowMs;
    return timeLeftLabel(order);
  }, [order, nowMs]);

  const priceChipBody = pricedBidding
    ? order?.paymentAmount != null || order?.paymentCurrency
      ? `${order?.paymentAmount != null ? formatMoney(order.paymentAmount) : "—"} ${ORDER_CURRENCY}`
      : `${formatMoney(order.bidBudgetMin)} – ${formatMoney(order.bidBudgetMax)} ${ORDER_CURRENCY}`
    : order?.projectType === "bidding"
      ? "—"
      : `${formatMoney(order?.budget)} ${ORDER_CURRENCY}`;

  return (
    <article className={`oh-pool-card oh-pool-card--static${compactSummary ? " oh-pool-card--compact-summary" : ""}`.trim()}>
      {showFull ? (
        <header className="oh-pool-card__head">
          <div className="oh-pool-card__title-wrap">
            <div className="oh-pool-card__title">{order?.title || "—"}</div>
            <div className="oh-pool-card__sub">
              {showOrderCode && order?.orderCode ? (
                <span className="oh-code" title={order.orderCode}>
                  {order.orderCode}
                </span>
              ) : null}
              {showAssignmentBadge ? <span className={assign.className}>{assign.label}</span> : null}
            </div>
          </div>
          <div className="oh-pool-card__badges">
            <span className={badge.className}>{badge.label}</span>
            {showAdminBadge ? <span className="oh-badge oh-badge--primary">إداري</span> : null}
          </div>
        </header>
      ) : (
        <header className="oh-pool-card__head oh-pool-card__head--summary">
          <div className="oh-pool-card__title-wrap">
            <div className="oh-pool-card__title">{order?.title || "—"}</div>
          </div>
        </header>
      )}

      {showFull ? (
        <div className="oh-pool-card__meta">
          <span className="oh-mini-chip">{categoryText}</span>
          <span className="oh-mini-chip">النوع: {typeLabel(order?.projectType)}</span>
          <span className="oh-mini-chip">
            السعر:{" "}
            <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>
              {priceChipBody}
            </span>
          </span>
          <span className="oh-mini-chip">مدة التسليم: {durationLabel(order)}</span>
          <span className="oh-mini-chip">ملفات: {filesCount ? String(filesCount) : "لا توجد ملفات مضافة"}</span>
          {order?.projectType === "bidding" ? (
            <span className="oh-mini-chip">
              المتقدمون:{" "}
              {showAdminBadge && bidUsers.length
                ? `${bidUsers.slice(0, 2).map((b) => bidderDisplayName(b)).join("، ")}${bidUsers.length > 2 ? ` +${bidUsers.length - 2}` : ""}`
                : applicantPoolCount > 0
                  ? String(applicantPoolCount)
                  : "لا يوجد"}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <div className="oh-pool-card__meta oh-pool-card__meta--keyonly" aria-label="ملخص الطلب">
            <span className="oh-mini-chip oh-mini-chip--emph">
              السعر:{" "}
              <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>
                {priceChipBody}
              </span>
            </span>
            <span className="oh-mini-chip oh-mini-chip--emph">مدة التسليم: {durationLabel(order)}</span>
          </div>
          <p className="oh-pool-card__desc oh-pool-card__desc--compact-preview">{shortText(order?.description, 220)}</p>
        </>
      )}

      {showFull ? (
        <p className={`oh-pool-card__desc${expanded ? " oh-pool-card__desc--expanded" : ""}`.trim()}>
          {expanded ? showValue(order?.description) : shortText(order?.description, 140)}
        </p>
      ) : null}

      {showFull && remaining ? (
        <p className="help" style={{ margin: 0 }}>
          {remaining}
        </p>
      ) : null}

      {showFull && skillsClean.length ? (
        <div className="oh-pool-card__meta" aria-label="المهارات">
          {skillsClean.slice(0, 8).map((s, idx) => (
            <span className="oh-mini-chip" key={s?.id || s?.name || String(idx)}>
              {typeof s === "string" ? s : s?.name || "—"}
            </span>
          ))}
          {skillsClean.length > 8 ? <span className="oh-mini-chip">+{skillsClean.length - 8}</span> : null}
        </div>
      ) : null}

      {expanded ? (
        <>
          <section className="oh-order-card__meta" style={{ marginTop: 2 }}>
            <div className="oh-meta">
              <div className="oh-meta__label">السعر (ملخص)</div>
              <div className="oh-meta__value oh-meta__value--strong">
                <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>
                  {priceLabel(order)}
                </span>
              </div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">الحالة التقنية</div>
              <div className="oh-meta__value">{showValue(order?.orderStatus)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">منشور</div>
              <div className="oh-meta__value">{yn(order?.isPublished)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">مفتوح للمعرض</div>
              <div className="oh-meta__value">{yn(order?.isOpenForPool)}</div>
            </div>
            <div className="oh-meta">
              <div className="oh-meta__label">مؤرشف</div>
              <div className="oh-meta__value">{yn(order?.isArchived)}</div>
            </div>
            {showAdminBadge ? (
              <>
                <div className="oh-meta">
                  <div className="oh-meta__label">createdByUserId</div>
                  <div className="oh-meta__value">{showValue(order?.createdByUserId)}</div>
                </div>
                <div className="oh-meta">
                  <div className="oh-meta__label">assignedFreelancerId</div>
                  <div className="oh-meta__value">{showValue(order?.assignedFreelancerId)}</div>
                </div>
              </>
            ) : null}
            <div className="oh-meta">
              <div className="oh-meta__label">updatedAt</div>
              <div className="oh-meta__value">{showValue(order?.updatedAt)}</div>
            </div>
          </section>

          {extraCats.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 950, color: "#1b2341" }}>تصنيفات إضافية</div>
              <div className="chips">
                {extraCats.map((x, idx) => {
                  const c = x?.category?.name || "—";
                  const ss = x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : "";
                  return (
                    <span className="chip" key={`${x?.category?.id || idx}`}>
                      {c}
                      {ss}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <footer className="oh-pool-card__foot">
        <div className="oh-pool-card__actions">
          <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
          </button>
          {footerInline}
        </div>
        {footer}
      </footer>
    </article>
  );
}
