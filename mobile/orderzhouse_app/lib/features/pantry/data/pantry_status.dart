import '../../../core/i18n/i18n.dart';
String pantryStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'open_for_bids':
      return tr('مفتوح للعروض');
    case 'assigned':
      return tr('قيد التنفيذ');
    case 'in_progress':
      return tr('قيد التنفيذ');
    case 'submitted':
      return tr('بانتظار المراجعة');
    case 'revision_requested':
      return tr('طلب تعديل');
    case 'approved':
      return tr('مكتمل');
    case 'archived':
      return tr('مؤرشف');
    default:
      return (status ?? '').trim().isEmpty ? '—' : status!;
  }
}

String pantryPricingTypeLabelAr(String? pricingType) {
  switch ((pricingType ?? '').trim().toLowerCase()) {
    case 'bidding':
      return tr('مناقصة');
    case 'fixed':
      return tr('سعر ثابت');
    default:
      return (pricingType ?? '').trim().isEmpty ? '—' : pricingType!;
  }
}

bool pantryCanBid(String? status) => (status ?? '').trim() == 'open_for_bids';

bool pantryCanDeliver(String? status) {
  final value = (status ?? '').trim();
  return value == 'assigned' || value == 'in_progress' || value == 'revision_requested';
}
