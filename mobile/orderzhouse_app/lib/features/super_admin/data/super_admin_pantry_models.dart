import '../../../core/network/json_helpers.dart';
import 'super_admin_models.dart';

class SuperAdminPantryFairRanking {
  const SuperAdminPantryFairRanking({
    this.eligibleForAssignment = false,
    this.recommendedBidId,
  });

  final bool eligibleForAssignment;
  final String? recommendedBidId;

  factory SuperAdminPantryFairRanking.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const SuperAdminPantryFairRanking();
    return SuperAdminPantryFairRanking(
      eligibleForAssignment: readBool(json, 'eligibleForAssignment', 'eligible_for_assignment'),
      recommendedBidId: _nullIfEmpty(readString(json, 'recommendedBidId', 'recommended_bid_id')),
    );
  }
}

class SuperAdminPantryBid {
  const SuperAdminPantryBid({
    required this.id,
    this.freelancerName,
    this.amountJod,
    this.durationDays,
    this.status,
    this.createdAt,
    this.message,
  });

  final String id;
  final String? freelancerName;
  final double? amountJod;
  final int? durationDays;
  final String? status;
  final String? createdAt;
  final String? message;

  bool get isPending => (status ?? '').trim().toLowerCase() == 'pending';

  factory SuperAdminPantryBid.fromJson(Map<String, dynamic> json) {
    return SuperAdminPantryBid(
      id: readString(json, 'id', 'id'),
      freelancerName: _nullIfEmpty(readString(json, 'freelancerName', 'freelancer_name')),
      amountJod: readDouble(json, 'amount', 'amount'),
      durationDays: readInt(json, 'durationDays', 'duration_days'),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      createdAt: _nullIfEmpty(readString(json, 'createdAt', 'created_at')),
      message: _nullIfEmpty(readString(json, 'message', 'message')),
    );
  }
}

class SuperAdminPantryDeliveryFile {
  const SuperAdminPantryDeliveryFile({required this.id, this.name});

  final String id;
  final String? name;

  factory SuperAdminPantryDeliveryFile.fromJson(Map<String, dynamic> json) {
    return SuperAdminPantryDeliveryFile(
      id: readString(json, 'id', 'id'),
      name: _nullIfEmpty(readString(json, 'fileName', 'file_name')) ??
          _nullIfEmpty(readString(json, 'name', 'name')),
    );
  }
}

class SuperAdminPantryDeliveryDetail {
  const SuperAdminPantryDeliveryDetail({
    required this.id,
    this.requestId,
    this.requestTitle,
    this.freelancerName,
    this.status,
    this.notes,
    this.createdAt,
    this.files = const [],
  });

  final String id;
  final String? requestId;
  final String? requestTitle;
  final String? freelancerName;
  final String? status;
  final String? notes;
  final String? createdAt;
  final List<SuperAdminPantryDeliveryFile> files;

  factory SuperAdminPantryDeliveryDetail.fromJson(Map<String, dynamic> json) {
    final filesRaw = json['files'];
    final files = <SuperAdminPantryDeliveryFile>[];
    if (filesRaw is List) {
      for (final row in filesRaw) {
        if (row is Map) files.add(SuperAdminPantryDeliveryFile.fromJson(Map<String, dynamic>.from(row)));
      }
    }
    return SuperAdminPantryDeliveryDetail(
      id: readString(json, 'id', 'id'),
      requestId: _nullIfEmpty(readString(json, 'pantryRequestId', 'pantry_request_id')),
      requestTitle: _nullIfEmpty(readString(json, 'requestTitle', 'request_title')),
      freelancerName: _nullIfEmpty(readString(json, 'freelancerName', 'freelancer_name')),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      notes: _nullIfEmpty(readString(json, 'message', 'message')) ??
          _nullIfEmpty(readString(json, 'adminFeedback', 'admin_feedback')),
      createdAt: _nullIfEmpty(readString(json, 'createdAt', 'created_at')),
      files: files,
    );
  }
}

class SuperAdminPantryRequestDetail {
  const SuperAdminPantryRequestDetail({
    required this.id,
    required this.title,
    this.requestStatus,
    this.collection,
    this.relistCount = 0,
    this.bids = const [],
    this.deliveries = const [],
    this.fairRanking,
  });

  final String id;
  final String title;
  final String? requestStatus;
  final SuperAdminBidCollection? collection;
  final int relistCount;
  final List<SuperAdminPantryBid> bids;
  final List<SuperAdminPantryDeliveryDetail> deliveries;
  final SuperAdminPantryFairRanking? fairRanking;
}

SuperAdminPantryRequestDetail parsePantryRequestDetail(dynamic body) {
  final data = _unwrap(body);
  Map<String, dynamic>? requestJson;
  final requestRaw = data?['request'];
  if (requestRaw is Map) {
    requestJson = Map<String, dynamic>.from(requestRaw);
  } else if (data != null) {
    requestJson = data;
  }
  requestJson ??= <String, dynamic>{};

  final collectionRaw = requestJson['bidCollection'] ?? requestJson['bid_collection'];
  Map<String, dynamic>? collectionJson;
  if (collectionRaw is Map) collectionJson = Map<String, dynamic>.from(collectionRaw);

  final bidsRaw = data?['bids'] ?? requestJson['bids'];
  final bids = <SuperAdminPantryBid>[];
  if (bidsRaw is List) {
    for (final row in bidsRaw) {
      if (row is Map) bids.add(SuperAdminPantryBid.fromJson(Map<String, dynamic>.from(row)));
    }
  }

  final deliveriesRaw = data?['deliveries'] ?? requestJson['deliveries'];
  final deliveries = <SuperAdminPantryDeliveryDetail>[];
  if (deliveriesRaw is List) {
    for (final row in deliveriesRaw) {
      if (row is Map) {
        deliveries.add(SuperAdminPantryDeliveryDetail.fromJson(Map<String, dynamic>.from(row)));
      }
    }
  }

  final rankingRaw = data?['fairRanking'] ?? data?['fair_ranking'];
  Map<String, dynamic>? rankingJson;
  if (rankingRaw is Map) rankingJson = Map<String, dynamic>.from(rankingRaw);

  return SuperAdminPantryRequestDetail(
    id: readString(requestJson, 'id', 'id'),
    title: _nullIfEmpty(readString(requestJson, 'title', 'title')) ?? 'طلب بيت المونة',
    requestStatus: _nullIfEmpty(readString(requestJson, 'status', 'status')),
    collection: SuperAdminBidCollection.fromJson(collectionJson),
    relistCount: readInt(requestJson, 'relistCount', 'relist_count') ?? 0,
    bids: bids,
    deliveries: deliveries,
    fairRanking: rankingJson == null ? null : SuperAdminPantryFairRanking.fromJson(rankingJson),
  );
}

SuperAdminPantryDeliveryDetail? parsePantryDeliveryById(dynamic body, String deliveryId) {
  final data = _unwrap(body);
  final list = data == null ? const <Map<String, dynamic>>[] : extractList(data, nestedKey: 'deliveries');
  for (final row in list) {
    if (readString(row, 'id', 'id') == deliveryId) {
      return SuperAdminPantryDeliveryDetail.fromJson(row);
    }
  }
  return null;
}

String formatSuperAdminDate(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  final parsed = DateTime.tryParse(raw.trim());
  if (parsed == null) return raw.trim();
  final d = parsed.toLocal();
  final mm = d.month.toString().padLeft(2, '0');
  final dd = d.day.toString().padLeft(2, '0');
  return '${d.year}-$mm-$dd';
}

Map<String, dynamic>? _unwrap(dynamic body) {
  if (body is! Map) return null;
  final map = Map<String, dynamic>.from(body);
  final data = map['data'];
  if (data is Map) return Map<String, dynamic>.from(data);
  return map;
}

String? _nullIfEmpty(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}
