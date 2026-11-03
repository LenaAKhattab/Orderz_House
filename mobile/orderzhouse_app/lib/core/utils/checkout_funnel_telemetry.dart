import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

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
  }) async {
    try {
      if (!_allowed.contains(eventType)) return;
      final sid = stripeCheckoutSessionId.trim();
      if (!_sessionRe.hasMatch(sid)) return;
      final storage = tokenStorage ?? SecureTokenStorage();
      final token = await storage.readAccessToken();
      if (token == null || token.isEmpty) return;

      final base = ApiConstants.baseUrl.replaceAll(RegExp(r'/$'), '');
      final uri = Uri.parse('$base/payments/checkout-funnel-events');
      await http
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
              'Accept-Language': locale,
              ApiConstants.mobileClientTypeHeader: ApiConstants.mobileClientTypeValue,
            },
            body: jsonEncode({
              'eventType': eventType,
              'stripeCheckoutSessionId': sid,
              if (paymentFlow != null && paymentFlow.isNotEmpty) 'paymentFlow': paymentFlow,
              'channel': 'mobile',
              'locale': locale,
            }),
          )
          .timeout(const Duration(seconds: 3));
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
