import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money/display_currencies.dart';
import '../../../core/money/display_money.dart';
import 'currency_display_provider.dart';

class JodMoneyDisplay extends ConsumerWidget {
  const JodMoneyDisplay({
    super.key,
    this.amount,
    this.amountMax,
    this.compact = true,
    this.onDark = false,
    this.showDisclaimer = false,
  });

  final num? amount;
  final num? amountMax;
  final bool compact;
  final bool onDark;
  final bool showDisclaimer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(currencyDisplaySettingsValueProvider);
    final hasMin = amount != null && amount!.toDouble().isFinite;
    final hasMax = amountMax != null && amountMax!.toDouble().isFinite;
    if (!hasMin && !hasMax) {
      return Text('—', style: _primaryStyle(onDark));
    }

    final primary = hasMin && hasMax && amount != amountMax
        ? '${formatJodAmount(amount)} – ${formatJodAmount(amountMax)}'
        : formatJodAmount(hasMin ? amount : amountMax);

    String? approx;
    if (shouldShowApproximate(settings.displayCurrency, settings.rate)) {
      if (hasMin && hasMax && amount != amountMax) {
        final a = formatApproximateCurrency(amount, settings.displayCurrency, settings.rate);
        final b = formatApproximateCurrency(amountMax, settings.displayCurrency, settings.rate);
        if (a != null && b != null) {
          approx = '$a – $b';
        } else {
          approx = a ?? b;
        }
      } else {
        approx = formatApproximateCurrency(
          hasMin ? amount : amountMax,
          settings.displayCurrency,
          settings.rate,
        );
      }
    }

    final note = settings.disclaimer.isNotEmpty ? settings.disclaimer : kDisplayDisclaimer;
    final column = Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(primary ?? '—', style: _primaryStyle(onDark)),
        if (approx != null)
          Text(
            '≈ $approx',
            style: _approxStyle(onDark),
          ),
        if (approx != null && showDisclaimer && !compact)
          Text(note, style: _noteStyle(onDark)),
      ],
    );

    if (approx != null) {
      return Tooltip(message: note, child: column);
    }
    return column;
  }

  TextStyle _primaryStyle(bool dark) => TextStyle(
        fontWeight: FontWeight.w800,
        fontSize: compact ? 13 : 16,
        height: 1.25,
        color: dark ? Colors.white : const Color(0xFF172033),
      );

  TextStyle _approxStyle(bool dark) => TextStyle(
        fontWeight: FontWeight.w600,
        fontSize: compact ? 11 : 12.5,
        height: 1.2,
        color: (dark ? Colors.white : const Color(0xFF172033)).withValues(alpha: 0.72),
      );

  TextStyle _noteStyle(bool dark) => TextStyle(
        fontWeight: FontWeight.w500,
        fontSize: 10.5,
        height: 1.2,
        color: (dark ? Colors.white : const Color(0xFF5A6378)).withValues(alpha: 0.85),
      );
}

class ApproximateCurrencyLine extends ConsumerWidget {
  const ApproximateCurrencyLine({super.key, this.amount, this.amountMax, this.onDark = false});

  final num? amount;
  final num? amountMax;
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(currencyDisplaySettingsValueProvider);
    if (!shouldShowApproximate(settings.displayCurrency, settings.rate)) {
      return const SizedBox.shrink();
    }
    final hasMin = amount != null && amount!.toDouble().isFinite;
    final hasMax = amountMax != null && amountMax!.toDouble().isFinite;
    if (!hasMin && !hasMax) return const SizedBox.shrink();
    String? approx;
    if (hasMin && hasMax && amount != amountMax) {
      final a = formatApproximateCurrency(amount, settings.displayCurrency, settings.rate);
      final b = formatApproximateCurrency(amountMax, settings.displayCurrency, settings.rate);
      approx = (a != null && b != null) ? '$a – $b' : (a ?? b);
    } else {
      approx = formatApproximateCurrency(hasMin ? amount : amountMax, settings.displayCurrency, settings.rate);
    }
    if (approx == null) return const SizedBox.shrink();
    return Tooltip(
      message: settings.disclaimer,
      child: Text(
        '≈ $approx',
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 11,
          color: (onDark ? Colors.white : const Color(0xFF172033)).withValues(alpha: 0.72),
        ),
      ),
    );
  }
}

class JodOrderBudgetDisplay extends StatelessWidget {
  const JodOrderBudgetDisplay({
    super.key,
    this.projectType,
    this.amount,
    this.bidMin,
    this.bidMax,
    this.compact = true,
    this.onDark = false,
  });

  final String? projectType;
  final num? amount;
  final num? bidMin;
  final num? bidMax;
  final bool compact;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final bidding = (projectType ?? '').toLowerCase() == 'bidding';
    if (bidding) {
      if (bidMin != null && bidMax != null) {
        return JodMoneyDisplay(amount: bidMin, amountMax: bidMax, compact: compact, onDark: onDark);
      }
      return Text('—', style: TextStyle(color: onDark ? Colors.white : const Color(0xFF172033)));
    }
    if (amount != null) {
      return JodMoneyDisplay(amount: amount, compact: compact, onDark: onDark);
    }
    return Text('—', style: TextStyle(color: onDark ? Colors.white : const Color(0xFF172033)));
  }
}
