import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/app_branding.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../ads/presentation/home_promo_ads_section.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import '../../profile/domain/profile_actions.dart';
import 'home_dashboard_chrome.dart';

/// Client home — same chrome as freelancer home, with client actions.
class ClientHomeScreen extends ConsumerWidget {
  const ClientHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final name = user?.displayName.trim();
    final greetingName = (name != null && name.isNotEmpty) ? name : 'عميلنا';
    final unreadAsync = ref.watch(unreadNotificationsControllerProvider);
    final unread = unreadAsync.maybeWhen(data: (v) => v, orElse: () => 0);
    final initials = user != null ? profileInitials(user) : 'ع';

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
                const SizedBox(height: 18),
                HomeSearchField(
                  hint: 'ابحث عن خدمة أو تصنيف...',
                  onTap: () => context.push(AppRoutes.services),
                ),
                const SizedBox(height: 22),
                const Text(
                  'أنجز طلباتك باحتراف\nمن مكان واحد',
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
                  'أنشئ طلبك، تابع التنفيذ مع المستقلين، وادفع بأمان بسهولة.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.95),
                    fontSize: 14,
                    height: 1.6,
                  ),
                ),
                const SizedBox(height: 18),
                HomePrimaryCta(
                  label: 'إنشاء طلب جديد',
                  onPressed: () => context.push(AppRoutes.clientCreateOrder),
                ),
                const SizedBox(height: 18),
                const HomePromoAdsSection(),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: HomeActionTile(
                        title: 'طلباتي\nكعميل',
                        badge: 'متابعة',
                        icon: Icons.receipt_long_outlined,
                        onTap: () => context.go(AppRoutes.myOrders),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: HomeActionTile(
                        title: 'الخدمات\nوالتصنيفات',
                        badge: 'تصفح',
                        icon: Icons.grid_view_rounded,
                        onTap: () => context.push(AppRoutes.services),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                HomeWideActionTile(
                  title: 'من نحن',
                  subtitle: 'تعرّف على أوردرز هاوس وكيف نعمل',
                  icon: Icons.article_outlined,
                  onTap: () => context.push(AppRoutes.publicPagePath('about')),
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
                Row(
                  children: [
                    Expanded(
                      child: HomeInfoChipCard(
                        icon: Icons.add_circle_outline_rounded,
                        title: 'طلب جديد',
                        subtitle: 'ابدأ مشروعك الآن',
                        accent: AppColors.primary,
                        onTap: () => context.push(AppRoutes.clientCreateOrder),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: HomeInfoChipCard(
                        icon: Icons.notifications_active_outlined,
                        title: 'الإشعارات',
                        subtitle: 'تابع المستجدات',
                        accent: AppColors.primaryMid,
                        onTap: () => context.push(AppRoutes.notifications),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: HomeInfoChipCard(
                        icon: Icons.storefront_rounded,
                        title: 'سوق الطلبات',
                        subtitle: 'اطّلع على الفرص',
                        accent: const Color(0xFF027A48),
                        onTap: () => context.go(AppRoutes.marketplace),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: HomeInfoChipCard(
                        icon: Icons.person_outline_rounded,
                        title: 'حسابي',
                        subtitle: 'الملف والإعدادات',
                        accent: AppColors.primaryDeep,
                        onTap: () => context.go(AppRoutes.profile),
                      ),
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
