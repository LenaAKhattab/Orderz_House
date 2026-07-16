import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'device_token_api.dart';

/// Registers / deactivates FCM tokens with the backend. Never logs the token.
class DeviceTokenRepository {
  DeviceTokenRepository({
    required DeviceTokenApi api,
    SharedPreferences? prefs,
  })  : _api = api,
        _prefs = prefs;

  static const _deviceIdKey = 'oh_push_device_id';
  static const _lastTokenKey = 'oh_push_last_token';

  final DeviceTokenApi _api;
  SharedPreferences? _prefs;

  Future<SharedPreferences> _ensurePrefs() async {
    return _prefs ??= await SharedPreferences.getInstance();
  }

  Future<String> deviceId() async {
    final prefs = await _ensurePrefs();
    final existing = prefs.getString(_deviceIdKey);
    if (existing != null && existing.isNotEmpty) return existing;
    final created = _randomId();
    await prefs.setString(_deviceIdKey, created);
    return created;
  }

  Future<String?> readCachedToken() async {
    final prefs = await _ensurePrefs();
    return prefs.getString(_lastTokenKey);
  }

  Future<void> cacheToken(String token) async {
    final prefs = await _ensurePrefs();
    await prefs.setString(_lastTokenKey, token);
  }

  Future<void> clearCachedToken() async {
    final prefs = await _ensurePrefs();
    await prefs.remove(_lastTokenKey);
  }

  /// Only call when the user session is authenticated.
  Future<void> registerToken({
    required String token,
    required String platform,
    String? appVersion,
  }) async {
    final trimmed = token.trim();
    if (trimmed.length < 20) return;
    await _api.registerPushToken(
      token: trimmed,
      platform: platform,
      deviceId: await deviceId(),
      appVersion: appVersion,
    );
    await cacheToken(trimmed);
  }

  Future<void> deactivateCurrentToken() async {
    final token = await readCachedToken();
    if (token == null || token.isEmpty) {
      try {
        await _api.deactivateAllPushTokens();
      } catch (_) {
        // Best-effort on logout.
      }
      return;
    }
    try {
      await _api.deactivatePushToken(token);
    } catch (_) {
      try {
        await _api.deactivateAllPushTokens();
      } catch (_) {}
    } finally {
      await clearCachedToken();
    }
  }

  static String _randomId() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  @visibleForTesting
  static String debugMaskToken(String token) {
    if (token.length < 12) return '[redacted]';
    return '${token.substring(0, 4)}…${token.substring(token.length - 4)}';
  }
}

final deviceTokenRepositoryProvider = Provider<DeviceTokenRepository>((ref) {
  return DeviceTokenRepository(api: ref.watch(deviceTokenApiProvider));
});
