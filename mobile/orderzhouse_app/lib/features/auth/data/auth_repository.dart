import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../../../core/storage/secure_token_storage.dart';
import '../domain/auth_user.dart';
import 'auth_api.dart';

final authApiProvider = Provider<AuthApi>((ref) {
  return AuthApi(ref.watch(dioProvider));
});

class AuthRepository {
  AuthRepository({
    required AuthApi api,
    required SecureTokenStorage tokenStorage,
  })  : _api = api,
        _tokenStorage = tokenStorage;

  final AuthApi _api;
  final SecureTokenStorage _tokenStorage;

  Future<AuthUser> login({
    required String email,
    required String password,
  }) async {
    final session = await _api.login(email: email, password: password);
    await _persistSession(session);
    return session.user;
  }

  Future<Map<String, dynamic>> register(Map<String, dynamic> body) {
    return _api.register(body: body);
  }

  Future<AuthUser> verifyRegisterOtp({
    required String email,
    required String otp,
  }) async {
    final session = await _api.verifyRegisterOtp(email: email, otp: otp);
    await _persistSession(session);
    return session.user;
  }

  Future<AuthUser?> bootstrapSession() async {
    final token = await _tokenStorage.readAccessToken();
    if (token == null || token.isEmpty) return null;
    try {
      return await _api.me();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await _tokenStorage.clearAccessToken();
        return null;
      }
      rethrow;
    }
  }

  Future<AuthUser> fetchMe() => _api.me();

  Future<void> logout() async {
    try {
      await _api.logout();
    } finally {
      await _tokenStorage.clearAccessToken();
    }
  }

  Future<void> clearLocalSession() => _tokenStorage.clearAccessToken();

  Future<void> _persistSession(AuthSession session) async {
    final token = session.accessToken;
    if (token == null || token.isEmpty) {
      throw DioException(
        requestOptions: RequestOptions(path: '/auth'),
        message: 'لم يُرجع الخادم رمز الدخول للموبايل.',
      );
    }
    await _tokenStorage.writeAccessToken(token);
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    api: ref.watch(authApiProvider),
    tokenStorage: ref.watch(secureTokenStorageProvider),
  );
});
