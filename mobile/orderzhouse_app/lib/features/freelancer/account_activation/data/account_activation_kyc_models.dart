import '../../../../core/network/json_helpers.dart';

/// Short terms snapshot aligned with backend A11 constant (display only).
const accountActivationKycTermsSnapshotAr =
    'أوافق على شروط تفعيل حساب المستقل واستخدام منصة OrderzHouse.\n'
    'أتعهد بأن صور الهوية المرفقة صحيحة وتعود لي شخصيًا.\n'
    'أفهم أن إرسال الطلب لا يعني التفعيل الفوري، وأن الإدارة تراجع الطلب قبل الموافقة.';

const accountActivationKycFilesRequiredAr = 'يرجى اختيار صورة الهوية من الأمام والخلف.';
const accountActivationKycTermsRequiredAr = 'يجب الموافقة على شروط تفعيل الحساب.';
const accountActivationKycSubmitSuccessAr = 'تم إرسال طلب التفعيل بنجاح.';
const accountActivationKycPendingAr = 'طلبك قيد المراجعة';
const accountActivationKycApprovedAr = 'تم تفعيل حسابك.';
const accountActivationKycRejectedHeadlineAr = 'تم رفض طلب التفعيل';
const accountActivationKycCompleteCtaAr = 'إكمال تفعيل الحساب';
const accountActivationKycResubmitCtaAr = 'إعادة إرسال طلب التفعيل';
const accountActivationKycPageTitleAr = 'تفعيل الحساب';
const accountActivationKycPageSubtitleAr =
    'ارفع صورة الهوية من الأمام والخلف لإرسال طلب التفعيل للمراجعة.';

class AccountActivationKycRequest {
  const AccountActivationKycRequest({
    required this.id,
    this.status,
    this.rejectionReason,
    this.submittedAt,
    this.reviewedAt,
  });

  final String id;
  final String? status;
  final String? rejectionReason;
  final String? submittedAt;
  final String? reviewedAt;

  bool get isPendingReview => (status ?? '').trim().toLowerCase() == 'pending_review';
  bool get isRejected => (status ?? '').trim().toLowerCase() == 'rejected';
  bool get isApproved => (status ?? '').trim().toLowerCase() == 'approved';

  factory AccountActivationKycRequest.fromJson(Map<String, dynamic> json) {
    return AccountActivationKycRequest(
      id: readString(json, 'id', 'id'),
      status: readMapField<String>(json, 'status', 'status'),
      rejectionReason: readMapField<String>(json, 'rejectionReason', 'rejection_reason'),
      submittedAt: readMapField<String>(json, 'submittedAt', 'submitted_at'),
      reviewedAt: readMapField<String>(json, 'reviewedAt', 'reviewed_at'),
    );
  }
}

class AccountActivationKycStatus {
  const AccountActivationKycStatus({
    this.schemaReady = true,
    this.activationStatus,
    this.isCompanyApproved = false,
    this.isSubscriptionPeriodActive = false,
    this.request,
    this.canSubmit = false,
    this.canResubmit = false,
    this.termsVersion,
    this.messageAr,
  });

  final bool schemaReady;
  final String? activationStatus;
  final bool isCompanyApproved;
  final bool isSubscriptionPeriodActive;
  final AccountActivationKycRequest? request;
  final bool canSubmit;
  final bool canResubmit;
  final String? termsVersion;
  final String? messageAr;

  bool get isPending => request?.isPendingReview == true;
  bool get isRejected =>
      request?.isRejected == true ||
      (activationStatus ?? '').trim().toLowerCase() == 'company_rejected';
  bool get showSubmitForm => (canSubmit || canResubmit) && !isCompanyApproved && !isPending;

  factory AccountActivationKycStatus.fromJson(Map<String, dynamic> json) {
    final requestRaw = json['request'];
    return AccountActivationKycStatus(
      schemaReady: json['schemaReady'] != false && json['schema_ready'] != false,
      activationStatus: readMapField<String>(json, 'activationStatus', 'activation_status'),
      isCompanyApproved: json['isCompanyApproved'] == true || json['is_company_approved'] == true,
      isSubscriptionPeriodActive:
          json['isSubscriptionPeriodActive'] == true || json['is_subscription_period_active'] == true,
      request: requestRaw is Map
          ? AccountActivationKycRequest.fromJson(Map<String, dynamic>.from(requestRaw))
          : null,
      canSubmit: json['canSubmit'] == true || json['can_submit'] == true,
      canResubmit: json['canResubmit'] == true || json['can_resubmit'] == true,
      termsVersion: readMapField<String>(json, 'termsVersion', 'terms_version'),
      messageAr: readMapField<String>(json, 'messageAr', 'message_ar'),
    );
  }

  factory AccountActivationKycStatus.fromResponse(dynamic body) {
    if (body is! Map) {
      throw FormatException('استجابة تفعيل الحساب غير متوقعة.');
    }
    final data = body['data'];
    if (data is Map) {
      return AccountActivationKycStatus.fromJson(Map<String, dynamic>.from(data));
    }
    return AccountActivationKycStatus.fromJson(Map<String, dynamic>.from(body));
  }
}

String? validateAccountActivationSubmit({
  required bool hasFront,
  required bool hasBack,
  required bool termsAccepted,
}) {
  if (!hasFront || !hasBack) return accountActivationKycFilesRequiredAr;
  if (!termsAccepted) return accountActivationKycTermsRequiredAr;
  return null;
}
