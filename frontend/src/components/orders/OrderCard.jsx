import { useEffect, useMemo, useState } from "react";
import { arabicDurationUnit } from "../../utils/arTime";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  // Force English digits everywhere in UI
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function priceLabel(order) {
  if (order?.projectType === "bidding" && order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
    const a = formatMoney(order.bidBudgetMin);
    const b = formatMoney(order.bidBudgetMax);
    const cur = String(order?.currencyCode || "").trim();
    return `${a} – ${b}${cur ? ` ${cur}` : ""}`.trim();
  }
  if (order?.projectType === "bidding") return "—";
  const amt = order?.budget != null ? formatMoney(order.budget) : "";
  const cur = String(order?.currencyCode || "").trim();
  if (!amt && !cur) return "—";
  return `${amt || "—"}${cur ? ` ${cur}` : ""}`.trim();
}

function shortText(text, max = 120) {
  const s = String(text || "").trim();
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

function statusBadge(order) {
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
  if (order?.assignedFreelancerId) return { label: "مُسند لفريلانسر", className: "oh-pill oh-pill--assigned" };
  return { label: "في الحوض", className: "oh-pill oh-pill--pool" };
}

const NO_FILES_ADDED_AR = "لا توجد ملفات مضافة";

function filesLabel(order) {
  const files = Array.isArray(order?.files) ? order.files : [];
  if (files.length === 0) return NO_FILES_ADDED_AR;
  const names = files
    .map((f) => f?.originalName || f?.name || f?.fileName || f?.filePath || "")
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (names.length === 0) return `${files.length} ملف`;
  const head = names.slice(0, 2).join("، ");
  const more = names.length > 2 ? ` +${names.length - 2}` : "";
  return `${head}${more}`;
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
  showOrderCode = true,
  showAssignmentBadge = true,
  showAdminBadge = true,
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = useMemo(() => statusBadge(order), [order]);
  const assign = useMemo(() => assignmentBadge(order), [order]);
  const skills = Array.isArray(order?.preferredSkills) ? order.preferredSkills : [];
  const filesText = useMemo(() => filesLabel(order), [order]);
  const extraCats = Array.isArray(order?.extraCategories) ? order.extraCategories : [];
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    void nowMs;
    return timeLeftLabel(order);
  }, [order, nowMs]);

  return (
    <article className="oh-order-card">
      <header className="oh-order-card__head">
        <div className="oh-order-card__title-wrap">
          <div className="oh-order-card__title">{order?.title || "—"}</div>
          <div className="oh-order-card__id-row">
            {showOrderCode ? (
              <span className="oh-code" title={order?.orderCode || ""}>
                {order?.orderCode || "—"}
              </span>
            ) : null}
            {showAssignmentBadge ? <span className={assign.className}>{assign.label}</span> : null}
          </div>
        </div>
        <div className="oh-order-card__badges">
          <span className={badge.className}>{badge.label}</span>
          {showAdminBadge ? <span className="oh-badge oh-badge--primary">إداري</span> : null}
        </div>
      </header>

      <p className="oh-order-card__desc">{expanded ? showValue(order?.description) : shortText(order?.description, 180)}</p>

      <section className="oh-order-card__meta">
        <div className="oh-meta">
          <div className="oh-meta__label">السعر</div>
          <div className="oh-meta__value oh-meta__value--strong">
            <span dir="ltr" style={{ unicodeBidi: "plaintext" }}>{priceLabel(order)}</span>
          </div>
        </div>
        <div className="oh-meta">
          <div className="oh-meta__label">النوع</div>
          <div className="oh-meta__value">{typeLabel(order?.projectType)}</div>
        </div>
        <div className="oh-meta">
          <div className="oh-meta__label">مدة التسليم</div>
          <div className="oh-meta__value">{durationLabel(order)}</div>
        </div>
        <div className="oh-meta">
          <div className="oh-meta__label">التصنيف</div>
          <div className="oh-meta__value">
            {order?.category?.name ? order.category.name : "—"}
            {order?.subSubcategory?.name ? ` • ${order.subSubcategory.name}` : ""}
          </div>
        </div>
        <div className="oh-meta">
          <div className="oh-meta__label">الملفات</div>
          <div
            className="oh-meta__value"
            title={Array.isArray(order?.files) && order.files.length && filesText !== NO_FILES_ADDED_AR ? filesText : ""}
          >
            {filesText}
          </div>
        </div>
      </section>

      {remaining ? (
        <p className="help" style={{ marginTop: 6, marginBottom: 0 }}>
          {remaining}
        </p>
      ) : null}

      {skills.length ? (
        <div className="oh-order-card__skills" aria-label="Preferred skills">
          {skills.slice(0, 10).map((s) => (
            <span className="oh-skill" key={s.id || s.name}>
              {s.name}
            </span>
          ))}
          {skills.length > 10 ? <span className="oh-skill oh-skill--more">+{skills.length - 10}</span> : null}
        </div>
      ) : null}

      {expanded ? (
        <section className="oh-order-card__meta">
          <div className="oh-meta">
            <div className="oh-meta__label">الحالة التقنية</div>
            <div className="oh-meta__value">{showValue(order?.orderStatus)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">منشور</div>
            <div className="oh-meta__value">{yn(order?.isPublished)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">مفتوح للحوض</div>
            <div className="oh-meta__value">{yn(order?.isOpenForPool)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">مؤرشف</div>
            <div className="oh-meta__value">{yn(order?.isArchived)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">createdByUserId</div>
            <div className="oh-meta__value">{showValue(order?.createdByUserId)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">assignedFreelancerId</div>
            <div className="oh-meta__value">{showValue(order?.assignedFreelancerId)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">createdAt</div>
            <div className="oh-meta__value">{showValue(order?.createdAt)}</div>
          </div>
          <div className="oh-meta">
            <div className="oh-meta__label">updatedAt</div>
            <div className="oh-meta__value">{showValue(order?.updatedAt)}</div>
          </div>
        </section>
      ) : null}

      {expanded && extraCats.length ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 950, color: "#1b2341" }}>تصنيفات إضافية</div>
          <div className="chips">
            {extraCats.map((x, idx) => {
              const c = x?.category?.name || "—";
              const ss = x?.subSubcategory?.name ? ` • ${x.subSubcategory.name}` : "";
              return (
                <span className="chip" key={`${x?.category?.id || idx}`}>
                  {c}{ss}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
        </button>
      </div>

      {footer ? <div className="oh-order-card__footer">{footer}</div> : null}
    </article>
  );
}

