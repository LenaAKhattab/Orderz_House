import 'package:dio/dio.dart';

import '../../../core/errors/api_error_message.dart';
import 'super_admin_api.dart';
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

/// Matches web `needsCompanyActivationAction` and hides admin-assigned rows.
/// Phase M1: in-app company-activate is disabled (KYC review is web-only).
bool canApproveActivation(SuperAdminActivationItem item) {
  return false;
}

/// Whether the queue item would historically have been approvable (tests / diagnostics).
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

bool isMobileCompanyActivateDisabled() => true;

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
