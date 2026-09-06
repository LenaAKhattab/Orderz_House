import '../../../core/network/json_helpers.dart';

class FreelancerEligibility {
  const FreelancerEligibility({
    required this.eligible,
    this.reason,
  });

  final bool eligible;
  final String? reason;

  factory FreelancerEligibility.fromJson(Map<String, dynamic> json) {
    return FreelancerEligibility(
      eligible: json['eligible'] == true,
      reason: readMapField<String>(json, 'reason', 'reason'),
    );
  }

  factory FreelancerEligibility.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      return FreelancerEligibility.fromJson(Map<String, dynamic>.from(data));
    }
    throw FormatException('استجابة الأهلية غير متوقعة.');
  }
}

bool freelancerEligibilityNeedsAccountActivation(FreelancerEligibility eligibility) {
  if (eligibility.eligible) return false;
  switch (eligibility.reason) {
    case 'company_activation_pending':
    case 'company_rejected':
    case 'activation_fee_unpaid':
      return true;
    default:
      return false;
  }
}

bool freelancerEligibilityLooksRejected(FreelancerEligibility eligibility) {
  return !eligibility.eligible && eligibility.reason == 'company_rejected';
}

String freelancerEligibilityMessageAr(FreelancerEligibility eligibility) {
  if (eligibility.eligible) {
    return 'حسابك مؤهل لاستلام الطلبات من السوق.';
  }

  switch (eligibility.reason) {
    case 'company_activation_pending':
      return 'بانتظار موافقة الإدارة قبل بدء استلام الطلبات.';
    case 'company_rejected':
      return 'تم رفض طلب التفعيل. يرجى مراجعة السبب وإعادة إرسال الطلب.';
    case 'no_subscription':
    case 'status_inactive':
    case 'status_cancelled':
    case 'payment_not_completed':
    case 'expired':
    case 'activation_fee_unpaid':
      return 'حسابك غير مؤهل حاليًا لتنفيذ هذا الإجراء. يرجى مراجعة الإدارة.';
    default:
      return 'حسابك غير مؤهل حاليًا لتنفيذ هذا الإجراء. يرجى مراجعة الإدارة.';
  }
}

/// Home / list banner copy: clear ineligible headline + specific reason.
String freelancerIneligibleBannerMessageAr(FreelancerEligibility eligibility) {
  final reason = freelancerIneligibleReasonAr(eligibility.reason);
  return 'أنت غير مؤهل لاستلام الطلبات من السوق.\n$reason';
}

String freelancerIneligibleReasonAr(String? reason) {
  switch (reason) {
    case 'company_activation_pending':
      return 'السبب: بانتظار موافقة الإدارة على تفعيل حسابك.';
    case 'company_rejected':
      return 'السبب: تم رفض طلب تفعيل حسابك.';
    case 'no_subscription':
      return 'فعّل باقتك أولاً لاستلام الطلبات.';
    case 'plan_configuration_error':
      return 'تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.';
    case 'status_inactive':
      return 'السبب: الاشتراك غير نشط.';
    case 'status_cancelled':
      return 'السبب: تم إلغاء الاشتراك.';
    case 'payment_not_completed':
      return 'السبب: لم يكتمل دفع الاشتراك.';
    case 'expired':
      return 'السبب: انتهت صلاحية الاشتراك.';
    case 'activation_fee_unpaid':
      return 'السبب: رسوم تفعيل الحساب غير مدفوعة. يرجى مراجعة الإدارة.';
    case 'account_activation_required':
    case 'kyc_required':
    case 'KYC_REQUIRED':
      return 'أكمل توثيق الهوية قبل استلام الطلبات.';
    case 'TRAINING_REQUIRED':
    case 'training_required':
      return 'أكمل التدريب المطلوب قبل استلام الطلبات.';
    case 'assigned_not_started':
      return 'باقتك جاهزة، وستبدأ عند استلام أول طلب مؤهل.';
    default:
      return 'السبب: يرجى مراجعة الإدارة لتفعيل أهليتك.';
  }
}
