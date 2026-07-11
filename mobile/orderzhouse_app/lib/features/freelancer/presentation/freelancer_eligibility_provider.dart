import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/freelancer_eligibility_models.dart';
import '../data/freelancer_eligibility_repository.dart';

final freelancerEligibilityProvider = FutureProvider.autoDispose<FreelancerEligibility?>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated || auth.user?.isFreelancerAccount != true) {
    return null;
  }
  return ref.read(freelancerEligibilityRepositoryProvider).fetchEligibility();
});
