import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../data/client_order_review_models.dart';
import '../data/client_order_review_repository.dart';

class ClientOrderReviewState {
  const ClientOrderReviewState({
    this.isSubmitting = false,
    this.error,
  });

  final bool isSubmitting;
  final String? error;

  ClientOrderReviewState copyWith({
    bool? isSubmitting,
    String? error,
    bool clearError = false,
  }) {
    return ClientOrderReviewState(
      isSubmitting: isSubmitting ?? this.isSubmitting,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ClientOrderReviewController extends AutoDisposeFamilyNotifier<ClientOrderReviewState, String> {
  @override
  ClientOrderReviewState build(String orderId) => const ClientOrderReviewState();

  Future<ClientFreelancerReview?> submitReview(
    SubmitClientOrderReviewPayload payload, {
    bool update = false,
  }) async {
    if (state.isSubmitting) return null;

    final ratingError = validateClientReviewRating(payload.rating);
    if (ratingError != null) {
      state = state.copyWith(error: ratingError);
      throw StateError(ratingError);
    }
    final textError = validateClientReviewText(payload.reviewText);
    if (textError != null) {
      state = state.copyWith(error: textError);
      throw StateError(textError);
    }

    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final review = update
          ? await ref.read(clientOrderReviewRepositoryProvider).updateReview(arg, payload)
          : await ref.read(clientOrderReviewRepositoryProvider).submitReview(arg, payload);
      state = state.copyWith(isSubmitting: false);
      return review;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        error: apiErrorMessage(e, fallback: 'تعذر إرسال التقييم.'),
      );
      rethrow;
    }
  }
}

final clientOrderReviewControllerProvider = NotifierProvider.autoDispose
    .family<ClientOrderReviewController, ClientOrderReviewState, String>(
  ClientOrderReviewController.new,
);

final clientOrderReviewStatusProvider =
    FutureProvider.autoDispose.family<ClientOrderReviewStatus, String>((ref, orderId) {
  return ref.read(clientOrderReviewRepositoryProvider).fetchReviewStatus(orderId);
});
