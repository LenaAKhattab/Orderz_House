import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/client_order_review_models.dart';

Future<SubmitClientOrderReviewPayload?> showClientOrderReviewSheet(
  BuildContext context, {
  required String orderTitle,
  String? freelancerName,
  required bool isSubmitting,
  SubmitClientOrderReviewPayload? initial,
}) {
  return showModalBottomSheet<SubmitClientOrderReviewPayload>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => _ClientOrderReviewSheet(
      orderTitle: orderTitle,
      freelancerName: freelancerName,
      isSubmitting: isSubmitting,
      initial: initial,
    ),
  );
}

class _ClientOrderReviewSheet extends StatefulWidget {
  const _ClientOrderReviewSheet({
    required this.orderTitle,
    this.freelancerName,
    required this.isSubmitting,
    this.initial,
  });

  final String orderTitle;
  final String? freelancerName;
  final bool isSubmitting;
  final SubmitClientOrderReviewPayload? initial;

  @override
  State<_ClientOrderReviewSheet> createState() => _ClientOrderReviewSheetState();
}

class _ClientOrderReviewSheetState extends State<_ClientOrderReviewSheet> {
  late int _rating;
  final _commentController = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    _rating = widget.initial?.rating ?? 0;
    _commentController.text = widget.initial?.reviewText ?? '';
  }

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  void _submit() {
    final ratingError = validateClientReviewRating(_rating);
    final textError = validateClientReviewText(_commentController.text);
    final validation = ratingError ?? textError;
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }
    Navigator.of(context).pop(
      SubmitClientOrderReviewPayload(
        rating: _rating,
        reviewText: _commentController.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final freelancer = widget.freelancerName?.trim();

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'تقييم المستقل',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 6),
          Text(
            widget.orderTitle,
            style: const TextStyle(color: AppColors.textMuted, height: 1.4),
            textAlign: TextAlign.right,
          ),
          if (freelancer != null && freelancer.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'المستقل: $freelancer',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
              textAlign: TextAlign.right,
            ),
          ],
          const SizedBox(height: 16),
          const Text(
            'التقييم العام',
            style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 8),
          _ReviewStarRow(
            value: _rating,
            onChanged: widget.isSubmitting
                ? null
                : (value) => setState(() {
                      _rating = value;
                      _error = null;
                    }),
          ),
          const SizedBox(height: 16),
          OhTextField(
            controller: _commentController,
            label: 'ملاحظاتك (اختياري)',
            hint: 'شارك تجربتك باختصار...',
            keyboardType: TextInputType.multiline,
          ),
          const SizedBox(height: 6),
          const Text(
            'إذا أضفت ملاحظة، يجب ألا تقل عن 10 أحرف.',
            style: TextStyle(color: AppColors.textMuted, fontSize: 12),
            textAlign: TextAlign.right,
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600),
              textAlign: TextAlign.right,
            ),
          ],
          const SizedBox(height: 16),
          OhButton(
            label: widget.isSubmitting ? 'جارٍ الإرسال...' : 'إرسال التقييم',
            isLoading: widget.isSubmitting,
            onPressed: widget.isSubmitting || _rating < 1 ? null : _submit,
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

class ReviewStarsDisplay extends StatelessWidget {
  const ReviewStarsDisplay({super.key, required this.rating});

  final int rating;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: List.generate(5, (index) {
        final filled = index < rating;
        return Icon(
          filled ? Icons.star_rounded : Icons.star_outline_rounded,
          color: filled ? AppColors.secondary : AppColors.textMuted,
          size: 22,
        );
      }),
    );
  }
}

class _ReviewStarRow extends StatelessWidget {
  const _ReviewStarRow({
    required this.value,
    required this.onChanged,
  });

  final int value;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: List.generate(5, (index) {
        final star = index + 1;
        final filled = value >= star;
        return IconButton(
          tooltip: '$star من 5',
          onPressed: onChanged == null ? null : () => onChanged!(star),
          icon: Icon(
            filled ? Icons.star_rounded : Icons.star_outline_rounded,
            color: filled ? AppColors.secondary : AppColors.textMuted,
            size: 32,
          ),
        );
      }),
    );
  }
}
