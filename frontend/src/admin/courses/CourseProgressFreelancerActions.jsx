import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../../components/ui/Button";
import {
  activateSubscriptionCompanyRequest,
  assignPlanToFreelancerRequest,
  getFreelancerCurrentSubscriptionAdminRequest,
  getFreelancerEligibilityAdminRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import {
  activationStatusLabel,
  eligibilityReasonAdminMessage,
  formatPlanOrderValueRange,
  formatPlanPriceLabel,
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "../subscriptions/subscriptionAdminDisplay";
import { fetchAssignmentSubscriptionSummary } from "../subscriptions/assignmentSubscriptionSummary";

function errorMessage(err) {
  return err?.response?.data?.message || "تعذر تنفيذ الإجراء";
}

function formatJoDate(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
      timeZone: "Asia/Amman",
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function fullNameAr(assignment) {
  return [assignment?.firstName, assignment?.fatherName, assignment?.familyName].filter(Boolean).join(" ").trim();
}

/** Above `.oh-admin-courses__modal-backdrop` (1020) and send modal (1100). */
const PROGRESS_FREELANCER_MENU_Z_INDEX = 1110;

function computeFloatingMenuPosition(triggerEl) {
  const rect = triggerEl.getBoundingClientRect();
  const minWidth = Math.max(178, Math.round(rect.width));
  let left = rect.left;
  const top = rect.bottom + 6;
  const maxLeft = window.innerWidth - minWidth - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < 8) left = 8;
  let topPx = top;
  const estimatedHeight = 200;
  if (top + estimatedHeight > window.innerHeight - 8) {
    topPx = Math.max(8, rect.top - estimatedHeight - 6);
  }
  return { top: topPx, left, minWidth };
}

function InlineModal({ title, onClose, children, busy }) {
  const titleId = useId();
  return (
    <div
      className="oh-admin-courses__progress-action-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="card oh-admin-courses__progress-action-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="oh-admin-courses__progress-action-dialog__head">
          <h4 id={titleId} className="oh-admin-courses__progress-action-dialog__title">
            {title}
          </h4>
          <button type="button" className="oh-admin-courses__progress-action-dialog__close" onClick={onClose} disabled={busy} aria-label="إغلاق">
            ×
          </button>
        </div>
        <div className="oh-admin-courses__progress-action-dialog__body">{children}</div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   assignment: object;
 *   assignablePlans: object[];
 *   assignablePlansLoading?: boolean;
 *   onSubscriptionUpdate: (freelancerId: string, subscription: object | null) => void;
 * }} props
 */
export default function CourseProgressFreelancerActions({
  assignment,
  assignablePlans,
  assignablePlansLoading = false,
  onSubscriptionUpdate,
}) {
  const toast = useToast();
  const triggerRef = useRef(null);
  const portalMenuRef = useRef(null);
  const planSelectId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [busy, setBusy] = useState(null);
  const [modal, setModal] = useState(null);
  const [planPick, setPlanPick] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSub, setDetailsSub] = useState(null);
  const [detailsEligibility, setDetailsEligibility] = useState(null);

  const sub = assignment?.subscription;
  const subscriptionId = sub?.subscriptionId;
  const isApproved = String(sub?.activationStatus || "").toLowerCase() === "company_approved";
  const canActivate = Boolean(subscriptionId) && !isApproved;

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    setMenuPosition(computeFloatingMenuPosition(el));
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return undefined;
    }
    updateMenuPosition();
    const onReflow = () => updateMenuPosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      const t = e.target;
      if (triggerRef.current?.contains(t) || portalMenuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const attachId = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown, true);
      document.addEventListener("touchstart", onDown, true);
    }, 0);
    return () => {
      window.clearTimeout(attachId);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, [menuOpen]);

  const toggleMenu = useCallback(() => {
    setMenuOpen((open) => {
      const next = !open;
      if (next && triggerRef.current) {
        setMenuPosition(computeFloatingMenuPosition(triggerRef.current));
      }
      return next;
    });
  }, []);

  const refreshSummary = useCallback(async () => {
    const summary = await fetchAssignmentSubscriptionSummary(assignment.freelancerId, {
      getFreelancerCurrentSubscriptionAdminRequest,
      getFreelancerEligibilityAdminRequest,
    });
    onSubscriptionUpdate(assignment.freelancerId, summary);
    return summary;
  }, [assignment.freelancerId, onSubscriptionUpdate]);

  const handleActivate = async () => {
    if (!canActivate || busy) return;
    closeMenu();
    setBusy("activate");
    try {
      await activateSubscriptionCompanyRequest(subscriptionId);
      await refreshSummary();
      toast.success("تم تفعيل اشتراك المستقل بنجاح");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleAssignPlan = async () => {
    const planId = Number(planPick);
    if (!Number.isInteger(planId) || planId < 1 || busy) return;
    setBusy("plan");
    try {
      await assignPlanToFreelancerRequest({
        freelancerUserId: assignment.freelancerId,
        planId,
        notes: null,
      });
      await refreshSummary();
      toast.success("تم تغيير خطة المستقل بنجاح");
      setModal(null);
      setPlanPick("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const openDetails = () => {
    closeMenu();
    setModal("details");
  };

  const openChangePlan = () => {
    closeMenu();
    setPlanPick(sub?.planId ? String(sub.planId) : "");
    setModal("plan");
  };

  const openProfile = () => {
    closeMenu();
    setModal("profile");
  };

  useEffect(() => {
    if (modal !== "details") {
      setDetailsSub(null);
      setDetailsEligibility(null);
      return undefined;
    }
    let cancelled = false;
    setDetailsLoading(true);
    Promise.all([
      getFreelancerCurrentSubscriptionAdminRequest(assignment.freelancerId),
      getFreelancerEligibilityAdminRequest(assignment.freelancerId),
    ])
      .then(([subRes, elRes]) => {
        if (cancelled) return;
        setDetailsSub(subRes?.data?.subscription || null);
        setDetailsEligibility(elRes?.data || null);
      })
      .catch(() => {
        if (!cancelled) {
          setDetailsSub(null);
          setDetailsEligibility(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modal, assignment.freelancerId]);

  const displaySub = detailsSub || (sub ? {
    plan: { title: sub.planName },
    planId: sub.planId,
    activationStatus: sub.activationStatus,
    paymentStatus: sub.paymentStatus,
    status: sub.subscriptionStatus,
    expiryDate: sub.expiryDate,
  } : null);
  const displayEligibility = detailsEligibility || (sub
    ? { eligible: sub.canTakeOrders, reason: sub.eligibilityReason }
    : null);

  const menuPanel = menuOpen && menuPosition ? (
    <div
      ref={portalMenuRef}
      className="oh-admin-courses__progress-actions-portal"
      role="menu"
      style={{
        position: "fixed",
        top: menuPosition.top,
        left: menuPosition.left,
        minWidth: menuPosition.minWidth,
        zIndex: PROGRESS_FREELANCER_MENU_Z_INDEX,
        pointerEvents: "auto",
      }}
    >
      {canActivate ? (
        <button
          type="button"
          role="menuitem"
          className="oh-admin-courses__progress-actions-item"
          disabled={busy === "activate"}
          onClick={handleActivate}
        >
          {busy === "activate" ? "جاري التفعيل…" : "تفعيل الاشتراك"}
        </button>
      ) : isApproved ? (
        <span className="oh-admin-courses__progress-actions-item oh-admin-courses__progress-actions-item--muted" role="menuitem">
          مفعّل بالفعل
        </span>
      ) : (
        <span className="oh-admin-courses__progress-actions-item oh-admin-courses__progress-actions-item--muted" role="menuitem">
          لا يوجد اشتراك للتفعيل
        </span>
      )}
      <button type="button" role="menuitem" className="oh-admin-courses__progress-actions-item" disabled={!!busy} onClick={openChangePlan}>
        تغيير الخطة
      </button>
      <button type="button" role="menuitem" className="oh-admin-courses__progress-actions-item" disabled={!!busy} onClick={openDetails}>
        عرض تفاصيل الاشتراك
      </button>
      <button type="button" role="menuitem" className="oh-admin-courses__progress-actions-item" disabled={!!busy} onClick={openProfile}>
        عرض بيانات المستقل
      </button>
    </div>
  ) : null;

  return (
    <>
      <div
        className={`oh-admin-courses__progress-actions-menu${menuOpen ? " oh-admin-courses__progress-actions-menu--open" : ""}`}
      >
        <button
          ref={triggerRef}
          type="button"
          className="oh-admin-courses__progress-actions-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={toggleMenu}
        >
          إدارة المستقل ▾
        </button>
      </div>
      {menuPanel ? createPortal(menuPanel, document.body) : null}

      {modal === "details" ? (
        <InlineModal title="تفاصيل الاشتراك" busy={detailsLoading} onClose={() => !detailsLoading && setModal(null)}>
          {detailsLoading ? (
            <p className="help">جاري التحميل…</p>
          ) : (
            <dl className="oh-admin-courses__progress-action-dl">
              <div>
                <dt>الباقة الحالية</dt>
                <dd>{displaySub?.plan?.title || displaySub?.plan?.name || sub?.planName || "—"}</dd>
              </div>
              <div>
                <dt>حالة التفعيل</dt>
                <dd>{activationStatusLabel(displaySub?.activationStatus || sub?.activationStatus)}</dd>
              </div>
              <div>
                <dt>حالة الدفع</dt>
                <dd>{paymentStatusLabel(displaySub?.paymentStatus || sub?.paymentStatus)}</dd>
              </div>
              <div>
                <dt>حالة الاشتراك</dt>
                <dd>{subscriptionStatusLabel(displaySub?.status || sub?.subscriptionStatus)}</dd>
              </div>
              <div>
                <dt>تاريخ الانتهاء</dt>
                <dd>{formatJoDate(displaySub?.expiryDate || sub?.expiryDate)}</dd>
              </div>
              <div>
                <dt>استلام الطلبات</dt>
                <dd>{displayEligibility?.eligible ? "نعم" : "لا"}</dd>
              </div>
              {!displayEligibility?.eligible ? (
                <div>
                  <dt>السبب</dt>
                  <dd>
                    {eligibilityReasonAdminMessage(
                      displayEligibility?.reason || sub?.eligibilityReason,
                      displaySub,
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </InlineModal>
      ) : null}

      {modal === "plan" ? (
        <InlineModal title="تغيير الخطة" busy={busy === "plan"} onClose={() => busy !== "plan" && setModal(null)}>
          <p className="help oh-admin-courses__progress-action-hint">تغيير الباقة لا يؤثر على تقدم الدورة أو درجة الاختبار.</p>
          <label className="oh-admin-courses__progress-action-label" htmlFor={planSelectId}>
            اختر الباقة
          </label>
          <select
            id={planSelectId}
            className="oh-admin-courses__input"
            value={planPick}
            disabled={assignablePlansLoading || busy === "plan"}
            onChange={(e) => setPlanPick(e.target.value)}
          >
            <option value="">— اختر —</option>
            {(assignablePlans || []).map((p) => (
              <option key={p.id} value={p.id}>
                {[p.title || p.name, formatPlanOrderValueRange(p), formatPlanPriceLabel(p)].filter((x) => x && x !== "—").join(" · ")}
              </option>
            ))}
          </select>
          <div className="oh-admin-courses__progress-action-dialog__foot">
            <Button type="button" variant="secondary" disabled={busy === "plan"} onClick={() => setModal(null)}>
              إلغاء
            </Button>
            <Button type="button" disabled={!planPick || busy === "plan"} onClick={handleAssignPlan}>
              {busy === "plan" ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </div>
        </InlineModal>
      ) : null}

      {modal === "profile" ? (
        <InlineModal title="بيانات المستقل" busy={false} onClose={() => setModal(null)}>
          <dl className="oh-admin-courses__progress-action-dl">
            <div>
              <dt>الاسم</dt>
              <dd>{fullNameAr(assignment) || "—"}</dd>
            </div>
            <div>
              <dt>رقم الحساب</dt>
              <dd>{assignment.accountId || "—"}</dd>
            </div>
            <div>
              <dt>البريد</dt>
              <dd>{assignment.email || "—"}</dd>
            </div>
            {assignment.phone ? (
              <div>
                <dt>الهاتف</dt>
                <dd>{assignment.phone}</dd>
              </div>
            ) : null}
            <div>
              <dt>الباقة الحالية</dt>
              <dd>{sub?.planName || "—"}</dd>
            </div>
            <div>
              <dt>حالة التفعيل</dt>
              <dd>{activationStatusLabel(sub?.activationStatus)}</dd>
            </div>
          </dl>
        </InlineModal>
      ) : null}
    </>
  );
}
