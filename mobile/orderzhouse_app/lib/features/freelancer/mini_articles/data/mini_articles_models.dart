import '../../../../core/network/json_helpers.dart';

num? _num(dynamic v) {
  if (v == null) return null;
  if (v is num) return v;
  return num.tryParse(v.toString());
}

String formatArticleValueJodLabel(num? amount) {
  if (amount == null) return 'قيمة المقال: —';
  return 'قيمة المقال: ${amount.toStringAsFixed(3)} JOD';
}

class ArticleBidCollection {
  const ArticleBidCollection({
    this.requiredBidCount,
    this.currentBidCount,
    this.status,
    this.deadlineAt,
    this.outcome,
  });

  final int? requiredBidCount;
  final int? currentBidCount;
  final String? status;
  final String? deadlineAt;
  final String? outcome;

  factory ArticleBidCollection.fromJson(dynamic json) {
    if (json is! Map) return const ArticleBidCollection();
    final map = Map<String, dynamic>.from(json);
    return ArticleBidCollection(
      requiredBidCount: readInt(map, 'requiredBidCount', 'required_bid_count'),
      currentBidCount: readInt(map, 'currentBidCount', 'current_bid_count') ??
          readInt(map, 'bidsCount', 'bids_count'),
      status: readMapField<String>(map, 'status', 'status'),
      deadlineAt: readMapField<String>(map, 'deadlineAt', 'deadline_at') ??
          readMapField<String>(map, 'applicationDeadlineAt', 'application_deadline_at'),
      outcome: readMapField<String>(map, 'outcome', 'outcome') ??
          readMapField<String>(map, 'bidCollectionOutcome', 'bid_collection_outcome'),
    );
  }

  String? get progressLabel {
    if (requiredBidCount == null && currentBidCount == null) return null;
    final cur = currentBidCount ?? 0;
    final req = requiredBidCount;
    if (req == null) return '$cur متقدم';
    return '$cur / $req متقدم';
  }

  bool get isClosedForApply {
    final s = (status ?? '').toLowerCase();
    final o = (outcome ?? '').toLowerCase();
    if (s.contains('closed') || s.contains('complete') || s == 'filled') return true;
    if (o.isNotEmpty && o != 'open' && o != 'collecting') return true;
    return false;
  }
}

class MiniArticle {
  const MiniArticle({
    required this.id,
    required this.title,
    this.description,
    this.status,
    this.articleLevel,
    this.articleValueJod,
    this.totalArticleValueJod,
    this.freelancerShareJod,
    this.reviewerShareJod,
    this.companyShareJod,
    this.activationPlanTierCode,
    this.requiredWordCount,
    this.bidCollection,
    this.applicationDeadlineAt,
  });

  final String id;
  final String title;
  final String? description;
  final String? status;
  final int? articleLevel;
  final num? articleValueJod;
  final num? totalArticleValueJod;
  final num? freelancerShareJod;
  final num? reviewerShareJod;
  final num? companyShareJod;
  final String? activationPlanTierCode;
  final int? requiredWordCount;
  final ArticleBidCollection? bidCollection;
  final String? applicationDeadlineAt;

  num? get displayValueJod => totalArticleValueJod ?? articleValueJod;

  factory MiniArticle.fromJson(Map<String, dynamic> json) {
    final collectionRaw = json['bidCollection'] ?? json['bid_collection'];
    return MiniArticle(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: readMapField<String>(json, 'description', 'description'),
      status: readMapField<String>(json, 'status', 'status'),
      articleLevel: readInt(json, 'articleLevel', 'article_level'),
      articleValueJod: _num(json['articleValueJod'] ?? json['article_value_jod']),
      totalArticleValueJod: _num(json['totalArticleValueJod'] ?? json['total_article_value_jod']),
      freelancerShareJod: _num(json['freelancerShareJod'] ?? json['freelancer_share_jod']),
      reviewerShareJod: _num(json['reviewerShareJod'] ?? json['reviewer_share_jod']),
      companyShareJod: _num(json['companyShareJod'] ?? json['company_share_jod']),
      activationPlanTierCode:
          readMapField<String>(json, 'activationPlanTierCode', 'activation_plan_tier_code'),
      requiredWordCount: readInt(json, 'requiredWordCount', 'required_word_count'),
      bidCollection: ArticleBidCollection.fromJson(collectionRaw),
      applicationDeadlineAt:
          readMapField<String>(json, 'applicationDeadlineAt', 'application_deadline_at'),
    );
  }

  static List<MiniArticle> parseListResponse(dynamic body) {
    if (body is! Map) return const [];
    final data = body['data'];
    if (data is! Map) return const [];
    final articles = data['articles'];
    if (articles is! List) return const [];
    return articles
        .whereType<Map>()
        .map((e) => MiniArticle.fromJson(Map<String, dynamic>.from(e)))
        .where((a) => a.id.isNotEmpty)
        .toList();
  }
}

class ArticleApplicationEligibility {
  const ArticleApplicationEligibility({
    this.eligible = false,
    this.reason,
    this.availableBids,
    this.canAffordBid,
    this.articleLevel,
    this.membershipArticleAccessLevel,
    this.membershipTierCode,
    this.bidCollection,
    this.bildazoAuthorLink,
  });

  final bool eligible;
  final String? reason;
  final int? availableBids;
  final bool? canAffordBid;
  final int? articleLevel;
  final int? membershipArticleAccessLevel;
  final String? membershipTierCode;
  final ArticleBidCollection? bidCollection;
  final Map<String, dynamic>? bildazoAuthorLink;

  factory ArticleApplicationEligibility.fromJson(dynamic json) {
    if (json is! Map) return const ArticleApplicationEligibility();
    final map = Map<String, dynamic>.from(json);
    final link = map['bildazoAuthorLink'] ?? map['bildazo_author_link'];
    return ArticleApplicationEligibility(
      eligible: map['eligible'] == true,
      reason: readMapField<String>(map, 'reason', 'reason'),
      availableBids: readInt(map, 'availableBids', 'available_bids'),
      canAffordBid: map['canAffordBid'] is bool
          ? map['canAffordBid'] as bool
          : map['can_afford_bid'] is bool
              ? map['can_afford_bid'] as bool
              : null,
      articleLevel: readInt(map, 'articleLevel', 'article_level'),
      membershipArticleAccessLevel:
          readInt(map, 'membershipArticleAccessLevel', 'membership_article_access_level'),
      membershipTierCode: readMapField<String>(map, 'membershipTierCode', 'membership_tier_code'),
      bidCollection: ArticleBidCollection.fromJson(map['bidCollection'] ?? map['bid_collection']),
      bildazoAuthorLink: link is Map ? Map<String, dynamic>.from(link) : null,
    );
  }
}

class ArticleApplication {
  const ArticleApplication({
    required this.id,
    this.status,
    this.proposalMessage,
    this.submittedAt,
  });

  final String id;
  final String? status;
  final String? proposalMessage;
  final String? submittedAt;

  String get statusKey => (status ?? '').trim().toLowerCase();
  bool get isPending => statusKey == 'pending' || statusKey == 'submitted';
  bool get isSelected =>
      statusKey == 'selected' || statusKey == 'assigned' || statusKey == 'writing';
  bool get isLost => statusKey == 'lost' || statusKey == 'rejected' || statusKey == 'not_selected';
  bool get isWithdrawn => statusKey == 'withdrawn';

  String get statusLabelAr {
    switch (statusKey) {
      case 'pending':
      case 'submitted':
        return 'تم التقديم';
      case 'selected':
      case 'assigned':
      case 'writing':
        return 'تم اختيارك';
      case 'lost':
      case 'not_selected':
        return 'لم يتم اختيارك';
      case 'rejected':
        return 'مرفوض';
      case 'withdrawn':
        return 'تم السحب';
      case 'under_review':
        return 'قيد المراجعة';
      case 'revision_requested':
        return 'مطلوب تعديل';
      case 'approved':
        return 'مقبول';
      case 'published':
        return 'منشور';
      default:
        return status?.trim().isNotEmpty == true ? status!.trim() : 'حالة غير معروفة';
    }
  }

  factory ArticleApplication.fromJson(Map<String, dynamic> json) {
    return ArticleApplication(
      id: readString(json, 'id', 'id'),
      status: readMapField<String>(json, 'status', 'status'),
      proposalMessage: readMapField<String>(json, 'proposalMessage', 'proposal_message'),
      submittedAt: readMapField<String>(json, 'submittedAt', 'submitted_at') ??
          readMapField<String>(json, 'createdAt', 'created_at'),
    );
  }
}

class MiniArticleDetailContext {
  const MiniArticleDetailContext({
    required this.article,
    this.application,
    this.eligibility,
  });

  final MiniArticle article;
  final ArticleApplication? application;
  final ArticleApplicationEligibility? eligibility;

  factory MiniArticleDetailContext.fromResponse(dynamic body) {
    if (body is! Map) throw FormatException('استجابة المقال غير متوقعة.');
    final data = body['data'];
    if (data is! Map) throw FormatException('استجابة المقال غير متوقعة.');
    final map = Map<String, dynamic>.from(data);
    final articleRaw = map['article'];
    if (articleRaw is! Map) throw FormatException('المقال غير موجود.');
    final appRaw = map['application'];
    return MiniArticleDetailContext(
      article: MiniArticle.fromJson(Map<String, dynamic>.from(articleRaw)),
      application: appRaw is Map
          ? ArticleApplication.fromJson(Map<String, dynamic>.from(appRaw))
          : null,
      eligibility: ArticleApplicationEligibility.fromJson(map['eligibility']),
    );
  }
}
