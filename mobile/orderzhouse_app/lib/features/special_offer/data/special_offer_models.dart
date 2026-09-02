import '../../../core/network/json_helpers.dart';

const specialOfferRefundLinkAr = 'تفاصيل استرداد مبلغ الباقة';
const specialOfferRefundModalTitleAr = 'تفاصيل استرداد مبلغ باقة العرض';
const specialOfferRefundModalGotItAr = 'فهمت';

const specialOfferRefundSectionTitlesAr = [
  'الاسترداد الشهري',
  'الأشهر غير النشطة',
  'الدخل من الطلبات',
  'تنبيه مهم',
];

class SpecialOfferPackage {
  const SpecialOfferPackage({
    required this.id,
    required this.title,
    this.subtitle,
    this.badgeText,
    this.ribbonText,
    this.priceJod = 0,
    this.originalPriceJod,
    this.totalOffers = 0,
    this.dailyLimit = 0,
    this.durationDays = 0,
    this.maxProjectValueJod,
    this.ctaLabel,
    this.microcopy,
    this.refundExplanationAr,
    this.purchaseMode,
    this.checkoutSupported = false,
  });

  final String id;
  final String title;
  final String? subtitle;
  final String? badgeText;
  final String? ribbonText;
  final num priceJod;
  final num? originalPriceJod;
  final num totalOffers;
  final num dailyLimit;
  final num durationDays;
  final num? maxProjectValueJod;
  final String? ctaLabel;
  final String? microcopy;
  final String? refundExplanationAr;
  final String? purchaseMode;
  final bool checkoutSupported;

  bool get hasRefundExplanation =>
      refundExplanationAr != null && refundExplanationAr!.trim().isNotEmpty;

  factory SpecialOfferPackage.fromJson(Map<String, dynamic> json) {
    return SpecialOfferPackage(
      id: readString(json, 'id', 'id', fallback: 'special_offer'),
      title: readString(json, 'title', 'title'),
      subtitle: _nullIfEmpty(readString(json, 'subtitle', 'subtitle')),
      badgeText: _nullIfEmpty(readString(json, 'badgeText', 'badge_text')),
      ribbonText: _nullIfEmpty(readString(json, 'ribbonText', 'ribbon_text')),
      priceJod: readDouble(json, 'priceJod', 'price_jod') ?? 0,
      originalPriceJod: readDouble(json, 'originalPriceJod', 'original_price_jod'),
      totalOffers: readDouble(json, 'totalOffers', 'total_offers') ?? 0,
      dailyLimit: readDouble(json, 'dailyLimit', 'daily_limit') ?? 0,
      durationDays: readDouble(json, 'durationDays', 'duration_days') ?? 0,
      maxProjectValueJod: readDouble(json, 'maxProjectValueJod', 'max_project_value_jod'),
      ctaLabel: _nullIfEmpty(readString(json, 'ctaLabel', 'cta_label')),
      microcopy: _nullIfEmpty(readString(json, 'microcopy', 'microcopy')),
      refundExplanationAr:
          _nullIfEmpty(readString(json, 'refundExplanationAr', 'refund_explanation_ar')),
      purchaseMode: _nullIfEmpty(readString(json, 'purchaseMode', 'purchase_mode')),
      checkoutSupported: readBool(json, 'checkoutSupported', 'checkout_supported'),
    );
  }
}

bool isSpecialOfferVisible(SpecialOfferPackage? offer) {
  if (offer == null) return false;
  if (offer.title.trim().isEmpty) return false;
  if (offer.priceJod < 0) return false;
  if (offer.totalOffers <= 0) return false;
  if (offer.dailyLimit <= 0) return false;
  if (offer.durationDays <= 0) return false;
  return true;
}

List<String> splitSpecialOfferRefundSections(String? text) {
  return (text ?? '')
      .split(RegExp(r'\n\s*\n'))
      .map((part) => part.trim())
      .where((part) => part.isNotEmpty)
      .toList(growable: false);
}

String? _nullIfEmpty(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}

String formatSpecialOfferAmount(num? value) {
  if (value == null) return '—';
  final n = value.toDouble();
  if (n == n.roundToDouble()) return n.toInt().toString();
  return n.toStringAsFixed(2);
}
