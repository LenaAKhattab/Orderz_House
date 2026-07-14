import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'account_api.dart';
import 'account_models.dart';

final accountApiProvider = Provider<AccountApi>((ref) {
  return AccountApi(ref.watch(dioProvider));
});

class AccountRepository {
  AccountRepository(this._api);

  final AccountApi _api;

  Future<AccountProfile> getProfile() => _api.getProfileMe();

  Future<AccountProfile> updateProfile(ProfileUpdatePayload payload) =>
      _api.updateProfile(payload);

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) =>
      _api.changePassword(
        currentPassword: currentPassword,
        newPassword: newPassword,
      );

  Future<void> deactivateAccount({
    required String currentPassword,
    required String confirmation,
  }) =>
      _api.deactivateAccount(
        currentPassword: currentPassword,
        confirmation: confirmation,
      );
}

final accountRepositoryProvider = Provider<AccountRepository>((ref) {
  return AccountRepository(ref.watch(accountApiProvider));
});
