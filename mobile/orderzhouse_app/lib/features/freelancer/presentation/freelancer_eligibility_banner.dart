import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../data/freelancer_eligibility_models.dart';
import 'freelancer_eligibility_provider.dart';

/// Shows eligibility status without any subscription / plans CTA (Play policy).
class FreelancerEligibilityBanner extends ConsumerWidget {
  const FreelancerEligibilityBanner({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncEligibility = ref.watch(freelancerEligibilityProvider);

    return asyncEligibility.when(
      loading: () => const SizedBox.shrink(),
      error: (error, stackTrace) => const SizedBox.shrink(),
      data: (eligibility) {
        if (eligibility == null) return const SizedBox.shrink();
        return _EligibilityCard(
          eligibility: eligibility,
          compact: compact,
        );
      },
    );
  }
}

class _EligibilityCard extends StatelessWidget {
  const _EligibilityCard({
    required this.eligibility,
    required this.compact,
  });

  final FreelancerEligibility eligibility;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final message = freelancerEligibilityMessageAr(eligibility);
    final isOk = eligibility.eligible;

    return Container(
      padding: EdgeInsets.all(compact ? 12 : 14),
      decoration: BoxDecoration(
        color: isOk
            ? AppColors.secondary.withValues(alpha: 0.15)
            : AppColors.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isOk ? AppColors.secondary : AppColors.error.withValues(alpha: 0.35),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isOk ? Icons.verified_outlined : Icons.info_outline,
            color: isOk ? AppColors.primary : AppColors.error,
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: AppColors.textInk,
                fontWeight: FontWeight.w600,
                height: 1.5,
                fontSize: compact ? 13 : 14,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
