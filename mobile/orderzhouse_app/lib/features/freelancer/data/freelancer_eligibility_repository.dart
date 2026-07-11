import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'freelancer_eligibility_api.dart';
import 'freelancer_eligibility_models.dart';

final freelancerEligibilityApiProvider = Provider<FreelancerEligibilityApi>((ref) {
  return FreelancerEligibilityApi(ref.watch(dioProvider));
});

class FreelancerEligibilityRepository {
  FreelancerEligibilityRepository(this._api);

  final FreelancerEligibilityApi _api;

  Future<FreelancerEligibility> fetchEligibility() => _api.fetchEligibility();
}

final freelancerEligibilityRepositoryProvider = Provider<FreelancerEligibilityRepository>((ref) {
  return FreelancerEligibilityRepository(ref.watch(freelancerEligibilityApiProvider));
});
