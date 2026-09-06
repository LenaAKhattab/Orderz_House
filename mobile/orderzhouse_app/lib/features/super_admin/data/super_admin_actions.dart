import 'package:dio/dio.dart';

import '../../../core/errors/api_error_message.dart';
import 'super_admin_api.dart';
import 'super_admin_kyc_models.dart';
import 'super_admin_models.dart';

/// Phase 1B claim status values already supported by
/// `PATCH /api/super-admin/financial-claims/:id/status`.
/// `paid` is deferred — it is payout-adjacent.
const superAdminAllowedClaimStatusValues = <String>[
  'accepted',
  'rejected',
  'frozen',
  'requires_in_person_review',
];

const superAdminClaimStatusesRequiringNote = <String>{
  'rejected',
  'frozen',
  'requires_in_person_review',
};

class SuperAdminClaimStatusOption {
  const SuperAdminClaimStatusOption({required this.status, required this.labelAr});

  final String status;
  final String labelAr;
}

const superAdminClaimStatusOptions = <SuperAdminClaimStatusOption>[
  SuperAdminClaimStatusOption(status: 'accepted', labelAr: 'قبول'),
  SuperAdminClaimStatusOption(status: 'rejected', labelAr: 'رفض'),
  SuperAdminClaimStatusOption(status: 'frozen', labelAr: 'تجميد'),
  SuperAdminClaimStatusOption(
    status: 'requires_in_person_review',
    labelAr: 'مراجعة حضورية',
  ),
];

class SuperAdminClaimStatusRequest {
  const SuperAdminClaimStatusRequest({required this.status, this.adminNote});

  final String status;
  final String? adminNote;
}

/// In-memory lock so a Super Admin action cannot be submitted twice.
class SuperAdminInFlightGuard {
  String? _id;

  bool get isBusy => _id != null;
  String? get busyId => _id;

  bool isBusyFor(String id) => _id == id;

  bool tryStart(String id) {
    if (_id != null) return false;
    _id = id;
    return true;
  }

  void end() {
    _id = null;
  }
}

bool isDashboardAdminAssignedActivation(SuperAdminActivationItem item) {
  final source = (item.source ?? '').trim().toLowerCase();
  final payment = (item.paymentStatus ?? '').trim().toLowerCase();
  final hasAssignedBy = (item.assignedByUserId ?? '').trim().isNotEmpty;
  final notes = (item.notes ?? '').trim();
  return source == 'admin' &&
      (payment == 'not_required' || payment == 'paid') &&
      hasAssignedBy &&
      notes != 'auto_default_free_plan';
}

bool isAdminAssignedFollowUpRow(SuperAdminActivationItem item) =>
    isDashboardAdminAssignedActivation(item);

const orderzhouseFreePlanId = '1';
const orderzhouseFreePlanName = 'orderzhouse_free';

bool isFreeOrStarterSubscriptionPlan(SuperAdminActivationItem item) {
  final planId = (item.planId ?? '').trim();
  if (planId == orderzhouseFreePlanId) return true;
  final planName = (item.planName ?? item.planTitle ?? '').trim().toLowerCase();
  if (planName == orderzhouseFreePlanName) return true;
  if (planName.contains('starter') || planName.contains('start')) return true;
  if (planName.contains('مجاني') || planName.contains('free')) return true;
  final notes = (item.notes ?? '').trim();
  if (notes == 'auto_default_free_plan') return true;
  final price = item.priceJod;
  if (price != null && price <= 0) {
    final payment = (item.paymentStatus ?? '').trim().toLowerCase();
    if (payment == 'not_required' || payment.isEmpty) return true;
  }
  return false;
}

/// Old free-plan rows stuck in activation queue — manual review only, not paid activation.
bool isLegacyFreeActivationRow(SuperAdminActivationItem item) {
  if (isAdminAssignedFollowUpRow(item)) return false;
  if (!isFreeOrStarterSubscriptionPlan(item)) return false;
  final notes = (item.notes ?? '').trim();
  if (notes == 'auto_default_free_plan') return true;
  return wouldHaveBeenApprovableActivation(item) ||
      (item.needsCompanyActivation == true) ||
      (item.activationStatus ?? '').trim().toLowerCase() == 'company_pending';
}

bool isPaidSubscriptionActivationActionable(SuperAdminActivationItem item) {
  if (isAdminAssignedFollowUpRow(item)) return false;
  if (isFreeOrStarterSubscriptionPlan(item)) return false;
  return wouldHaveBeenApprovableActivation(item);
}

class SuperAdminSubscriptionActivationSnapshot {
  const SuperAdminSubscriptionActivationSnapshot({
    required this.paidActionable,
    required this.legacyFree,
    required this.adminAssigned,
  });

  final List<SuperAdminActivationItem> paidActionable;
  final List<SuperAdminActivationItem> legacyFree;
  final List<SuperAdminActivationItem> adminAssigned;

  bool get isEmpty =>
      paidActionable.isEmpty && legacyFree.isEmpty && adminAssigned.isEmpty;

  int get actionableCount => paidActionable.length;
}

SuperAdminSubscriptionActivationSnapshot classifySubscriptionActivationItems(
  List<SuperAdminActivationItem> items,
) {
  final paid = <SuperAdminActivationItem>[];
  final legacy = <SuperAdminActivationItem>[];
  final assigned = <SuperAdminActivationItem>[];
  for (final item in items) {
    if (isAdminAssignedFollowUpRow(item)) {
      assigned.add(item);
      continue;
    }
    if (isLegacyFreeActivationRow(item)) {
      legacy.add(item);
      continue;
    }
    if (isPaidSubscriptionActivationActionable(item)) {
      paid.add(item);
    }
  }
  return SuperAdminSubscriptionActivationSnapshot(
    paidActionable: paid,
    legacyFree: legacy,
    adminAssigned: assigned,
  );
}

extension SuperAdminActivationQueueSnapshotX on SuperAdminActivationQueueSnapshot {
  SuperAdminSubscriptionActivationSnapshot get subscriptionClassification =>
      classifySubscriptionActivationItems(subscriptionItems);

  int get pendingPaidSubscriptionCount => subscriptionClassification.actionableCount;
}

/// Matches web `needsCompanyActivationAction` and hides admin-assigned rows.
bool canApproveActivation(SuperAdminActivationItem item) {
  return wouldHaveBeenApprovableActivation(item);
}

bool isMobileCompanyActivateDisabled() => false;

bool canApproveKycActivation(SuperAdminKycActivationItem item) {
  return item.id.trim().isNotEmpty && item.isPendingReview;
}

bool canApproveKycActivationRequest(SuperAdminKycActivationRequest request) {
  return request.id.trim().isNotEmpty && request.isPendingReview;
}

int identityActionableCount(List<SuperAdminKycActivationItem> kycItems) {
  return kycItems.where((e) => e.isPendingReview).length;
}

int subscriptionActionableCount(List<SuperAdminActivationItem> subscriptionItems) {
  return classifySubscriptionActivationItems(subscriptionItems).actionableCount;
}

int activationActionableCount(SuperAdminActivationQueueSnapshot snapshot) {
  return identityActionableCount(snapshot.kycItems) +
      subscriptionActionableCount(snapshot.subscriptionItems);
}

String? validateKycRejectionReason(String reason) {
  if (reason.trim().isEmpty) return superAdminActivationRejectReasonRequiredAr;
  return null;
}

String? validateActivationOverrideReason(String reason) {
  if (reason.trim().isEmpty) return superAdminActivationOverrideRequiredAr;
  return null;
}

/// Whether subscription queue row can receive company-activate (web parity).
bool wouldHaveBeenApprovableActivation(SuperAdminActivationItem item) {
  if (item.id.trim().isEmpty) return false;
  if (isDashboardAdminAssignedActivation(item)) return false;
  if (item.needsCompanyActivation == true) return true;
  final activation = (item.activationStatus ?? '').trim().toLowerCase();
  if (activation != 'company_pending') return false;
  final payment = (item.paymentStatus ?? '').trim().toLowerCase();
  return payment == 'paid' ||
      payment == 'pending' ||
      payment == 'not_required' ||
      payment.isEmpty;
}

bool canUpdatePendingClaimStatus(SuperAdminClaimItem item) {
  if (item.id.trim().isEmpty) return false;
  final status = (item.status ?? '').trim().toLowerCase();
  return status.isEmpty || status == 'pending';
}

bool claimStatusRequiresNote(String status) {
  return superAdminClaimStatusesRequiringNote.contains(status.trim().toLowerCase());
}

bool isAllowedClaimStatusAction(String status) {
  return superAdminAllowedClaimStatusValues.contains(status.trim().toLowerCase());
}

String? validateClaimAdminNote({required String status, required String note}) {
  if (!claimStatusRequiresNote(status)) return null;
  if (note.trim().length < 3) return superAdminActionNoteTooShortAr;
  return null;
}

bool canSubmitClaimStatusAction({required String? status, required String note}) {
  if (status == null || !isAllowedClaimStatusAction(status)) return false;
  return validateClaimAdminNote(status: status, note: note) == null;
}

String superAdminActionErrorMessage(Object error) {
  if (error is SuperAdminEndpointUnavailable) {
    return error.message;
  }
  if (error is DioException) {
    final status = error.response?.statusCode;
    if (status == 401 || status == 403) return superAdminAccessDeniedAr;
  }
  return apiErrorMessage(error, fallback: superAdminActionFailedAr);
}
