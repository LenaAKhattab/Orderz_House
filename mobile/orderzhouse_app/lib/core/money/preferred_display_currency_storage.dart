import 'package:shared_preferences/shared_preferences.dart';

import 'display_currencies.dart';

class PreferredDisplayCurrencyStorage {
  PreferredDisplayCurrencyStorage({SharedPreferences? prefs}) : _prefsOverride = prefs;

  final SharedPreferences? _prefsOverride;
  SharedPreferences? _prefs;

  Future<SharedPreferences> _ensure() async {
    return _prefs ??= (_prefsOverride ?? await SharedPreferences.getInstance());
  }

  Future<String> read() async {
    try {
      final prefs = await _ensure();
      final raw = (prefs.getString(kPreferredDisplayCurrencyStorageKey) ?? 'auto').trim();
      if (raw == 'auto' || raw.isEmpty) return 'auto';
      final code = raw.toUpperCase();
      return kSupportedDisplayCurrencies.contains(code) ? code : 'auto';
    } catch (_) {
      return 'auto';
    }
  }

  Future<void> write(String value) async {
    final next = value.trim().isEmpty ? 'auto' : value.trim();
    try {
      final prefs = await _ensure();
      await prefs.setString(kPreferredDisplayCurrencyStorageKey, next);
    } catch (_) {
      /* ignore */
    }
  }
}
