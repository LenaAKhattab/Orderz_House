import 'package:dio/dio.dart';

import '../domain/auth_user.dart';

class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/login',
      data: {'email': email.trim(), 'password': password},
    );
    return _parseAuthSession(response.data);
  }

  Future<Map<String, dynamic>> register({
    required Map<String, dynamic> body,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/register',
      data: body,
    );
    return response.data ?? {};
  }

  Future<AuthSession> verifyRegisterOtp({
    required String email,
    required String otp,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/verify-register-otp',
      data: {'email': email.trim(), 'otp': otp.trim()},
    );
    return _parseAuthSession(response.data);
  }

  Future<void> forgotPassword({required String email}) async {
    await _dio.post<Map<String, dynamic>>(
      '/auth/forgot-password',
      data: {'email': email.trim()},
    );
  }

  Future<String> verifyForgotPasswordOtp({
    required String email,
    required String otp,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/auth/verify-forgot-password-otp',
      data: {'email': email.trim(), 'otp': otp.trim()},
    );
    final data = response.data?['data'];
    final token = data is Map ? data['resetToken']?.toString() : null;
    if (token == null || token.isEmpty) {
      throw DioException(
        requestOptions: response.requestOptions,
        message: 'الرمز غير صحيح',
      );
    }
    return token;
  }

  Future<void> resetPassword({
    required String email,
    required String resetToken,
    required String newPassword,
  }) async {
    await _dio.post<Map<String, dynamic>>(
      '/auth/reset-password',
      data: {
        'email': email.trim(),
        'resetToken': resetToken,
        'newPassword': newPassword,
      },
    );
  }

  Future<AuthUser> me() async {
    final response = await _dio.get<Map<String, dynamic>>('/auth/me');
    final data = response.data?['data'];
    if (data is Map && data['user'] is Map) {
      return AuthUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
    }
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'استجابة غير متوقعة من الخادم.',
    );
  }

  Future<void> logout() async {
    try {
      await _dio.post<void>('/auth/logout');
    } on DioException catch (e) {
      if (e.response?.statusCode != 401) rethrow;
    }
  }

  AuthSession _parseAuthSession(Map<String, dynamic>? json) {
    final data = json?['data'];
    if (data is! Map) {
      throw DioException(
        requestOptions: RequestOptions(path: '/auth'),
        message: json?['message']?.toString() ?? 'فشل تسجيل الدخول.',
      );
    }
    final userJson = data['user'];
    if (userJson is! Map) {
      throw DioException(
        requestOptions: RequestOptions(path: '/auth'),
        message: 'بيانات المستخدم غير متوفرة.',
      );
    }
    return AuthSession(
      user: AuthUser.fromJson(Map<String, dynamic>.from(userJson)),
      accessToken: data['accessToken'] as String?,
      expiresIn: data['expiresIn'] is int ? data['expiresIn'] as int : null,
    );
  }
}
