import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import '../config/environment_config.dart';

/// API configuration — see `docs/MOBILE_RELEASE.md` and `--dart-define=API_BASE_URL=...`
class ApiConstants {
  ApiConstants._();

  static const mobileClientTypeHeader = 'X-Client-Type';
  static const mobileClientTypeValue = 'mobile';
  static const accessTokenStorageKey = 'orderz_access_token';

  static String get baseUrl {
    final dotEnv = !kReleaseMode && dotenv.isInitialized
        ? dotenv.maybeGet('API_BASE_URL')
        : null;
    return EnvironmentConfig.resolveApiBaseUrl(
      dotEnvValue: dotEnv,
      isRelease: kReleaseMode,
      isAndroid: !kIsWeb && Platform.isAndroid,
      isWeb: kIsWeb,
    );
  }

  static const connectTimeout = Duration(seconds: 15);
  static const receiveTimeout = Duration(seconds: 20);
}
