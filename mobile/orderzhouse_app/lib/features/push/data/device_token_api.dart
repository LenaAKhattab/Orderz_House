import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';

class DeviceTokenApi {
  DeviceTokenApi(this._dio);

  final Dio _dio;

  Future<void> registerPushToken({
    required String token,
    required String platform,
    String? deviceId,
    String? appVersion,
  }) async {
    await _dio.post<void>(
      '/devices/push-token',
      data: {
        'token': token,
        'platform': platform,
        if (deviceId != null && deviceId.isNotEmpty) 'deviceId': deviceId,
        if (appVersion != null && appVersion.isNotEmpty) 'appVersion': appVersion,
      },
    );
  }

  Future<void> deactivatePushToken(String token) async {
    await _dio.delete<void>(
      '/devices/push-token',
      data: {'token': token},
    );
  }

  Future<void> deactivateAllPushTokens() async {
    await _dio.post<void>('/devices/push-token/deactivate-all');
  }
}

final deviceTokenApiProvider = Provider<DeviceTokenApi>((ref) {
  return DeviceTokenApi(ref.watch(dioProvider));
});
