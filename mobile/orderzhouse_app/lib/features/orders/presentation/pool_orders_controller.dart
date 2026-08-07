import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/pool_order_models.dart';
import '../../../core/errors/api_error_message.dart';
import '../data/pool_orders_repository.dart';

class PoolOrdersState {
  const PoolOrdersState({
    this.orders = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.page = 1,
    this.totalPages = 1,
  });

  final List<PoolOrder> orders;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final int page;
  final int totalPages;

  bool get hasMore => page < totalPages;

  PoolOrdersState copyWith({
    List<PoolOrder>? orders,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    int? page,
    int? totalPages,
    bool clearError = false,
  }) {
    return PoolOrdersState(
      orders: orders ?? this.orders,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
    );
  }
}

class PoolOrdersController extends Notifier<PoolOrdersState> {
  @override
  PoolOrdersState build() {
    Future.microtask(() => load(refresh: true));
    return const PoolOrdersState(isLoading: true);
  }

  Future<void> load({bool refresh = false}) async {
    if (refresh) {
      state = const PoolOrdersState(isLoading: true);
    } else {
      if (!state.hasMore || state.isLoadingMore) return;
      state = state.copyWith(isLoadingMore: true, clearError: true);
    }

    final nextPage = refresh ? 1 : state.page + 1;
    try {
      final page = await ref.read(poolOrdersRepositoryProvider).fetchPoolOrders(page: nextPage);
      final merged = refresh ? page.orders : [...state.orders, ...page.orders];
      state = PoolOrdersState(
        orders: merged,
        page: page.page,
        totalPages: page.totalPages,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        error: apiErrorMessage(e, fallback: 'تعذر تحميل الطلبات.'),
      );
    }
  }
}

final poolOrdersControllerProvider =
    NotifierProvider<PoolOrdersController, PoolOrdersState>(PoolOrdersController.new);
