import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/special_offer_models.dart';

class SpecialOfferCard extends StatelessWidget {
  const SpecialOfferCard({
    super.key,
    required this.offer,
    required this.onOpenPlans,
    required this.onOpenRefundDetails,
  });

  final SpecialOfferPackage offer;
  final VoidCallback onOpenPlans;
  final VoidCallback onOpenRefundDetails;

  @override
  Widget build(BuildContext context) {
    final showOriginal =
        offer.originalPriceJod != null && offer.originalPriceJod! > offer.priceJod;

    return Container(
      key: const ValueKey('special-offer-card'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primaryDeep,
            AppColors.primary.withValues(alpha: 0.92),
          ],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.18),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (offer.ribbonText != null)
            Align(
              alignment: Alignment.centerRight,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.secondary.withValues(alpha: 0.9),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  offer.ribbonText!,
                  style: const TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                  ),
                ),
              ),
            ),
          if (offer.ribbonText != null) const SizedBox(height: 10),
          Text(
            offer.title,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 18,
              height: 1.3,
            ),
            textAlign: TextAlign.right,
          ),
          if (offer.subtitle != null) ...[
            const SizedBox(height: 6),
            Text(
              offer.subtitle!,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.88),
                fontSize: 13,
                height: 1.45,
              ),
              textAlign: TextAlign.right,
            ),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.end,
            children: [
              _FeatureChip(label: '${formatSpecialOfferAmount(offer.totalOffers)} عرض'),
              _FeatureChip(label: '${formatSpecialOfferAmount(offer.dailyLimit)} يومياً'),
              _FeatureChip(
                label: offer.maxProjectValueJod != null
                    ? 'حتى ${formatSpecialOfferAmount(offer.maxProjectValueJod)} د.أ'
                    : 'بلا سقف',
              ),
              _FeatureChip(label: '${formatSpecialOfferAmount(offer.durationDays)} يوم'),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (showOriginal) ...[
                Text(
                  '${formatSpecialOfferAmount(offer.originalPriceJod)} د.أ',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.65),
                    decoration: TextDecoration.lineThrough,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 8),
              ],
              Text(
                '${formatSpecialOfferAmount(offer.priceJod)} د.أ',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 22,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          OhButton(
            key: const ValueKey('special-offer-cta'),
            label: offer.ctaLabel?.trim().isNotEmpty == true ? offer.ctaLabel! : 'احصل على العرض الآن',
            onPressed: onOpenPlans,
          ),
          if (offer.hasRefundExplanation) ...[
            const SizedBox(height: 10),
            TextButton(
              key: const ValueKey('special-offer-refund-link'),
              onPressed: onOpenRefundDetails,
              style: TextButton.styleFrom(
                foregroundColor: Colors.white,
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.shield_outlined, size: 16, color: Colors.white.withValues(alpha: 0.92)),
                  const SizedBox(width: 6),
                  Text(
                    specialOfferRefundLinkAr,
                    style: const TextStyle(
                      decoration: TextDecoration.underline,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (offer.microcopy != null) ...[
            const SizedBox(height: 6),
            Text(
              offer.microcopy!,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.78),
                fontSize: 11,
                height: 1.4,
              ),
              textAlign: TextAlign.right,
            ),
          ],
        ],
      ),
    );
  }
}

class _FeatureChip extends StatelessWidget {
  const _FeatureChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 11),
      ),
    );
  }
}
