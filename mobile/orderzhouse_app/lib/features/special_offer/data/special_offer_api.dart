import 'package:dio/dio.dart';

import 'special_offer_models.dart';

class SpecialOfferApi {
  SpecialOfferApi(this._dio);

  final Dio _dio;

  Future<SpecialOfferPackage?> fetchPublicOffer() async {
    try {
      final response = await _dio.get<Map<String, dynamic>>('/special-offer-package');
      final root = response.data;
      if (root == null) return null;
      final data = root['data'];
      if (data is! Map) return null;
      final map = Map<String, dynamic>.from(data);
      final raw = map['specialOfferPackage'] ?? map['special_offer_package'];
      if (raw == null) return null;
      if (raw is! Map) return null;
      final offer = SpecialOfferPackage.fromJson(Map<String, dynamic>.from(raw));
      return isSpecialOfferVisible(offer) ? offer : null;
    } on DioException {
      return null;
    } catch (_) {
      return null;
    }
  }
}
