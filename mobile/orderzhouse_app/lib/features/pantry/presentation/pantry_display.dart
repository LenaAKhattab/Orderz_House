import 'package:flutter/material.dart';

import '../../currency/presentation/jod_money_display.dart';
import '../data/pantry_models.dart';
import '../data/pantry_status.dart';
import '../../../core/i18n/i18n.dart';

String pantryBudgetLabel(PantryRequest request) {
  final accepted = request.acceptedBid?.amount ?? request.myBid?.amount;
  if (accepted != null) return trf('{0} د.أ', [_fmt(accepted)]);
  if ((request.pricingType ?? '').toLowerCase() == 'bidding') {
    final min = request.budgetMin;
    final max = request.budgetMax;
    if (min != null && max != null) return trf('{0} – {1} د.أ', [_fmt(min), _fmt(max)]);
    if (min != null) return trf('من {0} د.أ', [_fmt(min)]);
    if (max != null) return trf('حتى {0} د.أ', [_fmt(max)]);
  }
  if (request.fixedBudget != null) return trf('{0} د.أ', [_fmt(request.fixedBudget!)]);
  return '—';
}

Widget pantryBudgetWidget(PantryRequest request, {bool compact = true}) {
  final accepted = request.acceptedBid?.amount ?? request.myBid?.amount;
  if (accepted != null) return JodMoneyDisplay(amount: accepted, compact: compact);
  if ((request.pricingType ?? '').toLowerCase() == 'bidding') {
    return JodMoneyDisplay(amount: request.budgetMin, amountMax: request.budgetMax, compact: compact);
  }
  if (request.fixedBudget != null) {
    return JodMoneyDisplay(amount: request.fixedBudget, compact: compact);
  }
  return const Text('—', style: TextStyle(fontWeight: FontWeight.w600));
}

String pantryDurationLabel(PantryRequest request) {
  final days = request.deliveryDays;
  if (days == null) return '—';
  final unit = (request.durationUnit ?? 'days').toLowerCase();
  if (unit == 'hours') return trf('{0} ساعة', [days]);
  if (unit == 'weeks') return trf('{0} أسبوع', [days]);
  return trf('{0} يوم', [days]);
}

String pantryShortDescription(String? description, {int max = 140}) {
  final text = (description ?? '').trim();
  if (text.length <= max) return text;
  return '${text.substring(0, max).trim()}…';
}

String pantryPricingLabel(PantryRequest request) => pantryPricingTypeLabelAr(request.pricingType);

/// Safe public copy only — no fair ranking, override, or auto-assign.
String? pantryPublicBidProgressLabel(PantryRequest request) {
  final progress = request.bidCollection;
  if (progress == null) return null;
  if (progress.isMinimumNotMet) return tr('لم يكتمل الحد الأدنى من المتقدمين');
  if (progress.isClosedAtThreshold) return tr('مغلق بعد اكتمال الحد الأدنى');
  if (progress.hasRequired) {
    final current = progress.currentBidCount ?? request.bidsCount ?? 0;
    return trf('المتقدمون {0} / {1}', [current, progress.requiredBidCount]);
  }
  final label = progress.label?.trim();
  if (label != null && label.isNotEmpty) return label;
  return null;
}

String _fmt(double value) {
  if (value == value.roundToDouble()) return value.round().toString();
  return value.toStringAsFixed(2);
}
