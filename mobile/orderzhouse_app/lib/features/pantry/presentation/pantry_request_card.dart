import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../orders/data/order_display_helpers.dart';
import '../data/pantry_models.dart';
import '../data/pantry_status.dart';
import 'pantry_display.dart';

class PantryRequestCard extends StatelessWidget {
  const PantryRequestCard({
    super.key,
    required this.request,
    this.showBidButton = false,
    this.showDeliverButton = false,
    this.onDetails,
    this.onBid,
    this.onDeliver,
  });

  final PantryRequest request;
  final bool showBidButton;
  final bool showDeliverButton;
  final VoidCallback? onDetails;
  final VoidCallback? onBid;
  final VoidCallback? onDeliver;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            request.title.trim().isEmpty ? 'طلب' : request.title,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: AppColors.textInk,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.secondary.withValues(alpha: 0.25),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                pantryStatusLabelAr(request.status),
                style: const TextStyle(
                  color: AppColors.primaryDeep,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
          ),
          if (request.description.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              pantryShortDescription(request.description),
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, height: 1.45),
            ),
          ],
          const SizedBox(height: 10),
          _row('نوع التسعير', pantryPricingLabel(request)),
          _rowWidget('الميزانية', pantryBudgetWidget(request)),
          _row('مدة التنفيذ', pantryDurationLabel(request)),
          if (request.bidsCount != null) _row('عدد العروض', '${request.bidsCount}'),
          if (pantryPublicBidProgressLabel(request) != null)
            _row('حد المتقدمين', pantryPublicBidProgressLabel(request)!),
          if (request.acceptedBid?.createdAt != null || request.updatedAt != null)
            _row(
              'التاريخ',
              formatOrderDate(request.acceptedBid?.createdAt ?? request.updatedAt ?? request.createdAt),
            ),
          if (request.skills.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              alignment: WrapAlignment.end,
              children: [
                for (final skill in request.skills.take(6))
                  Chip(
                    label: Text(skill),
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.end,
            children: [
              if (onDetails != null)
                OutlinedButton(onPressed: onDetails, child: const Text('عرض التفاصيل')),
              if (showBidButton && onBid != null)
                FilledButton(onPressed: onBid, child: const Text('تقديم عرض')),
              if (showDeliverButton && onDeliver != null)
                FilledButton(onPressed: onDeliver, child: const Text('تسليم العمل')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return _rowWidget(
      label,
      Text(value, textAlign: TextAlign.left, style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }

  Widget _rowWidget(String label, Widget value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Expanded(child: Align(alignment: Alignment.centerLeft, child: value)),
          Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
        ],
      ),
    );
  }
}
