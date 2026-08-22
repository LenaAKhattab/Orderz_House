import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/constants/web_constants.dart';
import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../../../auth/presentation/auth_controller.dart';
import 'mini_articles_controllers.dart';
import 'mini_articles_widgets.dart';

class MiniArticlesHubScreen extends ConsumerWidget {
  const MiniArticlesHubScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final ui = ref.watch(miniArticlesHubControllerProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('المقالات المصغّرة')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                const Text(
                  'سجّل الدخول كمستقل لعرض مقالات Mini Article.',
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

    if (auth.user?.isFreelancerAccount != true) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('المقالات المصغّرة')),
        body: const OhEmptyBody(
          message: 'هذه الصفحة متاحة للمستقلين فقط.',
          icon: Icons.person_off_outlined,
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('المقالات المصغّرة')),
      body: RefreshIndicator(
        onRefresh: () => ref.read(miniArticlesHubControllerProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const Text(
              'قدّم على مقالات Mini Article المتاحة. التقديم يستخدم Bid حسب سياسة الفرصة.',
              textAlign: TextAlign.right,
              style: TextStyle(color: AppColors.textMuted, height: 1.5),
            ),
            const SizedBox(height: 12),
            BildazoLinkPanel(status: ui.bildazo),
            const SizedBox(height: 10),
            EarnedBalancePanel(
              snapshot: ui.earnedBalance,
              onSilverCta: () async {
                final url =
                    await ref.read(miniArticlesHubControllerProvider.notifier).startSilverCheckout();
                if (!context.mounted) return;
                if (url != null && url.trim().isNotEmpty) {
                  final uri = Uri.tryParse(url.trim());
                  if (uri != null) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                    return;
                  }
                }
                final plans = Uri.tryParse(WebConstants.freelancerPlansUrl);
                if (plans != null) {
                  await launchUrl(plans, mode: LaunchMode.externalApplication);
                }
              },
            ),
            const SizedBox(height: 10),
            TrialSilverPanel(
              trial: ui.trial,
              conversion: ui.conversion,
              trialBusy: ui.trialBusy,
              silverBusy: ui.silverBusy,
              trialError: ui.trialError,
              silverError: ui.silverError,
              silverMessage: ui.silverMessage,
              onActivateTrial: () =>
                  ref.read(miniArticlesHubControllerProvider.notifier).activateTrial(),
              onStartSilver: () async {
                final url =
                    await ref.read(miniArticlesHubControllerProvider.notifier).startSilverCheckout();
                if (!context.mounted) return;
                if (url != null && url.trim().isNotEmpty) {
                  final uri = Uri.tryParse(url.trim());
                  if (uri != null) {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                    return;
                  }
                }
                final plans = Uri.tryParse(WebConstants.freelancerPlansUrl);
                if (plans != null) {
                  await launchUrl(plans, mode: LaunchMode.externalApplication);
                }
              },
            ),
            const SizedBox(height: 16),
            const Text(
              'المقالات المتاحة',
              textAlign: TextAlign.right,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            const SizedBox(height: 10),
            if (ui.loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (ui.error != null)
              OhErrorBanner(message: ui.error!)
            else if (ui.articles.isEmpty)
              const OhEmptyBody(
                message: 'لا توجد مقالات متاحة حالياً.',
                icon: Icons.article_outlined,
              )
            else
              ...ui.articles.map(
                (article) => MiniArticleListCard(
                  article: article,
                  onTap: () => context.push(AppRoutes.freelancerMiniArticlePath(article.id)),
                ),
              ),
            if (ui.refreshing)
              const Padding(
                padding: EdgeInsets.only(top: 12),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
          ],
        ),
      ),
    );
  }
}
