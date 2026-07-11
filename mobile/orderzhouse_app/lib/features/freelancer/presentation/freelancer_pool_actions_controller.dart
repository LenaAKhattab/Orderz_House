import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../orders/data/pool_order_models.dart';
import '../data/freelancer_pool_actions_models.dart';
import '../data/freelancer_pool_actions_repository.dart';
import '../data/pool_order_participation_helpers.dart';

class FreelancerPoolActionsState {
  const FreelancerPoolActionsState({
    this.isTaking = false,
    this.isSubmittingBid = false,
    this.lastUpdatedOrder,
    this.error,
  });

  final bool isTaking;
  final bool isSubmittingBid;
  final PoolOrder? lastUpdatedOrder;
  final String? error;

  bool get isBusy => isTaking || isSubmittingBid;

  FreelancerPoolActionsState copyWith({
    bool? isTaking,
    bool? isSubmittingBid,
    PoolOrder? lastUpdatedOrder,
    String? error,
    bool clearError = false,
    bool clearLastOrder = false,
  }) {
    return FreelancerPoolActionsState(
      isTaking: isTaking ?? this.isTaking,
      isSubmittingBid: isSubmittingBid ?? this.isSubmittingBid,
      lastUpdatedOrder: clearLastOrder ? null : (lastUpdatedOrder ?? this.lastUpdatedOrder),
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class FreelancerPoolActionsController extends AutoDisposeFamilyNotifier<FreelancerPoolActionsState, String> {
  @override
  FreelancerPoolActionsState build(String orderId) => const FreelancerPoolActionsState();

  Future<PoolOrder?> takeOrder() async {
    if (state.isBusy) return null;
    state = state.copyWith(isTaking: true, clearError: true);
    try {
      final updated = await ref.read(freelancerPoolActionsRepositoryProvider).takePoolOrder(arg);
      state = state.copyWith(isTaking: false, lastUpdatedOrder: updated);
      return updated;
    } catch (e) {
      state = state.copyWith(
        isTaking: false,
        error: apiErrorMessage(e, fallback: 'تعذر استلام الطلب.'),
      );
      rethrow;
    }
  }

  Future<PoolOrder?> submitBid(SubmitPoolBidPayload payload) async {
    if (state.isBusy) return null;
    state = state.copyWith(isSubmittingBid: true, clearError: true);
    try {
      final updated = await ref.read(freelancerPoolActionsRepositoryProvider).submitPoolBid(arg, payload);
      state = state.copyWith(isSubmittingBid: false, lastUpdatedOrder: updated);
      return updated;
    } catch (e) {
      state = state.copyWith(
        isSubmittingBid: false,
        error: apiErrorMessage(e, fallback: 'تعذر إرسال العرض.'),
      );
      rethrow;
    }
  }

  TakeOrderOutcome classifyTakeOutcome(PoolOrder order) {
    if (isPoolOrderTakenAsAssignment(order)) {
      return TakeOrderOutcome.assigned;
    }
    return TakeOrderOutcome.participationRegistered;
  }
}

enum TakeOrderOutcome {
  assigned,
  participationRegistered,
}

final freelancerPoolActionsControllerProvider = NotifierProvider.autoDispose
    .family<FreelancerPoolActionsController, FreelancerPoolActionsState, String>(
  FreelancerPoolActionsController.new,
);
