import 'package:flutter/foundation.dart';

/// Release-safe environment resolution (Phase 5C).
abstract final class EnvironmentConfig {
  static const productionApiBaseUrl = 'https://orderzhouse.com/api';
  static const productionWebBaseUrl = 'https://orderzhouse.com';

  static const _localHosts = {'localhost', '127.0.0.1', '10.0.2.2', '[::1]', '0.0.0.0'};

  /// Resolves API base URL. [isRelease] should match [kReleaseMode] in app code.
  static String resolveApiBaseUrl({
    String dartDefine = const String.fromEnvironment('API_BASE_URL'),
    String? dotEnvValue,
    bool isRelease = kReleaseMode,
    bool isAndroid = false,
    bool isWeb = kIsWeb,
  }) {
    final fromDefine = dartDefine.trim();
    if (fromDefine.isNotEmpty) {
      return _finalizeApiUrl(fromDefine, isRelease: isRelease);
    }

    if (!isRelease) {
      final fromDotEnv = dotEnvValue?.trim();
      if (fromDotEnv != null && fromDotEnv.isNotEmpty) {
        return _finalizeApiUrl(fromDotEnv, isRelease: false);
      }
      return debugApiFallbackBaseUrl(isAndroid: isAndroid, isWeb: isWeb);
    }

    return productionApiBaseUrl;
  }

  /// Resolves public web app base URL (no trailing slash).
  static String resolveWebBaseUrl({
    String dartDefine = const String.fromEnvironment('WEB_BASE_URL'),
    String? dotEnvValue,
    bool isRelease = kReleaseMode,
    bool isAndroid = false,
    bool isWeb = kIsWeb,
  }) {
    final fromDefine = dartDefine.trim();
    if (fromDefine.isNotEmpty) {
      return _finalizeWebUrl(fromDefine, isRelease: isRelease);
    }

    if (!isRelease) {
      final fromDotEnv = dotEnvValue?.trim();
      if (fromDotEnv != null && fromDotEnv.isNotEmpty) {
        return _finalizeWebUrl(fromDotEnv, isRelease: false);
      }
      return debugWebFallbackBaseUrl(isAndroid: isAndroid, isWeb: isWeb);
    }

    return productionWebBaseUrl;
  }

  @visibleForTesting
  static String debugApiFallbackBaseUrl({required bool isAndroid, required bool isWeb}) {
    if (isWeb) return 'http://localhost:5000/api';
    if (isAndroid) return 'http://10.0.2.2:5000/api';
    return 'http://localhost:5000/api';
  }

  static String debugWebFallbackBaseUrl({required bool isAndroid, required bool isWeb}) {
    if (isWeb) return 'http://localhost:5173';
    if (isAndroid) return 'http://10.0.2.2:5173';
    return 'http://localhost:5173';
  }

  /// True when [url] is safe for release builds (HTTPS, non-local host).
  @visibleForTesting
  static bool isSafeReleaseUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    if (uri == null) return false;
    if (uri.scheme != 'https') return false;
    final host = uri.host.toLowerCase();
    if (host.isEmpty) return false;
    if (_localHosts.contains(host)) return false;
    return true;
  }

  /// Whether an external checkout/launch URL may open in the current mode.
  static bool isSafeExternalLaunchUrl(String url, {bool isRelease = kReleaseMode}) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return false;
    final uri = Uri.tryParse(trimmed);
    if (uri == null) return false;

    if (isRelease) {
      return uri.scheme == 'https' && isSafeReleaseUrl(trimmed);
    }

    return uri.scheme == 'https' || uri.scheme == 'http';
  }

  static String _finalizeApiUrl(String raw, {required bool isRelease}) {
    final normalized = raw.trim();
    if (isRelease && !isSafeReleaseUrl(normalized)) {
      return productionApiBaseUrl;
    }
    return normalized;
  }

  static String _finalizeWebUrl(String raw, {required bool isRelease}) {
    final normalized = _normalizeWebBase(raw);
    if (isRelease && !isSafeReleaseUrl(normalized)) {
      return productionWebBaseUrl;
    }
    return normalized;
  }

  static String _normalizeWebBase(String raw) {
    return raw.trim().replaceAll(RegExp(r'/+$'), '');
  }
}
