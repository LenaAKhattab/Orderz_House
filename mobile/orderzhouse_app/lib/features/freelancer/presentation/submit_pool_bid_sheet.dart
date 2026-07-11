import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../orders/data/pool_order_models.dart';
import '../data/freelancer_pool_actions_models.dart';

Future<SubmitPoolBidPayload?> showSubmitPoolBidSheet(
  BuildContext context, {
  required PoolOrder order,
  required bool isSubmitting,
}) {
  return showModalBottomSheet<SubmitPoolBidPayload>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => _SubmitPoolBidSheet(order: order, isSubmitting: isSubmitting),
  );
}

class _SubmitPoolBidSheet extends StatefulWidget {
  const _SubmitPoolBidSheet({
    required this.order,
    required this.isSubmitting,
  });

  final PoolOrder order;
  final bool isSubmitting;

  @override
  State<_SubmitPoolBidSheet> createState() => _SubmitPoolBidSheetState();
}

class _SubmitPoolBidSheetState extends State<_SubmitPoolBidSheet> {
  final _amountController = TextEditingController();
  final _messageController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  void _submit() {
    final validation = validatePoolBidAmount(
      rawAmount: _amountController.text,
      bidBudgetMin: widget.order.bidBudgetMin,
      bidBudgetMax: widget.order.bidBudgetMax,
    );
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }
    final amount = double.parse(_amountController.text.trim().replaceAll(',', '.'));
    Navigator.of(context).pop(
      SubmitPoolBidPayload(
        amount: amount,
        message: _messageController.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final range = widget.order.budgetLabel;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'تقديم عرض',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 6),
          Text(
            widget.order.title,
            style: const TextStyle(color: AppColors.textMuted, height: 1.4),
            textAlign: TextAlign.right,
          ),
          if (range != null) ...[
            const SizedBox(height: 8),
            Text(
              'نطاق الميزانية: $range',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
              textAlign: TextAlign.right,
            ),
          ],
          const SizedBox(height: 16),
          OhTextField(
            controller: _amountController,
            label: 'مبلغ العرض (JOD)',
            hint: 'مثال: 150',
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onFieldSubmitted: (_) => _submit(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 6),
            Text(_error!, style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 12),
          OhTextField(
            controller: _messageController,
            label: 'رسالة اختيارية',
            hint: 'أضف تفاصيلاً لعرضك...',
            keyboardType: TextInputType.multiline,
          ),
          const SizedBox(height: 16),
          OhButton(
            label: widget.isSubmitting ? 'جارٍ الإرسال...' : 'إرسال العرض',
            isLoading: widget.isSubmitting,
            onPressed: widget.isSubmitting ? null : _submit,
          ),
          const SizedBox(height: 8),
          OhButton(
            label: 'إلغاء',
            outlined: true,
            onPressed: widget.isSubmitting ? null : () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}
