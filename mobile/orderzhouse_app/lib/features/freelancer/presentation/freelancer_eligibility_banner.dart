import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../account_activation/data/account_activation_kyc_models.dart';
import '../data/freelancer_eligibility_models.dart';
import 'freelancer_eligibility_provider.dart';

/// Shows an ineligible warning only. Eligible accounts see nothing.
/// Dismissible with the corner X (session-only).
class FreelancerEligibilityBanner extends ConsumerStatefulWidget {
  const FreelancerEligibilityBanner({super.key, this.compact = false});

  final bool compact;

  @override
  ConsumerState<FreelancerEligibilityBanner> createState() =>
      _FreelancerEligibilityBannerState();
}

class _FreelancerEligibilityBannerState extends ConsumerState<FreelancerEligibilityBanner> {
  bool _dismissed = false;

  @override
  Widget build(BuildContext context) {
    if (_dismissed) return const SizedBox.shrink();

    final asyncEligibility = ref.watch(freelancerEligibilityProvider);

    return asyncEligibility.when(
      loading: () => const SizedBox.shrink(),
      error: (error, stackTrace) => const SizedBox.shrink(),
      data: (eligibility) {
        if (eligibility == null || eligibility.eligible) {
          return const SizedBox.shrink();
        }
        final needsKyc = freelancerEligibilityNeedsAccountActivation(eligibility);
        final rejected = freelancerEligibilityLooksRejected(eligibility);
        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: _IneligibleCard(
            message: freelancerIneligibleBannerMessageAr(eligibility),
            compact: widget.compact,
            ctaLabel: needsKyc
                ? (rejected ? accountActivationKycResubmitCtaAr : accountActivationKycCompleteCtaAr)
                : null,
            onCta: needsKyc
                ? () => context.push(AppRoutes.freelancerAccountActivation)
                : null,
            onDismiss: () => setState(() => _dismissed = true),
          ),
        );
      },
    );
  }
}

class _IneligibleCard extends StatelessWidget {
  const _IneligibleCard({
    required this.message,
    required this.compact,
    required this.onDismiss,
    this.ctaLabel,
    this.onCta,
  });

  final String message;
  final bool compact;
  final VoidCallback onDismiss;
  final String? ctaLabel;
  final VoidCallback? onCta;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.fromLTRB(compact ? 10 : 12, compact ? 10 : 12, 4, compact ? 10 : 12),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.error.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 2, right: 8),
                child: Icon(Icons.info_outline, color: AppColors.error, size: 22),
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    message,
                    style: TextStyle(
                      color: AppColors.textInk,
                      fontWeight: FontWeight.w600,
                      height: 1.5,
                      fontSize: compact ? 13 : 14,
                    ),
                    textAlign: TextAlign.right,
                  ),
                ),
              ),
              IconButton(
                onPressed: onDismiss,
                tooltip: 'إخفاء',
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                icon: Icon(
                  Icons.close_rounded,
                  size: 20,
                  color: AppColors.textMuted.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
          if (ctaLabel != null && onCta != null) ...[
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.only(left: 8, right: 8),
              child: OhButton(
                label: ctaLabel!,
                onPressed: onCta,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
