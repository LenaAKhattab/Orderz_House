import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/create_financial_claim_models.dart';
import '../data/financial_claim_models.dart';
import '../data/financial_claim_repository.dart';

class CreateFinancialClaimState {
  const CreateFinancialClaimState({
    this.isSubmitting = false,
    this.error,
  });

  final bool isSubmitting;
  final String? error;

  CreateFinancialClaimState copyWith({
    bool? isSubmitting,
    String? error,
    bool clearError = false,
  }) {
    return CreateFinancialClaimState(
      isSubmitting: isSubmitting ?? this.isSubmitting,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class CreateFinancialClaimController
    extends AutoDisposeFamilyNotifier<CreateFinancialClaimState, String> {
  @override
  CreateFinancialClaimState build(String projectId) => const CreateFinancialClaimState();

  Future<FinancialClaim?> submit({String? freelancerNote}) async {
    if (state.isSubmitting) return null;

    final noteError = validateFreelancerClaimNote(freelancerNote);
    if (noteError != null) {
      state = state.copyWith(error: noteError);
      throw StateError(noteError);
    }

    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final claim = await ref.read(financialClaimRepositoryProvider).createDoneProjectClaim(
            projectId: arg,
            freelancerNote: freelancerNote,
          );
      state = state.copyWith(isSubmitting: false);
      return claim;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        error: mapFinancialClaimCreateErrorMessage(e),
      );
      rethrow;
    }
  }
}

final createFinancialClaimControllerProvider = NotifierProvider.autoDispose
    .family<CreateFinancialClaimController, CreateFinancialClaimState, String>(
  CreateFinancialClaimController.new,
);
