import '../../../core/network/json_helpers.dart';

const superAdminActivationApproveSuccessAr = 'تم اعتماد الطلب بنجاح.';
const superAdminActivationRejectSuccessAr = 'تم رفض الطلب بنجاح.';
const superAdminActivationConfirmApproveTitleAr = 'تأكيد الاعتماد';
const superAdminActivationConfirmApproveBodyAr = 'هل أنت متأكد من اعتماد هذا الطلب؟';
const superAdminActivationRejectTitleAr = 'رفض الطلب';
const superAdminActivationRejectReasonLabelAr = 'سبب الرفض';
const superAdminActivationRejectReasonRequiredAr = 'يرجى كتابة سبب الرفض.';
const superAdminActivationRejectButtonAr = 'رفض الطلب';
const superAdminActivationRejectSubmitAr = 'إرسال سبب الرفض';
const superAdminActivationAdminNotesLabelAr = 'ملاحظات داخلية (اختياري)';
const superAdminActivationKycSectionAr = 'طلبات مراجعة الهوية';
const superAdminActivationSubscriptionSectionAr = 'تفعيل اشتراك';
const superAdminActivationNoDocumentsAr = 'لا توجد وثائق مرفقة';
const superAdminActivationDocumentsAvailableAr = 'الوثائق متاحة للمعاينة';
const superAdminActivationOverrideReasonLabelAr = 'سبب تجاوز مراجعة الهوية';
const superAdminActivationOverrideHelperAr =
    'التفعيل المباشر يتطلب موافقة KYC أو تجاوز موثّق من مدير أعلى.';
const superAdminActivationOverrideRequiredAr = 'سبب التجاوز مطلوب.';
const superAdminActivationRefreshLabelAr = 'تحديث';
const superAdminActivationDetailTitleAr = 'تفاصيل طلب التفعيل';
const superAdminActivationIdFrontLabelAr = 'صورة الهوية الأمامية';
const superAdminActivationIdBackLabelAr = 'صورة الهوية الخلفية';
const superAdminActivationImageLoadFailedAr = 'تعذر تحميل الصورة.';

String kycStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'pending_review':
      return 'قيد المراجعة';
    case 'approved':
      return 'مقبول';
    case 'rejected':
      return 'مرفوض';
    case 'draft':
      return 'مسودة';
    case 'cancelled':
      return 'ملغى';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

class SuperAdminKycActivationItem {
  const SuperAdminKycActivationItem({
    required this.id,
    required this.freelancerUserId,
    this.status,
    this.freelancerName,
    this.freelancerEmail,
    this.submittedAt,
    this.reviewedAt,
    this.rejectionReason,
    this.hasFrontImage = false,
    this.hasBackImage = false,
    this.resubmissionCount = 0,
  });

  final String id;
  final String freelancerUserId;
  final String? status;
  final String? freelancerName;
  final String? freelancerEmail;
  final String? submittedAt;
  final String? reviewedAt;
  final String? rejectionReason;
  final bool hasFrontImage;
  final bool hasBackImage;
  final int resubmissionCount;

  bool get isPendingReview => (status ?? '').trim().toLowerCase() == 'pending_review';

  factory SuperAdminKycActivationItem.fromJson(Map<String, dynamic> json) {
    return SuperAdminKycActivationItem(
      id: readString(json, 'id', 'id'),
      freelancerUserId: readString(json, 'freelancerUserId', 'freelancer_user_id'),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      freelancerName: _nullIfEmpty(readString(json, 'freelancerName', 'freelancer_name')),
      freelancerEmail: _nullIfEmpty(readString(json, 'freelancerEmail', 'freelancer_email')),
      submittedAt: _nullIfEmpty(readString(json, 'submittedAt', 'submitted_at')),
      reviewedAt: _nullIfEmpty(readString(json, 'reviewedAt', 'reviewed_at')),
      rejectionReason: _nullIfEmpty(readString(json, 'rejectionReason', 'rejection_reason')),
      hasFrontImage: json['hasFrontImage'] == true || json['has_front_image'] == true,
      hasBackImage: json['hasBackImage'] == true || json['has_back_image'] == true,
      resubmissionCount: readInt(json, 'resubmissionCount', 'resubmission_count') ?? 0,
    );
  }
}

class SuperAdminKycActivationDetail {
  const SuperAdminKycActivationDetail({
    required this.request,
    this.freelancer,
    this.hasFrontFile = false,
    this.hasBackFile = false,
  });

  final SuperAdminKycActivationRequest request;
  final SuperAdminKycFreelancerInfo? freelancer;
  final bool hasFrontFile;
  final bool hasBackFile;

  factory SuperAdminKycActivationDetail.fromJson(Map<String, dynamic> json) {
    final requestRaw = json['request'];
    final freelancerRaw = json['freelancer'];
    final filesRaw = json['files'];
    Map<String, dynamic>? files;
    if (filesRaw is Map) files = Map<String, dynamic>.from(filesRaw);

    return SuperAdminKycActivationDetail(
      request: SuperAdminKycActivationRequest.fromJson(
        requestRaw is Map ? Map<String, dynamic>.from(requestRaw) : const {},
      ),
      freelancer: freelancerRaw is Map
          ? SuperAdminKycFreelancerInfo.fromJson(Map<String, dynamic>.from(freelancerRaw))
          : null,
      hasFrontFile: files?['front'] != null,
      hasBackFile: files?['back'] != null,
    );
  }
}

class SuperAdminKycActivationRequest {
  const SuperAdminKycActivationRequest({
    required this.id,
    required this.freelancerUserId,
    this.status,
    this.termsAcceptedAt,
    this.termsVersion,
    this.submittedAt,
    this.reviewedAt,
    this.rejectionReason,
    this.adminNotes,
    this.hasFrontImage = false,
    this.hasBackImage = false,
    this.resubmissionCount = 0,
  });

  final String id;
  final String freelancerUserId;
  final String? status;
  final String? termsAcceptedAt;
  final String? termsVersion;
  final String? submittedAt;
  final String? reviewedAt;
  final String? rejectionReason;
  final String? adminNotes;
  final bool hasFrontImage;
  final bool hasBackImage;
  final int resubmissionCount;

  bool get isPendingReview => (status ?? '').trim().toLowerCase() == 'pending_review';

  factory SuperAdminKycActivationRequest.fromJson(Map<String, dynamic> json) {
    return SuperAdminKycActivationRequest(
      id: readString(json, 'id', 'id'),
      freelancerUserId: readString(json, 'freelancerUserId', 'freelancer_user_id'),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      termsAcceptedAt: _nullIfEmpty(readString(json, 'termsAcceptedAt', 'terms_accepted_at')),
      termsVersion: _nullIfEmpty(readString(json, 'termsVersion', 'terms_version')),
      submittedAt: _nullIfEmpty(readString(json, 'submittedAt', 'submitted_at')),
      reviewedAt: _nullIfEmpty(readString(json, 'reviewedAt', 'reviewed_at')),
      rejectionReason: _nullIfEmpty(readString(json, 'rejectionReason', 'rejection_reason')),
      adminNotes: _nullIfEmpty(readString(json, 'adminNotes', 'admin_notes')),
      hasFrontImage: json['hasFrontImage'] == true || json['has_front_image'] == true,
      hasBackImage: json['hasBackImage'] == true || json['has_back_image'] == true,
      resubmissionCount: readInt(json, 'resubmissionCount', 'resubmission_count') ?? 0,
    );
  }
}

class SuperAdminKycFreelancerInfo {
  const SuperAdminKycFreelancerInfo({
    required this.id,
    this.email,
    this.name,
    this.phone,
  });

  final String id;
  final String? email;
  final String? name;
  final String? phone;

  factory SuperAdminKycFreelancerInfo.fromJson(Map<String, dynamic> json) {
    return SuperAdminKycFreelancerInfo(
      id: readString(json, 'id', 'id'),
      email: _nullIfEmpty(readString(json, 'email', 'email')),
      name: _nullIfEmpty(readString(json, 'name', 'name')),
      phone: _nullIfEmpty(readString(json, 'phone', 'phone')),
    );
  }
}

SuperAdminKycActivationDetail parseKycActivationDetail(dynamic body) {
  final data = _unwrapData(body);
  if (data == null) {
    return SuperAdminKycActivationDetail(
      request: SuperAdminKycActivationRequest.fromJson(const {}),
    );
  }
  return SuperAdminKycActivationDetail.fromJson(data);
}

class SuperAdminKycListResult {
  const SuperAdminKycListResult({
    required this.schemaReady,
    required this.items,
    this.total = 0,
  });

  final bool schemaReady;
  final List<SuperAdminKycActivationItem> items;
  final int total;
}

/// Identity queue screen state — KYC only (does not wait for subscription API).
class SuperAdminIdentityQueueSnapshot {
  const SuperAdminIdentityQueueSnapshot({
    required this.items,
    this.schemaReady = true,
    this.loadFailed = false,
  });

  final List<SuperAdminKycActivationItem> items;
  final bool schemaReady;
  final bool loadFailed;

  List<SuperAdminKycActivationItem> get pendingItems =>
      items.where((e) => e.isPendingReview).toList();
}

SuperAdminKycListResult parseKycActivationList(dynamic body) {
  final data = _unwrapData(body);
  if (data == null) {
    return const SuperAdminKycListResult(schemaReady: false, items: []);
  }
  final schemaReady = data['schemaReady'] != false && data['schema_ready'] != false;
  final list = extractList(data, nestedKey: 'items');
  final items = list.map(SuperAdminKycActivationItem.fromJson).toList();
  final total = readInt(data, 'total', 'total') ?? items.length;
  return SuperAdminKycListResult(schemaReady: schemaReady, items: items, total: total);
}

Map<String, dynamic>? _unwrapData(dynamic body) {
  if (body is Map && body['data'] is Map) {
    return Map<String, dynamic>.from(body['data'] as Map);
  }
  if (body is Map) return Map<String, dynamic>.from(body);
  return null;
}

String? _nullIfEmpty(String? value) {
  if (value == null) return null;
  final t = value.trim();
  return t.isEmpty ? null : t;
}
