import '../../orders/data/pool_order_models.dart';
import 'plan_upgrade_cta.dart';
import '../../../core/i18n/i18n.dart';

String get poolPlanLockMessageAr => tr('هذا الطلب غير متاح لحسابك حاليًا.');

const poolPlanEligibilityReasonPlanTooLow = 'PLAN_TOO_LOW';
const poolPlanEligibilityReasonNoActivePlan = 'NO_ACTIVE_PLAN';
const poolPlanEligibilityReasonInternal = 'INTERNAL_PLAN_CONFIGURATION';

final poolPlanEligibilityMessagePlanTooLowAr = planTooLowHeadlineAr;
final poolPlanEligibilityMessageNoActivePlanAr = noActivePlanHeadlineAr;
final poolPlanEligibilityMessageInternalAr = internalPlanConfigHeadlineAr;

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
  if (props != null && props.mode == PlanUpgradeCtaMode.support) {
    return buildPlanUpgradeCopy(reason: props.reason).headline;
  }
  if (props != null && props.mode == PlanUpgradeCtaMode.upgrade) {
    return buildPlanUpgradeCopy(
      requiredTierCode: props.requiredTierCode,
      requiredPlanLabel: props.requiredPlanLabel,
      reason: props.reason,
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
    if (order.myBid?.isPending == true) return tr('تم إرسال عرضك — بانتظار المراجعة');
    if (order.myBid?.isAccepted == true) return tr('تم قبول عرضك');
    return null;
  }
  if (poolFixedParticipationPending(order)) {
    return tr('تم تسجيل مشاركتك — بانتظار المراجعة');
  }
  if (order.myClaim?.isAccepted == true) return tr('تم استلام الطلب');
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
