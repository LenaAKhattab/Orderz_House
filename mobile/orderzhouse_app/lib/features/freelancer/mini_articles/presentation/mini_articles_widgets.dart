import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/constants/web_constants.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../data/mini_articles_copy.dart';
import '../data/mini_articles_models.dart';
import '../data/mini_articles_side_models.dart';

String miniArticleStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'released':
    case 'open':
    case 'published':
    case 'available':
      return 'متاح';
    case 'collecting':
    case 'bidding':
      return 'جمع التقديمات';
    case 'assigned':
    case 'in_progress':
      return 'قيد التنفيذ';
    case 'closed':
      return 'مغلق';
    case 'paused':
      return 'متوقف';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

String formatShareJod(num? amount) {
  if (amount == null) return '—';
  return '${amount.toStringAsFixed(3)} JOD';
}

class MiniArticleListCard extends StatelessWidget {
  const MiniArticleListCard({
    super.key,
    required this.article,
    this.applicationStatusLabel,
    this.planLocked = false,
    this.applyAvailableLabel,
    required this.onTap,
  });

  final MiniArticle article;
  final String? applicationStatusLabel;
  final bool planLocked;
  final String? applyAvailableLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final progress = article.bidCollection?.progressLabel;
    return OhCard(
      onTap: onTap,
      margin: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            article.title,
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: AppColors.textInk,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.end,
            spacing: 8,
            runSpacing: 6,
            children: [
              _Chip(label: miniArticleStatusLabelAr(article.status)),
              if (planLocked) const _Chip(label: 'مقفل بالخطة', tone: _ChipTone.warn),
              if (applicationStatusLabel != null)
                _Chip(label: applicationStatusLabel!, tone: _ChipTone.info),
              if (applyAvailableLabel != null)
                _Chip(label: applyAvailableLabel!, tone: _ChipTone.ok),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            formatArticleValueJodLabel(article.displayValueJod),
            textAlign: TextAlign.right,
            key: ValueKey('article-value-${article.id}'),
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 14,
              color: AppColors.primaryDeep,
            ),
          ),
          if (progress != null) ...[
            const SizedBox(height: 6),
            Text(
              progress,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

enum _ChipTone { neutral, warn, info, ok }

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.tone = _ChipTone.neutral});

  final String label;
  final _ChipTone tone;

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    switch (tone) {
      case _ChipTone.warn:
        bg = const Color(0xFFFFF4E5);
        fg = const Color(0xFFB54708);
      case _ChipTone.info:
        bg = const Color(0xFFEFF8FF);
        fg = const Color(0xFF175CD3);
      case _ChipTone.ok:
        bg = const Color(0xFFECFDF3);
        fg = const Color(0xFF027A48);
      case _ChipTone.neutral:
        bg = AppColors.primary.withValues(alpha: 0.08);
        fg = AppColors.primaryDeep;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 11),
      ),
    );
  }
}

class MiniArticleFinancialBreakdown extends StatelessWidget {
  const MiniArticleFinancialBreakdown({super.key, required this.article});

  final MiniArticle article;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'التفصيل المالي',
            textAlign: TextAlign.right,
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 10),
          _Row(label: 'إجمالي قيمة المقال', value: formatShareJod(article.displayValueJod)),
          _Row(label: 'صافي مستحقاتك بعد التوزيع', value: formatShareJod(article.freelancerShareJod)),
          _Row(label: 'حصة التدقيق', value: formatShareJod(article.reviewerShareJod)),
          _Row(label: 'حصة المنصة', value: formatShareJod(article.companyShareJod)),
          const SizedBox(height: 8),
          const Text(
            'قيمة المقال الإجمالية ليست رصيداً قابلاً للسحب.',
            textAlign: TextAlign.right,
            style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.left,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

class EarnedBalancePanel extends StatelessWidget {
  const EarnedBalancePanel({
    super.key,
    required this.snapshot,
    this.onOpenPlans,
    this.onOpenKyc,
    this.onOpenClaims,
  });

  final EarnedBalanceSnapshot snapshot;
  final VoidCallback? onOpenPlans;
  final VoidCallback? onOpenKyc;
  final VoidCallback? onOpenClaims;

  Future<void> _openPlans(BuildContext context) async {
    if (onOpenPlans != null) {
      onOpenPlans!();
      return;
    }
    final uri = Uri.tryParse(WebConstants.freelancerPlansUrl);
    if (uri == null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(earnedBalanceOpenPlansFailedAr)),
      );
      return;
    }
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(earnedBalanceOpenPlansFailedAr)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ui = resolveEarnedBalanceUiState(snapshot);
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            earnedBalanceTitleAr,
            textAlign: TextAlign.right,
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          if (ui.headline != null && ui.headline!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              ui.headline!,
              key: const ValueKey('earned-balance-headline'),
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: AppColors.primaryDeep,
                height: 1.4,
                fontSize: 13,
              ),
            ),
          ],
          if (ui.detail != null && ui.detail!.trim().isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              ui.detail!,
              key: const ValueKey('earned-balance-detail'),
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
            ),
          ],
          if (ui.showLockedPendingAmount) ...[
            const SizedBox(height: 8),
            Text(
              '$earnedBalanceLockedPendingLabelAr: ${snapshot.displayLockedPendingJod} JOD',
              key: const ValueKey('earned-balance-locked-pending'),
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primaryDeep),
            ),
          ],
          if (ui.showClosedAmount) ...[
            const SizedBox(height: 6),
            Text(
              '$earnedBalanceClosedAmountLabelAr: ${snapshot.totalForfeitedJod} JOD',
              key: const ValueKey('earned-balance-closed'),
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
          if (ui.showWithdrawableAmount) ...[
            const SizedBox(height: 6),
            Text(
              '$earnedBalanceWithdrawableLabelAr: ${snapshot.displayWithdrawableJod} JOD',
              key: const ValueKey('earned-balance-withdrawable'),
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.success, fontSize: 14),
            ),
          ],
          const SizedBox(height: 6),
          Text(
            'مقبول: ${snapshot.totalAcceptedArticles} · منشور: ${snapshot.totalPublishedArticles}',
            textAlign: TextAlign.right,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 8),
          const Text(
            earnedBalanceHelperAr,
            textAlign: TextAlign.right,
            style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
          ),
          if (ui.showPlansCta) ...[
            const SizedBox(height: 10),
            OhButton(
              key: const ValueKey('earned-balance-plans-cta'),
              label: earnedBalancePlansCtaAr,
              onPressed: () => _openPlans(context),
            ),
          ],
          if (ui.showKycPending) ...[
            const SizedBox(height: 8),
            Text(
              earnedBalanceKycPendingAr,
              key: const ValueKey('earned-balance-kyc-pending'),
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
          if (ui.showKycCta) ...[
            const SizedBox(height: 10),
            OhButton(
              key: const ValueKey('earned-balance-kyc-cta'),
              label: earnedBalanceKycCtaAr,
              outlined: true,
              onPressed: onOpenKyc,
            ),
          ],
          if (ui.showClaimsCta) ...[
            const SizedBox(height: 10),
            OhButton(
              key: const ValueKey('earned-balance-claims-cta'),
              label: earnedBalanceClaimsNavAr,
              outlined: true,
              onPressed: onOpenClaims,
            ),
          ],
          if (snapshot.entries.isEmpty) ...[
            const SizedBox(height: 10),
            const Text(
              earnedBalanceEmptyAr,
              textAlign: TextAlign.right,
              style: TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ] else ...[
            const SizedBox(height: 10),
            ...snapshot.entries.take(8).map((e) => _EarnedEntryTile(entry: e)),
          ],
        ],
      ),
    );
  }
}

class _EarnedEntryTile extends StatelessWidget {
  const _EarnedEntryTile({required this.entry});

  final EarnedBalanceEntry entry;

  @override
  Widget build(BuildContext context) {
    final amount = entry.amountJod ?? '—';
    final locked = entry.locked || entry.statusKey == 'pending_locked';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            entry.articleTitle?.trim().isNotEmpty == true ? entry.articleTitle! : 'مقال',
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            '${locked ? '🔒 ' : ''}صافي المستقل: $amount JOD · ${entry.statusLabelAr}',
            textAlign: TextAlign.right,
            key: ValueKey('earned-net-${entry.applicationId}'),
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          if (entry.bildazoUrl != null && entry.bildazoUrl!.trim().isNotEmpty) ...[
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () async {
                  final uri = Uri.tryParse(entry.bildazoUrl!.trim());
                  if (uri == null) return;
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                },
                child: const Text(bildazoViewArticleAr),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class BildazoLinkPanel extends StatelessWidget {
  const BildazoLinkPanel({super.key, required this.status});

  final BildazoAuthorLinkStatus status;

  Future<void> _openActivate(BuildContext context) async {
    final uri = Uri.tryParse(WebConstants.freelancerBildazoWriterActivateUrl);
    if (uri == null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(bildazoOpenHandoffFailedAr)),
      );
      return;
    }
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(bildazoOpenHandoffFailedAr)),
      );
    }
  }

  Future<void> _openProfile(BuildContext context, String url) async {
    final uri = Uri.tryParse(url.trim());
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final linked = status.isLinked;
    final profileUrl = status.resolvedProfileUrl;
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'حساب الكاتب على Bildazo',
            textAlign: TextAlign.right,
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
          const SizedBox(height: 8),
          Text(
            linked
                ? (status.displayName != null && status.displayName!.trim().isNotEmpty
                    ? '$bildazoLinkedStatusAr · ${status.displayName!.trim()}'
                    : bildazoLinkedStatusAr)
                : status.gateEnabled
                    ? bildazoRequiredAr
                    : bildazoGateOptionalAr,
            textAlign: TextAlign.right,
            key: ValueKey(linked ? 'bildazo-linked' : 'bildazo-required'),
            style: TextStyle(
              color: linked ? AppColors.textInk : AppColors.textMuted,
              fontWeight: FontWeight.w600,
              height: 1.4,
            ),
          ),
          if (!linked) ...[
            const SizedBox(height: 10),
            OhButton(
              key: const ValueKey('bildazo-activate-cta'),
              label: bildazoActivateCtaAr,
              outlined: true,
              onPressed: () => _openActivate(context),
            ),
          ] else if (profileUrl != null) ...[
            const SizedBox(height: 10),
            OhButton(
              key: const ValueKey('bildazo-view-profile-cta'),
              label: bildazoViewWriterProfileAr,
              outlined: true,
              onPressed: () => _openProfile(context, profileUrl),
            ),
          ],
        ],
      ),
    );
  }
}

class TrialSilverPanel extends StatelessWidget {
  const TrialSilverPanel({
    super.key,
    required this.trial,
    required this.conversion,
    this.trialBusy = false,
    this.silverBusy = false,
    this.trialError,
    this.silverError,
    this.silverMessage,
    this.onActivateTrial,
    this.onStartSilver,
  });

  final ActivationTrialSnapshot trial;
  final SilverConversionSnapshot conversion;
  final bool trialBusy;
  final bool silverBusy;
  final String? trialError;
  final String? silverError;
  final String? silverMessage;
  final VoidCallback? onActivateTrial;
  final Future<void> Function()? onStartSilver;

  @override
  Widget build(BuildContext context) {
    final showTrial = trial.engineEnabled || (trial.status != null && trial.status!.isNotEmpty);
    final showSilver = conversion.shouldShowSilverCta;
    if (!showTrial && !showSilver) return const SizedBox.shrink();

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (showTrial) ...[
            const Text(
              'حالة تجربة العمل',
              textAlign: TextAlign.right,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
            const SizedBox(height: 6),
            Text(
              trial.statusLabelAr,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            if (trial.daysRemaining != null) ...[
              const SizedBox(height: 4),
              Text(
                'الأيام المتبقية: ${trial.daysRemaining}',
                textAlign: TextAlign.right,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
            if (trial.trialBidsUsed != null || trial.trialBidLimit != null) ...[
              const SizedBox(height: 2),
              Text(
                'عروض التجربة: ${trial.trialBidsUsed ?? 0} / ${trial.trialBidLimit ?? '—'}',
                textAlign: TextAlign.right,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
            if (trial.acceptedWorkCount != null || trial.successfulWorkCap != null) ...[
              const SizedBox(height: 2),
              Text(
                'سقف العمل المقبول: ${trial.acceptedWorkCount ?? 0} / ${trial.successfulWorkCap ?? '—'}',
                textAlign: TextAlign.right,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
            if (trial.status == 'not_started' || trial.status == 'eligible') ...[
              const SizedBox(height: 10),
              OhButton(
                label: 'تفعيل التجربة',
                isLoading: trialBusy,
                onPressed: trialBusy ? null : onActivateTrial,
              ),
            ],
            if (trialError != null) ...[
              const SizedBox(height: 8),
              OhErrorBanner(message: trialError!),
            ],
          ],
          if (showSilver) ...[
            if (showTrial) const SizedBox(height: 14),
            Text(
              conversion.buttonLabel?.trim().isNotEmpty == true
                  ? conversion.buttonLabel!
                  : 'الترقية إلى Silver',
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
            if (conversion.priceJod != null) ...[
              const SizedBox(height: 4),
              Text(
                'السعر: ${conversion.priceJod!.toStringAsFixed(3)} JOD',
                textAlign: TextAlign.right,
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
              ),
            ],
            const SizedBox(height: 10),
            OhButton(
              label: 'متابعة الترقية',
              isLoading: silverBusy,
              onPressed: silverBusy || onStartSilver == null
                  ? null
                  : () {
                      // ignore: discarded_futures
                      onStartSilver!();
                    },
            ),
            const SizedBox(height: 8),
            OhButton(
              label: 'عرض الخطط على الموقع',
              outlined: true,
              onPressed: () async {
                final uri = Uri.tryParse(WebConstants.freelancerPlansUrl);
                if (uri == null) return;
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              },
            ),
            if (silverMessage != null) ...[
              const SizedBox(height: 8),
              Text(silverMessage!, textAlign: TextAlign.right, style: const TextStyle(fontSize: 12)),
            ],
            if (silverError != null) ...[
              const SizedBox(height: 8),
              OhErrorBanner(message: silverError!),
            ],
          ],
        ],
      ),
    );
  }
}

class ApplyBidNotice extends StatelessWidget {
  const ApplyBidNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.18)),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            applyBidUsesBidAr,
            textAlign: TextAlign.right,
            style: TextStyle(fontWeight: FontWeight.w700, height: 1.4),
          ),
          SizedBox(height: 6),
          Text(
            applyBidMayNotReturnAr,
            textAlign: TextAlign.right,
            style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.45),
          ),
        ],
      ),
    );
  }
}
