/// Args passed via GoRouter `extra` for manuscript submit screen.
class ManuscriptSubmitArgs {
  const ManuscriptSubmitArgs({
    required this.applicationId,
    this.articleId,
    this.articleTitle,
    this.revisionNote,
    this.isRevision = false,
    this.statusLabelAr,
  });

  final String applicationId;
  final String? articleId;
  final String? articleTitle;
  final String? revisionNote;
  final bool isRevision;
  final String? statusLabelAr;

  factory ManuscriptSubmitArgs.fromExtra(Object? extra, {required String applicationId}) {
    if (extra is ManuscriptSubmitArgs) {
      return ManuscriptSubmitArgs(
        applicationId: extra.applicationId.isNotEmpty ? extra.applicationId : applicationId,
        articleId: extra.articleId,
        articleTitle: extra.articleTitle,
        revisionNote: extra.revisionNote,
        isRevision: extra.isRevision,
        statusLabelAr: extra.statusLabelAr,
      );
    }
    if (extra is Map) {
      final map = Map<String, dynamic>.from(extra);
      return ManuscriptSubmitArgs(
        applicationId: '${map['applicationId'] ?? applicationId}'.trim().isEmpty
            ? applicationId
            : '${map['applicationId'] ?? applicationId}'.trim(),
        articleId: map['articleId']?.toString(),
        articleTitle: map['articleTitle']?.toString() ?? map['title']?.toString(),
        revisionNote: map['revisionNote']?.toString(),
        isRevision: map['isRevision'] == true || map['is_revision'] == true,
        statusLabelAr: map['statusLabelAr']?.toString(),
      );
    }
    return ManuscriptSubmitArgs(applicationId: applicationId);
  }
}
