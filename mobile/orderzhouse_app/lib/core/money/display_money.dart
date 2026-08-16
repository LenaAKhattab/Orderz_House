import 'package:intl/intl.dart';

import 'display_currencies.dart';

final NumberFormat _amountFormat = NumberFormat('#,##0.##', 'en_US');

String? formatJodAmount(num? amount) {
  if (amount == null) return null;
  final n = amount.toDouble();
  if (n.isNaN || n.isInfinite) return null;
  return '${_amountFormat.format(n)} ${kCurrencyLabels[kBaseCurrency]}';
}

String? formatApproximateCurrency(num? amountJod, String? targetCurrency, num? rate) {
  if (amountJod == null || rate == null || targetCurrency == null) return null;
  final n = amountJod.toDouble();
  final r = rate.toDouble();
  final code = targetCurrency.toUpperCase();
  if (n.isNaN || r.isNaN || r <= 0) return null;
  if (code.isEmpty || code == kBaseCurrency) return null;
  final converted = n * r;
  if (converted.isNaN || converted.isInfinite) return null;
  final suffix = kCurrencyLabels[code] ?? code;
  return '${_amountFormat.format(converted)} $suffix';
}

bool shouldShowApproximate(String? displayCurrency, num? rate) {
  final code = (displayCurrency ?? '').toUpperCase();
  final r = rate?.toDouble();
  return code.isNotEmpty &&
      code != kBaseCurrency &&
      r != null &&
      !r.isNaN &&
      r > 0;
}
