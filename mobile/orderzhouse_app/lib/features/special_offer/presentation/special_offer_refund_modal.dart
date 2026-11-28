import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/web_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/special_offer_models.dart';
import '../../../core/i18n/i18n.dart';

Future<void> openSpecialOfferWebHandoff(BuildContext context) async {
  final uri = Uri.tryParse(WebConstants.freelancerPlansUrl);
  if (uri == null) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr('تعذر فتح صفحة الباقات.'))),
    );
    return;
  }
  final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(tr('تعذر فتح صفحة الباقات.'))),
    );
  }
}

class SpecialOfferRefundModal extends StatelessWidget {
  const SpecialOfferRefundModal({super.key, required this.offer});

  final SpecialOfferPackage offer;

  static Future<void> show(BuildContext context, SpecialOfferPackage offer) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => SpecialOfferRefundModal(offer: offer),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sections = splitSpecialOfferRefundSections(offer.refundExplanationAr);
    final maxProject = offer.maxProjectValueJod != null
        ? trf('حتى {0} د.أ', [formatSpecialOfferAmount(offer.maxProjectValueJod)])
        : tr('بلا سقف للمشاريع');

    return Directionality(
      textDirection: Directionality.of(context),
      child: Container(
        key: const ValueKey('special-offer-refund-modal'),
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.12),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        specialOfferRefundModalTitleAr,
                        key: const ValueKey('special-offer-refund-title'),
                        style: const TextStyle(
                          color: AppColors.primaryDeep,
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                          height: 1.35,
                        ),
                        textAlign: TextAlign.start,
                      ),
                    ),
                    IconButton(
                      key: const ValueKey('special-offer-refund-close'),
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                _SummaryGrid(
                  items: [
                    _SummaryItem(
                      label: tr('عدد العروض'),
                      value: trf('{0} متاح', [formatSpecialOfferAmount(offer.totalOffers)]),
                    ),
                    _SummaryItem(
                      label: tr('حد يومي'),
                      value: trf('{0} عرض يومياً', [formatSpecialOfferAmount(offer.dailyLimit)]),
                    ),
                    _SummaryItem(
                      label: tr('الحد الأقصى للمشروع'),
                      value: maxProject,
                    ),
                    _SummaryItem(
                      label: tr('المدة'),
                      value: trf('{0} يوم', [formatSpecialOfferAmount(offer.durationDays)]),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                for (var i = 0; i < sections.length; i++) ...[
                  Text(
                    specialOfferRefundSectionTitlesAr.length > i
                        ? specialOfferRefundSectionTitlesAr[i]
                        : trf('تفاصيل {0}', [i + 1]),
                    style: const TextStyle(
                      color: AppColors.primaryDeep,
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                    ),
                    textAlign: TextAlign.start,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    sections[i],
                    key: i == 0 ? const ValueKey('special-offer-refund-section') : null,
                    style: const TextStyle(color: AppColors.textMuted, height: 1.55, fontSize: 13),
                    textAlign: TextAlign.start,
                  ),
                  const SizedBox(height: 12),
                ],
                OhButton(
                  label: specialOfferRefundModalGotItAr,
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryItem {
  const _SummaryItem({required this.label, required this.value});

  final String label;
  final String value;
}

class _SummaryGrid extends StatelessWidget {
  const _SummaryGrid({required this.items});

  final List<_SummaryItem> items;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final crossCount = constraints.maxWidth < 360 ? 1 : 2;
        return GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: items.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: crossCount,
            mainAxisExtent: 58,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          itemBuilder: (context, index) {
            final item = items[index];
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.12)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    item.label,
                    key: index == 0 ? const ValueKey('special-offer-summary-label') : null,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                    textAlign: TextAlign.start,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.value,
                    key: index == 0 ? const ValueKey('special-offer-summary-value') : null,
                    style: const TextStyle(
                      color: AppColors.primaryDeep,
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                    ),
                    textAlign: TextAlign.start,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
