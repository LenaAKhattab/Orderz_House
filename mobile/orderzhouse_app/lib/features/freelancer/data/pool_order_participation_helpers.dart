import '../../orders/data/pool_order_models.dart';

const poolPlanLockMessageAr = 'هذا الطلب غير متاح لحسابك حاليًا.';

bool isPoolOrderLockedByPlan(PoolOrder order) => order.isPlanLocked;

String poolPlanLockUserMessage(PoolOrder order) {
  final reason = order.poolEligibility?.lockReason?.trim();
  if (reason != null && reason.isNotEmpty) {
    // Strip purchase-oriented phrasing when API returns plan-oriented copy.
    final lower = reason.toLowerCase();
    if (lower.contains('باق') || lower.contains('اشتراك') || lower.contains('plan')) {
      return poolPlanLockMessageAr;
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
