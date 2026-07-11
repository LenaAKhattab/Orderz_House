import '../constants/api_constants.dart';

/// Resolve `/images/...` paths against API origin (matches web ServicesExplorer).
String resolveBackendAssetUrl(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '';
  final value = raw.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  final apiBase = ApiConstants.baseUrl;
  final origin = apiBase.replaceAll(RegExp(r'/api/?$'), '');
  final path = value.startsWith('/') ? value : '/$value';
  return '$origin$path';
}

T? readMapField<T>(Map<String, dynamic> json, String camel, String snake) {
  if (json.containsKey(camel)) return json[camel] as T?;
  if (json.containsKey(snake)) return json[snake] as T?;
  return null;
}

String readString(Map<String, dynamic> json, String camel, String snake, {String fallback = ''}) {
  final v = readMapField<dynamic>(json, camel, snake);
  return v == null ? fallback : '$v';
}

bool readBool(Map<String, dynamic> json, String camel, String snake, {bool fallback = false}) {
  final v = readMapField<dynamic>(json, camel, snake);
  if (v is bool) return v;
  if (v == null) return fallback;
  return v == true || v == 1 || v == 'true' || v == 't';
}

int? readInt(Map<String, dynamic> json, String camel, String snake) {
  final v = readMapField<dynamic>(json, camel, snake);
  if (v == null) return null;
  if (v is int) return v;
  return int.tryParse('$v');
}

double? readDouble(Map<String, dynamic> json, String camel, String snake) {
  final v = readMapField<dynamic>(json, camel, snake);
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse('$v');
}

List<Map<String, dynamic>> extractList(dynamic data, {String? nestedKey}) {
  if (data is List) {
    return data.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
  }
  if (data is Map && nestedKey != null) {
    final nested = data[nestedKey];
    if (nested is List) {
      return nested.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    }
  }
  return const [];
}
