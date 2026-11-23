import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'service_catalog_models.dart';

/// Fetches the server catalog with an in-memory, version-aware cache (ETag / If-None-Match).
/// The cache never outlives the app process and is dropped when the server reports a stale form,
/// so catalog edits reach the app without an app update.
class ServiceCatalogRepository {
  ServiceCatalogRepository(this._dio);

  final Dio _dio;
  ServiceCatalog? _cached;
  String? _etag;

  ServiceCatalog? get cached => _cached;

  void invalidate() {
    _cached = null;
    _etag = null;
  }

  Future<ServiceCatalog> fetch() async {
    final response = await _dio.get<dynamic>(
      '/catalog/services',
      queryParameters: {'fieldTypes': kMobileSupportedFieldTypes.join(',')},
      options: Options(
        headers: {if (_etag != null && _cached != null) 'If-None-Match': _etag},
        validateStatus: (s) => s != null && ((s >= 200 && s < 300) || s == 304),
      ),
    );
    if (response.statusCode == 304 && _cached != null) return _cached!;
    final body = response.data;
    final catalog = body is Map ? ServiceCatalog.fromResponse(Map<String, dynamic>.from(body)) : ServiceCatalog.empty;
    _cached = catalog;
    _etag = response.headers.value('etag');
    return catalog;
  }
}

final serviceCatalogRepositoryProvider = Provider<ServiceCatalogRepository>((ref) {
  return ServiceCatalogRepository(ref.watch(dioProvider));
});

/// True when the server rejected the order because the service form version changed meanwhile.
bool isStaleServiceFormError(Object error) {
  if (error is DioException) {
    final data = error.response?.data;
    return data is Map && data['code'] == 'SMART_ORDER_FORM_STALE';
  }
  return false;
}
