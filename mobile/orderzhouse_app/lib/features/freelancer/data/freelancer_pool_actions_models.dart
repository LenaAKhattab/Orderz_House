class SubmitPoolBidPayload {
  const SubmitPoolBidPayload({
    required this.amount,
    this.message,
  });

  final double amount;
  final String? message;

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{'amount': amount};
    final trimmed = message?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      map['message'] = trimmed;
    }
    return map;
  }
}

String? validatePoolBidAmount({
  required String rawAmount,
  double? bidBudgetMin,
  double? bidBudgetMax,
}) {
  final normalized = rawAmount.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return 'مبلغ العرض مطلوب.';
  final amount = double.tryParse(normalized);
  if (amount == null || amount <= 0) return 'أدخل مبلغاً صحيحاً أكبر من صفر.';
  if (bidBudgetMin != null && bidBudgetMax != null) {
    if (amount < bidBudgetMin || amount > bidBudgetMax) {
      return 'المبلغ يجب أن يكون ضمن نطاق الميزانية المحدد للطلب.';
    }
  }
  return null;
}
