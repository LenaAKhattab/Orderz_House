/// Holds a safe in-app route from a push tap until the router can consume it.
class PushPendingNavigation {
  PushPendingNavigation._();

  static String? _route;
  static bool didNavigate = false;
  static final List<void Function()> _listeners = [];

  static void addListener(void Function() listener) {
    _listeners.add(listener);
  }

  static void removeListener(void Function() listener) {
    _listeners.remove(listener);
  }

  static void setRoute(String? route) {
    final trimmed = route?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      _route = null;
      return;
    }
    if (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('//') ||
        trimmed.contains('..')) {
      _route = null;
      return;
    }
    _route = trimmed.startsWith('/') ? trimmed : '/$trimmed';
    didNavigate = false;
    for (final listener in List<void Function()>.from(_listeners)) {
      listener();
    }
  }

  /// Consumes a pending route for an already-authenticated session.
  /// Returns null when there is nothing to open or the app is already there,
  /// so a second tap delivery cannot navigate again.
  static String? takeIfDifferent(String? currentLocation) {
    final pending = _route;
    if (pending == null) return null;
    _route = null;
    didNavigate = true;
    if (currentLocation != null && _sameLocation(currentLocation, pending)) {
      return null;
    }
    return pending;
  }

  static bool _sameLocation(String current, String pending) {
    Uri parse(String value) {
      final withSlash = value.startsWith('/') ? value : '/$value';
      return Uri.parse(withSlash);
    }

    final a = parse(current);
    final b = parse(pending);
    return a.path == b.path && a.query == b.query;
  }

  static String? takeRoute() {
    final value = _route;
    _route = null;
    return value;
  }

  static String? peekRoute() => _route;

  static void clear() => _route = null;
}
