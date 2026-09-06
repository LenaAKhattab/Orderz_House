import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money/display_currencies.dart';
import '../../../core/theme/app_colors.dart';
import 'currency_display_provider.dart';

class PreferredDisplayCurrencySettings extends ConsumerWidget {
  const PreferredDisplayCurrencySettings({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final preferredAsync = ref.watch(preferredDisplayCurrencyProvider);
    final current = preferredAsync.maybeWhen(data: (v) => v, orElse: () => 'auto');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<String>(
          key: ValueKey(current),
          initialValue: current,
          decoration: const InputDecoration(
            labelText: kPreferenceLabel,
            border: OutlineInputBorder(),
          ),
          items: [
            for (final opt in kManualPreferenceOptions)
              DropdownMenuItem(value: opt.value, child: Text(opt.label)),
          ],
          onChanged: (value) async {
            if (value == null) return;
            await ref.read(preferredDisplayCurrencyStorageProvider).write(value);
            ref.read(currencyDisplayRepositoryProvider).invalidate();
            ref.invalidate(preferredDisplayCurrencyProvider);
            ref.invalidate(currencyDisplaySettingsProvider);
          },
        ),
        const SizedBox(height: 10),
        const Text(
          kPreferenceHint,
          style: TextStyle(color: AppColors.textMuted, height: 1.45, fontSize: 13),
          textAlign: TextAlign.right,
        ),
        const SizedBox(height: 6),
        const Text(
          '$kOfficialCurrencyCopy $kIndicativeCopy',
          style: TextStyle(color: AppColors.textMuted, height: 1.45, fontSize: 12.5),
          textAlign: TextAlign.right,
        ),
      ],
    );
  }
}
