import '../../../../core/network/json_helpers.dart';
import '../../../orders/data/order_display_helpers.dart';

class DoneProject {
  const DoneProject({
    required this.projectId,
    required this.orderNumber,
    required this.requestTitle,
    this.orderStatus,
    this.sourceType,
    this.categories = const [],
    this.actualCompletionDate,
    this.durationMinutes,
    this.totalPriceSnapshot,
    this.currencyCode,
    this.paymentStatus,
    this.hasMissingCompletionDate = false,
  });

  final String projectId;
  final String orderNumber;
  final String requestTitle;
  final String? orderStatus;
  final String? sourceType;
  final List<String> categories;
  final String? actualCompletionDate;
  final int? durationMinutes;
  final double? totalPriceSnapshot;
  final String? currencyCode;
  final String? paymentStatus;
  final bool hasMissingCompletionDate;

  factory DoneProject.fromJson(Map<String, dynamic> json) {
    final categoriesRaw = json['categories'];
    final categories = <String>[];
    if (categoriesRaw is List) {
      for (final item in categoriesRaw) {
        if (item is String && item.trim().isNotEmpty) {
          categories.add(item.trim());
        }
      }
    }

    return DoneProject(
      projectId: readString(json, 'projectId', 'project_id'),
      orderNumber: readString(json, 'orderNumber', 'order_number'),
      requestTitle: readString(json, 'requestTitle', 'request_title'),
      orderStatus: readMapField<String>(json, 'orderStatus', 'order_status'),
      sourceType: readMapField<String>(json, 'sourceType', 'source_type'),
      categories: categories,
      actualCompletionDate: readMapField<String>(json, 'actualCompletionDate', 'actual_completion_date'),
      durationMinutes: readInt(json, 'durationMinutes', 'duration_minutes'),
      totalPriceSnapshot: readDouble(json, 'totalPriceSnapshot', 'total_price_snapshot'),
      currencyCode: readMapField<String>(json, 'currencyCode', 'currency_code'),
      paymentStatus: readMapField<String>(json, 'paymentStatus', 'payment_status'),
      hasMissingCompletionDate: readBool(json, 'hasMissingCompletionDate', 'has_missing_completion_date'),
    );
  }

  static List<DoneProject> parseListResponse(dynamic body) {
    if (body is! Map) return const [];
    final data = body['data'];
    if (data is! Map) return const [];
    final projects = data['projects'] ?? data['doneProjects'];
    if (projects is! List) return const [];
    return projects
        .whereType<Map>()
        .map((e) => DoneProject.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}

String formatDurationMinutesLabel(int? minutes) {
  if (minutes == null) return '—';
  if (minutes <= 0) return '0 دقيقة';
  if (minutes < 60) return '$minutes دقيقة';
  final hours = minutes ~/ 60;
  final mins = minutes % 60;
  if (mins == 0) return '$hours ساعة';
  return '$hours ساعة و $mins دقيقة';
}

String doneProjectPaymentStatusLabelAr(String? status) {
  final label = paymentStatusLabel(status);
  if (label != '—') return label;
  return status?.trim().isNotEmpty == true ? status! : '—';
}

String formatDoneProjectAmount(DoneProject project) {
  if (project.totalPriceSnapshot == null) return '—';
  final currency = project.currencyCode?.trim().isNotEmpty == true ? project.currencyCode! : 'JOD';
  final amount = project.totalPriceSnapshot!;
  final value = amount == amount.roundToDouble() ? amount.toStringAsFixed(0) : amount.toStringAsFixed(2);
  return '$value $currency';
}

String formatDoneProjectCategories(List<String> categories) {
  if (categories.isEmpty) return '—';
  return categories.join('، ');
}

const doneProjectsEmptyMessageAr = 'لا توجد مشاريع مكتملة قابلة للمطالبة حاليًا';

const doneProjectMissingCompletionDateWarningAr =
    'تاريخ الإنجاز الفعلي غير متوفر — قد تحتاج مراجعة الإدارة قبل المطالبة.';
