import 'currency_display_api.dart';
import 'currency_display_models.dart';

/// Session-cached display settings. Never used for payments or stored amounts.
class CurrencyDisplayRepository {
  CurrencyDisplayRepository(this._api);

  final CurrencyDisplayApi _api;

  CurrencyDisplaySettings? _cached;
  String? _cachedPreferred;
  Future<CurrencyDisplaySettings>? _inflight;

  Future<CurrencyDisplaySettings> load({required String preferred}) async {
    if (_cached != null && _cachedPreferred == preferred) {
      return _cached!;
    }
    if (_inflight != null && _cachedPreferred == preferred) {
      return _inflight!;
    }
    _cachedPreferred = preferred;
    _inflight = _fetch(preferred);
    try {
      final result = await _inflight!;
      _cached = result;
      return result;
    } catch (_) {
      return _cached ?? CurrencyDisplaySettings.jodOnly;
    } finally {
      _inflight = null;
    }
  }

  Future<CurrencyDisplaySettings> _fetch(String preferred) async {
    try {
      return await _api.fetch(preferred: preferred);
    } catch (_) {
      return _cached ?? CurrencyDisplaySettings.jodOnly;
    }
  }

  void invalidate() {
    _cached = null;
    _cachedPreferred = null;
    _inflight = null;
  }
}
