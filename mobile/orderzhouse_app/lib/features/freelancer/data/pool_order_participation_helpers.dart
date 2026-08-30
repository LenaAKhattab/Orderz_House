import '../../orders/data/pool_order_models.dart';
import 'plan_upgrade_cta.dart';

const poolPlanLockMessageAr = 'هذا الطلب غير متاح لحسابك حاليًا.';

const poolPlanEligibilityReasonPlanTooLow = 'PLAN_TOO_LOW';
const poolPlanEligibilityReasonNoActivePlan = 'NO_ACTIVE_PLAN';
const poolPlanEligibilityReasonInternal = 'INTERNAL_PLAN_CONFIGURATION';

const poolPlanEligibilityMessagePlanTooLowAr =
    'هذا الطلب متاح لباقات أعلى. قم بترقية خطتك لاستلامه.';
const poolPlanEligibilityMessageNoActivePlanAr = 'فعّل باقتك أولاً لاستلام الطلبات.';
const poolPlanEligibilityMessageInternalAr =
    'تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.';

final _legacyPlanCorrectionRe = RegExp(r'الخطة بحاجة إلى تصحيح');

bool isPoolOrderLockedByPlan(PoolOrder order) => order.isPlanLocked;

PlanUpgradeCtaProps? poolOrderPlanUpgradeProps(PoolOrder order) {
  final pe = order.poolEligibility;
  return planUpgradePropsFromPoolEligibility(
    isLockedByPlan: pe?.isLockedByPlan == true || order.isPlanLocked,
    planConfigurationError: pe?.planConfigurationError,
    requiredTierCode: pe?.requiredTierCode,
    requiredPlanLabel: pe?.requiredPlanLabel ?? pe?.suggestedUpgradePlanTitle,
    lockReason: pe?.lockReason,
    reasonCode: pe?.reasonCode,
  );
}

String? _messageForReasonCode(String? code) {
  switch ((code ?? '').trim()) {
    case poolPlanEligibilityReasonPlanTooLow:
      return poolPlanEligibilityMessagePlanTooLowAr;
    case poolPlanEligibilityReasonNoActivePlan:
      return poolPlanEligibilityMessageNoActivePlanAr;
    case poolPlanEligibilityReasonInternal:
      return poolPlanEligibilityMessageInternalAr;
    default:
      return null;
  }
}

String poolPlanLockUserMessage(PoolOrder order) {
  final pe = order.poolEligibility;
  final fromCode = _messageForReasonCode(pe?.reasonCode);
  if (fromCode != null) return fromCode;

  if (pe?.planConfigurationError == true) {
    return poolPlanEligibilityMessageInternalAr;
  }

  final props = poolOrderPlanUpgradeProps(order);
  if (props != null) {
    // Prefer product PLAN_TOO_LOW copy over older tier-specific headline.
    if ((props.reason == poolPlanEligibilityReasonPlanTooLow) ||
        (props.reason.contains('باق') || props.reason == 'plan_locked' || props.reason == 'غير متاح لباقتك')) {
      return poolPlanEligibilityMessagePlanTooLowAr;
    }
    return buildPlanUpgradeCopy(
      requiredTierCode: props.requiredTierCode,
      requiredPlanLabel: props.requiredPlanLabel,
    ).headline;
  }

  final reason = pe?.lockReason?.trim();
  if (reason != null && reason.isNotEmpty) {
    if (_legacyPlanCorrectionRe.hasMatch(reason)) {
      return poolPlanEligibilityMessageInternalAr;
    }
    return reason;
  }
  return poolPlanLockMessageAr;
}

bool isPoolFixedApplicationOrder(PoolOrder order) {
  return order.projectType == 'fixed' && order.myBid != null && order.myClaim == null;
}

bool poolFixedParticipationPending(PoolOrder order) {
  if (order.projectType != 'fixed') return false;
  final claim = order.myClaim;
  if (claim != null && (claim.isPending || claim.isAccepted)) return true;
  if (isPoolFixedApplicationOrder(order) &&
      order.myBid != null &&
      (order.myBid!.isPending || order.myBid!.isAccepted)) {
    return true;
  }
  return false;
}

bool isPoolOrderTakenAsAssignment(PoolOrder order) {
  if (order.hasAssignedFreelancer) return true;
  final received = order.receivedAt;
  return received != null && received.trim().isNotEmpty;
}

String? poolParticipationStatusLabelAr(PoolOrder order) {
  if (order.projectType == 'bidding') {
    if (order.myBid?.isPending == true) return 'تم إرسال عرضك — بانتظار المراجعة';
    if (order.myBid?.isAccepted == true) return 'تم قبول عرضك';
    return null;
  }
  if (poolFixedParticipationPending(order)) {
    return 'تم تسجيل مشاركتك — بانتظار المراجعة';
  }
  if (order.myClaim?.isAccepted == true) return 'تم استلام الطلب';
  return null;
}

bool poolFreelancerCanTakeOrBid(PoolOrder order) {
  if (isPoolOrderLockedByPlan(order)) return false;
  if (order.projectType == 'bidding') {
    return order.myBid?.isPending != true;
  }
  if (order.projectType == 'fixed') {
    return !poolFixedParticipationPending(order) && !isPoolOrderTakenAsAssignment(order);
  }
  return true;
}
