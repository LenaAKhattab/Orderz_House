import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../data/client_delivery_review_models.dart';
import '../data/client_delivery_review_repository.dart';
import '../data/client_order_models.dart';

class ClientDeliveryReviewState {
  const ClientDeliveryReviewState({
    this.isApproving = false,
    this.isRequestingRevision = false,
    this.error,
  });

  final bool isApproving;
  final bool isRequestingRevision;
  final String? error;

  bool get isBusy => isApproving || isRequestingRevision;

  ClientDeliveryReviewState copyWith({
    bool? isApproving,
    bool? isRequestingRevision,
    String? error,
    bool clearError = false,
  }) {
    return ClientDeliveryReviewState(
      isApproving: isApproving ?? this.isApproving,
      isRequestingRevision: isRequestingRevision ?? this.isRequestingRevision,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ClientDeliveryReviewController extends AutoDisposeFamilyNotifier<ClientDeliveryReviewState, String> {
  @override
  ClientDeliveryReviewState build(String orderId) => const ClientDeliveryReviewState();

  Future<ClientOrder?> approveDelivery() async {
    if (state.isBusy) return null;
    state = state.copyWith(isApproving: true, clearError: true);
    try {
      final updated = await ref.read(clientDeliveryReviewRepositoryProvider).approveDelivery(arg);
      state = state.copyWith(isApproving: false);
      return updated;
    } catch (e) {
      state = state.copyWith(
        isApproving: false,
        error: apiErrorMessage(e, fallback: 'تعذر قبول التسليم.'),
      );
      rethrow;
    }
  }

  Future<ClientOrder?> requestRevision(RequestDeliveryRevisionPayload payload) async {
    if (state.isBusy) return null;

    final validation = validateDeliveryRevisionNote(payload.note);
    if (validation != null) {
      state = state.copyWith(error: validation);
      throw StateError(validation);
    }

    state = state.copyWith(isRequestingRevision: true, clearError: true);
    try {
      final updated = await ref.read(clientDeliveryReviewRepositoryProvider).requestRevision(arg, payload);
      state = state.copyWith(isRequestingRevision: false);
      return updated;
    } catch (e) {
      state = state.copyWith(
        isRequestingRevision: false,
        error: apiErrorMessage(e, fallback: 'تعذر إرسال طلب التعديل.'),
      );
      rethrow;
    }
  }
}

final clientDeliveryReviewControllerProvider = NotifierProvider.autoDispose
    .family<ClientDeliveryReviewController, ClientDeliveryReviewState, String>(
  ClientDeliveryReviewController.new,
);
