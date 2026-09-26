import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Search, X } from "lucide-react";
import Button from "../../components/ui/Button";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import Pagination from "../../components/common/Pagination";
import { useToast } from "../../components/ui/toastContext";
import {
  getSuperAdminUsersStatsRequest,
  listSuperAdminUsersRequest,
  getSuperAdminUserDetailRequest,
  patchSuperAdminUserAccountRequest,
  patchSuperAdminUserIdentityRequest,
  patchSuperAdminUserMembershipRequest,
  patchSuperAdminUserTrainingRequest,
  postSuperAdminUsersBulkActionsRequest,
  listAdminPlansRequest,
} from "../../services/api";
import "./superAdminUsersPage.css";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

const FILTER_TABS = [
  { id: "all", label: "الكل", countKey: "totals", params: {} },
  { id: "freelancers", label: "المستقلون", countKey: "freelancers", params: { role: "freelancer" } },
  { id: "clients", label: "العملاء", countKey: "clients", params: { role: "client" } },
  {
    id: "pending_activation",
    label: "تفعيل معلّق",
    countKey: "pendingActivation",
    params: { activationStatus: "company_pending" },
  },
  {
    id: "identity_review",
    label: "هوية قيد المراجعة",
    countKey: "identityPendingReview",
    params: { identityStatus: "pending_review" },
  },
  {
    id: "final_test",
    label: "اختبار نهائي",
    countKey: "pendingFinalTests",
    params: { hasPendingFinalTest: true },
  },
];

const DETAIL_TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "identity", label: "الهوية" },
  { id: "plan", label: "الباقة" },
  { id: "courses", label: "الدورات" },
  { id: "activity", label: "النشاط" },
  { id: "audit", label: "سجل الإدارة" },
];

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ العملية. حاول مجدداً.";
}

function formatJoDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
  }).format(d);
}

function formatJoDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function roleLabel(role) {
  const map = {
    freelancer: "مستقل",
    client: "عميل",
    admin: "أدمن",
    super_admin: "سوبر أدمن",
    financial_user: "مستخدم مالي",
  };
  return map[role] || role || "—";
}

function accountLabel(status) {
  if (status === "active") return "نشط";
  if (status === "inactive") return "معطّل";
  return status || "—";
}

function identityLabel(status) {
  const map = {
    none: "لا يوجد",
    pending_review: "بانتظار المراجعة",
    approved: "موافق عليه",
    rejected: "مرفوض",
  };
  return map[status] || status || "—";
}

function courseLabel(status) {
  const map = {
    none: "لا يوجد",
    assigned: "مُسند",
    in_progress: "قيد التقدم",
    pending_final_test: "اختبار نهائي",
    completed: "مكتمل",
  };
  return map[status] || status || "—";
}

function membershipLabel(status) {
  if (!status) return "لا يوجد";
  const map = {
    active: "نشط",
    cancelled: "ملغى",
    canceled: "ملغى",
    expired: "منتهٍ",
    pending: "معلّق",
  };
  return map[String(status).toLowerCase()] || status;
}

function toneForAccount(status) {
  return status === "active" ? "success" : status === "inactive" ? "inactive" : "neutral";
}

function toneForIdentity(status) {
  if (status === "approved") return "success";
  if (status === "pending_review") return "pending";
  if (status === "rejected") return "danger";
  return "neutral";
}

function toneForCourse(status) {
  if (status === "completed") return "success";
  if (status === "pending_final_test") return "warning";
  if (status === "in_progress") return "pending";
  return "neutral";
}

function downloadCsv(csvText, filename) {
  const blob = new Blob(["\uFEFF" + String(csvText || "")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function openProtectedPath(protectedPath) {
  const path = String(protectedPath || "").trim();
  if (!path || !path.startsWith("/")) return;
  window.open(path, "_blank", "noopener,noreferrer");
}

function ReasonModal({
  open,
  title,
  description,
  confirmLabel = "تأكيد",
  danger = false,
  busy = false,
  extra = null,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setLocalError("");
  }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setLocalError("سبب الإجراء مطلوب (٣ أحرف على الأقل).");
      return;
    }
    setLocalError("");
    await onConfirm(trimmed);
  };

  return (
    <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-sa-users-reason-title">
      <button type="button" className="oh-sa-users-modal__backdrop" aria-label="إغلاق" onClick={busy ? undefined : onClose} />
      <div className="oh-sa-users-modal__panel">
        <header className="oh-sa-users-modal__header">
          <h2 id="oh-sa-users-reason-title">{title}</h2>
          <button type="button" className="oh-sa-users-modal__close" onClick={onClose} disabled={busy} aria-label="إغلاق">
            ×
          </button>
        </header>
        <form className="oh-sa-users-modal__body" onSubmit={submit}>
          {description ? <p className="oh-sa-users-modal__desc">{description}</p> : null}
          {extra}
          <label className="oh-sa-users-field">
            <span>سبب الإجراء</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              required
              minLength={3}
              maxLength={2000}
              placeholder="اكتب سبب الإجراء…"
              disabled={busy}
            />
          </label>
          {localError ? <div className="oh-sa-users-modal__error">{localError}</div> : null}
          <footer className="oh-sa-users-modal__footer">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              إلغاء
            </Button>
            <Button type="submit" variant={danger ? "danger" : "primary"} disabled={busy}>
              {busy ? "جاري التنفيذ…" : confirmLabel}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function formatCount(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function UserRowActionsMenu({ user, open, onOpenChange, onEdit, onToggleStatus, onDelete }) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);
  const isActive = user.accountStatus === "active";

  useEffect(() => {
    if (!open) {
      setPos(null);
      return undefined;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = 168;
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 6, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const panel =
    open && pos
      ? createPortal(
          <div
            ref={panelRef}
            className="oh-sa-users-row-menu__panel"
            role="menu"
            style={{ top: pos.top, left: pos.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="oh-sa-users-row-menu__item"
              onClick={() => {
                onOpenChange(false);
                onEdit();
              }}
            >
              تعديل
            </button>
            <button
              type="button"
              role="menuitem"
              className="oh-sa-users-row-menu__item"
              onClick={() => {
                onOpenChange(false);
                onToggleStatus();
              }}
            >
              {isActive ? "تعطيل" : "تفعيل"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="oh-sa-users-row-menu__item oh-sa-users-row-menu__item--danger"
              onClick={() => {
                onOpenChange(false);
                onDelete();
              }}
            >
              حذف
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="oh-sa-users-row-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`oh-sa-users-row-menu__trigger${open ? " is-open" : ""}`}
        aria-label={`إجراءات ${user.fullName || user.email || user.id}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <MoreVertical size={18} strokeWidth={2.25} aria-hidden />
      </button>
      {panel}
    </div>
  );
}

function UserDetailDrawer({
  open,
  loading,
  error,
  detail,
  plans,
  onClose,
  onReload,
  onAction,
}) {
  const [tab, setTab] = useState("overview");
  const [accountDraft, setAccountDraft] = useState({
    firstName: "",
    fatherName: "",
    familyName: "",
    phone: "",
    whatsapp: "",
  });
  const [planId, setPlanId] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab("overview");
  }, [open, detail?.profile?.id]);

  useEffect(() => {
    const p = detail?.profile;
    if (!p) return;
    setAccountDraft({
      firstName: p.firstName || "",
      fatherName: p.fatherName || "",
      familyName: p.familyName || "",
      phone: p.phone || "",
      whatsapp: p.whatsapp || "",
    });
    setPlanId(detail?.subscription?.planId || "");
  }, [detail]);

  if (!open) return null;

  const profile = detail?.profile;
  const identity = detail?.identity;
  const subscription = detail?.subscription;
  const training = detail?.training;
  const activity = detail?.activity;
  const auditEvents = detail?.auditEvents || [];
  const blockers = detail?.blockers || [];

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-sa-users-drawer-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label="إغلاق" onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-sa-users-drawer-title">{profile?.fullName || profile?.email || "تفاصيل المستخدم"}</h2>
            {profile ? (
              <p className="oh-sa-users-drawer__sub" dir="ltr">
                {profile.email} · #{profile.id}
              </p>
            ) : null}
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>

        <nav className="oh-sa-users-tabs" aria-label="أقسام التفاصيل">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`oh-sa-users-tabs__btn${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="oh-sa-users-drawer__body">
          {loading ? <DashboardLoadingState label="جاري تحميل التفاصيل…" /> : null}
          {!loading && error ? <DashboardErrorState message={error} onRetry={onReload} /> : null}
          {!loading && !error && profile ? (
            <>
              {tab === "overview" ? (
                <div className="oh-sa-users-stack">
                  <div className="oh-sa-users-kv">
                    <div>
                      <span>الدور</span>
                      <strong>{roleLabel(profile.role)}</strong>
                    </div>
                    <div>
                      <span>الحساب</span>
                      <StatusBadge tone={toneForAccount(profile.accountStatus)}>
                        {accountLabel(profile.accountStatus)}
                      </StatusBadge>
                    </div>
                    <div>
                      <span>الهاتف</span>
                      <strong dir="ltr">{profile.phone || "—"}</strong>
                    </div>
                    <div>
                      <span>واتساب</span>
                      <strong dir="ltr">{profile.whatsapp || "—"}</strong>
                    </div>
                    <div>
                      <span>تاريخ الإنشاء</span>
                      <strong>{formatJoDate(profile.createdAt)}</strong>
                    </div>
                    <div>
                      <span>آخر نشاط</span>
                      <strong>{formatJoDateTime(profile.lastSeenAt)}</strong>
                    </div>
                  </div>

                  {blockers.length ? (
                    <div className="oh-sa-users-blockers">
                      <h3>عوائق</h3>
                      <ul>
                        {blockers.map((b) => (
                          <li key={b.code}>{b.message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="oh-sa-users-form-grid">
                    <label className="oh-sa-users-field">
                      <span>الاسم الأول</span>
                      <input
                        value={accountDraft.firstName}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, firstName: e.target.value }))}
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>اسم الأب</span>
                      <input
                        value={accountDraft.fatherName}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, fatherName: e.target.value }))}
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>العائلة</span>
                      <input
                        value={accountDraft.familyName}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, familyName: e.target.value }))}
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>الهاتف</span>
                      <input
                        value={accountDraft.phone}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, phone: e.target.value }))}
                        dir="ltr"
                      />
                    </label>
                    <label className="oh-sa-users-field">
                      <span>واتساب</span>
                      <input
                        value={accountDraft.whatsapp}
                        onChange={(e) => setAccountDraft((s) => ({ ...s, whatsapp: e.target.value }))}
                        dir="ltr"
                      />
                    </label>
                  </div>

                  <div className="oh-sa-users-actions-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          kind: "account",
                          title: "حفظ بيانات الحساب",
                          payload: { ...accountDraft },
                        })
                      }
                    >
                      حفظ البيانات
                    </Button>
                    <Button
                      type="button"
                      variant={profile.accountStatus === "active" ? "danger" : "primary"}
                      onClick={() =>
                        onAction({
                          kind: "account",
                          title:
                            profile.accountStatus === "active" ? "تعطيل الحساب" : "تفعيل الحساب",
                          danger: profile.accountStatus === "active",
                          payload: {
                            accountStatus: profile.accountStatus === "active" ? "inactive" : "active",
                          },
                        })
                      }
                    >
                      {profile.accountStatus === "active" ? "تعطيل الحساب" : "تفعيل الحساب"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === "identity" ? (
                <div className="oh-sa-users-stack">
                  <div className="oh-sa-users-kv">
                    <div>
                      <span>الحالة</span>
                      <StatusBadge tone={toneForIdentity(identity?.status)}>
                        {identityLabel(identity?.status)}
                      </StatusBadge>
                    </div>
                    <div>
                      <span>تاريخ الإرسال</span>
                      <strong>{formatJoDateTime(identity?.submittedAt)}</strong>
                    </div>
                    <div>
                      <span>تاريخ المراجعة</span>
                      <strong>{formatJoDateTime(identity?.reviewedAt)}</strong>
                    </div>
                    <div>
                      <span>إعادة الإرسال</span>
                      <strong>{identity?.resubmissionCount ?? 0}</strong>
                    </div>
                  </div>
                  {identity?.rejectionReason ? (
                    <p className="oh-sa-users-note">سبب الرفض: {identity.rejectionReason}</p>
                  ) : null}
                  <div className="oh-sa-users-docs">
                    {["front", "back"].map((side) => {
                      const doc = identity?.documents?.[side];
                      return (
                        <div key={side} className="oh-sa-users-doc">
                          <strong>{side === "front" ? "الوجه الأمامي" : "الوجه الخلفي"}</strong>
                          {doc?.protectedPath ? (
                            <Button type="button" variant="secondary" onClick={() => openProtectedPath(doc.protectedPath)}>
                              فتح الملف
                            </Button>
                          ) : (
                            <span className="oh-sa-users-muted">لا يوجد ملف</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="oh-sa-users-actions-row">
                    <Button
                      type="button"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: "الموافقة على الهوية",
                          payload: { action: "approve_identity" },
                        })
                      }
                    >
                      موافقة
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: "وضع الهوية قيد المراجعة",
                          payload: { action: "mark_pending_review" },
                        })
                      }
                    >
                      قيد المراجعة
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: "رفض الهوية",
                          danger: true,
                          payload: { action: "reject_identity" },
                        })
                      }
                    >
                      رفض
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        onAction({
                          kind: "identity",
                          title: "طلب إعادة رفع الهوية",
                          danger: true,
                          payload: { action: "request_resubmission" },
                        })
                      }
                    >
                      طلب إعادة الرفع
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === "plan" ? (
                <div className="oh-sa-users-stack">
                  <div className="oh-sa-users-kv">
                    <div>
                      <span>الباقة الحالية</span>
                      <strong>
                        {subscription?.plan?.title ||
                          subscription?.plan?.name ||
                          membershipLabel(subscription?.status)}
                      </strong>
                    </div>
                    <div>
                      <span>حالة الاشتراك</span>
                      <strong>{membershipLabel(subscription?.status)}</strong>
                    </div>
                    <div>
                      <span>التفعيل</span>
                      <strong>{subscription?.activationStatus || "—"}</strong>
                    </div>
                    <div>
                      <span>الانتهاء</span>
                      <strong>{formatJoDate(subscription?.expiryDate)}</strong>
                    </div>
                  </div>
                  <label className="oh-sa-users-field">
                    <span>اختيار باقة</span>
                    <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
                      <option value="">— اختر باقة —</option>
                      {(plans || []).map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.title || p.name || `باقة #${p.id}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="oh-sa-users-actions-row">
                    <Button
                      type="button"
                      disabled={!planId}
                      onClick={() =>
                        onAction({
                          kind: "membership",
                          title: subscription ? "تغيير الباقة" : "إسناد باقة",
                          payload: {
                            action: subscription ? "change_plan" : "assign_plan",
                            planId: Number(planId),
                          },
                        })
                      }
                    >
                      {subscription ? "تغيير الباقة" : "إسناد باقة"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!subscription}
                      onClick={() =>
                        onAction({
                          kind: "membership",
                          title: "إلغاء الباقة",
                          danger: true,
                          payload: { action: "cancel_plan" },
                        })
                      }
                    >
                      إلغاء الباقة
                    </Button>
                  </div>
                </div>
              ) : null}

              {tab === "courses" ? (
                <div className="oh-sa-users-stack">
                  <p className="oh-sa-users-muted">
                    الحالة الإجمالية: {courseLabel(training?.status)} · مكتمل {training?.completed ?? 0}/
                    {training?.total ?? 0}
                    {(training?.pendingFinalTest || 0) > 0
                      ? ` · اختبارات معلّقة: ${training.pendingFinalTest}`
                      : ""}
                  </p>
                  {(training?.courses || []).length === 0 ? (
                    <DashboardEmptyState title="لا توجد دورات" description="لا توجد دورات مرتبطة بهذا المستخدم." />
                  ) : (
                    <div className="oh-sa-users-table-wrap">
                      <table className="oh-sa-users-table oh-sa-users-table--compact">
                        <thead>
                          <tr>
                            <th>الدورة</th>
                            <th>التقدم</th>
                            <th>إجراءات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(training.courses || []).map((c) => (
                            <tr key={c.id}>
                              <td>{c.title || `دورة #${c.id}`}</td>
                              <td>
                                {c.progress?.percentage ?? 0}%
                                {c.courseCompletedAt ? " · مكتملة" : ""}
                                {c.isTestingEnabled ? " · اختبار" : ""}
                              </td>
                              <td>
                                <div className="oh-sa-users-table__actions">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      onAction({
                                        kind: "training",
                                        title: "تعليم الدورة مكتملة",
                                        payload: { action: "mark_course_completed", courseId: Number(c.id) },
                                      })
                                    }
                                  >
                                    إكمال
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      onAction({
                                        kind: "training",
                                        title: "تعليم الاختبار النهائي ناجحاً",
                                        payload: { action: "mark_final_test_passed", courseId: Number(c.id) },
                                      })
                                    }
                                  >
                                    نجاح الاختبار
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() =>
                                      onAction({
                                        kind: "training",
                                        title: "إعادة ضبط تقدم الدورة",
                                        danger: true,
                                        payload: { action: "reset_course_progress", courseId: Number(c.id) },
                                      })
                                    }
                                  >
                                    إعادة التقدم
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() =>
                                      onAction({
                                        kind: "training",
                                        title: "إعادة ضبط الاختبار النهائي",
                                        danger: true,
                                        payload: { action: "reset_final_test", courseId: Number(c.id) },
                                      })
                                    }
                                  >
                                    إعادة الاختبار
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}

              {tab === "activity" ? (
                <div className="oh-sa-users-kv">
                  <div>
                    <span>طلبات كعميل</span>
                    <strong>{activity?.ordersAsClient ?? 0}</strong>
                  </div>
                  <div>
                    <span>طلبات كمستقل</span>
                    <strong>{activity?.ordersAsFreelancer ?? 0}</strong>
                  </div>
                  <div>
                    <span>العروض</span>
                    <strong>{activity?.bids ?? 0}</strong>
                  </div>
                  <div>
                    <span>آخر ظهور</span>
                    <strong>{formatJoDateTime(activity?.lastSeenAt || profile.lastSeenAt)}</strong>
                  </div>
                </div>
              ) : null}

              {tab === "audit" ? (
                auditEvents.length === 0 ? (
                  <DashboardEmptyState title="لا يوجد سجل" description="لم تُسجَّل إجراءات إدارية بعد." />
                ) : (
                  <ul className="oh-sa-users-audit">
                    {auditEvents.map((ev) => (
                      <li key={ev.id}>
                        <div className="oh-sa-users-audit__top">
                          <strong>{ev.action}</strong>
                          <span>{formatJoDateTime(ev.createdAt)}</span>
                        </div>
                        <p>{ev.reason || "—"}</p>
                        <span className="oh-sa-users-muted">بواسطة: {ev.actorName || ev.actorAdminId || "—"}</span>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export default function SuperAdminUsersPage() {
  const { push } = useToast();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  const [selected, setSelected] = useState(() => new Set());
  const [plans, setPlans] = useState([]);
  const [detailUserId, setDetailUserId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [reasonModal, setReasonModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("inactive");
  const [rowMenuUserId, setRowMenuUserId] = useState(null);

  const tabParams = useMemo(() => {
    const tab = FILTER_TABS.find((t) => t.id === activeTab) || FILTER_TABS[0];
    return tab.params || {};
  }, [activeTab]);

  const loadStats = useCallback(async () => {
    try {
      setStatsError("");
      const res = await getSuperAdminUsersStatsRequest();
      setStats(res?.data?.stats || null);
    } catch (err) {
      setStatsError(errorMessage(err));
      setStats(null);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        ...tabParams,
      };
      if (searchQuery) params.q = searchQuery;
      const res = await listSuperAdminUsersRequest(params);
      setItems(res?.data?.items || []);
      setTotal(Number(res?.data?.total || 0));
      setTotalPages(Number(res?.data?.totalPages || 1));
      setSelected(new Set());
      setRowMenuUserId(null);
    } catch (err) {
      setError(errorMessage(err));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, tabParams, searchQuery]);

  const loadPlans = useCallback(async () => {
    try {
      const res = await listAdminPlansRequest(false);
      setPlans(res?.data?.plans || []);
    } catch {
      setPlans([]);
    }
  }, []);

  const loadDetail = useCallback(async (userId) => {
    if (!userId) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      const res = await getSuperAdminUserDetailRequest(userId);
      setDetail(res?.data || null);
    } catch (err) {
      setDetail(null);
      setDetailError(errorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadPlans();
  }, [loadStats, loadPlans]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (detailUserId) loadDetail(detailUserId);
  }, [detailUserId, loadDetail]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === searchQuery) return;
      setPage(1);
      setSearchQuery(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchQuery]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const selectTab = (tabId) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    setPage(1);
  };

  const openSearch = () => setSearchOpen(true);

  const closeSearch = () => {
    setSearchOpen(false);
    if (searchInput.trim()) {
      setSearchInput("");
      setSearchQuery("");
      setPage(1);
    }
  };

  const allSelected = items.length > 0 && items.every((u) => selected.has(String(u.id)));
  const selectedIds = useMemo(() => [...selected].map((id) => Number(id)), [selected]);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((u) => String(u.id))));
  };

  const toggleOne = (id) => {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const closeDetail = () => {
    setDetailUserId(null);
    setDetail(null);
    setDetailError("");
  };

  const runReasonedAction = async (reason) => {
    if (!reasonModal) return;
    setBusy(true);
    try {
      const { type } = reasonModal;
      if (type === "bulk") {
        const action = reasonModal.action;
        const payload = { ...(reasonModal.payload || {}) };
        const res = await postSuperAdminUsersBulkActionsRequest({
          userIds: selectedIds,
          action,
          payload,
          reason,
        });
        if (action === "export_selected_users_csv" && res?.data?.csv) {
          downloadCsv(res.data.csv, `users-export-${Date.now()}.csv`);
        }
        const ok = res?.data?.succeeded ?? selectedIds.length;
        const fail = res?.data?.failed ?? 0;
        push({
          type: fail ? "warning" : "success",
          message: fail
            ? `اكتمل جزئياً: نجح ${ok} وفشل ${fail}.`
            : `تم تنفيذ الإجراء الجماعي بنجاح (${ok}).`,
        });
        await Promise.all([loadUsers(), loadStats()]);
        if (detailUserId) await loadDetail(detailUserId);
      } else if (type === "detail") {
        const userId = reasonModal.userId;
        const kind = reasonModal.kind;
        const payload = { ...(reasonModal.payload || {}), reason };
        if (kind === "account") {
          await patchSuperAdminUserAccountRequest(userId, payload);
        } else if (kind === "identity") {
          await patchSuperAdminUserIdentityRequest(userId, payload);
        } else if (kind === "membership") {
          await patchSuperAdminUserMembershipRequest(userId, payload);
        } else if (kind === "training") {
          await patchSuperAdminUserTrainingRequest(userId, payload);
        }
        push({ type: "success", message: "تم حفظ التغيير بنجاح." });
        await Promise.all([loadUsers(), loadStats(), loadDetail(userId)]);
      }
      setReasonModal(null);
    } catch (err) {
      push({ type: "error", message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const openBulkModal = (action, title, opts = {}) => {
    if (!selectedIds.length) {
      push({ type: "warning", message: "اختر مستخدمين أولاً." });
      return;
    }
    setReasonModal({
      type: "bulk",
      action,
      title,
      description: opts.description || `سيتم تطبيق الإجراء على ${selectedIds.length} مستخدم.`,
      danger: Boolean(opts.danger),
      payload: opts.payload || {},
      confirmLabel: opts.confirmLabel || "تأكيد",
      extra: opts.extra || null,
    });
  };

  const openRowAccountModal = (user, { title, accountStatus, danger = false, description }) => {
    setRowMenuUserId(null);
    setReasonModal({
      type: "detail",
      userId: user.id,
      kind: "account",
      title,
      danger: Boolean(danger),
      payload: { accountStatus },
      description: description || "هذا إجراء حسّاس ويتطلب سبباً واضحاً.",
      confirmLabel: "تنفيذ",
    });
  };

  return (
    <DashboardShell>
      {statsError ? <p className="oh-sa-users-inline-error">{statsError}</p> : null}

      {selected.size > 0 ? (
        <div className="oh-sa-users-bulk" role="region" aria-label="إجراءات جماعية">
          <span className="oh-sa-users-bulk__count">محدّد: {selected.size}</span>
          <label className="oh-sa-users-field oh-sa-users-field--inline">
            <span>الحالة</span>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
              <option value="active">نشط</option>
              <option value="inactive">معطّل</option>
            </select>
          </label>
          <Button
            type="button"
            variant={bulkStatus === "inactive" ? "danger" : "secondary"}
            onClick={() =>
              openBulkModal("set_account_status", "تغيير حالة الحسابات", {
                danger: bulkStatus === "inactive",
                payload: { accountStatus: bulkStatus },
              })
            }
          >
            تغيير الحالة
          </Button>
          <label className="oh-sa-users-field oh-sa-users-field--inline">
            <span>باقة</span>
            <select value={bulkPlanId} onChange={(e) => setBulkPlanId(e.target.value)}>
              <option value="">— اختر —</option>
              {plans.map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.title || p.name || `#${p.id}`}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={!bulkPlanId}
            onClick={() =>
              openBulkModal("assign_plan", "إسناد باقة للمحددين", {
                payload: { planId: Number(bulkPlanId) },
              })
            }
          >
            إسناد باقة
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() =>
              openBulkModal("request_kyc_resubmission", "طلب إعادة رفع الهوية", {
                danger: true,
                description: "سيُطلب من المستخدمين المحددين إعادة رفع مستندات الهوية.",
              })
            }
          >
            طلب إعادة KYC
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              openBulkModal("export_selected_users_csv", "تصدير المستخدمين المحددين", {
                confirmLabel: "تصدير",
              })
            }
          >
            تصدير
          </Button>
          <Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>
            مسح التحديد
          </Button>
        </div>
      ) : null}

      <DashboardSection className="oh-sa-users-list-section">
        <header className="oh-sa-users-list-head">
          <div className="oh-sa-users-list-head__top">
            <div className="oh-sa-users-list-head__titles">
              <h2 className="oh-sa-users-list-head__title">قائمة المستخدمين</h2>
              {total ? (
                <p className="oh-sa-users-list-head__desc">{total.toLocaleString("en-US")} مستخدم</p>
              ) : null}
            </div>
            <div className={`oh-sa-users-toolbar__search${searchOpen ? " is-open" : ""}`}>
              {searchOpen ? (
                <>
                  <Search size={16} strokeWidth={2} className="oh-sa-users-toolbar__search-glyph" aria-hidden />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") closeSearch();
                    }}
                    placeholder="اسم، بريد، هاتف، أو رقم المستخدم"
                    aria-label="بحث عن مستخدم"
                  />
                  <button
                    type="button"
                    className="oh-sa-users-toolbar__search-clear"
                    onClick={closeSearch}
                    aria-label="إغلاق البحث"
                  >
                    <X size={14} strokeWidth={2.25} aria-hidden />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="oh-sa-users-toolbar__search-btn"
                  onClick={openSearch}
                  aria-label="بحث"
                >
                  <Search size={18} strokeWidth={2} aria-hidden />
                </button>
              )}
            </div>
          </div>

          <div className="oh-sa-users-toolbar__tabs" role="tablist" aria-label="تصفية المستخدمين">
            {FILTER_TABS.map((tab) => {
              const count = stats?.[tab.countKey];
              const showBadge = Number(count || 0) > 0;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`oh-sa-users-tab${isActive ? " is-active" : ""}`}
                  onClick={() => selectTab(tab.id)}
                >
                  <span className="oh-sa-users-tab__label">{tab.label}</span>
                  {showBadge ? (
                    <span className="oh-sa-users-tab__badge">{formatCount(count)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </header>

        {error && !loading ? <DashboardErrorState message={error} onRetry={loadUsers} /> : null}
        {loading ? (
          <DashboardLoadingState label="جاري تحميل المستخدمين…" />
        ) : items.length === 0 ? (
          <DashboardEmptyState title="لا يوجد مستخدمون" description="عدّل الفلاتر أو أعد المحاولة لاحقاً." />
        ) : (
          <>
            <div className="oh-sa-users-table-wrap oh-sa-users-table-wrap--airy">
              <table className="oh-sa-users-table oh-sa-users-table--airy">
                <thead>
                  <tr>
                    <th className="oh-sa-users-table__check">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="تحديد الكل" />
                    </th>
                    <th className="oh-sa-users-col oh-sa-users-col--user">المستخدم</th>
                    <th className="oh-sa-users-col oh-sa-users-col--role">الدور</th>
                    <th className="oh-sa-users-col oh-sa-users-col--account">الحساب</th>
                    <th className="oh-sa-users-col oh-sa-users-col--identity">الهوية</th>
                    <th className="oh-sa-users-col oh-sa-users-col--plan">الباقة</th>
                    <th className="oh-sa-users-col oh-sa-users-col--courses">الدورات</th>
                    <th className="oh-sa-users-col oh-sa-users-col--seen">آخر نشاط</th>
                    <th className="oh-sa-users-col oh-sa-users-col--created">تاريخ الإنشاء</th>
                    <th className="oh-sa-users-col oh-sa-users-col--actions">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((user) => {
                    const id = String(user.id);
                    const initial = String(user.fullName || user.email || "?")
                      .trim()
                      .slice(0, 1)
                      .toUpperCase();
                    return (
                      <tr key={id}>
                        <td className="oh-sa-users-table__check">
                          <input
                            type="checkbox"
                            checked={selected.has(id)}
                            onChange={() => toggleOne(id)}
                            aria-label={`تحديد ${user.fullName || user.email || id}`}
                          />
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--user">
                          <div className="oh-sa-users-person">
                            <span
                              className="oh-sa-users-person__avatar-wrap"
                              title={user.isOnline ? "متصل الآن" : "غير متصل"}
                            >
                              <span className="oh-sa-users-person__avatar" aria-hidden>
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt="" />
                                ) : (
                                  initial
                                )}
                              </span>
                              <span
                                className={
                                  user.isOnline
                                    ? "oh-sa-users-person__presence oh-sa-users-person__presence--online"
                                    : "oh-sa-users-person__presence oh-sa-users-person__presence--offline"
                                }
                                aria-label={user.isOnline ? "متصل الآن" : "غير متصل"}
                              />
                            </span>
                            <span className="oh-sa-users-person__text">
                              <strong className="oh-sa-users-person__name">{user.fullName || "بدون اسم"}</strong>
                              <span className="oh-sa-users-person__sub" dir="ltr">
                                {user.email || "—"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--role">
                          <span className="oh-sa-users-cell-primary">{roleLabel(user.role)}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--account">
                          <StatusBadge tone={toneForAccount(user.accountStatus)} className="oh-sa-users-pill">
                            {accountLabel(user.accountStatus)}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--identity">
                          <StatusBadge tone={toneForIdentity(user.identityStatus)} className="oh-sa-users-pill">
                            {identityLabel(user.identityStatus)}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--plan">
                          <div className="oh-sa-users-stack-cell">
                            <span className="oh-sa-users-cell-primary">{user.membershipTier || "—"}</span>
                            <span className="oh-sa-users-cell-sub">{membershipLabel(user.membershipStatus)}</span>
                          </div>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--courses">
                          <StatusBadge tone={toneForCourse(user.courseStatus)} className="oh-sa-users-pill">
                            {courseLabel(user.courseStatus)}
                            {user.coursesTotal
                              ? ` (${user.coursesCompleted || 0}/${user.coursesTotal})`
                              : ""}
                          </StatusBadge>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--seen">
                          <span className="oh-sa-users-cell-sub">{formatJoDateTime(user.lastSeenAt)}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--created">
                          <span className="oh-sa-users-cell-sub">{formatJoDate(user.createdAt)}</span>
                        </td>
                        <td className="oh-sa-users-col oh-sa-users-col--actions">
                          <UserRowActionsMenu
                            user={user}
                            open={rowMenuUserId === id}
                            onOpenChange={(next) => setRowMenuUserId(next ? id : null)}
                            onEdit={() => setDetailUserId(user.id)}
                            onToggleStatus={() =>
                              openRowAccountModal(user, {
                                title:
                                  user.accountStatus === "active" ? "تعطيل الحساب" : "تفعيل الحساب",
                                accountStatus: user.accountStatus === "active" ? "inactive" : "active",
                                danger: user.accountStatus === "active",
                              })
                            }
                            onDelete={() =>
                              openRowAccountModal(user, {
                                title: "حذف الحساب",
                                accountStatus: "inactive",
                                danger: true,
                                description:
                                  "سيتم تعطيل الحساب ومنع تسجيل الدخول. هذا إجراء حسّاس ويتطلب سبباً واضحاً.",
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="oh-sa-users-pagination">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={loading} />
            </div>
          </>
        )}
      </DashboardSection>

      <UserDetailDrawer
        open={Boolean(detailUserId)}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        plans={plans}
        onClose={closeDetail}
        onReload={() => loadDetail(detailUserId)}
        onAction={(spec) =>
          setReasonModal({
            type: "detail",
            userId: detailUserId,
            kind: spec.kind,
            title: spec.title,
            danger: Boolean(spec.danger),
            payload: spec.payload,
            description: "هذا إجراء حسّاس ويتطلب سبباً واضحاً.",
            confirmLabel: "تنفيذ",
          })
        }
      />

      <ReasonModal
        open={Boolean(reasonModal)}
        title={reasonModal?.title || ""}
        description={reasonModal?.description}
        confirmLabel={reasonModal?.confirmLabel}
        danger={reasonModal?.danger}
        busy={busy}
        extra={reasonModal?.extra}
        onClose={() => (busy ? null : setReasonModal(null))}
        onConfirm={runReasonedAction}
      />
    </DashboardShell>
  );
}
