import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../data/client_order_bid_models.dart';
import '../data/client_order_models.dart';
import '../data/client_orders_repository.dart';

class ClientOrdersState {
  const ClientOrdersState({
    this.orders = const [],
    this.isLoading = false,
    this.error,
  });

  final List<ClientOrder> orders;
  final bool isLoading;
  final String? error;

  ClientOrdersState copyWith({
    List<ClientOrder>? orders,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return ClientOrdersState(
      orders: orders ?? this.orders,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ClientOrdersController extends Notifier<ClientOrdersState> {
  @override
  ClientOrdersState build() {
    return const ClientOrdersState();
  }

  Future<void> load({bool refresh = false}) async {
    if (state.isLoading && !refresh) return;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final orders = await ref.read(clientOrdersRepositoryProvider).fetchMyOrders();
      state = ClientOrdersState(orders: orders);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: apiErrorMessage(e, fallback: 'تعذر تحميل طلباتك.'),
      );
    }
  }
}

final clientOrdersControllerProvider =
    NotifierProvider<ClientOrdersController, ClientOrdersState>(ClientOrdersController.new);

final clientOrderDetailProvider =
    FutureProvider.autoDispose.family<ClientOrder, String>((ref, orderId) async {
  return ref.read(clientOrdersRepositoryProvider).fetchMyOrderById(orderId);
});

final clientOrderBidsProvider = FutureProvider.autoDispose
    .family<ClientOrderBidsResult, String>((ref, orderId) async {
  return ref.read(clientOrdersRepositoryProvider).listOrderBids(orderId);
});
