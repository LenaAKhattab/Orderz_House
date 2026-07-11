import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../data/freelancer_my_order_models.dart';
import '../data/freelancer_my_orders_repository.dart';

class FreelancerMyOrdersState {
  const FreelancerMyOrdersState({
    this.orders = const [],
    this.isLoading = false,
    this.error,
  });

  final List<FreelancerMyOrder> orders;
  final bool isLoading;
  final String? error;

  FreelancerMyOrdersState copyWith({
    List<FreelancerMyOrder>? orders,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return FreelancerMyOrdersState(
      orders: orders ?? this.orders,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class FreelancerMyOrdersController extends Notifier<FreelancerMyOrdersState> {
  @override
  FreelancerMyOrdersState build() => const FreelancerMyOrdersState();

  Future<void> load({bool refresh = false}) async {
    if (state.isLoading && !refresh) return;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final orders = await ref.read(freelancerMyOrdersRepositoryProvider).fetchMyOrders();
      state = state.copyWith(orders: orders, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: apiErrorMessage(e, fallback: 'تعذر تحميل طلباتك.'),
      );
    }
  }
}

final freelancerMyOrdersControllerProvider =
    NotifierProvider<FreelancerMyOrdersController, FreelancerMyOrdersState>(
  FreelancerMyOrdersController.new,
);
