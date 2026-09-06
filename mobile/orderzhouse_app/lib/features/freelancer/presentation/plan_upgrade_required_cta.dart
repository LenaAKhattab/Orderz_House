import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/web_constants.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/plan_upgrade_cta.dart';

class PlanUpgradeRequiredCta extends StatelessWidget {
  const PlanUpgradeRequiredCta({
    super.key,
    this.requiredTierCode,
    this.requiredPlanLabel,
    this.reason,
    this.compact = false,
  });

  final String? requiredTierCode;
  final String? requiredPlanLabel;
  final String? reason;
  final bool compact;

  Future<void> _openPlans(BuildContext context) async {
    final url = WebConstants.freelancerPlansUrl;
    final uri = Uri.tryParse(url);
    if (uri == null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(planUpgradeOpenFailedAr)),
      );
      return;
    }
    final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!launched && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(planUpgradeOpenFailedAr)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final copy = buildPlanUpgradeCopy(
      requiredTierCode: requiredTierCode,
      requiredPlanLabel: requiredPlanLabel,
      reason: reason,
    );

    if (copy.mode == PlanUpgradeCtaMode.support) {
      return Container(
        padding: EdgeInsets.all(compact ? 10 : 12),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
        ),
        child: Text(
          copy.headline,
          textAlign: TextAlign.right,
          style: TextStyle(
            color: AppColors.textInk,
            fontWeight: FontWeight.w700,
            fontSize: compact ? 13 : 14,
            height: 1.45,
          ),
        ),
      );
    }

    return Container(
      padding: EdgeInsets.all(compact ? 10 : 12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            copy.headline,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: AppColors.textInk,
              fontWeight: FontWeight.w800,
              fontSize: compact ? 13 : 14,
              height: 1.4,
            ),
          ),
          if (copy.action != null) ...[
            const SizedBox(height: 4),
            Text(
              copy.action!,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: AppColors.textMuted,
                fontWeight: FontWeight.w600,
                fontSize: compact ? 12 : 13,
                height: 1.45,
              ),
            ),
          ],
          if (copy.tierHint != null) ...[
            const SizedBox(height: 4),
            Text(
              copy.tierHint!,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: AppColors.primaryDeep,
                fontWeight: FontWeight.w700,
                fontSize: compact ? 12 : 13,
              ),
            ),
          ],
          if (copy.showButton) ...[
            const SizedBox(height: 10),
            OhButton(
              label: copy.button,
              outlined: true,
              onPressed: () => _openPlans(context),
            ),
          ],
        ],
      ),
    );
  }
}
