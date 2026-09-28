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
import "../../i18n/coursesResources";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  activationStatusLabel,
  adminSubscriptionActivationMenuLabel,
  describeFreelancerAdminEligibilityState,
  eligibilityReasonAdminMessage,
  formatPlanOrderValueRange,
  formatPlanPriceLabel,
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "../subscriptions/subscriptionAdminDisplay";
import { fetchAssignmentSubscriptionSummary } from "../subscriptions/assignmentSubscriptionSummary";

function errorMessage(err, t) {
  return err?.response?.data?.message || t("courses.errors.actionFailed");
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
  const { t } = useTranslation();
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
          <button type="button" className="oh-admin-courses__progress-action-dialog__close" onClick={onClose} disabled={busy} aria-label={t("courses.common.close")}>
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
  const { t } = useTranslation();
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
      // Staff path: backend requires approved KYC (or Super Admin override elsewhere).
      await activateSubscriptionCompanyRequest(subscriptionId);
      await refreshSummary();
      toast.success(t("courses.toast.subscriptionActivated"));
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(null);
    }
  };

  const handleAssignPlan = async () => {
    const planId = Number(planPick);
    if (!Number.isInteger(planId) || planId < 1 || busy) return;
    setBusy("plan");
    try {
      const res = await assignPlanToFreelancerRequest({
        freelancerUserId: assignment.freelancerId,
        planId,
        notes: null,
      });
      await refreshSummary();
      const eligible = res?.data?.eligibility?.eligible === true;
      toast.success(
        eligible
          ? t("courses.toast.planAssignedEligible")
          : t("courses.toast.planAssignedReview"),
      );
      setModal(null);
      setPlanPick("");
    } catch (err) {
      toast.error(errorMessage(err, t));
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
    ? {
        eligible: sub.canTakeOrders,
        reason: sub.eligibilityReason,
        activationFeeStatus: detailsEligibility?.activationFeeStatus || null,
      }
    : null);
  const eligibilityState = describeFreelancerAdminEligibilityState({
    eligibility: displayEligibility,
    subscription: displaySub || sub,
    activationFeeStatus: displayEligibility?.activationFeeStatus || null,
  });
  const activationMenuLabel = adminSubscriptionActivationMenuLabel({
    isApproved,
    canActivate,
    eligibility: displayEligibility || {
      eligible: sub?.canTakeOrders,
      reason: sub?.eligibilityReason,
    },
    subscription: displaySub || sub,
    activationFeeStatus: displayEligibility?.activationFeeStatus || null,
  });

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
          {busy === "activate" ? t("courses.progressActions.activating") : t("courses.progressActions.activateSubscription")}
        </button>
      ) : (
        <span className="oh-admin-courses__progress-actions-item oh-admin-courses__progress-actions-item--muted" role="menuitem">
          {activationMenuLabel || t("courses.progressActions.noSubscription")}
        </span>
      )}
      <button type="button" role="menuitem" className="oh-admin-courses__progress-actions-item" disabled={!!busy} onClick={openChangePlan}>
        {t("courses.progressActions.changePlan")}
      </button>
      <button type="button" role="menuitem" className="oh-admin-courses__progress-actions-item" disabled={!!busy} onClick={openDetails}>
        {t("courses.progressActions.subscriptionDetails")}
      </button>
      <button type="button" role="menuitem" className="oh-admin-courses__progress-actions-item" disabled={!!busy} onClick={openProfile}>
        {t("courses.progressActions.freelancerProfile")}
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
          {t("courses.progressActions.manageFreelancer")}
        </button>
      </div>
      {menuPanel ? createPortal(menuPanel, document.body) : null}

      {modal === "details" ? (
        <InlineModal title={t("courses.progressActions.subscriptionDetailsTitle")} busy={detailsLoading} onClose={() => !detailsLoading && setModal(null)}>
          {detailsLoading ? (
            <p className="help">{t("courses.common.loading")}</p>
          ) : (
            <dl className="oh-admin-courses__progress-action-dl">
              <div>
                <dt>{t("courses.progressActions.currentPlan")}</dt>
                <dd>{displaySub?.plan?.title || displaySub?.plan?.name || sub?.planName || "—"}</dd>
              </div>
              <div>
                <dt>{t("courses.progressActions.companyApproval")}</dt>
                <dd>{activationStatusLabel(displaySub?.activationStatus || sub?.activationStatus)}</dd>
              </div>
              <div>
                <dt>{t("courses.progressActions.paymentStatus")}</dt>
                <dd>{paymentStatusLabel(displaySub?.paymentStatus || sub?.paymentStatus)}</dd>
              </div>
              <div>
                <dt>{t("courses.progressActions.subscriptionStatus")}</dt>
                <dd>{subscriptionStatusLabel(displaySub?.status || sub?.subscriptionStatus)}</dd>
              </div>
              <div>
                <dt>{t("courses.progressActions.expiryDate")}</dt>
                <dd>{formatJoDate(displaySub?.expiryDate || sub?.expiryDate)}</dd>
              </div>
              <div>
                <dt>{t("courses.progressActions.orderEligibility")}</dt>
                <dd>{eligibilityState.label}</dd>
              </div>
              <div>
                <dt>{t("courses.progressActions.canTakeOrders")}</dt>
                <dd>{displayEligibility?.eligible ? t("courses.common.yes") : t("courses.common.no")}</dd>
              </div>
              {displayEligibility?.reason ? (
                <div>
                  <dt>{t("courses.progressActions.eligibilityCode")}</dt>
                  <dd>
                    {eligibilityReasonAdminMessage(
                      displayEligibility?.reason || sub?.eligibilityReason,
                      displaySub,
                    )}
                  </dd>
                </div>
              ) : null}
              {displayEligibility?.activationFeeStatus ? (
                <div>
                  <dt>{t("courses.progressActions.activationFee")}</dt>
                  <dd>
                    {displayEligibility.activationFeeStatus.enabled === false
                      ? t("courses.progressActions.feeNotRequired")
                      : displayEligibility.activationFeeStatus.needsPayment
                      ? t("courses.progressActions.feeUnpaid")
                      : displayEligibility.activationFeeStatus.isCurrent
                        ? t("courses.progressActions.feePaidCurrent")
                        : "—"}
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </InlineModal>
      ) : null}

      {modal === "plan" ? (
        <InlineModal title={t("courses.progressActions.changePlanTitle")} busy={busy === "plan"} onClose={() => busy !== "plan" && setModal(null)}>
          <p className="help oh-admin-courses__progress-action-hint">{t("courses.progressActions.planChangeHint")}</p>
          <p className="help oh-admin-courses__progress-action-hint" role="note">
            {t("courses.progressActions.offlinePlanHint")}
          </p>
          <label className="oh-admin-courses__progress-action-label" htmlFor={planSelectId}>
            {t("courses.progressActions.choosePlan")}
          </label>
          <select
            id={planSelectId}
            className="oh-admin-courses__input"
            value={planPick}
            disabled={assignablePlansLoading || busy === "plan"}
            onChange={(e) => setPlanPick(e.target.value)}
          >
            <option value="">{t("courses.progressActions.choosePlaceholder")}</option>
            {(assignablePlans || []).map((p) => (
              <option key={p.id} value={p.id}>
                {[p.title || p.name, formatPlanOrderValueRange(p), formatPlanPriceLabel(p)].filter((x) => x && x !== "—").join(" · ")}
              </option>
            ))}
          </select>
          <div className="oh-admin-courses__progress-action-dialog__foot">
            <Button type="button" variant="secondary" disabled={busy === "plan"} onClick={() => setModal(null)}>
              {t("courses.common.cancel")}
            </Button>
            <Button type="button" disabled={!planPick || busy === "plan"} onClick={handleAssignPlan}>
              {busy === "plan" ? t("courses.progressActions.saving") : t("courses.common.save")}
            </Button>
          </div>
        </InlineModal>
      ) : null}

      {modal === "profile" ? (
        <InlineModal title={t("courses.progressActions.freelancerProfileTitle")} busy={false} onClose={() => setModal(null)}>
          <dl className="oh-admin-courses__progress-action-dl">
            <div>
              <dt>{t("courses.progressActions.name")}</dt>
              <dd>{fullNameAr(assignment) || "—"}</dd>
            </div>
            <div>
              <dt>{t("courses.progressActions.accountId")}</dt>
              <dd>{assignment.accountId || "—"}</dd>
            </div>
            <div>
              <dt>{t("courses.progressActions.email")}</dt>
              <dd>{assignment.email || "—"}</dd>
            </div>
            {assignment.phone ? (
              <div>
                <dt>{t("courses.progressActions.phone")}</dt>
                <dd>{assignment.phone}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("courses.progressActions.currentPlan")}</dt>
              <dd>{sub?.planName || "—"}</dd>
            </div>
            <div>
              <dt>{t("courses.progressActions.activationState")}</dt>
              <dd>{activationStatusLabel(sub?.activationStatus)}</dd>
            </div>
          </dl>
        </InlineModal>
      ) : null}
    </>
  );
}
