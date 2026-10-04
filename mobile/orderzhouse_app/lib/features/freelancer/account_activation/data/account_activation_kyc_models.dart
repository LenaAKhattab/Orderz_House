import '../../../../core/network/json_helpers.dart';

/// Short terms snapshot aligned with backend A11 constant (display only).
const accountActivationKycTermsSnapshotAr =
    'أوافق على شروط تفعيل حساب المستقل واستخدام منصة OrderzHouse.\n'
    'أتعهد بأن صور الهوية المرفقة صحيحة وتعود لي شخصيًا.\n'
    'أفهم أن إرسال الطلب لا يعني التفعيل الفوري، وأن الإدارة تراجع الطلب قبل الموافقة.';

const accountActivationKycFilesRequiredAr = 'يرجى اختيار صورة الهوية من الأمام والخلف.';
const accountActivationKycTermsRequiredAr = 'يجب الموافقة على شروط تفعيل الحساب.';
const accountActivationKycSubmitSuccessAr = 'تم إرسال طلب توثيق الهوية بنجاح.';
const accountActivationKycPendingAr = 'طلب توثيق الهوية قيد المراجعة';
const accountActivationKycApprovedAr = 'تم توثيق هويتك.';
const accountActivationKycApprovedManualAr = 'تم التحقق من الهوية إدارياً.';
const accountActivationKycNotVerifiedAr = 'لم يتم توثيق الهوية بعد';
const accountActivationKycRejectedHeadlineAr = 'تم رفض طلب توثيق الهوية';
const accountActivationKycCompleteCtaAr = 'إكمال توثيق الهوية';
const accountActivationKycResubmitCtaAr = 'إعادة إرسال طلب توثيق الهوية';
const accountActivationKycPageTitleAr = 'توثيق الهوية';
const accountActivationKycPageSubtitleAr =
    'ارفع صور الهوية لإكمال تفعيل الحساب.';
const accountActivationKycMembershipWaitingAr =
    'تم اعتماد حسابك، وتبدأ مدة الاشتراك عند استلام أول طلب حقيقي.';
const accountActivationKycMembershipActiveAr =
    'اشتراكك نشط ومدة الاشتراك جارية.';

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

class AccountActivationIdentity {
  const AccountActivationIdentity({
    this.status = 'none',
    this.verified = false,
    this.source,
    this.canSubmit = false,
    this.canResubmit = false,
    this.hasPlatformDocuments = false,
  });

  final String status;
  final bool verified;
  final String? source;
  final bool canSubmit;
  final bool canResubmit;
  final bool hasPlatformDocuments;

  bool get isManual => (source ?? '').trim().toLowerCase() == 'manual_admin';
  bool get isPending => status.trim().toLowerCase() == 'pending_review';
  bool get isRejected => status.trim().toLowerCase() == 'rejected';

  factory AccountActivationIdentity.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const AccountActivationIdentity();
    return AccountActivationIdentity(
      status: readMapField<String>(json, 'status', 'status') ?? 'none',
      verified: json['verified'] == true,
      source: readMapField<String>(json, 'source', 'source'),
      canSubmit: json['canSubmit'] == true || json['can_submit'] == true,
      canResubmit: json['canResubmit'] == true || json['can_resubmit'] == true,
      hasPlatformDocuments:
          json['hasPlatformDocuments'] == true || json['has_platform_documents'] == true,
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
    this.identity = const AccountActivationIdentity(),
    this.accountApproved = false,
    this.membershipCountdownStarted = false,
    this.membershipStatus,
    this.hasFirstOrder = false,
  });

  final bool schemaReady;
  final String? activationStatus;
  /// Legacy company-approval flag — NOT identity verification.
  final bool isCompanyApproved;
  final bool isSubscriptionPeriodActive;
  final AccountActivationKycRequest? request;
  final bool canSubmit;
  final bool canResubmit;
  final String? termsVersion;
  final String? messageAr;
  final AccountActivationIdentity identity;
  final bool accountApproved;
  final bool membershipCountdownStarted;
  final String? membershipStatus;
  final bool hasFirstOrder;

  /// Canonical identity verified (platform KYC or manual).
  bool get isIdentityVerified => identity.verified;

  bool get isPending => identity.isPending || request?.isPendingReview == true;

  bool get isRejected =>
      identity.isRejected ||
      request?.isRejected == true;

  bool get showSubmitForm =>
      (identity.canSubmit || identity.canResubmit || canSubmit || canResubmit) &&
      !isIdentityVerified &&
      !isPending;

  String get verifiedTitleAr =>
      identity.isManual ? accountActivationKycApprovedManualAr : accountActivationKycApprovedAr;

  String get membershipBodyAr {
    if (membershipCountdownStarted) return accountActivationKycMembershipActiveAr;
    if (accountApproved) return accountActivationKycMembershipWaitingAr;
    return messageAr ?? accountActivationKycNotVerifiedAr;
  }

  factory AccountActivationKycStatus.fromJson(Map<String, dynamic> json) {
    final requestRaw = json['request'];
    final identityRaw = json['identity'];
    final accountRaw = json['accountApproval'] ?? json['account_approval'];
    final membershipRaw = json['membership'];

    final identity = AccountActivationIdentity.fromJson(
      identityRaw is Map ? Map<String, dynamic>.from(identityRaw) : null,
    );

    final accountApproved = accountRaw is Map
        ? (accountRaw['approved'] == true)
        : (json['isCompanyApproved'] == true || json['is_company_approved'] == true);

    final membershipCountdownStarted = membershipRaw is Map
        ? (membershipRaw['countdownStarted'] == true ||
            membershipRaw['countdown_started'] == true)
        : (json['isSubscriptionPeriodActive'] == true ||
            json['is_subscription_period_active'] == true);

    final membershipStatus = membershipRaw is Map
        ? readMapField<String>(
            Map<String, dynamic>.from(membershipRaw),
            'status',
            'status',
          )
        : null;

    final hasFirstOrder = membershipRaw is Map
        ? (membershipRaw['hasFirstOrder'] == true || membershipRaw['has_first_order'] == true)
        : false;

    // Prefer canonical identity.verified; never treat company approval as identity.
    final verified = identityRaw is Map
        ? identity.verified
        : false;

    return AccountActivationKycStatus(
      schemaReady: json['schemaReady'] != false && json['schema_ready'] != false,
      activationStatus: readMapField<String>(json, 'activationStatus', 'activation_status'),
      isCompanyApproved: json['isCompanyApproved'] == true || json['is_company_approved'] == true,
      isSubscriptionPeriodActive: membershipCountdownStarted,
      request: requestRaw is Map
          ? AccountActivationKycRequest.fromJson(Map<String, dynamic>.from(requestRaw))
          : null,
      canSubmit: identityRaw is Map
          ? (identity.canSubmit || verified == false && (json['canSubmit'] == true))
          : (json['canSubmit'] == true || json['can_submit'] == true),
      canResubmit: identityRaw is Map
          ? identity.canResubmit
          : (json['canResubmit'] == true || json['can_resubmit'] == true),
      termsVersion: readMapField<String>(json, 'termsVersion', 'terms_version'),
      messageAr: readMapField<String>(json, 'messageAr', 'message_ar'),
      identity: identityRaw is Map
          ? identity
          : AccountActivationIdentity(
              status: readMapField<String>(
                    requestRaw is Map
                        ? Map<String, dynamic>.from(requestRaw)
                        : const <String, dynamic>{},
                    'status',
                    'status',
                  ) ??
                  'none',
              verified: false,
              canSubmit: json['canSubmit'] == true || json['can_submit'] == true,
              canResubmit: json['canResubmit'] == true || json['can_resubmit'] == true,
            ),
      accountApproved: accountApproved,
      membershipCountdownStarted: membershipCountdownStarted,
      membershipStatus: membershipStatus,
      hasFirstOrder: hasFirstOrder,
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
