import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/stripe_checkout_launcher.dart';
import '../data/customer_quote.dart';

/// Registered customer: own quote (lines, total, validity) with accept / pay. Payment status shown here always
/// comes from the server; returning from Stripe never marks anything as paid on the device.
class CustomerQuoteCard extends ConsumerStatefulWidget {
  const CustomerQuoteCard({super.key, required this.orderId, required this.quote, this.onChanged});
  final String orderId;
  final CustomerQuote quote;
  final VoidCallback? onChanged;

  @override
  ConsumerState<CustomerQuoteCard> createState() => _CustomerQuoteCardState();
}

class _CustomerQuoteCardState extends ConsumerState<CustomerQuoteCard> {
  bool _busy = false;

  Future<void> _accept() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(customerQuoteApiProvider).accept(widget.orderId);
      widget.onChanged?.call();
    } on DioException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(apiErrorMessage(e, fallback: 'تعذر قبول العرض.'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pay() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final url = await ref.read(customerQuoteApiProvider).checkout(widget.orderId);
      if (url != null) {
        final r = await launchStripeCheckoutUrl(url, paymentFlow: 'client_quote');
        if (!r.launched && r.message != null) messenger.showSnackBar(SnackBar(content: Text(r.message!)));
      }
    } on DioException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(apiErrorMessage(e, fallback: 'تعذر بدء الدفع.'))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = widget.quote;
    return Card(
      key: const ValueKey('customer-quote-card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(child: Text('عرض السعر', style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.textInk))),
                Text('النسخة ${q.version}', style: const TextStyle(color: AppColors.textMuted)),
              ],
            ),
            const SizedBox(height: 8),
            _line('المبلغ الأساسي', '${q.baseAmount} ${q.currency}'),
            for (final a in q.adjustments) _line(a.label, '${a.amount} ${q.currency}'),
            const Divider(),
            _line('الإجمالي', '${q.totalAmount} ${q.currency}', bold: true),
            if (q.termsNote != null && q.termsNote!.isNotEmpty) Text(q.termsNote!, style: const TextStyle(color: AppColors.textMuted)),
            if (q.isExpired) const Text('انتهت صلاحية عرض السعر. تواصل مع فريقنا لعرض جديد.', style: TextStyle(color: AppColors.error)),
            if (q.isPaid) const Padding(padding: EdgeInsets.only(top: 8), child: Text('تم الدفع', key: ValueKey('quote-paid'), style: TextStyle(fontWeight: FontWeight.w700))),
            const SizedBox(height: 8),
            Row(
              children: [
                if (q.canAccept)
                  Expanded(
                    child: OutlinedButton(key: const ValueKey('quote-accept'), onPressed: _busy ? null : _accept, child: const Text('قبول عرض السعر')),
                  ),
                if (q.canAccept && q.canPay) const SizedBox(width: 8),
                if (q.canPay)
                  Expanded(child: FilledButton(key: const ValueKey('quote-pay'), onPressed: _busy ? null : _pay, child: const Text('الدفع الآن'))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _line(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(label)),
            Text(value, textDirection: TextDirection.ltr, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
          ],
        ),
      );
}
