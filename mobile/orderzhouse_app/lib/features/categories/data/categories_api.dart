import 'package:dio/dio.dart';

import 'category_models.dart';

class CategoriesApi {
  CategoriesApi(this._dio);

  final Dio _dio;

  Future<List<ServiceCategory>> fetchCategories() async {
    final response = await _dio.get<dynamic>('/categories');
    final body = response.data;
    if (body is Map && body['data'] != null) {
      return ServiceCategory.parseList(body['data']);
    }
    return ServiceCategory.parseList(body);
  }

  Future<List<ServiceSubcategory>> fetchSubcategories(String categoryId) async {
    final response = await _dio.get<dynamic>('/categories/$categoryId/subcategories');
    final body = response.data;
    if (body is Map && body['data'] != null) {
      return ServiceSubcategory.parseList(body['data']);
    }
    return ServiceSubcategory.parseList(body);
  }

  Future<List<ServiceSubSubcategory>> fetchSubSubcategories(String categoryId) async {
    final response = await _dio.get<dynamic>('/categories/$categoryId/sub-subcategories');
    final body = response.data;
    if (body is Map && body['data'] != null) {
      return ServiceSubSubcategory.parseList(body['data']);
    }
    return ServiceSubSubcategory.parseList(body);
  }
}
