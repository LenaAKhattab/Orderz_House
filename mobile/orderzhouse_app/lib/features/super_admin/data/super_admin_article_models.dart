import '../../../core/network/json_helpers.dart';
import 'super_admin_models.dart';

class SuperAdminArticleFairRanking {
  const SuperAdminArticleFairRanking({
    this.eligibleForAssignment = false,
    this.recommendedApplicationId,
    this.ranksByApplicationId = const {},
  });

  final bool eligibleForAssignment;
  final String? recommendedApplicationId;
  final Map<String, int> ranksByApplicationId;

  factory SuperAdminArticleFairRanking.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const SuperAdminArticleFairRanking();
    final ranks = <String, int>{};
    final candidates = json['candidates'];
    if (candidates is List) {
      for (final row in candidates) {
        if (row is! Map) continue;
        final map = Map<String, dynamic>.from(row);
        final id = readString(map, 'applicationId', 'application_id').trim();
        final rank = readInt(map, 'rank', 'rank');
        if (id.isNotEmpty && rank != null) ranks[id] = rank;
      }
    }
    return SuperAdminArticleFairRanking(
      eligibleForAssignment: readBool(json, 'eligibleForAssignment', 'eligible_for_assignment'),
      recommendedApplicationId: _nullIfEmpty(
        readString(json, 'recommendedApplicationId', 'recommended_application_id'),
      ),
      ranksByApplicationId: ranks,
    );
  }
}

class SuperAdminArticleApplication {
  const SuperAdminArticleApplication({
    required this.id,
    this.freelancerName,
    this.status,
    this.submittedAt,
    this.rank,
  });

  final String id;
  final String? freelancerName;
  final String? status;
  final String? submittedAt;
  final int? rank;

  bool get isPending => (status ?? '').trim().toLowerCase() == 'pending';
  bool get isSelected => (status ?? '').trim().toLowerCase() == 'selected';

  factory SuperAdminArticleApplication.fromJson(Map<String, dynamic> json, {int? rank}) {
    final first = readString(json, 'freelancerFirstName', 'freelancer_first_name');
    final family = readString(json, 'freelancerFamilyName', 'freelancer_family_name');
    final joined = [first, family].where((e) => e.trim().isNotEmpty).join(' ').trim();
    final fallback = readString(json, 'freelancerName', 'freelancer_name');
    return SuperAdminArticleApplication(
      id: readString(json, 'id', 'id'),
      freelancerName: _nullIfEmpty(joined) ?? _nullIfEmpty(fallback),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      submittedAt: _nullIfEmpty(readString(json, 'submittedAt', 'submitted_at')) ??
          _nullIfEmpty(readString(json, 'createdAt', 'created_at')),
      rank: rank,
    );
  }
}

class SuperAdminArticleDetail {
  const SuperAdminArticleDetail({
    required this.id,
    required this.title,
    this.articleStatus,
    this.valueJod,
    this.collection,
    this.relistCount = 0,
    this.createdAt,
    this.deadline,
    this.applications = const [],
    this.fairRanking,
  });

  final String id;
  final String title;
  final String? articleStatus;
  final double? valueJod;
  final SuperAdminBidCollection? collection;
  final int relistCount;
  final String? createdAt;
  final String? deadline;
  final List<SuperAdminArticleApplication> applications;
  final SuperAdminArticleFairRanking? fairRanking;

  bool get hasSelectedApplicant => applications.any((a) => a.isSelected);
}

String articleStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'published':
      return 'منشور';
    case 'draft':
      return 'مسودة';
    case 'closed':
      return 'مغلق';
    case 'cancelled':
      return 'ملغى';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : 'مقال';
  }
}

String articleApplicationStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'pending':
      return 'قيد المراجعة';
    case 'selected':
      return superAdminAssignedApplicantLabelAr;
    case 'rejected':
      return 'مرفوض';
    case 'withdrawn':
      return 'منسحب';
    case 'cancelled':
      return 'ملغى';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : 'طلب';
  }
}

String articleCollectionStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'assigned':
      return superAdminAssignedApplicantLabelAr;
    default:
      return pantryCollectionStatusLabelAr(status);
  }
}

SuperAdminArticleDetail parseArticleDetail({
  required String articleId,
  dynamic articleBody,
  required dynamic applicationsBody,
}) {
  final articleData = _unwrap(articleBody);
  Map<String, dynamic>? articleJson;
  final articleRaw = articleData?['article'];
  if (articleRaw is Map) {
    articleJson = Map<String, dynamic>.from(articleRaw);
  } else if (articleData != null && articleData['id'] != null) {
    articleJson = articleData;
  }

  final appsData = _unwrap(applicationsBody) ?? const <String, dynamic>{};
  Map<String, dynamic>? collectionJson;
  final collectionRaw = appsData['bidCollection'] ??
      appsData['bid_collection'] ??
      articleJson?['bidCollection'] ??
      articleJson?['bid_collection'] ??
      articleData?['bidCollection'];
  if (collectionRaw is Map) collectionJson = Map<String, dynamic>.from(collectionRaw);
  final collection = SuperAdminBidCollection.fromJson(collectionJson);

  final rankingRaw = appsData['fairRanking'] ?? appsData['fair_ranking'];
  Map<String, dynamic>? rankingJson;
  if (rankingRaw is Map) rankingJson = Map<String, dynamic>.from(rankingRaw);
  final ranking = rankingJson == null ? null : SuperAdminArticleFairRanking.fromJson(rankingJson);

  final applications = <SuperAdminArticleApplication>[];
  final appsRaw = appsData['applications'];
  if (appsRaw is List) {
    for (final row in appsRaw) {
      if (row is! Map) continue;
      final map = Map<String, dynamic>.from(row);
      final id = readString(map, 'id', 'id');
      applications.add(
        SuperAdminArticleApplication.fromJson(
          map,
          rank: ranking?.ranksByApplicationId[id],
        ),
      );
    }
  }

  final firstAppTitle = appsRaw is List && appsRaw.isNotEmpty && appsRaw.first is Map
      ? _nullIfEmpty(
          readString(Map<String, dynamic>.from(appsRaw.first as Map), 'articleTitle', 'article_title'),
        )
      : null;
  final articleIdResolved = articleJson == null
      ? articleId
      : (readString(articleJson, 'id', 'id').trim().isEmpty
          ? articleId
          : readString(articleJson, 'id', 'id'));

  return SuperAdminArticleDetail(
    id: articleIdResolved,
    title: _nullIfEmpty(articleJson == null ? '' : readString(articleJson, 'title', 'title')) ??
        firstAppTitle ??
        'مقال',
    articleStatus: articleJson == null
        ? null
        : _nullIfEmpty(readString(articleJson, 'status', 'status')),
    valueJod: articleJson == null ? null : readDouble(articleJson, 'articleValueJod', 'article_value_jod'),
    collection: collection,
    relistCount: (articleJson == null ? null : readInt(articleJson, 'relistCount', 'relist_count')) ??
        collection.relistCount ??
        0,
    createdAt: articleJson == null
        ? null
        : (_nullIfEmpty(readString(articleJson, 'createdAt', 'created_at')) ??
            _nullIfEmpty(readString(articleJson, 'publishedAt', 'published_at'))),
    deadline: collection.deadline ??
        (articleJson == null
            ? null
            : _nullIfEmpty(readString(articleJson, 'applicationDeadlineAt', 'application_deadline_at'))),
    applications: applications,
    fairRanking: ranking,
  );
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
