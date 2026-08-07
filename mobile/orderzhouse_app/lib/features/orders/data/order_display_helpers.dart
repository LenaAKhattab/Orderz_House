import 'package:intl/intl.dart';

String formatOrderDate(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  return DateFormat('d MMM y', 'ar').format(parsed.toLocal());
}

String projectTypeLabel(String? projectType) {
  if (projectType == 'bidding') return 'مناقصة';
  if (projectType == 'fixed') return 'ثابت';
  return projectType ?? '—';
}

String poolOrderStatusLabel(String? status) {
  switch (status) {
    case 'published':
      return 'منشور';
    case 'open_for_freelancers':
      return 'مفتوح للمستقلين';
    case 'open_for_bids':
      return 'مفتوح للعروض';
    default:
      return status ?? '—';
  }
}

String clientOrderStatusLabel(String? status) {
  switch (status) {
    case 'pending_payment':
      return 'بانتظار الدفع';
    case 'pending_admin_review':
      return 'بانتظار مراجعة الإدارة';
    case 'awaiting_payment_after_bid_selection':
      return 'بانتظار الدفع';
    case 'published':
      return 'منشور';
    case 'open_for_freelancers':
      return 'مفتوح للمستقلين';
    case 'open_for_bids':
      return 'مفتوح للعروض';
    case 'in_progress':
      return 'قيد التنفيذ';
    case 'submitted':
      return 'تم التسليم';
    case 'revision_requested':
      return 'طلب تعديل';
    case 'completed':
      return 'مكتمل';
    case 'cancelled':
      return 'ملغى';
    default:
      return status ?? '—';
  }
}

String freelancerOrderStatusLabel(String? status) {
  switch (status) {
    case 'assigned':
      return 'مسند';
    case 'ready_for_work':
      return 'جاهز للعمل';
    case 'in_progress':
      return 'قيد التنفيذ';
    case 'revision_required':
      return 'طلب تعديل';
    case 'pending_client_review':
      return 'بانتظار مراجعة العميل';
    case 'completed':
      return 'مكتمل';
    case 'cancelled':
      return 'ملغى';
    case 'published':
      return 'منشور';
    default:
      return clientOrderStatusLabel(status);
  }
}

String paymentStatusLabel(String? status) {
  switch (status) {
    case 'paid':
      return 'مدفوع';
    case 'pending':
      return 'بانتظار الدفع';
    case 'failed':
      return 'فشل الدفع';
    case 'skipped_by_admin':
      return 'تم التخطي (إداري)';
    default:
      return status ?? '—';
  }
}

String? budgetLabel({
  required String? projectType,
  double? budget,
  double? bidBudgetMin,
  double? bidBudgetMax,
  String? currencyCode,
}) {
  final currency = currencyCode ?? 'JOD';
  final isBidding = projectType == 'bidding';
  if (isBidding) {
    if (bidBudgetMin != null && bidBudgetMax != null) {
      return '${bidBudgetMin.toStringAsFixed(0)} - ${bidBudgetMax.toStringAsFixed(0)} $currency';
    }
    if (bidBudgetMin != null) return 'من ${bidBudgetMin.toStringAsFixed(0)} $currency';
    if (bidBudgetMax != null) return 'حتى ${bidBudgetMax.toStringAsFixed(0)} $currency';
    return null;
  }
  if (budget != null) return '${budget.toStringAsFixed(0)} $currency';
  return null;
}

String? durationLabel(int? value, String? unit) {
  if (value == null || unit == null || unit.isEmpty) return null;
  final unitAr = switch (unit) {
    'days' => 'يوم',
    'hours' => 'ساعة',
    'weeks' => 'أسبوع',
    _ => unit,
  };
  return '$value $unitAr';
}
