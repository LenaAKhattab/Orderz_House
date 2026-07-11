import 'package:dio/dio.dart';

import '../constants/api_constants.dart';
import '../storage/secure_token_storage.dart';

class MobileClientInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers[ApiConstants.mobileClientTypeHeader] =
        ApiConstants.mobileClientTypeValue;
    handler.next(options);
  }
}

class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required SecureTokenStorage tokenStorage,
    required void Function() onUnauthorized,
  })  : _tokenStorage = tokenStorage,
        _onUnauthorized = onUnauthorized;

  final SecureTokenStorage _tokenStorage;
  final void Function() _onUnauthorized;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _tokenStorage.readAccessToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final status = err.response?.statusCode;
    final path = err.requestOptions.path;
    final isAuthEndpoint = path.contains('/auth/login') ||
        path.contains('/auth/register') ||
        path.contains('/auth/verify-register-otp');

    if (status == 401 && !isAuthEndpoint) {
      await _tokenStorage.clearAccessToken();
      _onUnauthorized();
    }
    handler.next(err);
  }
}
