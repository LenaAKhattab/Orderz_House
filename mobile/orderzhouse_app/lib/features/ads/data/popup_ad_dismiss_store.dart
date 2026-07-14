import 'package:shared_preferences/shared_preferences.dart';

import 'popup_ad_models.dart';

/// Mirrors web `popupAdDismiss.js` (session / day / every_visit).
class PopupAdDismissStore {
  PopupAdDismissStore({SharedPreferences? prefs}) : _prefsOverride = prefs;

  final SharedPreferences? _prefsOverride;
  SharedPreferences? _prefs;

  /// In-memory session keys (cleared when process restarts) — like sessionStorage.
  static final Set<String> _sessionKeys = <String>{};

  Future<SharedPreferences> _prefsAsync() async {
    return _prefs ??= (_prefsOverride ?? await SharedPreferences.getInstance());
  }

  static String _todayKey() {
    final d = DateTime.now();
    final m = d.month.toString().padLeft(2, '0');
    final day = d.day.toString().padLeft(2, '0');
    return '${d.year}-$m-$day';
  }

  static String _normalizePath(String pathname) {
    final raw = pathname.trim();
    if (raw.isEmpty) return '/';
    return raw.startsWith('/') ? raw : '/$raw';
  }

  bool isDismissedSync(PopupAd ad, String pathname) {
    final id = ad.id;
    if (id.isEmpty) return true;
    final freq = (ad.frequency).trim().isEmpty ? 'session' : ad.frequency;
    final path = _normalizePath(pathname);

    if (freq == 'every_visit') {
      return _sessionKeys.contains('visit_${id}_$path');
    }
    if (freq == 'day') {
      // Async prefs may not be ready — treat as not dismissed until async check.
      final prefs = _prefs;
      if (prefs == null) return false;
      return prefs.getString('oh_popup_ad_day_${id}_${_todayKey()}') == '1';
    }
    return _sessionKeys.contains('sess_$id');
  }

  Future<bool> isDismissed(PopupAd ad, String pathname) async {
    final id = ad.id;
    if (id.isEmpty) return true;
    final freq = (ad.frequency).trim().isEmpty ? 'session' : ad.frequency;
    final path = _normalizePath(pathname);

    if (freq == 'every_visit') {
      return _sessionKeys.contains('visit_${id}_$path');
    }
    if (freq == 'day') {
      final prefs = await _prefsAsync();
      return prefs.getString('oh_popup_ad_day_${id}_${_todayKey()}') == '1';
    }
    return _sessionKeys.contains('sess_$id');
  }

  Future<void> markDismissed(PopupAd ad, String pathname) async {
    final id = ad.id;
    if (id.isEmpty) return;
    final freq = (ad.frequency).trim().isEmpty ? 'session' : ad.frequency;
    final path = _normalizePath(pathname);

    if (freq == 'every_visit') {
      _sessionKeys.add('visit_${id}_$path');
      return;
    }
    if (freq == 'day') {
      final prefs = await _prefsAsync();
      await prefs.setString('oh_popup_ad_day_${id}_${_todayKey()}', '1');
      return;
    }
    _sessionKeys.add('sess_$id');
  }

  Future<PopupAd?> pickToShow(List<PopupAd> ads, String pathname) async {
    for (final ad in ads) {
      if (!await isDismissed(ad, pathname)) return ad;
    }
    return null;
  }

  /// Test helper.
  static void clearSessionForTests() => _sessionKeys.clear();
}
