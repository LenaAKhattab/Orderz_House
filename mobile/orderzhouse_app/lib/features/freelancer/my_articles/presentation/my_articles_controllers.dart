import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/my_articles_api.dart';
import '../data/my_articles_errors.dart';
import '../data/my_articles_models.dart';

class MyArticlesState {
  const MyArticlesState({
    this.loading = true,
    this.refreshing = false,
    this.error,
    this.snapshot = const MyArticlesSnapshot(),
    this.statusFilter = 'all',
  });

  final bool loading;
  final bool refreshing;
  final String? error;
  final MyArticlesSnapshot snapshot;
  final String statusFilter;

  MyArticlesState copyWith({
    bool? loading,
    bool? refreshing,
    String? error,
    MyArticlesSnapshot? snapshot,
    String? statusFilter,
    bool clearError = false,
  }) {
    return MyArticlesState(
      loading: loading ?? this.loading,
      refreshing: refreshing ?? this.refreshing,
      error: clearError ? null : (error ?? this.error),
      snapshot: snapshot ?? this.snapshot,
      statusFilter: statusFilter ?? this.statusFilter,
    );
  }
}

final myArticlesControllerProvider =
    StateNotifierProvider.autoDispose<MyArticlesController, MyArticlesState>(
  (ref) => MyArticlesController(ref)..refresh(),
);

class MyArticlesController extends StateNotifier<MyArticlesState> {
  MyArticlesController(this._ref) : super(const MyArticlesState());

  final Ref _ref;

  Future<void> setStatusFilter(String key) async {
    final next = key.trim().isEmpty ? 'all' : key.trim();
    if (next == state.statusFilter) return;
    state = state.copyWith(
      statusFilter: next,
      loading: true,
      snapshot: MyArticlesSnapshot(writerProfileUrl: state.snapshot.writerProfileUrl),
      clearError: true,
    );
    await refresh();
  }

  Future<void> refresh() async {
    final hasItems = state.snapshot.items.isNotEmpty;
    state = state.copyWith(
      loading: !hasItems,
      refreshing: hasItems,
      clearError: true,
    );
    try {
      final snap = await _ref.read(myArticlesApiProvider).listMyArticles(
            status: state.statusFilter,
          );
      state = state.copyWith(
        loading: false,
        refreshing: false,
        snapshot: snap,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        refreshing: false,
        error: myArticlesErrorMessage(e),
      );
    }
  }
}
