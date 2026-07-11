import '../../../core/network/json_helpers.dart';
import '../../orders/data/order_display_helpers.dart' as display;
import '../../orders/data/order_file_models.dart';
import '../../orders/data/pool_order_models.dart';

class FreelancerOrderSubmission {
  const FreelancerOrderSubmission({
    required this.id,
    this.submissionNumber,
    this.status,
    this.statusBadgeAr,
    this.submittedAt,
    this.filesCount = 0,
    this.files = const [],
  });

  final String id;
  final int? submissionNumber;
  final String? status;
  final String? statusBadgeAr;
  final String? submittedAt;
  final int filesCount;
  final List<OrderFileDescriptor> files;

  String get statusLabel => statusBadgeAr ?? status ?? '—';

  factory FreelancerOrderSubmission.fromJson(Map<String, dynamic> json) {
    final files = parseOrderFilesFromSubmissionJson(json);
    return FreelancerOrderSubmission(
      id: readString(json, 'id', 'id'),
      submissionNumber: readInt(json, 'submissionNumber', 'submission_number'),
      status: readMapField<String>(json, 'status', 'status'),
      statusBadgeAr: readMapField<String>(json, 'statusBadgeAr', 'status_badge_ar'),
      submittedAt: readMapField<String>(json, 'submittedAt', 'submitted_at'),
      filesCount: files.length,
      files: files,
    );
  }
}

class FreelancerOrderSubmissionHistory {
  const FreelancerOrderSubmissionHistory({this.submissions = const []});

  final List<FreelancerOrderSubmission> submissions;

  factory FreelancerOrderSubmissionHistory.fromJson(dynamic json) {
    if (json is! Map) return const FreelancerOrderSubmissionHistory();
    final map = Map<String, dynamic>.from(json);
    final raw = map['submissions'];
    if (raw is! List) return const FreelancerOrderSubmissionHistory();
    return FreelancerOrderSubmissionHistory(
      submissions: raw
          .whereType<Map>()
          .map((e) => FreelancerOrderSubmission.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class FreelancerMyOrder {
  const FreelancerMyOrder({
    required this.id,
    required this.title,
    this.description,
    this.projectType,
    this.orderStatus,
    this.budget,
    this.bidBudgetMin,
    this.bidBudgetMax,
    this.currencyCode,
    this.paymentAmount,
    this.createdAt,
    this.updatedAt,
    this.dueAt,
    this.durationValue,
    this.durationUnit,
    this.category,
    this.clientRevisionNote,
    this.submissionHistory,
    this.files = const [],
  });

  final String id;
  final String title;
  final String? description;
  final String? projectType;
  final String? orderStatus;
  final double? budget;
  final double? bidBudgetMin;
  final double? bidBudgetMax;
  final String? currencyCode;
  final double? paymentAmount;
  final String? createdAt;
  final String? updatedAt;
  final String? dueAt;
  final int? durationValue;
  final String? durationUnit;
  final PoolOrderCategory? category;
  final String? clientRevisionNote;
  final FreelancerOrderSubmissionHistory? submissionHistory;
  final List<OrderFileDescriptor> files;

  List<OrderFileDescriptor> get briefFiles =>
      files.where((f) => f.isBrief).toList();

  List<OrderFileDescriptor> get deliveryFilesFromOrder =>
      files.where((f) => f.isDelivery).toList();

  String get projectTypeLabel => display.projectTypeLabel(projectType);

  String get statusLabel => display.freelancerOrderStatusLabel(orderStatus);

  String? get budgetLabel => display.budgetLabel(
        projectType: projectType,
        budget: budget ?? paymentAmount,
        bidBudgetMin: bidBudgetMin,
        bidBudgetMax: bidBudgetMax,
        currencyCode: currencyCode,
      );

  String? get durationText => display.durationLabel(durationValue, durationUnit);

  factory FreelancerMyOrder.fromJson(Map<String, dynamic> json) {
    return FreelancerMyOrder(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: readMapField<String>(json, 'description', 'description'),
      projectType: readMapField<String>(json, 'projectType', 'project_type'),
      orderStatus: readMapField<String>(json, 'orderStatus', 'order_status'),
      budget: readDouble(json, 'budget', 'budget'),
      bidBudgetMin: readDouble(json, 'bidBudgetMin', 'bid_budget_min'),
      bidBudgetMax: readDouble(json, 'bidBudgetMax', 'bid_budget_max'),
      currencyCode: readMapField<String>(json, 'currencyCode', 'currency_code'),
      paymentAmount: readDouble(json, 'paymentAmount', 'payment_amount'),
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
      updatedAt: readMapField<String>(json, 'updatedAt', 'updated_at'),
      dueAt: readMapField<String>(json, 'dueAt', 'due_at'),
      durationValue: readInt(json, 'durationValue', 'duration_value'),
      durationUnit: readMapField<String>(json, 'durationUnit', 'duration_unit'),
      category: json['category'] is Map
          ? PoolOrderCategory.fromJson(Map<String, dynamic>.from(json['category'] as Map))
          : null,
      clientRevisionNote: readMapField<String>(json, 'clientRevisionNote', 'client_revision_note'),
      submissionHistory: json['submissionHistory'] != null || json['submission_history'] != null
          ? FreelancerOrderSubmissionHistory.fromJson(json['submissionHistory'] ?? json['submission_history'])
          : null,
      files: parseOrderFilesList(json['files']),
    );
  }

  factory FreelancerMyOrder.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      final order = map['order'];
      if (order is Map) {
        return FreelancerMyOrder.fromJson(Map<String, dynamic>.from(order));
      }
    }
    throw FormatException('استجابة تفاصيل طلب المستقل غير متوقعة.');
  }

  static List<FreelancerMyOrder> parseList(dynamic response) {
    if (response is Map<String, dynamic>) {
      final data = response['data'];
      if (data is Map) {
        return extractList(Map<String, dynamic>.from(data)['orders'])
            .map(FreelancerMyOrder.fromJson)
            .toList();
      }
    }
    if (response is Map) {
      final data = response['data'];
      if (data is Map) {
        return extractList(Map<String, dynamic>.from(data)['orders'])
            .map(FreelancerMyOrder.fromJson)
            .toList();
      }
    }
    return const [];
  }
}
