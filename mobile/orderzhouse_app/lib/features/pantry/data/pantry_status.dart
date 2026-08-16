String pantryStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'open_for_bids':
      return 'مفتوح للعروض';
    case 'assigned':
      return 'قيد التنفيذ';
    case 'in_progress':
      return 'قيد التنفيذ';
    case 'submitted':
      return 'بانتظار المراجعة';
    case 'revision_requested':
      return 'طلب تعديل';
    case 'approved':
      return 'مكتمل';
    case 'archived':
      return 'مؤرشف';
    default:
      return (status ?? '').trim().isEmpty ? '—' : status!;
  }
}

String pantryPricingTypeLabelAr(String? pricingType) {
  switch ((pricingType ?? '').trim().toLowerCase()) {
    case 'bidding':
      return 'مناقصة';
    case 'fixed':
      return 'سعر ثابت';
    default:
      return (pricingType ?? '').trim().isEmpty ? '—' : pricingType!;
  }
}

bool pantryCanBid(String? status) => (status ?? '').trim() == 'open_for_bids';

bool pantryCanDeliver(String? status) {
  final value = (status ?? '').trim();
  return value == 'assigned' || value == 'in_progress' || value == 'revision_requested';
}
