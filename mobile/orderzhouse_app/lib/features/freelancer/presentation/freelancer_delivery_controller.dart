import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../client_orders/data/order_attachment_limits.dart';
import '../../client_orders/data/order_attachment_models.dart';
import '../data/freelancer_delivery_repository.dart';
import '../data/freelancer_my_order_models.dart';

class FreelancerDeliveryState {
  const FreelancerDeliveryState({
    this.isSubmitting = false,
    this.error,
  });

  final bool isSubmitting;
  final String? error;

  FreelancerDeliveryState copyWith({
    bool? isSubmitting,
    String? error,
    bool clearError = false,
  }) {
    return FreelancerDeliveryState(
      isSubmitting: isSubmitting ?? this.isSubmitting,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class FreelancerDeliveryController extends AutoDisposeFamilyNotifier<FreelancerDeliveryState, String> {
  @override
  FreelancerDeliveryState build(String orderId) => const FreelancerDeliveryState();

  Future<FreelancerMyOrder?> submitDelivery(List<SelectedOrderAttachment> attachments) async {
    if (state.isSubmitting) return null;

    final validation = validateDeliveryAttachments(attachments.map((f) => f.draft).toList());
    if (!validation.isValid) {
      state = state.copyWith(error: validation.message);
      throw StateError(validation.message ?? deliveryAttachmentRequiredMessageAr);
    }

    state = state.copyWith(isSubmitting: true, clearError: true);
    try {
      final updated = await ref.read(freelancerDeliveryRepositoryProvider).submitDelivery(arg, attachments);
      state = state.copyWith(isSubmitting: false);
      return updated;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        error: apiErrorMessage(e, fallback: 'تعذر إرسال التسليم.'),
      );
      rethrow;
    }
  }
}

final freelancerDeliveryControllerProvider = NotifierProvider.autoDispose
    .family<FreelancerDeliveryController, FreelancerDeliveryState, String>(
  FreelancerDeliveryController.new,
);
