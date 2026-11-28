import '../../../core/network/json_helpers.dart';
import '../../../core/i18n/i18n.dart';

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
    throw FormatException(tr('استجابة الأهلية غير متوقعة.'));
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
    return tr('حسابك مؤهل لاستلام الطلبات من السوق.');
  }

  switch (eligibility.reason) {
    case 'company_activation_pending':
      return tr('بانتظار موافقة الإدارة قبل بدء استلام الطلبات.');
    case 'company_rejected':
      return tr('تم رفض طلب التفعيل. يرجى مراجعة السبب وإعادة إرسال الطلب.');
    case 'no_subscription':
    case 'status_inactive':
    case 'status_cancelled':
    case 'payment_not_completed':
    case 'expired':
    case 'activation_fee_unpaid':
      return tr('حسابك غير مؤهل حاليًا لتنفيذ هذا الإجراء. يرجى مراجعة الإدارة.');
    default:
      return tr('حسابك غير مؤهل حاليًا لتنفيذ هذا الإجراء. يرجى مراجعة الإدارة.');
  }
}

/// Home / list banner copy: clear ineligible headline + specific reason.
String freelancerIneligibleBannerMessageAr(FreelancerEligibility eligibility) {
  final reason = freelancerIneligibleReasonAr(eligibility.reason);
  return trf('أنت غير مؤهل لاستلام الطلبات من السوق.\n{0}', [reason]);
}

String freelancerIneligibleReasonAr(String? reason) {
  switch (reason) {
    case 'company_activation_pending':
      return tr('السبب: بانتظار موافقة الإدارة على تفعيل حسابك.');
    case 'company_rejected':
      return tr('السبب: تم رفض طلب تفعيل حسابك.');
    case 'no_subscription':
      return tr('فعّل باقتك أولاً لاستلام الطلبات.');
    case 'plan_configuration_error':
      return tr('تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.');
    case 'status_inactive':
      return tr('السبب: الاشتراك غير نشط.');
    case 'status_cancelled':
      return tr('السبب: تم إلغاء الاشتراك.');
    case 'payment_not_completed':
      return tr('السبب: لم يكتمل دفع الاشتراك.');
    case 'expired':
      return tr('السبب: انتهت صلاحية الاشتراك.');
    case 'activation_fee_unpaid':
      return tr('السبب: رسوم تفعيل الحساب غير مدفوعة. يرجى مراجعة الإدارة.');
    case 'account_activation_required':
    case 'kyc_required':
    case 'KYC_REQUIRED':
      return tr('أكمل توثيق الهوية قبل استلام الطلبات.');
    case 'TRAINING_REQUIRED':
    case 'training_required':
      return tr('أكمل التدريب المطلوب قبل استلام الطلبات.');
    case 'assigned_not_started':
      return tr('باقتك جاهزة، وستبدأ عند استلام أول طلب مؤهل.');
    default:
      return tr('السبب: يرجى مراجعة الإدارة لتفعيل أهليتك.');
  }
}
