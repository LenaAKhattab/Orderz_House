import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/constants/web_constants.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../../presentation/plan_upgrade_required_cta.dart';
import '../data/mini_articles_copy.dart';
import '../data/mini_articles_models.dart';
import 'mini_articles_controllers.dart';
import 'mini_articles_widgets.dart';

class MiniArticleDetailScreen extends ConsumerStatefulWidget {
  const MiniArticleDetailScreen({super.key, required this.articleId});

  final String articleId;

  @override
  ConsumerState<MiniArticleDetailScreen> createState() => _MiniArticleDetailScreenState();
}

class _MiniArticleDetailScreenState extends ConsumerState<MiniArticleDetailScreen> {
  final _proposalCtrl = TextEditingController();

  @override
  void dispose() {
    _proposalCtrl.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final ok = await ref
        .read(miniArticleDetailControllerProvider(widget.articleId).notifier)
        .apply(proposalMessage: _proposalCtrl.text);
    if (!mounted) return;
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال التقديم بنجاح.')),
      );
    }
  }

  Future<void> _openBildazoWeb() async {
    final uri = Uri.tryParse(WebConstants.freelancerBildazoWriterActivateUrl);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final ui = ref.watch(miniArticleDetailControllerProvider(widget.articleId));

    if (!auth.isAuthenticated) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('تفاصيل المقال')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                const Text(
                  'سجّل الدخول لعرض المقال والتقديم.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                const SizedBox(height: 16),
                OhButton(
                  label: 'تسجيل الدخول',
                  onPressed: () => context.push(AppRoutes.login),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final ctx = ui.context;
    final article = ctx?.article;
    final application = ctx?.application;
    final eligibility = ctx?.eligibility;
    final showPlanCta = shouldShowArticlePlanUpgradeCta(eligibility);
    final lockMessage = eligibilityMessageAr(eligibility);
    final canShowApply = application == null && eligibility?.eligible == true;

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: Text(article?.title.isNotEmpty == true ? article!.title : 'تفاصيل المقال')),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.read(miniArticleDetailControllerProvider(widget.articleId).notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            if (ui.loading && article == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (ui.error != null && article == null)
              OhErrorBanner(message: ui.error!)
            else if (article != null) ...[
              Text(
                article.title,
                textAlign: TextAlign.right,
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 18, height: 1.35),
              ),
              const SizedBox(height: 8),
              Wrap(
                alignment: WrapAlignment.end,
                spacing: 8,
                runSpacing: 6,
                children: [
                  _StatusPill(miniArticleStatusLabelAr(article.status)),
                  if (application != null) _StatusPill(application.statusLabelAr),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                formatArticleValueJodLabel(article.displayValueJod),
                textAlign: TextAlign.right,
                key: const Key('detail-article-value'),
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  color: AppColors.primaryDeep,
                ),
              ),
              if (article.bidCollection?.progressLabel != null) ...[
                const SizedBox(height: 6),
                Text(
                  article.bidCollection!.progressLabel!,
                  textAlign: TextAlign.right,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ],
              if (article.description?.trim().isNotEmpty == true) ...[
                const SizedBox(height: 14),
                const Text(
                  'المتطلبات / الوصف',
                  textAlign: TextAlign.right,
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 6),
                Text(
                  article.description!.trim(),
                  textAlign: TextAlign.right,
                  style: const TextStyle(height: 1.55, color: AppColors.textInk),
                ),
              ],
              if (article.requiredWordCount != null) ...[
                const SizedBox(height: 8),
                Text(
                  'عدد الكلمات المطلوب: ${article.requiredWordCount}',
                  textAlign: TextAlign.right,
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ],
              const SizedBox(height: 14),
              MiniArticleFinancialBreakdown(article: article),
              const SizedBox(height: 12),
              if (application != null) ...[
                OhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'حالة تقديمك: ${application.statusLabelAr}',
                        textAlign: TextAlign.right,
                        key: Key('application-status-${application.statusKey}'),
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        'لا يمكن إرسال تقديم آخر على نفس المقال.',
                        textAlign: TextAlign.right,
                        style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ] else ...[
                const ApplyBidNotice(),
                if (eligibility?.availableBids != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    'رصيد Bids المتاح (من الخادم): ${eligibility!.availableBids}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ],
                if (lockMessage != null) ...[
                  const SizedBox(height: 10),
                  OhErrorBanner(message: lockMessage),
                ],
                if (eligibility?.reason == 'BILDAZO_AUTHOR_LINK_REQUIRED') ...[
                  const SizedBox(height: 10),
                  OhButton(
                    key: const ValueKey('detail-bildazo-activate-cta'),
                    label: bildazoActivateCtaAr,
                    outlined: true,
                    onPressed: _openBildazoWeb,
                  ),
                ],
                if (showPlanCta) ...[
                  const SizedBox(height: 10),
                  PlanUpgradeRequiredCta(
                    requiredTierCode: article.activationPlanTierCode ?? eligibility?.membershipTierCode,
                  ),
                ],
                if (canShowApply) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _proposalCtrl,
                    maxLines: 3,
                    textAlign: TextAlign.right,
                    decoration: const InputDecoration(
                      labelText: 'رسالة التقديم (اختياري)',
                      alignLabelWithHint: true,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OhButton(
                    label: 'التقديم باستخدام Bid',
                    isLoading: ui.applying,
                    onPressed: ui.applying ? null : _apply,
                  ),
                ],
              ],
              if (ui.applyError != null) ...[
                const SizedBox(height: 12),
                OhErrorBanner(message: ui.applyError!),
              ],
              if (ui.error != null) ...[
                const SizedBox(height: 12),
                OhErrorBanner(message: ui.error!),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 11,
          color: AppColors.primaryDeep,
        ),
      ),
    );
  }
}
