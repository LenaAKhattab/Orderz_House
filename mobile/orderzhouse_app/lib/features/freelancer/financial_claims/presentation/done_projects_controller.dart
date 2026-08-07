import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/auth_controller.dart';
import '../data/done_project_models.dart';
import '../data/financial_claim_repository.dart';

/// Submitted search query for done-projects (manual search button).
final doneProjectsSearchQueryProvider = StateProvider<String>((ref) => '');

final doneProjectsControllerProvider =
    FutureProvider.autoDispose<List<DoneProject>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated || auth.user?.isFreelancerAccount != true) {
    return const [];
  }

  final q = ref.watch(doneProjectsSearchQueryProvider);
  final repo = ref.read(financialClaimRepositoryProvider);
  return repo.fetchDoneProjects(q: q, limit: 100);
});
