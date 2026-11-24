import 'service_catalog_models.dart';

/// Smart Orders S2/S4 — immutable service form snapshot stored with the order (read-only on mobile).
/// Rendered from the snapshot's own field definitions, never from the live catalog.
class ServiceFormSnapshot {
  const ServiceFormSnapshot({
    required this.serviceCode,
    required this.version,
    required this.name,
    required this.fields,
    required this.values,
    this.quantityUnit,
    this.quantityValue,
    this.quantityUnspecified = false,
  });

  final String serviceCode;
  final int version;
  final Map<String, String> name;
  final List<CatalogField> fields;
  final Map<String, dynamic> values;
  final String? quantityUnit;
  final String? quantityValue;
  final bool quantityUnspecified;

  static ServiceFormSnapshot? tryParse(dynamic raw) {
    if (raw is! Map) return null;
    final j = Map<String, dynamic>.from(raw);
    final code = j['serviceCode']?.toString() ?? '';
    if (code.isEmpty) return null;
    final q = j['quantity'] is Map ? Map<String, dynamic>.from(j['quantity'] as Map) : const <String, dynamic>{};
    final name = <String, String>{};
    if (j['name'] is Map) {
      (j['name'] as Map).forEach((k, v) {
        if (v != null && v.toString().trim().isNotEmpty) name[k.toString()] = v.toString();
      });
    }
    return ServiceFormSnapshot(
      serviceCode: code,
      version: j['version'] is num ? (j['version'] as num).toInt() : int.tryParse('${j['version']}') ?? 1,
      name: name,
      fields: (j['fields'] is List)
          ? (j['fields'] as List).whereType<Map>().map((f) => CatalogField.fromJson(Map<String, dynamic>.from(f))).toList()
          : const [],
      values: j['values'] is Map ? Map<String, dynamic>.from(j['values'] as Map) : const {},
      quantityUnit: q['unit']?.toString(),
      quantityValue: q['value']?.toString(),
      quantityUnspecified: q['unspecified'] == true,
    );
  }

  /// Display rows (label → text) for every field that has a stored value, in schema order.
  /// Unknown/future field types still show their raw value instead of being dropped.
  List<MapEntry<String, String>> displayRows(String locale) {
    final isEn = locale == 'en';
    final rows = <MapEntry<String, String>>[];
    if (quantityUnspecified) {
      rows.add(MapEntry(isEn ? 'Quantity' : 'الكمية', isEn ? 'Not specified' : 'غير محددة'));
    } else if (quantityValue != null && quantityValue!.isNotEmpty) {
      rows.add(MapEntry(isEn ? 'Quantity' : 'الكمية', '$quantityValue ${unitLabel(quantityUnit ?? 'units', locale)}'));
    }
    for (final f in fields) {
      if (!values.containsKey(f.key)) continue;
      final v = values[f.key];
      if (v == null) continue;
      String optionLabel(Object? x) {
        final o = f.options.where((o) => o.value == x?.toString()).firstOrNull;
        return o == null ? (x?.toString() ?? '') : pickLocalized(o.label, locale);
      }

      String text;
      switch (f.type) {
        case 'select':
        case 'radio':
          text = optionLabel(v);
        case 'multiselect':
          text = (v is List ? v : [v]).map(optionLabel).join('، ');
        case 'checkbox':
          text = v == true ? (isEn ? 'Yes' : 'نعم') : (isEn ? 'No' : 'لا');
        case 'file':
          text = (v is List ? v : [v]).map((x) => x is Map ? (x['name']?.toString() ?? '') : x.toString()).where((s) => s.isNotEmpty).join('، ');
        case 'repeater':
          text = (v is List ? v : const [])
              .whereType<Map>()
              .map((row) => _subText(f.subFields, Map<String, dynamic>.from(row), locale))
              .where((t) => t.isNotEmpty)
              .join(' | ');
        case 'conditional_group':
          text = v is Map ? _subText(f.subFields, Map<String, dynamic>.from(v), locale) : '';
        case 'datetime':
          final d = DateTime.tryParse(v.toString())?.toLocal();
          String two(int n) => n.toString().padLeft(2, '0');
          text = d == null ? v.toString() : '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
        default:
          text = v is List ? v.join('، ') : v.toString();
      }
      if (text.trim().isEmpty) continue;
      final label = pickLocalized(f.label, locale);
      rows.add(MapEntry(label.isEmpty ? f.key : label, text));
    }
    return rows;
  }

  static String _subText(List<CatalogField> subs, Map<String, dynamic> row, String locale) {
    final parts = <String>[];
    for (final f in subs) {
      final v = row[f.key];
      if (v == null || (v is String && v.isEmpty)) continue;
      String val;
      if (f.options.isNotEmpty) {
        final vs = v is List ? v : [v];
        val = vs.map((x) {
          final o = f.options.where((o) => o.value == x.toString()).firstOrNull;
          return o == null ? x.toString() : pickLocalized(o.label, locale);
        }).join('، ');
      } else if (v is bool) {
        val = v ? (locale == 'en' ? 'Yes' : 'نعم') : (locale == 'en' ? 'No' : 'لا');
      } else {
        val = v.toString();
      }
      final label = pickLocalized(f.label, locale);
      parts.add('${label.isEmpty ? f.key : label}: $val');
    }
    return parts.join('، ');
  }
}
