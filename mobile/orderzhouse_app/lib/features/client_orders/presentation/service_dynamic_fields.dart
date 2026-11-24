import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../data/order_attachment_limits.dart';
import '../data/order_attachment_models.dart';
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
    this.pickFiles,
  });

  final CatalogService service;
  final ServiceFormDraft draft;
  final Map<String, String> errors;
  final void Function(String key, Object? value) onValue;
  final void Function({String? quantity, bool? unspecified}) onQuantity;

  /// Injectable for tests; defaults to the platform file picker with the order attachment rules.
  final Future<List<SelectedOrderAttachment>> Function({required bool multiple})? pickFiles;

  static Future<List<SelectedOrderAttachment>> _platformPick({required bool multiple}) async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: multiple,
      type: FileType.custom,
      allowedExtensions: orderAttachmentAllowedExtensions.toList(),
      withData: true,
    );
    if (result == null) return const [];
    var id = DateTime.now().microsecondsSinceEpoch;
    return result.files
        .map((f) => SelectedOrderAttachment.fromPlatformFile(f, id: 'svc-${id++}'))
        .whereType<SelectedOrderAttachment>()
        .toList();
  }

  static String formatDateTimeLocal(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return '';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)} ${two(d.hour)}:${two(d.minute)}';
  }

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
        case 'datetime':
          w = InkWell(
            key: key,
            onTap: () async {
              final now = DateTime.now();
              final current = DateTime.tryParse(value?.toString() ?? '')?.toLocal() ?? now;
              final day = await showDatePicker(
                context: context,
                firstDate: DateTime(now.year - 1),
                lastDate: DateTime(now.year + 5),
                initialDate: current,
              );
              if (day == null || !context.mounted) return;
              final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(current));
              if (time == null) return;
              // Sent as an absolute instant (UTC ISO-8601); the server stores it the same way as the web form.
              final picked = DateTime(day.year, day.month, day.day, time.hour, time.minute);
              onValue(f.key, picked.toUtc().toIso8601String());
            },
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: label,
                helperText: help.isEmpty ? null : help,
                errorText: err(f.key),
                suffixIcon: const Icon(Icons.schedule),
              ),
              child: Text(formatDateTimeLocal(value?.toString()), textDirection: TextDirection.ltr),
            ),
          );
        case 'file':
          final files = (value is List ? value.whereType<SelectedOrderAttachment>().toList() : <SelectedOrderAttachment>[]);
          final max = f.max?.toInt();
          final canAdd = max == null || files.length < max;
          w = InputDecorator(
            key: key,
            decoration: InputDecoration(
              labelText: label,
              helperText: help.isEmpty ? (isEn ? 'Files are shared with the order attachments.' : 'تُرفع الملفات مع مرفقات الطلب.') : help,
              errorText: err(f.key),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final file in files)
                  Row(
                    children: [
                      const Icon(Icons.insert_drive_file_outlined, size: 18),
                      const SizedBox(width: 6),
                      Expanded(child: Text(file.name, overflow: TextOverflow.ellipsis)),
                      IconButton(
                        key: ValueKey('${f.key}-remove-${file.name}'),
                        tooltip: isEn ? 'Remove' : 'إزالة',
                        icon: const Icon(Icons.close, size: 18),
                        onPressed: () => onValue(f.key, files.where((x) => x.id != file.id).toList()),
                      ),
                    ],
                  ),
                if (canAdd)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton.icon(
                      key: ValueKey('${f.key}-pick'),
                      icon: const Icon(Icons.attach_file),
                      label: Text(isEn ? 'Choose files' : 'اختيار ملفات'),
                      onPressed: () async {
                        final picked = await (pickFiles ?? _platformPick)(multiple: max == null || max - files.length > 1);
                        if (picked.isEmpty) return;
                        // Names identify uploads on the server: never add the same name twice to one field.
                        final names = files.map((x) => x.name).toSet();
                        final next = [...files];
                        for (final p in picked) {
                          if (names.add(p.name)) next.add(p);
                        }
                        onValue(f.key, max == null ? next : next.take(max).toList());
                      },
                    ),
                  ),
              ],
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
