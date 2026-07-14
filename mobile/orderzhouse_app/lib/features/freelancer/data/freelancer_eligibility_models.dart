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
