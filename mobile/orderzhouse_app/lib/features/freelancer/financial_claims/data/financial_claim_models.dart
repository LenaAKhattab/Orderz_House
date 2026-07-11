import '../../../../core/network/json_helpers.dart';
import '../../../orders/data/order_display_helpers.dart';

const financialClaimUnpricedMessageAr = 'لم يتم تسعير المطالبة بعد من الإدارة';

/// Client-side grouping keys (matches web `groupClaims`).
enum FinancialClaimGroup {
  underReview,
  blocked,
  paid,
  notDue,
  due,
}

enum FinancialClaimFilter {
  all,
  underReview,
  due,
  paid,
  blocked,
}

class FinancialClaim {
  const FinancialClaim({
    required this.id,
    this.projectId,
    required this.orderNumber,
    required this.requestTitle,
    this.categories = const [],
    this.durationMinutes,
    this.actualCompletionDate,
    this.status,
    this.payoutStatus,
    this.totalPriceSnapshot,
    this.userAmountSnapshot,
    this.companyAmountSnapshot,
    this.paidAmount,
    this.remainingAmount,
    this.freelancerNote,
    this.adminNote,
    this.submittedAt,
    this.reviewedAt,
    this.payoutWindowStart,
    this.payoutWindowEnd,
  });

  final String id;
  final String? projectId;
  final String orderNumber;
  final String requestTitle;
  final List<String> categories;
  final int? durationMinutes;
  final String? actualCompletionDate;
  final String? status;
  final String? payoutStatus;
  final double? totalPriceSnapshot;
  final double? userAmountSnapshot;
  final double? companyAmountSnapshot;
  final double? paidAmount;
  final double? remainingAmount;
  final String? freelancerNote;
  final String? adminNote;
  final String? submittedAt;
  final String? reviewedAt;
  final String? payoutWindowStart;
  final String? payoutWindowEnd;

  bool get hasAdminPricing =>
      totalPriceSnapshot != null && userAmountSnapshot != null;

  factory FinancialClaim.fromJson(Map<String, dynamic> json) {
    final categoriesRaw = json['categories'];
    final categories = <String>[];
    if (categoriesRaw is List) {
      for (final item in categoriesRaw) {
        if (item is String && item.trim().isNotEmpty) {
          categories.add(item.trim());
        }
      }
    }

    return FinancialClaim(
      id: readString(json, 'id', 'id'),
      projectId: readMapField<String>(json, 'projectId', 'project_id'),
      orderNumber: readString(json, 'orderNumber', 'order_number'),
      requestTitle: readString(json, 'requestTitle', 'request_title'),
      categories: categories,
      durationMinutes: readInt(json, 'durationMinutes', 'duration_minutes'),
      actualCompletionDate: readMapField<String>(json, 'actualCompletionDate', 'actual_completion_date'),
      status: readMapField<String>(json, 'status', 'status'),
      payoutStatus: readMapField<String>(json, 'payoutStatus', 'payout_status'),
      totalPriceSnapshot: readDouble(json, 'totalPriceSnapshot', 'total_price_snapshot'),
      userAmountSnapshot: readDouble(json, 'userAmountSnapshot', 'user_amount_snapshot'),
      companyAmountSnapshot: readDouble(json, 'companyAmountSnapshot', 'company_amount_snapshot'),
      paidAmount: readDouble(json, 'paidAmount', 'paid_amount'),
      remainingAmount: readDouble(json, 'remainingAmount', 'remaining_amount'),
      freelancerNote: readMapField<String>(json, 'freelancerNote', 'freelancer_note'),
      adminNote: readMapField<String>(json, 'adminNote', 'admin_note'),
      submittedAt: readMapField<String>(json, 'submittedAt', 'submitted_at'),
      reviewedAt: readMapField<String>(json, 'reviewedAt', 'reviewed_at'),
      payoutWindowStart: readMapField<String>(json, 'payoutWindowStart', 'payout_window_start'),
      payoutWindowEnd: readMapField<String>(json, 'payoutWindowEnd', 'payout_window_end'),
    );
  }

  static List<FinancialClaim> parseListResponse(dynamic body) {
    if (body is! Map) return const [];
    final data = body['data'];
    if (data is! Map) return const [];
    final claims = data['claims'];
    if (claims is! List) return const [];
    return claims
        .whereType<Map>()
        .map((e) => FinancialClaim.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}

FinancialClaimGroup classifyFinancialClaim(FinancialClaim claim) {
  final status = claim.status?.trim();
  final payoutStatus = claim.payoutStatus?.trim();

  if (status == 'pending') return FinancialClaimGroup.underReview;
  if (status == 'rejected' || status == 'frozen' || status == 'requires_in_person_review') {
    return FinancialClaimGroup.blocked;
  }
  if (status == 'paid' || payoutStatus == 'paid') return FinancialClaimGroup.paid;
  if (payoutStatus == 'not_due_yet' || payoutStatus == 'missing_completion_date') {
    return FinancialClaimGroup.notDue;
  }
  return FinancialClaimGroup.due;
}

Map<FinancialClaimGroup, List<FinancialClaim>> groupFinancialClaims(List<FinancialClaim> claims) {
  final grouped = <FinancialClaimGroup, List<FinancialClaim>>{
    for (final group in FinancialClaimGroup.values) group: [],
  };
  for (final claim in claims) {
    grouped[classifyFinancialClaim(claim)]!.add(claim);
  }
  return grouped;
}

List<FinancialClaim> filterFinancialClaims(
  List<FinancialClaim> claims,
  FinancialClaimFilter filter,
) {
  switch (filter) {
    case FinancialClaimFilter.all:
      return claims;
    case FinancialClaimFilter.underReview:
      return claims.where((c) => classifyFinancialClaim(c) == FinancialClaimGroup.underReview).toList();
    case FinancialClaimFilter.due:
      return claims.where((c) => classifyFinancialClaim(c) == FinancialClaimGroup.due).toList();
    case FinancialClaimFilter.paid:
      return claims.where((c) => classifyFinancialClaim(c) == FinancialClaimGroup.paid).toList();
    case FinancialClaimFilter.blocked:
      return claims.where((c) => classifyFinancialClaim(c) == FinancialClaimGroup.blocked).toList();
  }
}

class FinancialClaimsSummary {
  const FinancialClaimsSummary({
    required this.total,
    required this.underReview,
    required this.paid,
    required this.due,
  });

  final int total;
  final int underReview;
  final int paid;
  final int due;

  factory FinancialClaimsSummary.fromClaims(List<FinancialClaim> claims) {
    final grouped = groupFinancialClaims(claims);
    return FinancialClaimsSummary(
      total: claims.length,
      underReview: grouped[FinancialClaimGroup.underReview]!.length,
      paid: grouped[FinancialClaimGroup.paid]!.length,
      due: grouped[FinancialClaimGroup.due]!.length,
    );
  }
}

String financialClaimStatusLabelAr(String? status) {
  switch (status) {
    case 'pending':
      return 'قيد المراجعة';
    case 'accepted':
      return 'مقبولة';
    case 'rejected':
      return 'مرفوضة';
    case 'frozen':
      return 'مجمدة';
    case 'requires_in_person_review':
      return 'تتطلب مراجعة حضورية';
    case 'paid':
      return 'مدفوعة';
    default:
      return status?.trim().isNotEmpty == true ? status! : '—';
  }
}

String financialClaimPayoutStatusLabelAr(String? status) {
  switch (status) {
    case 'missing_completion_date':
      return 'تاريخ إنجاز غير متوفر';
    case 'not_due_yet':
      return 'غير مستحقة بعد';
    case 'within_payout_window':
      return 'ضمن نافذة الدفع';
    case 'late_after_payout_window':
      return 'متأخرة بعد نافذة الدفع';
    case 'paid':
      return 'مدفوعة';
    default:
      return status?.trim().isNotEmpty == true ? status! : '—';
  }
}

String financialClaimGroupLabelAr(FinancialClaimGroup group) {
  switch (group) {
    case FinancialClaimGroup.underReview:
      return 'قيد المراجعة';
    case FinancialClaimGroup.blocked:
      return 'محظورة / مرفوضة';
    case FinancialClaimGroup.paid:
      return 'مدفوعة';
    case FinancialClaimGroup.notDue:
      return 'غير مستحقة بعد';
    case FinancialClaimGroup.due:
      return 'مستحقة / قابلة للمتابعة';
  }
}

String financialClaimFilterLabelAr(FinancialClaimFilter filter) {
  switch (filter) {
    case FinancialClaimFilter.all:
      return 'الكل';
    case FinancialClaimFilter.underReview:
      return 'قيد المراجعة';
    case FinancialClaimFilter.due:
      return 'مستحقة';
    case FinancialClaimFilter.paid:
      return 'مدفوعة';
    case FinancialClaimFilter.blocked:
      return 'محظورة/مرفوضة';
  }
}

String formatFinancialAmount(double? amount, {String currency = 'JOD'}) {
  if (amount == null) return '—';
  final value = amount == amount.roundToDouble() ? amount.toStringAsFixed(0) : amount.toStringAsFixed(2);
  return '$value $currency';
}

String formatPayoutWindowLabel(String? start, String? end) {
  if ((start == null || start.isEmpty) && (end == null || end.isEmpty)) return '—';
  return '${formatOrderDate(start)} → ${formatOrderDate(end)}';
}
