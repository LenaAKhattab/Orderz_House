import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../data/pantry_models.dart';
import '../data/pantry_repository.dart';

final pantryOpenRequestsProvider = FutureProvider.autoDispose<List<PantryRequest>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated || auth.user?.usesFreelancerExperience != true) {
    return const [];
  }
  return ref.read(pantryRepositoryProvider).fetchOpenRequests();
});

final pantryMyWorkProvider = FutureProvider.autoDispose<List<PantryRequest>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated || auth.user?.usesFreelancerExperience != true) {
    return const [];
  }
  return ref.read(pantryRepositoryProvider).fetchMyWork();
});

final pantryRequestDetailProvider =
    FutureProvider.autoDispose.family<PantryRequestDetail, String>((ref, id) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated || auth.user?.usesFreelancerExperience != true) {
    throw StateError('pantry_forbidden');
  }
  return ref.read(pantryRepositoryProvider).fetchRequest(id);
});
