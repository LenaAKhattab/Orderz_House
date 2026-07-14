import 'package:dio/dio.dart';

import 'account_models.dart';

class AccountApi {
  AccountApi(this._dio);

  final Dio _dio;

  Future<AccountProfile> getProfileMe() async {
    final res = await _dio.get<Map<String, dynamic>>('/profile/me');
    final data = res.data?['data'];
    final user = data is Map ? data['user'] : null;
    if (user is! Map) {
      throw DioException(
        requestOptions: res.requestOptions,
        message: 'تعذر تحميل بيانات الحساب.',
      );
    }
    return AccountProfile.fromJson(Map<String, dynamic>.from(user));
  }

  Future<AccountProfile> updateProfile(ProfileUpdatePayload payload) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      '/profile/me',
      data: payload.toJson(),
    );
    final data = res.data?['data'];
    final user = data is Map ? data['user'] : null;
    if (user is! Map) {
      throw DioException(
        requestOptions: res.requestOptions,
        message: 'تعذر حفظ الملف الشخصي.',
      );
    }
    return AccountProfile.fromJson(Map<String, dynamic>.from(user));
  }

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    await _dio.patch<Map<String, dynamic>>(
      '/profile/password',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
      },
    );
  }

  Future<void> deactivateAccount({
    required String currentPassword,
    required String confirmation,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/profile/deactivate',
      data: {
        'currentPassword': currentPassword,
        'confirmation': confirmation,
      },
    );
  }
}
