import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../config/environment_config.dart';

/// Public web app URLs — see `docs/MOBILE_RELEASE.md` and `--dart-define=WEB_BASE_URL=...`
class WebConstants {
  WebConstants._();

  static const freelancerPlansPath = '/dashboard/freelancer/plans';

  static String get baseUrl {
    final dotEnv = !kReleaseMode && dotenv.isInitialized
        ? dotenv.maybeGet('WEB_BASE_URL')
        : null;
    return EnvironmentConfig.resolveWebBaseUrl(
      dotEnvValue: dotEnv,
      isRelease: kReleaseMode,
      isAndroid: !kIsWeb && Platform.isAndroid,
      isWeb: kIsWeb,
    );
  }

  /// Platform-aware debug fallback when dart-define and dotenv are unset.
  @visibleForTesting
  static String platformFallbackBaseUrl({bool? isAndroid}) {
    final android = isAndroid ?? (!kIsWeb && Platform.isAndroid);
    return EnvironmentConfig.debugWebFallbackBaseUrl(
      isAndroid: android,
      isWeb: kIsWeb,
    );
  }

  static String get freelancerPlansUrl => buildWebPath(freelancerPlansPath);

  /// Joins [baseUrl] with [path] without double slashes (except after scheme).
  static String buildWebPath(String path) {
    final normalizedPath = path.startsWith('/') ? path : '/$path';
    return '$baseUrl$normalizedPath';
  }
}
