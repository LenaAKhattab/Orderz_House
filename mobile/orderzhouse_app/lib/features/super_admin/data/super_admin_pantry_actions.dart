import 'super_admin_models.dart';
import 'super_admin_pantry_models.dart';

const superAdminPantryAcceptConfirmKey = 'sa-confirm-accept-bid';
const superAdminPantryRejectConfirmKey = 'sa-confirm-reject-bid';
const superAdminPantryApproveDeliveryConfirmKey = 'sa-confirm-approve-delivery';
const superAdminPantryRevisionConfirmKey = 'sa-confirm-revision';
const superAdminPantryOverrideFieldKey = 'sa-pantry-override-reason';
const superAdminPantryRevisionFieldKey = 'sa-pantry-revision-note';

bool isFairRankingEligible(SuperAdminPantryFairRanking? ranking) {
  return ranking?.eligibleForAssignment == true;
}

bool isRecommendedPantryBid(String bidId, SuperAdminPantryFairRanking? ranking) {
  final recommended = ranking?.recommendedBidId;
  if (recommended == null || recommended.isEmpty || bidId.trim().isEmpty) return false;
  return recommended == bidId;
}

bool pantrySelectionAllowed({
  required SuperAdminPantryRequestDetail request,
}) {
  if (isFairRankingEligible(request.fairRanking)) return true;
  final status = (request.collection?.status ?? '').trim().toLowerCase();
  return status == 'threshold_reached' || status == 'eligible_for_assignment';
}

bool canAcceptPantryBid({
  required SuperAdminPantryRequestDetail request,
  required SuperAdminPantryBid bid,
}) {
  if (!bid.isPending || bid.id.trim().isEmpty) return false;
  final requestStatus = (request.requestStatus ?? '').trim().toLowerCase();
  if (requestStatus != 'open_for_bids') return false;
  return pantrySelectionAllowed(request: request);
}

bool canRejectPantryBid({
  required SuperAdminPantryRequestDetail request,
  required SuperAdminPantryBid bid,
}) {
  if (!bid.isPending || bid.id.trim().isEmpty) return false;
  final requestStatus = (request.requestStatus ?? '').trim().toLowerCase();
  return requestStatus == 'open_for_bids';
}

bool acceptRequiresOverride({
  required String bidId,
  required SuperAdminPantryFairRanking? ranking,
}) {
  if (!isFairRankingEligible(ranking)) return false;
  return !isRecommendedPantryBid(bidId, ranking);
}

String? validatePantryOverrideReason(String note) {
  final text = note.trim();
  if (text.length < superAdminFairOverrideMinChars) return superAdminOverrideReasonTooShortAr;
  if (text.length > superAdminFairOverrideMaxChars) return superAdminOverrideReasonTooLongAr;
  return null;
}

bool canApprovePantryDelivery(SuperAdminPantryDeliveryDetail delivery) {
  return (delivery.status ?? '').trim().toLowerCase() == 'submitted';
}

bool canRequestPantryRevision(SuperAdminPantryDeliveryDetail delivery) {
  return (delivery.status ?? '').trim().toLowerCase() == 'submitted';
}

String? validatePantryRevisionNote(String note) {
  if (note.trim().length < 3) return superAdminActionNoteTooShortAr;
  return null;
}
