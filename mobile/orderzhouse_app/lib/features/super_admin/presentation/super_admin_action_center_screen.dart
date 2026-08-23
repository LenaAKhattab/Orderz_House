import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/app_branding.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../home/presentation/home_dashboard_chrome.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../../profile/domain/profile_actions.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_feedback_models.dart';
import '../data/super_admin_models.dart';
import '../data/super_admin_web_handoff.dart';
import 'super_admin_ui.dart';

class SuperAdminActionCenterScreen extends ConsumerWidget {
  const SuperAdminActionCenterScreen({super.key});

  Future<void> _refreshAll(WidgetRef ref) async {
    await Future.wait<void>([
      ref.read(superAdminActionCenterProvider.notifier).refresh(),
      ref.refresh(unreadNotificationsControllerProvider.future).then((_) {}),
    ]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final async = ref.watch(superAdminActionCenterProvider);
    final unreadAsync = ref.watch(unreadNotificationsControllerProvider);
    final unread = unreadAsync.maybeWhen(data: (v) => v, orElse: () => 0);
    final name = user?.displayName.trim();
    final greeting = (name != null && name.isNotEmpty) ? name : 'المشرف الأعلى';
    final initials = user != null ? profileInitials(user) : 'م';

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      body: Stack(
        children: [
          const HomeAtmosphere(),
          SafeArea(
            child: async.when(
              skipLoadingOnReload: true,
              skipLoadingOnRefresh: true,
              loading: () => SuperAdminActionCenterView(
                greetingName: greeting,
                initials: initials,
                unread: unread,
                isLoading: true,
                onRetry: () => _refreshAll(ref),
                onRefresh: () => _refreshAll(ref),
                onAvatarTap: () => context.push(AppRoutes.accountSettings),
              ),
              error: (error, _) => SuperAdminActionCenterView(
                greetingName: greeting,
                initials: initials,
                unread: unread,
                errorMessage: superAdminLoadErrorMessage(error),
                onRetry: () => _refreshAll(ref),
                onRefresh: () => _refreshAll(ref),
                onAvatarTap: () => context.push(AppRoutes.accountSettings),
              ),
              data: (snapshot) => SuperAdminActionCenterView(
                greetingName: greeting,
                initials: initials,
                unread: unread,
                snapshot: snapshot,
                onRetry: () => _refreshAll(ref),
                onRefresh: () => _refreshAll(ref),
                onAvatarTap: () => context.push(AppRoutes.accountSettings),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class SuperAdminActionCenterView extends StatelessWidget {
  const SuperAdminActionCenterView({
    super.key,
    required this.greetingName,
    required this.initials,
    required this.unread,
    required this.onRetry,
    required this.onRefresh,
    required this.onAvatarTap,
    this.snapshot,
    this.errorMessage,
    this.isLoading = false,
  });

  final String greetingName;
  final String initials;
  final int unread;
  final SuperAdminActionCenterSnapshot? snapshot;
  final String? errorMessage;
  final bool isLoading;
  final VoidCallback onRetry;
  final Future<void> Function() onRefresh;
  final VoidCallback onAvatarTap;

  /// Single source of truth for unread: header badge + notifications tile.
  SuperAdminCountCard get _unreadCard => SuperAdminCountCard.ok(unread < 0 ? 0 : unread);

  bool get _hasInAppUrgent {
    if (snapshot == null) return false;
    int n(SuperAdminCountCard c) => c.available ? (c.count ?? 0) : 0;
    return n(snapshot!.identityRequests) +
        n(snapshot!.subscriptionActivations) +
        n(snapshot!.claims) +
        unread +
        n(snapshot!.pantry) +
        n(snapshot!.articles) >
        0;
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      AppBranding.displayNameAr,
                      style: const TextStyle(
                        color: AppColors.primaryDeep,
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        height: 1.2,
                      ),
                      textAlign: TextAlign.right,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'أهلاً، $greetingName',
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 14),
                      textAlign: TextAlign.right,
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'مركز المهام',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                      textAlign: TextAlign.right,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              HomeHeaderNotificationButton(unread: unread),
              const SizedBox(width: 10),
              HomeHeaderAvatar(initials: initials, onTap: onAvatarTap),
            ],
          ),
          const SizedBox(height: 22),
          if (isLoading) ...[
            const SizedBox(height: 80),
            const SizedBox(
              height: 220,
              child: OhLoadingBody(message: 'جاري تحميل المهام العاجلة...'),
            ),
          ] else if (errorMessage != null) ...[
            const SizedBox(height: 40),
            SizedBox(
              height: 260,
              child: OhErrorBody(message: errorMessage!, onRetry: onRetry),
            ),
          ] else if (snapshot != null) ...[
            if (!_hasInAppUrgent) ...[
              const OhEmptyBody(
                message: 'لا توجد مهام عاجلة حالياً.',
                icon: Icons.verified_outlined,
              ),
              const SizedBox(height: 16),
            ],
            Text(
              superAdminInAppActionsSectionAr,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: AppColors.primaryDeep,
              ),
            ),
            const SizedBox(height: 12),
            SuperAdminCountTile(
              title: 'مطالبات مالية تحتاج إجراء',
              card: snapshot!.claims,
              icon: Icons.payments_outlined,
              hint: snapshot!.claims.available ? 'اضغط للعرض' : null,
              onTap: () => context.push(AppRoutes.superAdminClaims),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              key: const Key('sa-identity-requests-tile'),
              title: superAdminIdentityQueueTitleAr,
              card: snapshot!.identityRequests,
              icon: Icons.badge_outlined,
              hint: superAdminActivationListHintAr,
              onTap: () => context.push(AppRoutes.superAdminIdentityRequests),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              key: const Key('sa-subscription-activation-tile'),
              title: superAdminSubscriptionActivationQueueTitleAr,
              card: snapshot!.subscriptionActivations,
              icon: Icons.card_membership_outlined,
              hint: superAdminActivationListHintAr,
              onTap: () => context.push(AppRoutes.superAdminSubscriptionActivation),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              title: superAdminPackageAssignmentTitleAr,
              card: snapshot!.packageAssignment ?? SuperAdminCountCard.ok(0),
              icon: Icons.group_outlined,
              hint: 'إدارة الباقات والمستخدمين',
              onTap: () => context.push(AppRoutes.superAdminPackageAssignment),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              title: 'إشعارات غير مقروءة',
              card: _unreadCard,
              icon: Icons.notifications_outlined,
              hint: 'نفس عداد أيقونة الإشعارات',
              onTap: () => context.push(AppRoutes.notifications),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              title: 'بيت المونة يحتاج متابعة',
              card: snapshot!.pantry,
              icon: Icons.inventory_2_outlined,
              hint: snapshot!.pantry.available ? 'اضغط للعرض' : null,
              onTap: () => context.push(AppRoutes.superAdminPantry),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              title: 'المقالات تحتاج متابعة',
              card: snapshot!.articles,
              icon: Icons.article_outlined,
              hint: snapshot!.articles.available ? 'اضغط للعرض' : null,
              onTap: () => context.push(AppRoutes.superAdminArticles),
            ),
            const SizedBox(height: 10),
            SuperAdminCountTile(
              key: const Key('sa-feedback-tile'),
              title: superAdminFeedbackQueueTitleAr,
              card: snapshot!.feedback ?? SuperAdminCountCard.ok(0),
              icon: Icons.feedback_outlined,
              hint: 'اضغط للعرض',
              onTap: () => context.push(AppRoutes.superAdminFeedback),
            ),
            const SizedBox(height: 22),
            Text(
              superAdminWebFollowUpSectionAr,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: AppColors.primaryDeep,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              superAdminInternalOrdersAuditNoteAr,
              textAlign: TextAlign.right,
              style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
            ),
            const SizedBox(height: 12),
            if (snapshot!.internalOrders.available) ...[
              SuperAdminCountTile(
                key: const Key('sa-internal-orders-web-tile'),
                title: superAdminInternalOrdersTileTitleAr,
                card: snapshot!.internalOrders,
                icon: Icons.assignment_late_outlined,
                webHandoff: true,
                hint: superAdminInternalOrdersHintAr,
                onTap: () => openSuperAdminWebOrSnack(
                  context,
                  openSuperAdminInternalOrdersWeb,
                ),
                onPrimaryCta: () => openSuperAdminWebOrSnack(
                  context,
                  openSuperAdminInternalOrdersWeb,
                ),
                primaryCtaLabel: superAdminOpenWebPanelAr,
                primaryCtaKey: const Key('sa-internal-orders-open-web'),
              ),
            ],
            if (snapshot!.platformOrdersAvailable) ...[
              const SizedBox(height: 22),
              const Text(
                'ملخص المنصة',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: AppColors.primaryDeep,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  _MiniStat(label: 'مفتوحة', value: snapshot!.openProjects ?? 0),
                  const SizedBox(width: 8),
                  _MiniStat(label: 'قيد التنفيذ', value: snapshot!.inProgressProjects ?? 0),
                  const SizedBox(width: 8),
                  _MiniStat(label: 'مكتملة', value: snapshot!.completedProjects ?? 0),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final int value;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.cardBorder),
        ),
        child: Column(
          children: [
            Text(
              '$value',
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: AppColors.primaryDeep,
              ),
            ),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
