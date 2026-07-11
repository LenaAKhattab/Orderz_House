import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'freelancer_eligibility_models.dart';
import 'freelancer_eligibility_repository.dart';
import 'freelancer_plans_api.dart';
import 'freelancer_plans_models.dart';

final freelancerPlansApiProvider = Provider<FreelancerPlansApi>((ref) {
  return FreelancerPlansApi(ref.watch(dioProvider));
});

class FreelancerPlansRepository {
  FreelancerPlansRepository(this._api, this._eligibilityRepository);

  final FreelancerPlansApi _api;
  final FreelancerEligibilityRepository _eligibilityRepository;

  Future<List<PublicPlan>> fetchPlans() => _api.fetchPlans();

  Future<FreelancerSubscriptionBundle> fetchSubscription() => _api.fetchSubscription();

  Future<FreelancerEligibility> fetchEligibility() => _eligibilityRepository.fetchEligibility();

  Future<FreelancerPlansSnapshot> fetchPlansSnapshot({bool includeEligibility = true}) async {
    final plansFuture = _api.fetchPlans();
    final subscriptionFuture = _api.fetchSubscription();
    final eligibilityFuture = includeEligibility ? _eligibilityRepository.fetchEligibility() : null;

    final plans = await plansFuture;
    final bundle = await subscriptionFuture;
    FreelancerEligibility? eligibility;
    if (eligibilityFuture != null) {
      eligibility = await eligibilityFuture;
    }

    return FreelancerPlansSnapshot(
      plans: plans,
      subscription: bundle.subscription,
      activationFeeStatus: bundle.activationFeeStatus,
      eligibility: eligibility,
    );
  }
}

final freelancerPlansRepositoryProvider = Provider<FreelancerPlansRepository>((ref) {
  return FreelancerPlansRepository(
    ref.watch(freelancerPlansApiProvider),
    ref.watch(freelancerEligibilityRepositoryProvider),
  );
});
