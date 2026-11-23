import 'service_catalog_models.dart';

/// Selected service + entered values (UX validation only — the server re-validates the exact version).
class ServiceFormDraft {
  const ServiceFormDraft({
    this.serviceCode,
    this.version,
    this.values = const {},
    this.quantity = '',
    this.quantityUnspecified = false,
  });

  final String? serviceCode;
  final int? version;
  final Map<String, Object?> values;
  final String quantity;
  final bool quantityUnspecified;

  bool get hasService => serviceCode != null && serviceCode!.isNotEmpty;

  ServiceFormDraft withValue(String key, Object? value) =>
      ServiceFormDraft(
        serviceCode: serviceCode,
        version: version,
        values: {...values, key: value},
        quantity: quantity,
        quantityUnspecified: quantityUnspecified,
      );

  ServiceFormDraft withQuantity({String? quantity, bool? unspecified}) => ServiceFormDraft(
        serviceCode: serviceCode,
        version: version,
        values: values,
        quantity: quantity ?? this.quantity,
        quantityUnspecified: unspecified ?? quantityUnspecified,
      );
}

bool _isEmpty(Object? v) =>
    v == null || (v is String && v.trim().isEmpty) || (v is List && v.isEmpty);

bool fieldVisible(CatalogField f, Map<String, Object?> values) {
  if (f.showIfField == null) return true;
  final v = values[f.showIfField];
  if (v is List) return v.any((x) => f.showIfValues.contains(x));
  return f.showIfValues.contains(v);
}

final _int = RegExp(r'^-?\d{1,10}$');
final _dec2 = RegExp(r'^-?\d{1,10}(\.\d{1,2})?$');
final _date = RegExp(r'^\d{4}-\d{2}-\d{2}$');

/// Returns field key → reason code (same codes as the server).
Map<String, String> validateServiceForm(CatalogService service, ServiceFormDraft draft) {
  final errors = <String, String>{};
  for (final f in service.fields) {
    if (!fieldVisible(f, draft.values)) continue;
    final v = draft.values[f.key];
    if (_isEmpty(v) || (f.type == 'checkbox' && f.required && v != true)) {
      if (f.required) errors[f.key] = 'required';
      continue;
    }
    switch (f.type) {
      case 'number':
      case 'decimal':
        final s = v.toString().trim().replaceAll(',', '.');
        if (!(f.type == 'decimal' ? _dec2 : _int).hasMatch(s)) {
          errors[f.key] = 'invalid_number';
        } else if (f.min != null && num.parse(s) < f.min!) {
          errors[f.key] = 'below_min';
        } else if (f.max != null && num.parse(s) > f.max!) {
          errors[f.key] = 'above_max';
        }
      case 'text':
      case 'textarea':
        if (f.maxLength != null && v.toString().length > f.maxLength!) errors[f.key] = 'too_long';
      case 'url':
        final u = Uri.tryParse(v.toString().trim());
        if (u == null || !(u.scheme == 'https' || u.scheme == 'http') || !u.host.contains('.')) {
          errors[f.key] = 'invalid_url';
        }
      case 'date':
        final s = v.toString();
        final parsed = _date.hasMatch(s) ? DateTime.tryParse(s) : null;
        if (parsed == null || parsed.toIso8601String().substring(0, 10) != s) errors[f.key] = 'invalid_date';
      case 'multiselect':
        final list = v as List;
        if (f.min != null && list.length < f.min!) errors[f.key] = 'below_min';
        if (f.max != null && list.length > f.max!) errors[f.key] = 'above_max';
      default:
        break;
    }
  }
  final q = service.quantity;
  if (draft.quantityUnspecified) {
    if (!q.allowUnspecified) errors['quantity'] = 'unspecified_not_allowed';
  } else if (draft.quantity.trim().isNotEmpty) {
    final s = draft.quantity.trim().replaceAll(',', '.');
    if (!(q.decimals ? _dec2 : _int).hasMatch(s) || num.parse(s) <= 0) {
      errors['quantity'] = 'invalid_number';
    } else if (q.min != null && num.parse(s) < q.min!) {
      errors['quantity'] = 'below_min';
    } else if (q.max != null && num.parse(s) > q.max!) {
      errors['quantity'] = 'above_max';
    }
  } else if (q.required) {
    errors['quantity'] = 'required';
  }
  return errors;
}

/// `serviceForm` body for POST /client/orders (only visible, non-empty values; exact version).
Map<String, dynamic>? buildServiceFormPayload(CatalogService? service, ServiceFormDraft draft) {
  if (service == null || !draft.hasService) return null;
  final values = <String, Object?>{};
  for (final f in service.fields) {
    if (!fieldVisible(f, draft.values)) continue;
    final v = draft.values[f.key];
    if (_isEmpty(v) && v != false) continue;
    values[f.key] = v;
  }
  return {
    'serviceCode': service.serviceCode,
    'version': service.version,
    'values': values,
    'quantity': draft.quantityUnspecified ? null : (draft.quantity.trim().isEmpty ? null : draft.quantity.trim()),
    'quantityUnspecified': draft.quantityUnspecified,
  };
}
