import '../../orders/data/pool_order_models.dart';
import 'plan_upgrade_cta.dart';

const poolPlanLockMessageAr = 'هذا الطلب غير متاح لحسابك حاليًا.';

bool isPoolOrderLockedByPlan(PoolOrder order) => order.isPlanLocked;

PlanUpgradeCtaProps? poolOrderPlanUpgradeProps(PoolOrder order) {
  final pe = order.poolEligibility;
  return planUpgradePropsFromPoolEligibility(
    isLockedByPlan: pe?.isLockedByPlan == true || order.isPlanLocked,
    planConfigurationError: pe?.planConfigurationError,
    requiredTierCode: pe?.requiredTierCode,
    requiredPlanLabel: pe?.requiredPlanLabel ?? pe?.suggestedUpgradePlanTitle,
    lockReason: pe?.lockReason,
  );
}

String poolPlanLockUserMessage(PoolOrder order) {
  final props = poolOrderPlanUpgradeProps(order);
  if (props != null) {
    return buildPlanUpgradeCopy(
      requiredTierCode: props.requiredTierCode,
      requiredPlanLabel: props.requiredPlanLabel,
    ).headline;
  }
  final reason = order.poolEligibility?.lockReason?.trim();
  if (reason != null && reason.isNotEmpty) {
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
