import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'pantry_api.dart';
import 'pantry_models.dart';

final pantryApiProvider = Provider<PantryApi>((ref) {
  return PantryApi(ref.watch(dioProvider));
});

class PantryRepository {
  PantryRepository(this._api);

  final PantryApi _api;

  Future<List<PantryRequest>> fetchOpenRequests() => _api.fetchOpenRequests();

  Future<PantryRequestDetail> fetchRequest(String id) => _api.fetchRequest(id);

  Future<PantryBid> submitBid({
    required String requestId,
    required double amount,
    required int durationDays,
    required String message,
  }) =>
      _api.submitBid(
        requestId: requestId,
        amount: amount,
        durationDays: durationDays,
        message: message,
      );

  Future<List<PantryRequest>> fetchMyWork() => _api.fetchMyWork();

  Future<PantryDelivery> submitDelivery({
    required String requestId,
    required String message,
    String? fileUrl,
    String? fileName,
  }) =>
      _api.submitDelivery(
        requestId: requestId,
        message: message,
        fileUrl: fileUrl,
        fileName: fileName,
      );
}

final pantryRepositoryProvider = Provider<PantryRepository>((ref) {
  return PantryRepository(ref.watch(pantryApiProvider));
});
