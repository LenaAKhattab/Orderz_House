import 'package:intl/intl.dart';
import '../../../core/i18n/i18n.dart';

String formatOrderDate(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  return DateFormat('d MMM y', AppI18n.language.code).format(parsed.toLocal());
}

String projectTypeLabel(String? projectType) {
  if (projectType == 'bidding') return tr('مناقصة');
  if (projectType == 'fixed') return tr('ثابت');
  return projectType ?? '—';
}

String poolOrderStatusLabel(String? status) {
  switch (status) {
    case 'published':
      return tr('منشور');
    case 'open_for_freelancers':
      return tr('مفتوح للمستقلين');
    case 'open_for_bids':
      return tr('مفتوح للعروض');
    default:
      return status ?? '—';
  }
}

String clientOrderStatusLabel(String? status) {
  switch (status) {
    case 'pending_payment':
      return tr('بانتظار الدفع');
    // Smart Orders: managed order still being prepared / assigned by the team.
    case 'draft':
      return tr('قيد الإعداد');
    case 'pending_admin_review':
      return tr('بانتظار مراجعة الإدارة');
    // Smart Orders (managed): execution state; payment is shown separately.
    case 'awaiting_quote_payment':
      return tr('بانتظار دفع عرض السعر');
    case 'awaiting_assignment':
      return tr('بانتظار تعيين المستقل');
    case 'awaiting_payment_after_bid_selection':
      return tr('بانتظار الدفع');
    case 'published':
      return tr('منشور');
    case 'open_for_freelancers':
      return tr('مفتوح للمستقلين');
    case 'open_for_bids':
      return tr('مفتوح للعروض');
    case 'in_progress':
      return tr('قيد التنفيذ');
    case 'submitted':
      return tr('تم التسليم');
    case 'revision_requested':
      return tr('طلب تعديل');
    case 'completed':
      return tr('مكتمل');
    case 'cancelled':
      return tr('ملغى');
    default:
      return status ?? '—';
  }
}

String freelancerOrderStatusLabel(String? status) {
  switch (status) {
    case 'assigned':
      return tr('مسند');
    case 'ready_for_work':
      return tr('جاهز للعمل');
    case 'in_progress':
      return tr('قيد التنفيذ');
    case 'revision_required':
      return tr('طلب تعديل');
    case 'pending_client_review':
      return tr('بانتظار مراجعة العميل');
    case 'completed':
      return tr('مكتمل');
    case 'cancelled':
      return tr('ملغى');
    case 'published':
      return tr('منشور');
    default:
      return clientOrderStatusLabel(status);
  }
}

String paymentStatusLabel(String? status) {
  switch (status) {
    case 'paid':
      return tr('مدفوع');
    case 'pending':
      return tr('بانتظار الدفع');
    case 'failed':
      return tr('فشل الدفع');
    case 'skipped_by_admin':
      return tr('تم التخطي (إداري)');
    case 'not_required':
      return tr('غير مطلوب');
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
    if (bidBudgetMin != null) return trf('من {0} {1}', [bidBudgetMin.toStringAsFixed(0), currency]);
    if (bidBudgetMax != null) return trf('حتى {0} {1}', [bidBudgetMax.toStringAsFixed(0), currency]);
    return null;
  }
  if (budget != null) return '${budget.toStringAsFixed(0)} $currency';
  return null;
}

String? durationLabel(int? value, String? unit) {
  if (value == null || unit == null || unit.isEmpty) return null;
  final unitAr = switch (unit) {
    'days' => tr('يوم'),
    'hours' => tr('ساعة'),
    'weeks' => tr('أسبوع'),
    _ => unit,
  };
  return '$value $unitAr';
}
