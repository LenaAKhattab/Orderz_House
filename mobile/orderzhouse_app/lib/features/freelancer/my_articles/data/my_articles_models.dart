import '../../../../core/network/json_helpers.dart';
import 'my_articles_copy.dart';

const myArticlesPortfolioFilterKeys = <String>[
  'all',
  'awaiting_selection',
  'awaiting_execution',
  'under_review',
  'revision_requested',
  'accepted',
  'published_on_bildazo',
  'rejected',
];

String myArticlesFilterLabelAr(String key) {
  switch (key) {
    case 'all':
      return myArticlesFilterAllAr;
    case 'awaiting_selection':
      return myArticlesStatusAwaitingSelectionAr;
    case 'awaiting_execution':
      return myArticlesStatusAwaitingExecutionAr;
    case 'under_review':
      return myArticlesStatusUnderReviewAr;
    case 'revision_requested':
      return myArticlesStatusRevisionRequestedAr;
    case 'accepted':
      return myArticlesStatusAcceptedAr;
    case 'published_on_bildazo':
      return myArticlesStatusPublishedAr;
    case 'rejected':
      return myArticlesStatusRejectedAr;
    default:
      return myArticlesUnknownStatusAr;
  }
}

/// Maps portfolio / raw application statuses to Arabic (web ord20).
String myArticlesPortfolioStatusLabelAr(String? status, {String? apiLabel}) {
  final fromApi = apiLabel?.trim();
  if (fromApi != null && fromApi.isNotEmpty) return fromApi;

  final key = (status ?? '').trim().toLowerCase();
  switch (key) {
    case 'pending':
    case 'awaiting_selection':
      return myArticlesStatusAwaitingSelectionAr;
    case 'selected':
    case 'assigned':
    case 'writing':
    case 'awaiting_execution':
      return myArticlesStatusAwaitingExecutionAr;
    case 'submitted':
    case 'under_review':
      return myArticlesStatusUnderReviewAr;
    case 'revision_requested':
      return myArticlesStatusRevisionRequestedAr;
    case 'approved':
    case 'accepted':
      return myArticlesStatusAcceptedAr;
    case 'published':
    case 'already_imported':
    case 'published_on_bildazo':
      return myArticlesStatusPublishedAr;
    case 'rejected':
    case 'cancelled':
    case 'withdrawn':
      return myArticlesStatusRejectedAr;
    case '':
      return myArticlesUnknownStatusAr;
    default:
      return myArticlesUnknownStatusAr;
  }
}

/// Normalize raw/application statuses into portfolio keys used by filters.
String normalizeMyArticlesPortfolioStatus({
  String? portfolioStatus,
  String? applicationStatus,
  String? reviewStatus,
  String? publishStatus,
}) {
  final portfolio = (portfolioStatus ?? '').trim().toLowerCase();
  if (myArticlesPortfolioFilterKeys.contains(portfolio) && portfolio != 'all') {
    return portfolio;
  }

  final publish = (publishStatus ?? '').trim().toLowerCase();
  if (publish == 'published' || publish == 'already_imported') {
    return 'published_on_bildazo';
  }

  final app = (applicationStatus ?? '').trim().toLowerCase();
  final review = (reviewStatus ?? '').trim().toLowerCase();

  if (['rejected', 'cancelled', 'withdrawn'].contains(app) || review == 'rejected') {
    return 'rejected';
  }
  if (app == 'revision_requested' || review == 'revision_requested') {
    return 'revision_requested';
  }
  if (app == 'approved' || review == 'approved' || app == 'accepted') {
    return 'accepted';
  }
  if (review == 'submitted' || app == 'under_review' || app == 'submitted') {
    return 'under_review';
  }
  if (['selected', 'assigned', 'writing'].contains(app)) {
    return 'awaiting_execution';
  }
  if (app == 'pending' || app == 'awaiting_selection') {
    return 'awaiting_selection';
  }
  if (portfolio.isNotEmpty) return portfolio;
  return 'awaiting_execution';
}

class MyArticleBildazoPublish {
  const MyArticleBildazoPublish({
    this.status,
    this.articleUrl,
  });

  final String? status;
  final String? articleUrl;

  bool get isPublishedSuccess {
    final s = (status ?? '').trim().toLowerCase();
    return s == 'published' || s == 'already_imported';
  }

  factory MyArticleBildazoPublish.fromJson(dynamic raw) {
    if (raw is! Map) return const MyArticleBildazoPublish();
    final map = Map<String, dynamic>.from(raw);
    return MyArticleBildazoPublish(
      status: readMapField<String>(map, 'status', 'status'),
      articleUrl: readMapField<String>(map, 'articleUrl', 'article_url') ??
          readMapField<String>(map, 'bildazoArticleUrl', 'bildazo_article_url'),
    );
  }
}

class MyArticleItem {
  const MyArticleItem({
    required this.applicationId,
    this.articleId,
    this.title,
    this.portfolioStatus = 'awaiting_execution',
    this.portfolioStatusLabelAr,
    this.applicationStatus,
    this.reviewStatus,
    this.publishStatus,
    this.assignedAt,
    this.submittedAt,
    this.approvedAt,
    this.publishedAt,
    this.grossAmountJod,
    this.freelancerNetJod,
    this.bildazoArticleUrl,
    this.writerProfileUrl,
    this.revisionNote,
    this.bildazoPublish,
    this.canSubmit = false,
    this.needsRevision = false,
  });

  final String applicationId;
  final String? articleId;
  final String? title;
  final String portfolioStatus;
  final String? portfolioStatusLabelAr;
  final String? applicationStatus;
  final String? reviewStatus;
  final String? publishStatus;
  final String? assignedAt;
  final String? submittedAt;
  final String? approvedAt;
  final String? publishedAt;
  final String? grossAmountJod;
  final String? freelancerNetJod;
  final String? bildazoArticleUrl;
  final String? writerProfileUrl;
  final String? revisionNote;
  final MyArticleBildazoPublish? bildazoPublish;
  final bool canSubmit;
  final bool needsRevision;

  String get statusLabelAr => myArticlesPortfolioStatusLabelAr(
        portfolioStatus,
        apiLabel: portfolioStatusLabelAr,
      );

  bool get isPublishedOnBildazo =>
      portfolioStatus == 'published_on_bildazo' ||
      (bildazoPublish?.isPublishedSuccess ?? false);

  String? get resolvedArticleUrl {
    final fromPublish = bildazoPublish?.articleUrl?.trim();
    if (fromPublish != null && fromPublish.isNotEmpty) return fromPublish;
    final direct = bildazoArticleUrl?.trim();
    if (direct != null && direct.isNotEmpty) return direct;
    return null;
  }

  String? get resolvedWriterProfileUrl {
    final u = writerProfileUrl?.trim();
    return (u != null && u.isNotEmpty) ? u : null;
  }

  /// First manuscript submit CTA (M6). Respects [canSubmit]=false.
  bool get showSubmitManuscriptAction {
    if (isPublishedOnBildazo) return false;
    if (!canSubmit) return false;
    if (needsRevision || portfolioStatus == 'revision_requested') return false;
    if (_blockedForManuscriptAction) return false;
    if (portfolioStatus == 'awaiting_execution') return true;
    final app = (applicationStatus ?? '').trim().toLowerCase();
    return app == 'selected' || app == 'assigned' || app == 'writing';
  }

  /// Revision resubmit CTA (M6).
  bool get showResubmitManuscriptAction {
    if (isPublishedOnBildazo) return false;
    if (_blockedForManuscriptAction && portfolioStatus != 'revision_requested') {
      return false;
    }
    return needsRevision || portfolioStatus == 'revision_requested';
  }

  bool get _blockedForManuscriptAction {
    const blocked = {
      'awaiting_selection',
      'under_review',
      'accepted',
      'published_on_bildazo',
      'rejected',
    };
    return blocked.contains(portfolioStatus);
  }

  factory MyArticleItem.fromJson(Map<String, dynamic> json) {
    final publishRaw = json['bildazoPublish'] ?? json['bildazo_publish'];
    final publish = MyArticleBildazoPublish.fromJson(publishRaw);

    final applicationStatus =
        readMapField<String>(json, 'applicationStatus', 'application_status') ??
            readMapField<String>(json, 'status', 'status');
    final reviewStatus = readMapField<String>(json, 'reviewStatus', 'review_status') ??
        readMapField<String>(json, 'submissionStatus', 'submission_status');
    final publishStatus = publish.status ??
        readMapField<String>(json, 'publishStatus', 'publish_status') ??
        readMapField<String>(json, 'bildazoPublishStatus', 'bildazo_publish_status');

    final portfolioStatus = normalizeMyArticlesPortfolioStatus(
      portfolioStatus: readMapField<String>(json, 'portfolioStatus', 'portfolio_status'),
      applicationStatus: applicationStatus,
      reviewStatus: reviewStatus,
      publishStatus: publishStatus,
    );

    final net = json['freelancerNetEarningJod'] ??
        json['freelancer_net_earning_jod'] ??
        json['freelancerNetJod'] ??
        json['freelancer_net_jod'] ??
        json['writerNetJod'] ??
        json['writer_net_jod'];
    final gross = json['articleGrossValueJod'] ??
        json['article_gross_value_jod'] ??
        json['grossAmountJod'] ??
        json['gross_amount_jod'];

    final actions = json['actions'];
    var canSubmit = readBool(json, 'canSubmit', 'can_submit');
    var needsRevision = readBool(json, 'needsRevision', 'needs_revision') ||
        portfolioStatus == 'revision_requested';
    if (actions is List) {
      for (final a in actions) {
        if (a is! Map) continue;
        final key = '${a['key'] ?? ''}'.trim();
        if (key == 'submit_manuscript') canSubmit = true;
        if (key == 'resubmit_manuscript') needsRevision = true;
      }
    }

    return MyArticleItem(
      applicationId: readString(json, 'applicationId', 'application_id').isNotEmpty
          ? readString(json, 'applicationId', 'application_id')
          : readString(json, 'id', 'id'),
      articleId: readMapField<String>(json, 'articleId', 'article_id'),
      title: readMapField<String>(json, 'articleTitle', 'article_title') ??
          readMapField<String>(json, 'title', 'title'),
      portfolioStatus: portfolioStatus,
      portfolioStatusLabelAr:
          readMapField<String>(json, 'portfolioStatusLabelAr', 'portfolio_status_label_ar'),
      applicationStatus: applicationStatus,
      reviewStatus: reviewStatus,
      publishStatus: publishStatus,
      assignedAt: readMapField<String>(json, 'assignedAt', 'assigned_at'),
      submittedAt: readMapField<String>(json, 'submissionDate', 'submission_date') ??
          readMapField<String>(json, 'submittedAt', 'submitted_at'),
      approvedAt: readMapField<String>(json, 'approvedAt', 'approved_at'),
      publishedAt: readMapField<String>(json, 'publishedAt', 'published_at') ??
          readMapField<String>(json, 'bildazoPublishedAt', 'bildazo_published_at'),
      grossAmountJod: gross?.toString(),
      freelancerNetJod: net?.toString(),
      bildazoArticleUrl: readMapField<String>(json, 'bildazoArticleUrl', 'bildazo_article_url') ??
          publish.articleUrl,
      writerProfileUrl: readMapField<String>(json, 'writerProfileUrl', 'writer_profile_url') ??
          readMapField<String>(json, 'bildazoProfileUrl', 'bildazo_profile_url'),
      revisionNote: readMapField<String>(json, 'revisionNote', 'revision_note') ??
          readMapField<String>(json, 'reviewerNotes', 'reviewer_notes') ??
          readMapField<String>(json, 'submissionReviewerNotes', 'submission_reviewer_notes'),
      bildazoPublish: publishRaw == null ? null : publish,
      canSubmit: canSubmit,
      needsRevision: needsRevision,
    );
  }
}

class MyArticlesSnapshot {
  const MyArticlesSnapshot({
    this.items = const [],
    this.total = 0,
    this.writerProfileUrl,
    this.portfolioStatuses = const [],
  });

  final List<MyArticleItem> items;
  final int total;
  final String? writerProfileUrl;
  final List<String> portfolioStatuses;

  factory MyArticlesSnapshot.fromResponse(dynamic body) {
    if (body is! Map) return const MyArticlesSnapshot();
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'] as Map)
        : Map<String, dynamic>.from(body);

    final itemsRaw = data['items'] ?? data['articles'] ?? data['applications'];
    final items = <MyArticleItem>[];
    if (itemsRaw is List) {
      for (final row in itemsRaw) {
        if (row is Map) {
          final item = MyArticleItem.fromJson(Map<String, dynamic>.from(row));
          if (item.applicationId.isNotEmpty) items.add(item);
        }
      }
    }

    final statusesRaw = data['portfolioStatuses'] ?? data['portfolio_statuses'];
    final statuses = <String>[];
    if (statusesRaw is List) {
      for (final s in statusesRaw) {
        final v = '$s'.trim();
        if (v.isNotEmpty) statuses.add(v);
      }
    }

    return MyArticlesSnapshot(
      items: items,
      total: readInt(data, 'total', 'total') ?? items.length,
      writerProfileUrl: readMapField<String>(data, 'writerProfileUrl', 'writer_profile_url'),
      portfolioStatuses: statuses,
    );
  }
}

String? formatMyArticlesDateAr(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final d = DateTime.tryParse(raw.trim());
  if (d == null) return raw.trim();
  final local = d.toLocal();
  final y = local.year.toString().padLeft(4, '0');
  final m = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '$y-$m-$day';
}
