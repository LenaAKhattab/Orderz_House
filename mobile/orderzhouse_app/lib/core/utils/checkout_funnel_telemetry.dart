import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../constants/api_constants.dart';
import '../storage/secure_token_storage.dart';

/// Best-effort first-party checkout funnel signals (mobile).
/// Never blocks Stripe launch; failures are swallowed.
class CheckoutFunnelTelemetry {
  CheckoutFunnelTelemetry._();

  static const _allowed = {
    'checkout_redirect_started',
    'checkout_cancel_returned',
    'checkout_success_returned',
  };

  static final _sessionRe = RegExp(r'^cs_[A-Za-z0-9_]+$');

  static Future<void> record({
    required String eventType,
    required String stripeCheckoutSessionId,
    String? paymentFlow,
    String locale = 'ar',
    SecureTokenStorage? tokenStorage,
    Future<String?> Function()? accessTokenReader,
  }) async {
    try {
      if (!_allowed.contains(eventType)) return;
      final sid = stripeCheckoutSessionId.trim();
      if (!_sessionRe.hasMatch(sid)) return;
      final token = accessTokenReader != null
          ? await accessTokenReader()
          : await (tokenStorage ?? SecureTokenStorage()).readAccessToken();
      if (token == null || token.isEmpty) return;

      final base = ApiConstants.baseUrl.replaceAll(RegExp(r'/$'), '');
      final dio = Dio(
        BaseOptions(
          baseUrl: base,
          connectTimeout: const Duration(seconds: 3),
          receiveTimeout: const Duration(seconds: 3),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
            'Accept-Language': locale,
            ApiConstants.mobileClientTypeHeader: ApiConstants.mobileClientTypeValue,
          },
        ),
      );
      await dio.post(
        '/payments/checkout-funnel-events',
        data: {
          'eventType': eventType,
          'stripeCheckoutSessionId': sid,
          if (paymentFlow != null && paymentFlow.isNotEmpty) 'paymentFlow': paymentFlow,
          'channel': 'mobile',
          'locale': locale,
        },
      );
    } catch (e, st) {
      if (kDebugMode) {
        debugPrint('checkout funnel telemetry ignored: $e\n$st');
      }
    }
  }

  static String? sessionIdFromCheckoutUrl(String url) {
    try {
      final uri = Uri.parse(url);
      for (final part in uri.pathSegments) {
        if (_sessionRe.hasMatch(part)) return part;
      }
    } catch (_) {}
    return null;
  }
}
