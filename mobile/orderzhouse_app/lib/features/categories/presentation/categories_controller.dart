import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../data/categories_repository.dart';
import '../data/category_models.dart';

class CategoriesState {
  const CategoriesState({
    required this.items,
    this.isLoading = false,
    this.error,
  });

  final List<CategoryWithSubcategories> items;
  final bool isLoading;
  final String? error;

  CategoriesState copyWith({
    List<CategoryWithSubcategories>? items,
    bool? isLoading,
    String? error,
    bool clearError = false,
  }) {
    return CategoriesState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class CategoriesController extends Notifier<CategoriesState> {
  @override
  CategoriesState build() {
    Future.microtask(load);
    return const CategoriesState(items: [], isLoading: true);
  }

  Future<void> load() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final repo = ref.read(categoriesRepositoryProvider);
      final categories = await repo.fetchBrowsableCategories();
      state = CategoriesState(
        items: categories
            .map((c) => CategoryWithSubcategories(category: c))
            .toList(),
      );
    } catch (e) {
      state = CategoriesState(
        items: const [],
        error: apiErrorMessage(e, fallback: 'تعذر تحميل التصنيفات.'),
      );
    }
  }

  Future<void> loadSubcategories(String categoryId) async {
    final index = state.items.indexWhere((e) => e.category.id == categoryId);
    if (index < 0) return;
    final current = state.items[index];
    if (current.subcategories.isNotEmpty || current.subcategoriesLoading) return;

    final updated = [...state.items];
    updated[index] = current.copyWith(subcategoriesLoading: true, clearSubError: true);
    state = state.copyWith(items: updated);

    try {
      final subs = await ref.read(categoriesRepositoryProvider).fetchSubcategories(categoryId);
      final done = [...state.items];
      final i = done.indexWhere((e) => e.category.id == categoryId);
      if (i >= 0) {
        done[i] = done[i].copyWith(
          subcategories: subs,
          subcategoriesLoading: false,
        );
        state = state.copyWith(items: done);
      }
    } catch (e) {
      final done = [...state.items];
      final i = done.indexWhere((e) => e.category.id == categoryId);
      if (i >= 0) {
        done[i] = done[i].copyWith(
          subcategoriesLoading: false,
          subcategoriesError: e.toString(),
        );
        state = state.copyWith(items: done);
      }
    }
  }
}

final categoriesControllerProvider =
    NotifierProvider<CategoriesController, CategoriesState>(CategoriesController.new);
