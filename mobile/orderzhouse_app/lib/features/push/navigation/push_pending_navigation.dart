/// Holds a safe in-app route from a push tap until the router can consume it.
class PushPendingNavigation {
  PushPendingNavigation._();

  static String? _route;

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
  }

  static String? takeRoute() {
    final value = _route;
    _route = null;
    return value;
  }

  static String? peekRoute() => _route;

  static void clear() => _route = null;
}
