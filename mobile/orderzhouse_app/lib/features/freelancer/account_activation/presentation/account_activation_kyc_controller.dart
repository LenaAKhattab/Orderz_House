import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/api_error_message.dart';
import '../../presentation/freelancer_eligibility_provider.dart';
import '../data/account_activation_kyc_models.dart';
import '../data/account_activation_kyc_repository.dart';

class AccountActivationKycUiState {
  const AccountActivationKycUiState({
    this.status,
    this.loading = true,
    this.submitting = false,
    this.error,
    this.localValidationError,
  });

  final AccountActivationKycStatus? status;
  final bool loading;
  final bool submitting;
  final String? error;
  final String? localValidationError;

  AccountActivationKycUiState copyWith({
    AccountActivationKycStatus? status,
    bool? loading,
    bool? submitting,
    String? error,
    String? localValidationError,
    bool clearError = false,
    bool clearLocalValidation = false,
  }) {
    return AccountActivationKycUiState(
      status: status ?? this.status,
      loading: loading ?? this.loading,
      submitting: submitting ?? this.submitting,
      error: clearError ? null : (error ?? this.error),
      localValidationError:
          clearLocalValidation ? null : (localValidationError ?? this.localValidationError),
    );
  }
}

final accountActivationKycControllerProvider =
    StateNotifierProvider.autoDispose<AccountActivationKycController, AccountActivationKycUiState>(
  (ref) => AccountActivationKycController(ref),
);

class AccountActivationKycController extends StateNotifier<AccountActivationKycUiState> {
  AccountActivationKycController(this._ref) : super(const AccountActivationKycUiState()) {
    refresh();
  }

  final Ref _ref;

  Future<void> refresh() async {
    state = state.copyWith(loading: true, clearError: true, clearLocalValidation: true);
    try {
      final status = await _ref.read(accountActivationKycRepositoryProvider).fetchStatus();
      state = state.copyWith(status: status, loading: false, clearError: true);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: apiErrorMessage(e, fallback: 'تعذر تحميل حالة تفعيل الحساب.'),
      );
    }
  }

  Future<bool> submit({
    required File? idFront,
    required File? idBack,
    required bool termsAccepted,
  }) async {
    final validation = validateAccountActivationSubmit(
      hasFront: idFront != null,
      hasBack: idBack != null,
      termsAccepted: termsAccepted,
    );
    if (validation != null) {
      state = state.copyWith(localValidationError: validation);
      return false;
    }
    if (state.submitting) return false;

    state = state.copyWith(submitting: true, clearError: true, clearLocalValidation: true);
    try {
      final status = await _ref.read(accountActivationKycRepositoryProvider).submit(
            idFront: idFront!,
            idBack: idBack!,
            termsAccepted: true,
            termsVersion: state.status?.termsVersion,
          );
      state = state.copyWith(status: status, submitting: false, clearError: true);
      _ref.invalidate(freelancerEligibilityProvider);
      return true;
    } catch (e) {
      state = state.copyWith(
        submitting: false,
        error: apiErrorMessage(e, fallback: 'تعذر إرسال طلب التفعيل.'),
      );
      return false;
    }
  }
}
