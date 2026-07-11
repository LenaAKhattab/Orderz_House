import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/freelancer_plans_models.dart';
import '../data/freelancer_plans_repository.dart';

final freelancerPlansControllerProvider =
    FutureProvider.autoDispose<FreelancerPlansSnapshot>((ref) async {
  final auth = ref.watch(authControllerProvider);
  final repo = ref.read(freelancerPlansRepositoryProvider);

  if (!auth.isAuthenticated || auth.user?.isFreelancerAccount != true) {
    final plans = await repo.fetchPlans();
    return FreelancerPlansSnapshot(plans: plans);
  }

  return repo.fetchPlansSnapshot(includeEligibility: true);
});
