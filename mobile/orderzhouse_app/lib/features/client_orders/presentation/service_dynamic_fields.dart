import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../data/service_catalog_models.dart';
import '../data/service_form_logic.dart';

/// Renders a catalog service's quantity + supported dynamic fields (Smart Orders S2).
class ServiceDynamicFields extends StatelessWidget {
  const ServiceDynamicFields({
    super.key,
    required this.service,
    required this.draft,
    required this.errors,
    required this.onValue,
    required this.onQuantity,
  });

  final CatalogService service;
  final ServiceFormDraft draft;
  final Map<String, String> errors;
  final void Function(String key, Object? value) onValue;
  final void Function({String? quantity, bool? unspecified}) onQuantity;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'ar';
    final isEn = locale == 'en';
    final q = service.quantity;
    final unit = unitLabel(q.unit, locale);
    String? err(String key) => errors[key] == null ? null : serviceFormErrorText(errors[key]!, locale);

    final children = <Widget>[
      TextFormField(
        key: ValueKey('${service.serviceCode}-v${service.version}-quantity'),
        initialValue: draft.quantity,
        enabled: !draft.quantityUnspecified,
        keyboardType: TextInputType.numberWithOptions(decimal: q.decimals),
        decoration: InputDecoration(
          labelText: '${isEn ? 'Quantity' : 'الكمية'} ($unit)${q.required ? ' *' : ''}',
          suffixText: unit,
          helperText: (q.min != null && q.max != null) ? (isEn ? 'From ${q.min} to ${q.max}' : 'من ${q.min} إلى ${q.max}') : null,
          errorText: err('quantity'),
        ),
        onChanged: (v) => onQuantity(quantity: v),
      ),
      if (q.allowUnspecified)
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          value: draft.quantityUnspecified,
          title: Text(isEn ? 'Not specified / needs estimation' : 'غير محدد / بحاجة لتقدير'),
          onChanged: (v) => onQuantity(unspecified: v == true),
        ),
    ];

    for (final f in service.fields) {
      if (!fieldVisible(f, draft.values)) continue;
      final label = '${pickLocalized(f.label, locale)}${f.required ? ' *' : ''}';
      final help = pickLocalized(f.help, locale);
      final hint = pickLocalized(f.placeholder, locale);
      final value = draft.values[f.key];
      final key = ValueKey('${service.serviceCode}-v${service.version}-${f.key}');
      Widget w;
      switch (f.type) {
        case 'select':
          w = DropdownButtonFormField<String>(
            key: key,
            initialValue: value is String && f.options.any((o) => o.value == value) ? value : null,
            isExpanded: true,
            decoration: InputDecoration(labelText: label, helperText: help.isEmpty ? null : help, errorText: err(f.key)),
            items: f.options
                .map((o) => DropdownMenuItem(value: o.value, child: Text(pickLocalized(o.label, locale))))
                .toList(),
            onChanged: (v) => onValue(f.key, v),
          );
        case 'radio':
        case 'multiselect':
          final multi = f.type == 'multiselect';
          final selected = multi ? List<String>.from((value as List?) ?? const []) : <String>[if (value is String) value];
          w = InputDecorator(
            key: key,
            decoration: InputDecoration(labelText: label, helperText: help.isEmpty ? null : help, errorText: err(f.key)),
            child: Wrap(
              spacing: 8,
              runSpacing: 4,
              children: f.options.map((o) {
                final on = selected.contains(o.value);
                return FilterChip(
                  label: Text(pickLocalized(o.label, locale)),
                  selected: on,
                  onSelected: (sel) {
                    if (!multi) {
                      onValue(f.key, o.value);
                    } else {
                      final next = [...selected]..remove(o.value);
                      if (sel) next.add(o.value);
                      onValue(f.key, next);
                    }
                  },
                );
              }).toList(),
            ),
          );
        case 'checkbox':
          w = CheckboxListTile(
            key: key,
            contentPadding: EdgeInsets.zero,
            value: value == true,
            title: Text(label),
            subtitle: err(f.key) != null
                ? Text(err(f.key)!, style: const TextStyle(color: AppColors.error))
                : (help.isEmpty ? null : Text(help)),
            onChanged: (v) => onValue(f.key, v == true),
          );
        case 'date':
          w = InkWell(
            key: key,
            onTap: () async {
              final now = DateTime.now();
              final picked = await showDatePicker(
                context: context,
                firstDate: DateTime(now.year - 1),
                lastDate: DateTime(now.year + 5),
                initialDate: DateTime.tryParse(value?.toString() ?? '') ?? now,
              );
              if (picked != null) onValue(f.key, picked.toIso8601String().substring(0, 10));
            },
            child: InputDecorator(
              decoration: InputDecoration(labelText: label, errorText: err(f.key), suffixIcon: const Icon(Icons.event)),
              child: Text(value?.toString() ?? ''),
            ),
          );
        default:
          final isNumber = f.type == 'number' || f.type == 'decimal';
          w = TextFormField(
            key: key,
            initialValue: value?.toString() ?? '',
            maxLines: f.type == 'textarea' ? 4 : 1,
            maxLength: f.maxLength,
            keyboardType: isNumber
                ? TextInputType.numberWithOptions(decimal: f.type == 'decimal')
                : (f.type == 'url' ? TextInputType.url : TextInputType.text),
            textDirection: (isNumber || f.type == 'url') ? TextDirection.ltr : null,
            decoration: InputDecoration(
              labelText: label,
              hintText: hint.isEmpty ? null : hint,
              helperText: help.isEmpty ? null : help,
              errorText: err(f.key),
            ),
            onChanged: (v) => onValue(f.key, v),
          );
      }
      children.add(Padding(padding: const EdgeInsets.only(top: 12), child: w));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children);
  }
}
