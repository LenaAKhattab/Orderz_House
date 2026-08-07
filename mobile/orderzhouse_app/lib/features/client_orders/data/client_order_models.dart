import '../../../core/network/json_helpers.dart';
import '../../orders/data/order_display_helpers.dart' as display;
import '../../orders/data/pool_order_models.dart';
import '../../orders/data/order_file_models.dart';
import 'order_payment_models.dart';

class ClientOrderBidSummary {
  const ClientOrderBidSummary({
    this.bidId,
    this.amount,
    this.status,
    this.createdAt,
    this.displayName,
  });

  final String? bidId;
  final double? amount;
  final String? status;
  final String? createdAt;
  final String? displayName;

  factory ClientOrderBidSummary.fromJson(Map<String, dynamic> json) {
    return ClientOrderBidSummary(
      bidId: readMapField<String>(json, 'bidId', 'bid_id'),
      amount: readDouble(json, 'amount', 'amount'),
      status: readMapField<String>(json, 'status', 'status'),
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
      displayName: readMapField<String>(json, 'displayName', 'display_name'),
    );
  }
}

class ClientOrderSubmissionSummary {
  const ClientOrderSubmissionSummary({
    this.id,
    this.status,
    this.statusBadgeAr,
    this.createdAt,
    this.submittedAt,
    this.message,
    this.filesCount = 0,
    this.files = const [],
  });

  final String? id;
  final String? status;
  final String? statusBadgeAr;
  final String? createdAt;
  final String? submittedAt;
  final String? message;
  final int filesCount;
  final List<OrderFileDescriptor> files;

  List<String> get fileNames => files.map((f) => f.displayName).toList();

  String get displayStatus => statusBadgeAr ?? status ?? '—';

  String? get displayDate => submittedAt ?? createdAt;

  factory ClientOrderSubmissionSummary.fromJson(Map<String, dynamic> json) {
    final files = parseOrderFilesFromSubmissionJson(json);
    return ClientOrderSubmissionSummary(
      id: readMapField<String>(json, 'id', 'id'),
      status: readMapField<String>(json, 'status', 'status'),
      statusBadgeAr: readMapField<String>(json, 'statusBadgeAr', 'status_badge_ar'),
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
      submittedAt: readMapField<String>(json, 'submittedAt', 'submitted_at'),
      message: readMapField<String>(json, 'message', 'message'),
      filesCount: files.length,
      files: files,
    );
  }
}

class ClientOrder {
  const ClientOrder({
    required this.id,
    required this.title,
    this.description,
    this.projectType,
    this.orderStatus,
    this.budget,
    this.bidBudgetMin,
    this.bidBudgetMax,
    this.currencyCode,
    this.paymentStatus,
    this.paymentAmount,
    this.createdAt,
    this.dueAt,
    this.durationValue,
    this.durationUnit,
    this.category,
    this.hasAssignedFreelancer = false,
    this.bidSummaries = const [],
    this.submissions = const [],
    this.bidsCount = 0,
    this.clientRevisionNote,
    this.files = const [],
    this.isPublished,
    this.isOpenForPool,
    this.requiresPaymentFlag,
    this.canPayNowFlag,
    this.requiresAdminReviewFlag,
    this.clientDisplayStatus,
    this.clientDisplayStatusLabelAr,
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
  final String? paymentStatus;
  final double? paymentAmount;
  final String? createdAt;
  final String? dueAt;
  final int? durationValue;
  final String? durationUnit;
  final PoolOrderCategory? category;
  final bool hasAssignedFreelancer;
  final List<ClientOrderBidSummary> bidSummaries;
  final List<ClientOrderSubmissionSummary> submissions;
  final int bidsCount;
  final String? clientRevisionNote;
  final List<OrderFileDescriptor> files;
  final bool? isPublished;
  final bool? isOpenForPool;
  final bool? requiresPaymentFlag;
  final bool? canPayNowFlag;
  final bool? requiresAdminReviewFlag;
  final String? clientDisplayStatus;
  final String? clientDisplayStatusLabelAr;

  String get projectTypeLabel => display.projectTypeLabel(projectType);

  String get statusLabel {
    final fromApi = clientDisplayStatusLabelAr?.trim();
    if (fromApi != null && fromApi.isNotEmpty) return fromApi;
    if (requiresAdminReview) return 'بانتظار مراجعة الإدارة';
    if (needsPayment) return 'بانتظار الدفع';
    return display.clientOrderStatusLabel(orderStatus);
  }

  String get paymentStatusLabel => display.paymentStatusLabel(paymentStatus);

  String? get budgetLabel => display.budgetLabel(
        projectType: projectType,
        budget: budget,
        bidBudgetMin: bidBudgetMin,
        bidBudgetMax: bidBudgetMax,
        currencyCode: currencyCode,
      );

  String? get durationText => display.durationLabel(durationValue, durationUnit);

  bool get needsPayment => orderNeedsPayment(
        projectType: projectType,
        paymentStatus: paymentStatus,
        orderStatus: orderStatus,
        requiresPaymentFlag: requiresPaymentFlag,
      );

  bool get canPayNow => orderCanPayNow(
        needsPayment: needsPayment,
        canPayNowFlag: canPayNowFlag,
      );

  bool get requiresAdminReview => orderRequiresAdminReview(
        paymentStatus: paymentStatus,
        isPublished: isPublished,
        isOpenForPool: isOpenForPool,
        orderStatus: orderStatus,
        requiresAdminReviewFlag: requiresAdminReviewFlag,
        clientDisplayStatus: clientDisplayStatus,
      );

  String? get statusHintAr {
    if (needsPayment) return 'أكمل الدفع حتى يبدأ معالجة الطلب';
    if (requiresAdminReview) {
      return 'تم استلام الدفع، وسيتم نشر الطلب بعد مراجعته من الإدارة';
    }
    return null;
  }

  String? get assignedFreelancerLabel {
    if (!hasAssignedFreelancer) return null;
    final accepted = bidSummaries.where((b) => b.status == 'accepted' || b.status == 'selected');
    if (accepted.isNotEmpty && accepted.first.displayName != null) {
      return accepted.first.displayName;
    }
    final anyName = () {
      for (final b in bidSummaries) {
        final n = b.displayName?.trim();
        if (n != null && n.isNotEmpty) return n;
      }
      return null;
    }();
    return anyName ?? 'مستقل معيّن';
  }

  factory ClientOrder.fromJson(Map<String, dynamic> json) {
    final bidUsersRaw = json['bidUsers'] ?? json['bid_users'];
    final bids = bidUsersRaw is List
        ? bidUsersRaw
            .whereType<Map>()
            .map((e) => ClientOrderBidSummary.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <ClientOrderBidSummary>[];

    final history = json['submissionHistory'] ?? json['submission_history'];
    List<ClientOrderSubmissionSummary> submissions = const [];
    if (history is Map) {
      final subs = history['submissions'];
      if (subs is List) {
        submissions = subs
            .whereType<Map>()
            .map((e) => ClientOrderSubmissionSummary.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }
    }

    bool? readNullableBool(String camel, String snake) {
      if (!json.containsKey(camel) && !json.containsKey(snake)) return null;
      return readBool(json, camel, snake);
    }

    return ClientOrder(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: readMapField<String>(json, 'description', 'description'),
      projectType: readMapField<String>(json, 'projectType', 'project_type'),
      orderStatus: readMapField<String>(json, 'orderStatus', 'order_status'),
      budget: readDouble(json, 'budget', 'budget'),
      bidBudgetMin: readDouble(json, 'bidBudgetMin', 'bid_budget_min'),
      bidBudgetMax: readDouble(json, 'bidBudgetMax', 'bid_budget_max'),
      currencyCode: readMapField<String>(json, 'currencyCode', 'currency_code'),
      paymentStatus: readMapField<String>(json, 'paymentStatus', 'payment_status'),
      paymentAmount: readDouble(json, 'paymentAmount', 'payment_amount'),
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
      dueAt: readMapField<String>(json, 'dueAt', 'due_at'),
      durationValue: readInt(json, 'durationValue', 'duration_value'),
      durationUnit: readMapField<String>(json, 'durationUnit', 'duration_unit'),
      category: json['category'] is Map
          ? PoolOrderCategory.fromJson(Map<String, dynamic>.from(json['category'] as Map))
          : null,
      hasAssignedFreelancer: readBool(json, 'hasAssignedFreelancer', 'has_assigned_freelancer'),
      bidSummaries: bids,
      submissions: submissions,
      bidsCount: readInt(json, 'bidsCount', 'bids_count') ?? bids.length,
      clientRevisionNote: readMapField<String>(json, 'clientRevisionNote', 'client_revision_note'),
      files: parseOrderFilesList(json['files']),
      isPublished: readNullableBool('isPublished', 'is_published'),
      isOpenForPool: readNullableBool('isOpenForPool', 'is_open_for_pool'),
      requiresPaymentFlag: readNullableBool('requiresPayment', 'requires_payment'),
      canPayNowFlag: readNullableBool('canPayNow', 'can_pay_now'),
      requiresAdminReviewFlag: readNullableBool('requiresAdminReview', 'requires_admin_review'),
      clientDisplayStatus: readMapField<String>(json, 'clientDisplayStatus', 'client_display_status'),
      clientDisplayStatusLabelAr:
          readMapField<String>(json, 'clientDisplayStatusLabelAr', 'client_display_status_label_ar'),
    );
  }

  factory ClientOrder.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      final order = map['order'];
      if (order is Map) {
        return ClientOrder.fromJson(Map<String, dynamic>.from(order));
      }
    }
    throw FormatException('استجابة تفاصيل طلب العميل غير متوقعة.');
  }

  static List<ClientOrder> parseList(dynamic response) {
    if (response is Map<String, dynamic>) {
      final data = response['data'];
      if (data is Map) {
        return extractList(Map<String, dynamic>.from(data)['orders'])
            .map(ClientOrder.fromJson)
            .toList();
      }
    }
    if (response is Map) {
      final data = response['data'];
      if (data is Map) {
        return extractList(Map<String, dynamic>.from(data)['orders'])
            .map(ClientOrder.fromJson)
            .toList();
      }
    }
    return const [];
  }
}
