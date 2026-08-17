import 'super_admin_article_models.dart';
import 'super_admin_models.dart';
import 'super_admin_pantry_actions.dart';

const superAdminSelectApplicantConfirmKey = 'sa-confirm-select-applicant';
const superAdminRelistArticleConfirmKey = 'sa-confirm-relist-article';
const superAdminArticleOverrideFieldKey = 'sa-article-override-reason';

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

String? validateArticleOverrideReason(String note) => validatePantryOverrideReason(note);
