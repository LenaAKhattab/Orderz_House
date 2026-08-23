import 'super_admin_article_models.dart';
import 'super_admin_models.dart';
import 'super_admin_pantry_actions.dart';

const superAdminSelectApplicantConfirmKey = 'sa-confirm-select-applicant';
const superAdminRelistArticleConfirmKey = 'sa-confirm-relist-article';
const superAdminArticleOverrideFieldKey = 'sa-article-override-reason';
const superAdminApproveArticleConfirmKey = 'sa-confirm-approve-article';
const superAdminRejectArticleConfirmKey = 'sa-confirm-reject-article';
const superAdminArticleRevisionNoteFieldKey = 'sa-article-revision-note';
const superAdminArticleRejectReasonFieldKey = 'sa-article-reject-reason';

const superAdminApproveArticleLabelAr = 'اعتماد المقال';
const superAdminRequestArticleRevisionLabelAr = 'طلب تعديل';
const superAdminRejectArticleLabelAr = 'رفض المقال';
const superAdminArticleApproveConfirmAr = 'هل أنت متأكد من اعتماد هذا المقال؟';
const superAdminArticleApproveSuccessAr = 'تم اعتماد المقال بنجاح.';
const superAdminArticleRevisionSuccessAr = 'تم إرسال طلب التعديل بنجاح.';
const superAdminArticleRejectSuccessAr = 'تم رفض المقال بنجاح.';
const superAdminArticleRevisionNoteRequiredAr = 'يرجى كتابة ملاحظات التعديل.';
const superAdminArticleRejectReasonRequiredAr = 'يرجى كتابة سبب الرفض.';

bool isArticleFairRankingEligible(SuperAdminArticleFairRanking? ranking) {
  return ranking?.eligibleForAssignment == true;
}

bool isRecommendedArticleApplicant(String applicationId, SuperAdminArticleFairRanking? ranking) {
  final recommended = ranking?.recommendedApplicationId;
  if (recommended == null || recommended.isEmpty || applicationId.trim().isEmpty) return false;
  return recommended == applicationId;
}

bool selectRequiresOverride({
  required String applicationId,
  required SuperAdminArticleFairRanking? ranking,
}) {
  if (!isArticleFairRankingEligible(ranking)) return false;
  return !isRecommendedArticleApplicant(applicationId, ranking);
}

bool articleSelectionAllowed(SuperAdminBidCollection? collection) {
  if (collection == null) return false;
  final status = (collection.status ?? '').trim().toLowerCase();
  final outcome = (collection.outcome ?? '').trim().toLowerCase();
  if (status == 'minimum_not_met' || outcome == 'minimum_not_met') return false;
  if (status == 'assigned' || outcome == 'assigned') return false;
  return collection.thresholdReached ||
      status == 'eligible_for_assignment' ||
      status == 'threshold_reached' ||
      outcome == 'threshold_reached';
}

bool canSelectArticleApplication({
  required SuperAdminArticleDetail detail,
  required SuperAdminArticleApplication application,
}) {
  if (!application.isPending || application.id.trim().isEmpty) return false;
  if (detail.hasSelectedApplicant) return false;
  return articleSelectionAllowed(detail.collection);
}

bool canRelistArticleBidCollection(SuperAdminArticleDetail detail) {
  if (detail.hasSelectedApplicant) return false;
  final collection = detail.collection;
  if (collection == null) return false;
  if (collection.canRelistBidCollection == true) return true;
  final status = (collection.status ?? '').trim().toLowerCase();
  final outcome = (collection.outcome ?? '').trim().toLowerCase();
  return status == 'minimum_not_met' || outcome == 'minimum_not_met';
}

SuperAdminArticleApplication? reviewableArticleApplication(SuperAdminArticleDetail detail) {
  return detail.applications.where((a) => a.isReviewActionable).firstOrNull;
}

/// Backward-compatible alias used by controllers.
SuperAdminArticleApplication? selectedArticleApplication(SuperAdminArticleDetail detail) {
  return reviewableArticleApplication(detail) ??
      detail.applications.where((a) => a.isSelected).firstOrNull;
}

bool canRejectSelectedArticleApplication(SuperAdminArticleDetail detail) {
  final app = reviewableArticleApplication(detail);
  return app != null && app.id.trim().isNotEmpty;
}

bool canRequestArticleRevision(SuperAdminArticleDetail detail) {
  final app = reviewableArticleApplication(detail);
  if (app == null || app.id.trim().isEmpty) return false;
  final status = (app.status ?? '').trim().toLowerCase();
  return status == 'selected' || status == 'revision_requested';
}

bool canFinalizeArticleApproval(SuperAdminArticleDetail detail) {
  return canRequestArticleRevision(detail);
}

String? validateArticleRevisionNote(String note) {
  if (note.trim().isEmpty) return superAdminArticleRevisionNoteRequiredAr;
  if (note.trim().length < 3) return superAdminArticleRevisionNoteRequiredAr;
  return null;
}

String? validateArticleRejectReason(String reason) {
  if (reason.trim().isEmpty) return superAdminArticleRejectReasonRequiredAr;
  if (reason.trim().length < 3) return superAdminArticleRejectReasonRequiredAr;
  return null;
}

String? validateArticleOverrideReason(String note) => validatePantryOverrideReason(note);
