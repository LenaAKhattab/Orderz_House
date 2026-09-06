import '../../../../core/network/json_helpers.dart';

/// Result of POST .../final-manuscript (submit or resubmit).
class ManuscriptSubmitResult {
  const ManuscriptSubmitResult({
    this.created = false,
    this.submissionId,
    this.applicationId,
    this.articleId,
    this.status,
    this.title,
    this.submittedAt,
    this.canResubmit = false,
  });

  final bool created;
  final String? submissionId;
  final String? applicationId;
  final String? articleId;
  final String? status;
  final String? title;
  final String? submittedAt;
  final bool canResubmit;

  bool get isUnderReview {
    final s = (status ?? '').trim().toLowerCase();
    return s == 'submitted' || s == 'under_review';
  }

  factory ManuscriptSubmitResult.fromResponse(dynamic body) {
    if (body is! Map) return const ManuscriptSubmitResult();
    final root = Map<String, dynamic>.from(body);
    final data = root['data'] is Map
        ? Map<String, dynamic>.from(root['data'] as Map)
        : root;

    // Nested submission object if present.
    final submission = data['submission'] is Map
        ? Map<String, dynamic>.from(data['submission'] as Map)
        : data['articleSubmission'] is Map
            ? Map<String, dynamic>.from(data['articleSubmission'] as Map)
            : data;

    return ManuscriptSubmitResult(
      created: readBool(data, 'created', 'created') || root['statusCode'] == 201,
      submissionId: readMapField<String>(submission, 'id', 'id'),
      applicationId: readMapField<String>(submission, 'applicationId', 'application_id') ??
          readMapField<String>(data, 'applicationId', 'application_id'),
      articleId: readMapField<String>(submission, 'articleId', 'article_id') ??
          readMapField<String>(data, 'articleId', 'article_id'),
      status: readMapField<String>(submission, 'status', 'status') ??
          readMapField<String>(data, 'status', 'status'),
      title: readMapField<String>(submission, 'title', 'title'),
      submittedAt: readMapField<String>(submission, 'submittedAt', 'submitted_at'),
      canResubmit: readBool(submission, 'canResubmit', 'can_resubmit'),
    );
  }
}
