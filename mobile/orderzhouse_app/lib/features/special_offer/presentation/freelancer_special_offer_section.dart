import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'special_offer_card.dart';
import 'special_offer_controller.dart';
import 'special_offer_refund_modal.dart';

/// Compact special-offer card on freelancer home — web handoff only (no in-app checkout).
class FreelancerSpecialOfferSection extends ConsumerWidget {
  const FreelancerSpecialOfferSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOffer = ref.watch(publicSpecialOfferProvider);

    return asyncOffer.when(
      loading: () => const SizedBox.shrink(),
      error: (error, stackTrace) => const SizedBox.shrink(),
      data: (offer) {
        if (offer == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: SpecialOfferCard(
            offer: offer,
            onOpenPlans: () => openSpecialOfferWebHandoff(context),
            onOpenRefundDetails: () => SpecialOfferRefundModal.show(context, offer),
          ),
        );
      },
    );
  }
}
