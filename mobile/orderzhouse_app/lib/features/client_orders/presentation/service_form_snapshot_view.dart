import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../data/service_catalog_models.dart';
import '../data/service_form_snapshot.dart';

/// Read-only rendering of the service form submitted with the order (no edit affordances).
class ServiceFormSnapshotView extends StatelessWidget {
  const ServiceFormSnapshotView({super.key, required this.snapshot});
  final ServiceFormSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'ar';
    final rows = snapshot.displayRows(locale);
    final name = pickLocalized(snapshot.name, locale);
    return Column(
      key: const ValueKey('service-form-snapshot'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          name.isEmpty ? snapshot.serviceCode : name,
          style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textInk),
        ),
        const SizedBox(height: 6),
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 2, child: Text(r.key, style: const TextStyle(color: AppColors.textMuted))),
                const SizedBox(width: 8),
                Expanded(flex: 3, child: Text(r.value, style: const TextStyle(color: AppColors.textInk, fontWeight: FontWeight.w600))),
              ],
            ),
          ),
      ],
    );
  }
}
