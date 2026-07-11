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

String freelancerEligibilityMessageAr(FreelancerEligibility eligibility) {
  if (eligibility.eligible) {
    return 'حسابك مؤهل لاستلام الطلبات من السوق.';
  }

  switch (eligibility.reason) {
    case 'company_activation_pending':
      return 'بانتظار موافقة الإدارة قبل بدء استلام الطلبات.';
    case 'no_subscription':
      return 'لا يمكنك استلام الطلبات حالياً لأنك غير مشترك. راجع الباقات.';
    case 'status_inactive':
    case 'status_cancelled':
      return 'اشتراكك غير نشط حالياً. راجع الباقات.';
    case 'payment_not_completed':
      return 'تعذر تفعيل استلام الطلبات لأن حالة الدفع للاشتراك غير مكتملة.';
    case 'expired':
      return 'اشتراكك منتهٍ. راجع الباقات لتجديد الاشتراك.';
    case 'activation_fee_unpaid':
      return 'يجب دفع رسوم التفعيل السنوية قبل استلام الطلبات.';
    default:
      return 'حسابك غير مؤهل حالياً لاستلام طلبات من السوق (تحقق من الاشتراك).';
  }
}
