import 'package:flutter/material.dart';

import '../../currency/presentation/jod_money_display.dart';
import '../data/pantry_models.dart';
import '../data/pantry_status.dart';

String pantryBudgetLabel(PantryRequest request) {
  final accepted = request.acceptedBid?.amount ?? request.myBid?.amount;
  if (accepted != null) return '${_fmt(accepted)} د.أ';
  if ((request.pricingType ?? '').toLowerCase() == 'bidding') {
    final min = request.budgetMin;
    final max = request.budgetMax;
    if (min != null && max != null) return '${_fmt(min)} – ${_fmt(max)} د.أ';
    if (min != null) return 'من ${_fmt(min)} د.أ';
    if (max != null) return 'حتى ${_fmt(max)} د.أ';
  }
  if (request.fixedBudget != null) return '${_fmt(request.fixedBudget!)} د.أ';
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
  if (unit == 'hours') return '$days ساعة';
  if (unit == 'weeks') return '$days أسبوع';
  return '$days يوم';
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
  if (progress.isMinimumNotMet) return 'لم يكتمل الحد الأدنى من المتقدمين';
  if (progress.isClosedAtThreshold) return 'مغلق بعد اكتمال الحد الأدنى';
  if (progress.hasRequired) {
    final current = progress.currentBidCount ?? request.bidsCount ?? 0;
    return 'المتقدمون $current / ${progress.requiredBidCount}';
  }
  final label = progress.label?.trim();
  if (label != null && label.isNotEmpty) return label;
  return null;
}

String _fmt(double value) {
  if (value == value.roundToDouble()) return value.round().toString();
  return value.toStringAsFixed(2);
}
