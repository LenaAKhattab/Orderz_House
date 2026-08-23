import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/app_branding.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../ads/presentation/home_promo_ads_section.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../home/presentation/home_dashboard_chrome.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../../profile/domain/profile_actions.dart';
import 'freelancer_eligibility_banner.dart';

/// Freelancer home — layout inspired by the marketing home composition,
/// with in-app actions (orders / my orders / plans) instead of guest CTAs.
class FreelancerHomeScreen extends ConsumerWidget {
  const FreelancerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final name = user?.displayName.trim();
    final greetingName = (name != null && name.isNotEmpty) ? name : 'مستقلنا';
    final unreadAsync = ref.watch(unreadNotificationsControllerProvider);
    final unread = unreadAsync.maybeWhen(data: (v) => v, orElse: () => 0);
    final initials = user != null ? profileInitials(user) : 'م';

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      body: Stack(
        children: [
          const HomeAtmosphere(),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            AppBranding.displayNameAr,
                            style: const TextStyle(
                              color: AppColors.primaryDeep,
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                              height: 1.2,
                            ),
                            textAlign: TextAlign.right,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'أهلاً، $greetingName',
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 14,
                              height: 1.4,
                            ),
                            textAlign: TextAlign.right,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    HomeHeaderNotificationButton(unread: unread),
                    const SizedBox(width: 10),
                    HomeHeaderAvatar(
                      initials: initials,
                      onTap: () => context.go(AppRoutes.profile),
                    ),
                  ],
                ),
                const SizedBox(height: 22),
                const Text(
                  'فرص جديدة بانتظارك\nفي سوق الطلبات',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.primaryDeep,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'تصفّح الطلبات المتاحة، قدّم عروضك، وتابع أعمالك من مكان واحد.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.95),
                    fontSize: 14,
                    height: 1.6,
                  ),
                ),
                const SizedBox(height: 18),
                HomePrimaryCta(
                  label: 'تصفح الطلبات الآن',
                  onPressed: () => context.go(AppRoutes.marketplace),
                ),
                const SizedBox(height: 12),
                const FreelancerEligibilityBanner(compact: true),
                const HomePromoAdsSection(),
                Row(
                  children: [
                    Expanded(
                      child: HomeActionTile(
                        title: 'طلباتي\nكمستقل',
                        badge: 'أعمالي',
                        icon: Icons.work_outline_rounded,
                        onTap: () => context.go(AppRoutes.myOrders),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: HomeActionTile(
                        title: 'الخدمات\nوالتصنيفات',
                        badge: 'مجالات',
                        icon: Icons.grid_view_rounded,
                        onTap: () => context.push(AppRoutes.services),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                HomeWideActionTile(
                  title: 'المطالبات المالية',
                  subtitle: 'تابع مستحقاتك وحالة الصرف',
                  icon: Icons.account_balance_wallet_outlined,
                  onTap: () => context.push(AppRoutes.freelancerFinancialClaims),
                ),
                const SizedBox(height: 12),
                HomeWideActionTile(
                  title: 'المقالات المصغّرة',
                  subtitle: 'قدّم على المقالات · الرصيد المعلّق غير قابل للسحب مباشرة',
                  icon: Icons.article_outlined,
                  onTap: () => context.push(AppRoutes.freelancerMiniArticles),
                ),
                const SizedBox(height: 12),
                HomeWideActionTile(
                  title: 'مقالاتي',
                  subtitle: 'حالة التدقيق والنشر على Bildazo',
                  icon: Icons.library_books_outlined,
                  onTap: () => context.push(AppRoutes.freelancerMyArticles),
                ),
                const SizedBox(height: 12),
                HomeWideActionTile(
                  title: 'الدورات التدريبية',
                  subtitle: 'أكمل دوراتك المطلوبة للعمل على المنصة',
                  icon: Icons.school_rounded,
                  onTap: () => context.go(AppRoutes.courses),
                ),
                const SizedBox(height: 22),
                const Text(
                  'اختصارات سريعة',
                  style: TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                  textAlign: TextAlign.right,
                ),
                const SizedBox(height: 12),
                HomeCircleShortcutsRow(
                  items: [
                    HomeCircleShortcut(
                      icon: Icons.travel_explore_rounded,
                      label: 'استكشف',
                      accent: AppColors.primary,
                      onTap: () => context.go(AppRoutes.marketplace),
                    ),
                    HomeCircleShortcut(
                      icon: Icons.notifications_active_outlined,
                      label: 'الإشعارات',
                      accent: AppColors.primaryMid,
                      onTap: () => context.push(AppRoutes.notifications),
                    ),
                    HomeCircleShortcut(
                      icon: Icons.school_rounded,
                      label: 'الدورات',
                      accent: const Color(0xFF027A48),
                      onTap: () => context.go(AppRoutes.courses),
                    ),
                    HomeCircleShortcut(
                      icon: Icons.person_outline_rounded,
                      label: 'حسابي',
                      accent: AppColors.primaryDeep,
                      onTap: () => context.go(AppRoutes.profile),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
