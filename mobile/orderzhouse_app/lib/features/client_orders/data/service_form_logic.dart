import 'order_attachment_models.dart';
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

/// S7: anchored format check (pattern already vetted by the server; invalid → treated as pass).
bool _matchesFormat(String pattern, String value) {
  try {
    return RegExp('^(?:$pattern)\$', unicode: true).hasMatch(value);
  } catch (_) {
    return true;
  }
}

/// Validates a list of fields over [values]; error keys are prefixed (`group.sub`, `rows[0].sub`).
Map<String, String> _validateFields(List<CatalogField> fields, Map<String, Object?> values, String prefix) {
  final errors = <String, String>{};
  String k(String key) => prefix.isEmpty ? key : '$prefix.$key';
  for (final f in fields) {
    if (!fieldVisible(f, values)) continue;
    final v = values[f.key];
    if (f.type == 'conditional_group') {
      final group = v is Map ? Map<String, Object?>.from(v) : <String, Object?>{};
      errors.addAll(_validateFields(f.subFields, group, k(f.key)));
      continue;
    }
    if (f.type == 'repeater') {
      final rows = v is List ? v.whereType<Map>().map((r) => Map<String, Object?>.from(r)).toList() : <Map<String, Object?>>[];
      if (rows.isEmpty && (f.required || (f.minItems ?? 0) > 0)) {
        errors[k(f.key)] = f.required && (f.minItems ?? 0) == 0 ? 'required' : 'below_min';
      } else if (f.minItems != null && rows.length < f.minItems!) {
        errors[k(f.key)] = 'below_min';
      } else if (f.maxItems != null && rows.length > f.maxItems!) {
        errors[k(f.key)] = 'above_max';
      }
      for (var i = 0; i < rows.length; i++) {
        errors.addAll(_validateFields(f.subFields, rows[i], '${k(f.key)}[$i]'));
      }
      continue;
    }
    final single = _validateScalar(f, v);
    if (single != null) errors[k(f.key)] = single;
  }
  return errors;
}

/// Returns field key → reason code (same codes as the server).
Map<String, String> validateServiceForm(CatalogService service, ServiceFormDraft draft) {
  final errors = _validateFields(service.fields, draft.values, '');
  _validateQuantity(service, draft, errors);
  return errors;
}

String? _validateScalar(CatalogField f, Object? v) {
  final errors = <String, String>{};
  {
    if (_isEmpty(v) || (f.type == 'checkbox' && f.required && v != true)) {
      if (f.required) errors[f.key] = 'required';
      return errors[f.key];
    }
    if (f.validationRegex != null && (f.type == 'text' || f.type == 'textarea') && v is String && v.trim().isNotEmpty) {
      if (!_matchesFormat(f.validationRegex!, v.trim())) return 'invalid_format';
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
      case 'datetime':
        if (DateTime.tryParse(v.toString()) == null) errors[f.key] = 'invalid_date';
      case 'multiselect':
        final list = v as List;
        if (f.min != null && list.length < f.min!) errors[f.key] = 'below_min';
        if (f.max != null && list.length > f.max!) errors[f.key] = 'above_max';
      case 'file':
        final list = v is List ? v : const [];
        if (f.min != null && list.length < f.min!) {
          errors[f.key] = 'invalid_file';
        } else if (f.max != null && list.length > f.max!) {
          errors[f.key] = 'above_max';
        }
      default:
        break;
    }
  }
  return errors[f.key];
}

void _validateQuantity(CatalogService service, ServiceFormDraft draft, Map<String, String> errors) {
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
}

/// `serviceForm` body for POST /client/orders (only visible, non-empty values; exact version).
Map<String, dynamic>? buildServiceFormPayload(CatalogService? service, ServiceFormDraft draft) {
  if (service == null || !draft.hasService) return null;
  final values = <String, Object?>{};
  for (final f in service.fields) {
    if (!fieldVisible(f, draft.values)) continue;
    final v = draft.values[f.key];
    if (_isEmpty(v) && v != false) continue;
    // Files are uploaded as order attachments and referenced by their upload names (same as web).
    values[f.key] = f.type == 'file' && v is List ? v.whereType<SelectedOrderAttachment>().map((a) => a.name).toList() : v;
  }
  return {
    'serviceCode': service.serviceCode,
    'version': service.version,
    'values': values,
    'quantity': draft.quantityUnspecified ? null : (draft.quantity.trim().isEmpty ? null : draft.quantity.trim()),
    'quantityUnspecified': draft.quantityUnspecified,
  };
}

/// Files picked inside visible dynamic `file` fields (uploaded together with the order attachments).
List<SelectedOrderAttachment> serviceFormFiles(CatalogService? service, ServiceFormDraft draft) {
  if (service == null || !draft.hasService) return const [];
  final out = <SelectedOrderAttachment>[];
  for (final f in service.fields) {
    if (f.type != 'file' || !fieldVisible(f, draft.values)) continue;
    final v = draft.values[f.key];
    if (v is List) out.addAll(v.whereType<SelectedOrderAttachment>());
  }
  return out;
}

/// Whether a value entered for [from] is still valid for the refreshed field [to].
bool _compatibleValue(CatalogField from, CatalogField to, Object? v) {
  if (from.type != to.type) return false;
  if (v == null) return false;
  switch (to.type) {
    case 'select':
    case 'radio':
      return to.options.any((o) => o.value == v);
    case 'multiselect':
      return v is List && v.every((x) => to.options.any((o) => o.value == x));
    case 'text':
    case 'textarea':
      return to.maxLength == null || v.toString().length <= to.maxLength!;
    default:
      return true;
  }
}

/// Result of moving a draft to a refreshed (newer) service version after `SMART_ORDER_FORM_STALE`.
class ServiceDraftMigration {
  const ServiceDraftMigration({required this.draft, required this.kept, required this.dropped, required this.serviceAvailable});
  final ServiceFormDraft draft;
  final List<String> kept;
  final List<String> dropped;
  final bool serviceAvailable;
}

/// Keeps every compatible value (same key, same type, still-valid options); drops the rest.
/// The server re-validates the exact new version, so this is only to avoid retyping.
ServiceDraftMigration migrateServiceDraft({
  required CatalogService? oldService,
  required CatalogService? newService,
  required ServiceFormDraft draft,
}) {
  if (newService == null || oldService == null) {
    return ServiceDraftMigration(
      draft: const ServiceFormDraft(),
      kept: const [],
      dropped: draft.values.keys.toList(),
      serviceAvailable: newService != null,
    );
  }
  final kept = <String>[];
  final dropped = <String>[];
  final values = <String, Object?>{};
  for (final entry in draft.values.entries) {
    final from = oldService.fields.where((f) => f.key == entry.key).firstOrNull;
    final to = newService.fields.where((f) => f.key == entry.key).firstOrNull;
    if (from != null && to != null && _compatibleValue(from, to, entry.value)) {
      values[entry.key] = entry.value;
      kept.add(entry.key);
    } else {
      dropped.add(entry.key);
    }
  }
  final sameUnit = oldService.quantity.unit == newService.quantity.unit;
  return ServiceDraftMigration(
    draft: ServiceFormDraft(
      serviceCode: newService.serviceCode,
      version: newService.version,
      values: values,
      quantity: sameUnit ? draft.quantity : '',
      quantityUnspecified: sameUnit && newService.quantity.allowUnspecified && draft.quantityUnspecified,
    ),
    kept: kept,
    dropped: dropped,
    serviceAvailable: true,
  );
}
