import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/environment_config.dart';

/// Result of attempting to open a Stripe Checkout URL externally.
class StripeCheckoutLaunchResult {
  const StripeCheckoutLaunchResult({
    required this.launched,
    this.blockedLiveCheckout = false,
    this.message,
  });

  final bool launched;
  final bool blockedLiveCheckout;
  final String? message;

  static const liveBlockedAr =
      'تم إنشاء رابط دفع، لكن بيئة Stripe الحالية Live ولا يجب اختبار الدفع محليًا.';
}

/// True when [url] contains a Stripe live Checkout Session id (`cs_live_`).
bool isStripeLiveCheckoutUrl(String url) => url.contains('cs_live_');

/// True when [url] contains a Stripe test Checkout Session id (`cs_test_`).
bool isStripeTestCheckoutUrl(String url) => url.contains('cs_test_');

/// Opens Stripe-hosted checkout in the external browser — no Stripe keys in app.
///
/// In debug/profile, live Checkout URLs (`cs_live_`) are blocked so local QA
/// cannot accidentally open production Stripe. Release builds are unchanged
/// aside from existing HTTPS/local-host URL safety.
Future<StripeCheckoutLaunchResult> launchStripeCheckoutUrl(String checkoutUrl) async {
  final trimmed = checkoutUrl.trim();
  if (trimmed.isEmpty) {
    return const StripeCheckoutLaunchResult(launched: false);
  }

  if (!kReleaseMode && isStripeLiveCheckoutUrl(trimmed)) {
    return const StripeCheckoutLaunchResult(
      launched: false,
      blockedLiveCheckout: true,
      message: StripeCheckoutLaunchResult.liveBlockedAr,
    );
  }

  if (!EnvironmentConfig.isSafeExternalLaunchUrl(trimmed, isRelease: kReleaseMode)) {
    return const StripeCheckoutLaunchResult(launched: false);
  }

  final uri = Uri.parse(trimmed);
  final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
  return StripeCheckoutLaunchResult(launched: launched);
}
