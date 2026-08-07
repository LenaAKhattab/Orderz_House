import 'package:dio/dio.dart';

import '../../../core/network/json_helpers.dart';
import 'popup_ad_models.dart';
import 'public_ad_models.dart';

class PublicAdsApi {
  PublicAdsApi(this._dio);

  final Dio _dio;

  Future<List<PublicAd>> listAds({String placement = 'home_right_panel'}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/public/ads',
      queryParameters: {'placement': placement},
    );
    final data = res.data?['data'];
    final maps = extractList(data, nestedKey: 'ads');
    return maps.map(PublicAd.fromJson).where((a) => a.id.isNotEmpty).toList();
  }

  Future<void> trackImpression(String adId, {required String placement}) async {
    final id = int.tryParse(adId);
    if (id == null || id < 1) return;
    try {
      await _dio.post<void>(
        '/public/ads/$id/impression',
        queryParameters: {'placement': placement},
      );
    } catch (_) {
      /* ignore tracking failures */
    }
  }

  Future<void> trackClick(String adId, {required String placement}) async {
    final id = int.tryParse(adId);
    if (id == null || id < 1) return;
    try {
      await _dio.post<void>(
        '/public/ads/$id/click',
        queryParameters: {'placement': placement},
      );
    } catch (_) {
      /* ignore */
    }
  }
}

class PopupAdsApi {
  PopupAdsApi(this._dio);

  final Dio _dio;

  Future<List<PopupAd>> listPopupAds({required String pathname}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/public/popup-ads',
      queryParameters: {'pathname': pathname},
    );
    final data = res.data?['data'];
    final maps = extractList(data, nestedKey: 'ads');
    return maps.map(PopupAd.fromJson).where((a) => a.id.isNotEmpty).toList();
  }

  Future<void> trackImpression(String adId) async {
    final id = int.tryParse(adId);
    if (id == null || id < 1) return;
    try {
      await _dio.post<void>('/public/popup-ads/$id/impression');
    } catch (_) {
      /* ignore */
    }
  }

  Future<void> trackClick(String adId) async {
    final id = int.tryParse(adId);
    if (id == null || id < 1) return;
    try {
      await _dio.post<void>('/public/popup-ads/$id/click');
    } catch (_) {
      /* ignore */
    }
  }
}
