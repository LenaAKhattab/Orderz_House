import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money/preferred_display_currency_storage.dart';
import '../../../core/network/dio_provider.dart';
import '../data/currency_display_api.dart';
import '../data/currency_display_models.dart';
import '../data/currency_display_repository.dart';

final preferredDisplayCurrencyStorageProvider = Provider<PreferredDisplayCurrencyStorage>((ref) {
  return PreferredDisplayCurrencyStorage();
});

final currencyDisplayApiProvider = Provider<CurrencyDisplayApi>((ref) {
  return CurrencyDisplayApi(ref.watch(dioProvider));
});

final currencyDisplayRepositoryProvider = Provider<CurrencyDisplayRepository>((ref) {
  return CurrencyDisplayRepository(ref.watch(currencyDisplayApiProvider));
});

final preferredDisplayCurrencyProvider = FutureProvider<String>((ref) async {
  return ref.watch(preferredDisplayCurrencyStorageProvider).read();
});

/// Fetched once per session (and after preference change). Safe JOD fallback on failure.
final currencyDisplaySettingsProvider = FutureProvider<CurrencyDisplaySettings>((ref) async {
  final preferred = await ref.watch(preferredDisplayCurrencyProvider.future);
  return ref.watch(currencyDisplayRepositoryProvider).load(preferred: preferred);
});

final currencyDisplaySettingsValueProvider = Provider<CurrencyDisplaySettings>((ref) {
  return ref.watch(currencyDisplaySettingsProvider).maybeWhen(
        data: (v) => v,
        orElse: () => CurrencyDisplaySettings.jodOnly,
      );
});
