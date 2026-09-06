import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'account_activation_kyc_api.dart';
import 'account_activation_kyc_models.dart';

final accountActivationKycRepositoryProvider = Provider<AccountActivationKycRepository>((ref) {
  return AccountActivationKycRepository(ref.watch(accountActivationKycApiProvider));
});

class AccountActivationKycRepository {
  AccountActivationKycRepository(this._api);

  final AccountActivationKycApi _api;

  Future<AccountActivationKycStatus> fetchStatus() => _api.fetchStatus();

  Future<AccountActivationKycStatus> submit({
    required File idFront,
    required File idBack,
    required bool termsAccepted,
    String? termsVersion,
  }) {
    return _api.submit(
      idFront: idFront,
      idBack: idBack,
      termsAccepted: termsAccepted,
      termsVersion: termsVersion,
    );
  }
}
