import '../../../core/network/json_helpers.dart';

import 'order_display_helpers.dart' as display;

class PoolMyParticipation {
  const PoolMyParticipation({this.id, this.status, this.amount});

  final String? id;
  final String? status;
  final double? amount;

  factory PoolMyParticipation.fromJson(dynamic json) {
    if (json is! Map) return const PoolMyParticipation();
    final map = Map<String, dynamic>.from(json);
    return PoolMyParticipation(
      id: readMapField<String>(map, 'id', 'id'),
      status: readMapField<String>(map, 'status', 'status'),
      amount: readDouble(map, 'amount', 'amount'),
    );
  }

  bool get isPending => status == 'pending';
  bool get isAccepted => status == 'accepted';
}

class PoolPlanEligibility {
  const PoolPlanEligibility({
    this.isLockedByPlan = false,
    this.lockReason,
    this.reasonCode,
    this.requiredPlanLabel,
    this.requiredTierCode,
    this.planConfigurationError = false,
    this.suggestedUpgradePlanTitle,
  });

  final bool isLockedByPlan;
  final String? lockReason;
  final String? reasonCode;
  final String? requiredPlanLabel;
  final String? requiredTierCode;
  final bool planConfigurationError;
  final String? suggestedUpgradePlanTitle;

  factory PoolPlanEligibility.fromJson(dynamic json) {
    if (json is! Map) return const PoolPlanEligibility();
    final map = Map<String, dynamic>.from(json);
    return PoolPlanEligibility(
      isLockedByPlan: readBool(map, 'isLockedByPlan', 'is_locked_by_plan'),
      lockReason: readMapField<String>(map, 'lockReason', 'lock_reason'),
      reasonCode: readMapField<String>(map, 'reasonCode', 'reason_code'),
      requiredPlanLabel: readMapField<String>(map, 'requiredPlanLabel', 'required_plan_label'),
      requiredTierCode: readMapField<String>(map, 'requiredTierCode', 'required_tier_code'),
      planConfigurationError:
          readBool(map, 'planConfigurationError', 'plan_configuration_error'),
      suggestedUpgradePlanTitle: readMapField<String>(
        map,
        'suggestedUpgradePlanTitle',
        'suggested_upgrade_plan_title',
      ),
    );
  }
}

class PoolOrderCategory {
  const PoolOrderCategory({this.id, this.name, this.slug});

  final String? id;
  final String? name;
  final String? slug;

  factory PoolOrderCategory.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const PoolOrderCategory();
    return PoolOrderCategory(
      id: readMapField<String>(json, 'id', 'id'),
      name: readMapField<String>(json, 'name', 'name'),
      slug: readMapField<String>(json, 'slug', 'slug'),
    );
  }
}

class PoolOrder {
  const PoolOrder({
    required this.id,
    required this.title,
    this.description,
    this.projectType,
    this.orderStatus,
    this.budget,
    this.bidBudgetMin,
    this.bidBudgetMax,
    this.currencyCode,
    this.createdAt,
    this.poolListedAt,
    this.category,
    this.applicantsCount = 0,
    this.durationValue,
    this.durationUnit,
    this.dueAt,
    this.filesCount = 0,
    this.hasAssignedFreelancer = false,
    this.acceptsPriceBidsFlag = false,
    this.poolEligibility,
    this.myBid,
    this.myClaim,
    this.receivedAt,
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
  final String? createdAt;
  final String? poolListedAt;
  final PoolOrderCategory? category;
  final int applicantsCount;
  final int? durationValue;
  final String? durationUnit;
  final String? dueAt;
  final int filesCount;
  final bool hasAssignedFreelancer;
  final bool acceptsPriceBidsFlag;
  final PoolPlanEligibility? poolEligibility;
  final PoolMyParticipation? myBid;
  final PoolMyParticipation? myClaim;
  final String? receivedAt;

  bool get isPlanLocked => poolEligibility?.isLockedByPlan == true;

  bool get isBidding => projectType == 'bidding' || acceptsPriceBidsFlag;

  String get projectTypeLabel => display.projectTypeLabel(projectType);

  String get statusLabel => display.poolOrderStatusLabel(orderStatus);

  String? get budgetLabel => display.budgetLabel(
        projectType: projectType,
        budget: budget,
        bidBudgetMin: bidBudgetMin,
        bidBudgetMax: bidBudgetMax,
        currencyCode: currencyCode,
      );

  String? get durationText => display.durationLabel(durationValue, durationUnit);

  String? get publishedAtLabel => poolListedAt ?? createdAt;

  factory PoolOrder.fromJson(Map<String, dynamic> json) {
    return PoolOrder(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: readMapField<String>(json, 'description', 'description'),
      projectType: readMapField<String>(json, 'projectType', 'project_type'),
      orderStatus: readMapField<String>(json, 'orderStatus', 'order_status'),
      budget: readDouble(json, 'budget', 'budget'),
      bidBudgetMin: readDouble(json, 'bidBudgetMin', 'bid_budget_min'),
      bidBudgetMax: readDouble(json, 'bidBudgetMax', 'bid_budget_max'),
      currencyCode: readMapField<String>(json, 'currencyCode', 'currency_code'),
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
      poolListedAt: readMapField<String>(json, 'poolListedAt', 'pool_listed_at'),
      category: json['category'] is Map
          ? PoolOrderCategory.fromJson(Map<String, dynamic>.from(json['category'] as Map))
          : null,
      applicantsCount: readInt(json, 'applicantsCount', 'applicants_count') ??
          readInt(json, 'bidsCount', 'bids_count') ??
          0,
      durationValue: readInt(json, 'durationValue', 'duration_value'),
      durationUnit: readMapField<String>(json, 'durationUnit', 'duration_unit'),
      dueAt: readMapField<String>(json, 'dueAt', 'due_at'),
      filesCount: readInt(json, 'filesCount', 'files_count') ?? 0,
      hasAssignedFreelancer: readBool(json, 'hasAssignedFreelancer', 'has_assigned_freelancer'),
      acceptsPriceBidsFlag: readBool(json, 'acceptsPriceBids', 'accepts_price_bids'),
      poolEligibility: json['poolEligibility'] != null || json['pool_eligibility'] != null
          ? PoolPlanEligibility.fromJson(json['poolEligibility'] ?? json['pool_eligibility'])
          : null,
      myBid: json['myBid'] != null || json['my_bid'] != null
          ? PoolMyParticipation.fromJson(json['myBid'] ?? json['my_bid'])
          : null,
      myClaim: json['myClaim'] != null || json['my_claim'] != null
          ? PoolMyParticipation.fromJson(json['myClaim'] ?? json['my_claim'])
          : null,
      receivedAt: readMapField<String>(json, 'receivedAt', 'received_at'),
    );
  }

  PoolOrder copyWithParticipation({
    PoolMyParticipation? myBid,
    PoolMyParticipation? myClaim,
    bool? hasAssignedFreelancer,
    String? receivedAt,
  }) {
    return PoolOrder(
      id: id,
      title: title,
      description: description,
      projectType: projectType,
      orderStatus: orderStatus,
      budget: budget,
      bidBudgetMin: bidBudgetMin,
      bidBudgetMax: bidBudgetMax,
      currencyCode: currencyCode,
      createdAt: createdAt,
      poolListedAt: poolListedAt,
      category: category,
      applicantsCount: applicantsCount,
      durationValue: durationValue,
      durationUnit: durationUnit,
      dueAt: dueAt,
      filesCount: filesCount,
      hasAssignedFreelancer: hasAssignedFreelancer ?? this.hasAssignedFreelancer,
      acceptsPriceBidsFlag: acceptsPriceBidsFlag,
      poolEligibility: poolEligibility,
      myBid: myBid ?? this.myBid,
      myClaim: myClaim ?? this.myClaim,
      receivedAt: receivedAt ?? this.receivedAt,
    );
  }

  factory PoolOrder.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      final order = map['order'];
      if (order is Map) {
        return PoolOrder.fromJson(Map<String, dynamic>.from(order));
      }
    }
    throw FormatException('استجابة تفاصيل الطلب غير متوقعة.');
  }

  static List<PoolOrder> parseList(dynamic data) {
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      return extractList(map['orders']).map(PoolOrder.fromJson).toList();
    }
    return extractList(data, nestedKey: 'orders').map(PoolOrder.fromJson).toList();
  }
}

class PoolOrdersPage {
  const PoolOrdersPage({
    required this.orders,
    this.page = 1,
    this.totalPages = 1,
    this.total = 0,
  });

  final List<PoolOrder> orders;
  final int page;
  final int totalPages;
  final int total;

  bool get hasMore => page < totalPages;

  factory PoolOrdersPage.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is! Map) {
      return const PoolOrdersPage(orders: []);
    }
    final map = Map<String, dynamic>.from(data);
    final pagination = map['pagination'];
    int page = 1;
    int totalPages = 1;
    int total = 0;
    if (pagination is Map) {
      final p = Map<String, dynamic>.from(pagination);
      page = readInt(p, 'page', 'page') ?? 1;
      totalPages = readInt(p, 'totalPages', 'total_pages') ?? 1;
      total = readInt(p, 'total', 'total') ?? 0;
    }
    return PoolOrdersPage(
      orders: PoolOrder.parseList(map),
      page: page,
      totalPages: totalPages,
      total: total,
    );
  }
}
