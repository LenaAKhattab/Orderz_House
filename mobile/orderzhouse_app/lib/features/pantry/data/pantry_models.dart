import '../../../core/network/json_helpers.dart';

class PantryAttachment {
  const PantryAttachment({this.url, this.name});

  final String? url;
  final String? name;

  factory PantryAttachment.fromDynamic(dynamic raw) {
    if (raw is String) {
      return PantryAttachment(url: raw, name: null);
    }
    if (raw is Map) {
      final json = Map<String, dynamic>.from(raw);
      final url = readString(json, 'fileUrl', 'file_url');
      final alt = readString(json, 'url', 'url');
      final name = readString(json, 'fileName', 'file_name');
      final altName = readString(json, 'name', 'name');
      return PantryAttachment(
        url: url.isNotEmpty ? url : (alt.isEmpty ? null : alt),
        name: name.isNotEmpty ? name : (altName.isEmpty ? null : altName),
      );
    }
    return const PantryAttachment();
  }
}

class PantryBid {
  const PantryBid({
    required this.id,
    this.amount,
    this.durationDays,
    this.message,
    this.status,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final double? amount;
  final int? durationDays;
  final String? message;
  final String? status;
  final String? createdAt;
  final String? updatedAt;

  bool get isAccepted => (status ?? '').trim().toLowerCase() == 'accepted';

  factory PantryBid.fromJson(Map<String, dynamic> json) {
    return PantryBid(
      id: readString(json, 'id', 'id'),
      amount: readDouble(json, 'amount', 'amount'),
      durationDays: readInt(json, 'durationDays', 'duration_days'),
      message: _nullableString(json, 'message', 'message'),
      status: _nullableString(json, 'status', 'status'),
      createdAt: _nullableString(json, 'createdAt', 'created_at'),
      updatedAt: _nullableString(json, 'updatedAt', 'updated_at'),
    );
  }
}

class PantryDelivery {
  const PantryDelivery({
    required this.id,
    this.message,
    this.status,
    this.adminFeedback,
    this.createdAt,
    this.files = const [],
  });

  final String id;
  final String? message;
  final String? status;
  final String? adminFeedback;
  final String? createdAt;
  final List<PantryAttachment> files;

  factory PantryDelivery.fromJson(Map<String, dynamic> json) {
    final filesRaw = json['files'];
    final files = <PantryAttachment>[];
    if (filesRaw is List) {
      for (final item in filesRaw) {
        files.add(PantryAttachment.fromDynamic(item));
      }
    }
    return PantryDelivery(
      id: readString(json, 'id', 'id'),
      message: _nullableString(json, 'message', 'message'),
      status: _nullableString(json, 'status', 'status'),
      adminFeedback: _nullableString(json, 'adminFeedback', 'admin_feedback'),
      createdAt: _nullableString(json, 'createdAt', 'created_at'),
      files: files,
    );
  }
}

/// Public bid-collection progress (no admin/fair-ranking fields).
class PantryBidCollectionProgress {
  const PantryBidCollectionProgress({
    this.requiredBidCount,
    this.currentBidCount,
    this.status,
    this.outcome,
    this.thresholdReached = false,
    this.label,
  });

  final int? requiredBidCount;
  final int? currentBidCount;
  final String? status;
  final String? outcome;
  final bool thresholdReached;
  final String? label;

  bool get hasRequired => (requiredBidCount ?? 0) > 0;

  bool get isMinimumNotMet {
    final s = (status ?? '').toLowerCase();
    final o = (outcome ?? '').toLowerCase();
    return s == 'minimum_not_met' || o == 'minimum_not_met';
  }

  bool get isClosedAtThreshold {
    if (thresholdReached) return true;
    final s = (status ?? '').toLowerCase();
    final o = (outcome ?? '').toLowerCase();
    return s.contains('threshold') || o == 'threshold_reached';
  }

  factory PantryBidCollectionProgress.fromJson(Map<String, dynamic> json) {
    final nested = json['bidCollection'] ?? json['bid_collection'];
    if (nested is Map) {
      final map = Map<String, dynamic>.from(nested);
      return PantryBidCollectionProgress(
        requiredBidCount: readInt(map, 'requiredBidCount', 'required_bid_count') ??
            readInt(map, 'required', 'required'),
        currentBidCount: readInt(map, 'currentBidCount', 'current_bid_count') ??
            readInt(map, 'current', 'current') ??
            readInt(json, 'validApplicantsCount', 'valid_applicants_count') ??
            readInt(json, 'bidsCount', 'bids_count'),
        status: _nullableString(map, 'bidCollectionStatus', 'bid_collection_status') ??
            _nullableString(map, 'status', 'status'),
        outcome: _nullableString(map, 'bidCollectionOutcome', 'bid_collection_outcome') ??
            _nullableString(map, 'outcome', 'outcome'),
        thresholdReached: map['thresholdReached'] == true || map['threshold_reached'] == true,
        label: _nullableString(map, 'label', 'label'),
      );
    }
    final required = readInt(json, 'requiredBidCount', 'required_bid_count');
    if (required == null) return const PantryBidCollectionProgress();
    return PantryBidCollectionProgress(
      requiredBidCount: required,
      currentBidCount: readInt(json, 'validApplicantsCount', 'valid_applicants_count') ??
          readInt(json, 'bidsCount', 'bids_count'),
      outcome: _nullableString(json, 'bidCollectionOutcome', 'bid_collection_outcome'),
    );
  }
}

class PantryRequest {
  const PantryRequest({
    required this.id,
    this.title = '',
    this.description = '',
    this.status,
    this.pricingType,
    this.fixedBudget,
    this.budgetMin,
    this.budgetMax,
    this.deliveryDays,
    this.durationUnit,
    this.skills = const [],
    this.requirements,
    this.attachments = const [],
    this.bidsCount,
    this.assignedFreelancerId,
    this.createdAt,
    this.updatedAt,
    this.acceptedBid,
    this.delivery,
    this.myBid,
    this.bidCollection,
  });

  final String id;
  final String title;
  final String description;
  final String? status;
  final String? pricingType;
  final double? fixedBudget;
  final double? budgetMin;
  final double? budgetMax;
  final int? deliveryDays;
  final String? durationUnit;
  final List<String> skills;
  final String? requirements;
  final List<PantryAttachment> attachments;
  final int? bidsCount;
  final String? assignedFreelancerId;
  final String? createdAt;
  final String? updatedAt;
  final PantryBid? acceptedBid;
  final PantryDelivery? delivery;
  final PantryBid? myBid;
  final PantryBidCollectionProgress? bidCollection;

  factory PantryRequest.fromJson(Map<String, dynamic> json) {
    final progress = PantryBidCollectionProgress.fromJson(json);
    return PantryRequest(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: readString(json, 'description', 'description'),
      status: _nullableString(json, 'status', 'status'),
      pricingType: _nullableString(json, 'pricingType', 'pricing_type'),
      fixedBudget: readDouble(json, 'fixedBudget', 'fixed_budget'),
      budgetMin: readDouble(json, 'budgetMin', 'budget_min'),
      budgetMax: readDouble(json, 'budgetMax', 'budget_max'),
      deliveryDays: readInt(json, 'deliveryDays', 'delivery_days'),
      durationUnit: _nullableString(json, 'durationUnit', 'duration_unit'),
      skills: _stringList(json['skills']),
      requirements: _nullableString(json, 'requirements', 'requirements'),
      attachments: _attachments(json['attachments']),
      bidsCount: readInt(json, 'bidsCount', 'bids_count'),
      assignedFreelancerId: _nullableString(json, 'assignedFreelancerId', 'assigned_freelancer_id'),
      createdAt: _nullableString(json, 'createdAt', 'created_at'),
      updatedAt: _nullableString(json, 'updatedAt', 'updated_at'),
      acceptedBid: _bidOrNull(json['acceptedBid'] ?? json['accepted_bid']),
      delivery: _deliveryOrNull(json['delivery'] ?? json['latestDelivery'] ?? json['latest_delivery']),
      myBid: _bidOrNull(json['myBid'] ?? json['my_bid']),
      bidCollection: progress.hasRequired || progress.isMinimumNotMet || progress.isClosedAtThreshold
          ? progress
          : (json['bidCollection'] is Map || json['requiredBidCount'] != null || json['required_bid_count'] != null
              ? progress
              : null),
    );
  }

  PantryRequest mergeDetail({PantryBid? myBid, PantryDelivery? delivery, PantryBid? acceptedBid}) {
    return PantryRequest(
      id: id,
      title: title,
      description: description,
      status: status,
      pricingType: pricingType,
      fixedBudget: fixedBudget,
      budgetMin: budgetMin,
      budgetMax: budgetMax,
      deliveryDays: deliveryDays,
      durationUnit: durationUnit,
      skills: skills,
      requirements: requirements,
      attachments: attachments,
      bidsCount: bidsCount,
      assignedFreelancerId: assignedFreelancerId,
      createdAt: createdAt,
      updatedAt: updatedAt,
      acceptedBid: acceptedBid ?? this.acceptedBid,
      delivery: delivery ?? this.delivery,
      myBid: myBid ?? this.myBid,
      bidCollection: bidCollection,
    );
  }
}

class PantryRequestDetail {
  const PantryRequestDetail({required this.request, this.myBid, this.delivery});

  final PantryRequest request;
  final PantryBid? myBid;
  final PantryDelivery? delivery;
}

String? _nullableString(Map<String, dynamic> json, String camel, String snake) {
  final value = readString(json, camel, snake);
  return value.isEmpty ? null : value;
}

List<String> _stringList(dynamic raw) {
  if (raw is List) {
    return raw.map((e) => '$e'.trim()).where((e) => e.isNotEmpty).toList();
  }
  if (raw is String && raw.trim().isNotEmpty) return [raw.trim()];
  return const [];
}

List<PantryAttachment> _attachments(dynamic raw) {
  if (raw is! List) return const [];
  return raw.map(PantryAttachment.fromDynamic).toList();
}

PantryBid? _bidOrNull(dynamic raw) {
  if (raw is Map) return PantryBid.fromJson(Map<String, dynamic>.from(raw));
  return null;
}

PantryDelivery? _deliveryOrNull(dynamic raw) {
  if (raw is Map) return PantryDelivery.fromJson(Map<String, dynamic>.from(raw));
  if (raw is List && raw.isNotEmpty && raw.first is Map) {
    return PantryDelivery.fromJson(Map<String, dynamic>.from(raw.first as Map));
  }
  return null;
}

Map<String, dynamic>? unwrapDataMap(dynamic body) {
  if (body is Map) {
    final data = body['data'];
    if (data is Map) return Map<String, dynamic>.from(data);
    return Map<String, dynamic>.from(body);
  }
  return null;
}

List<Map<String, dynamic>> unwrapRequestMaps(dynamic body) {
  final data = unwrapDataMap(body);
  if (data == null) return const [];
  return extractList(data, nestedKey: 'requests');
}
