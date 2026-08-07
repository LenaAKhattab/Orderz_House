import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'categories_api.dart';
import 'category_models.dart';

final categoriesApiProvider = Provider<CategoriesApi>((ref) {
  return CategoriesApi(ref.watch(dioProvider));
});

class CategoriesRepository {
  CategoriesRepository(this._api);

  final CategoriesApi _api;

  Future<List<ServiceCategory>> fetchBrowsableCategories() async {
    final all = await _api.fetchCategories();
    return all.where(ServiceCategory.isBrowsable).toList()
      ..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
  }

  Future<List<ServiceSubcategory>> fetchSubcategories(String categoryId) {
    return _api.fetchSubcategories(categoryId);
  }

  Future<List<ServiceSubSubcategory>> fetchSubSubcategories(String categoryId) {
    return _api.fetchSubSubcategories(categoryId);
  }
}

final categoriesRepositoryProvider = Provider<CategoriesRepository>((ref) {
  return CategoriesRepository(ref.watch(categoriesApiProvider));
});
