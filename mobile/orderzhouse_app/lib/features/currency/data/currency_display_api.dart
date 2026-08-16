import 'package:dio/dio.dart';

import 'currency_display_models.dart';

class CurrencyDisplayApi {
  CurrencyDisplayApi(this._dio);

  final Dio _dio;

  Future<CurrencyDisplaySettings> fetch({String? preferred}) async {
    final response = await _dio.get<dynamic>(
      '/public/currency-display',
      queryParameters: preferred == null || preferred.isEmpty
          ? null
          : {'preferred': preferred},
    );
    return CurrencyDisplaySettings.fromResponse(response.data);
  }
}
