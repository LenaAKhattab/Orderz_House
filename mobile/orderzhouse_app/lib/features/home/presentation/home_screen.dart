import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../freelancer/presentation/freelancer_home_screen.dart';
import '../../shell/main_shell.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    if (auth.user?.usesFreelancerExperience == true) {
      return const FreelancerHomeScreen();
    }

    final textTheme = Theme.of(context).textTheme;

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'أوردرز هاوس',
                        style: textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.textInk,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'مرحباً، ${auth.user?.displayName ?? 'عميلنا'}',
                        style: textTheme.bodyMedium?.copyWith(color: AppColors.textMuted),
                      ),
                    ],
                  ),
                ),
                const CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.iconChipBg,
                  child: Icon(Icons.person, color: AppColors.primary),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [AppColors.primaryDeep, AppColors.primary, Color(0xFF3D4F78)],
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.22),
                    blurRadius: 24,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'أنجز طلباتك باحتراف',
                    style: textTheme.headlineSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                    textAlign: TextAlign.right,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'اطلب خدمة، تابع التنفيذ، وادفع بأمان — من مكان واحد.',
                    style: textTheme.bodyMedium?.copyWith(
                      color: Colors.white.withValues(alpha: 0.92),
                      height: 1.6,
                    ),
                    textAlign: TextAlign.right,
                  ),
                  const SizedBox(height: 16),
                  if (auth.user?.usesClientExperience == true) ...[
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.secondary,
                        foregroundColor: AppColors.primaryDeep,
                      ),
                      onPressed: () => context.go(AppRoutes.myOrders),
                      child: const Text('طلباتي'),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton(
                      onPressed: () => context.push(AppRoutes.clientCreateOrder),
                      child: const Text('إنشاء طلب جديد'),
                    ),
                  ] else ...[
                    FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.secondary,
                        foregroundColor: AppColors.primaryDeep,
                      ),
                      onPressed: () => context.go(AppRoutes.marketplace),
                      child: const Text('تصفح الطلبات المتاحة'),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                HomeQuickAction(
                  icon: Icons.grid_view_rounded,
                  label: 'الخدمات',
                  onTap: () => context.go(AppRoutes.services),
                ),
                const SizedBox(width: 10),
                HomeQuickAction(
                  icon: Icons.storefront_rounded,
                  label: 'سوق الطلبات',
                  onTap: () => context.go(AppRoutes.marketplace),
                ),
                const SizedBox(width: 10),
                HomeQuickAction(
                  icon: Icons.article_outlined,
                  label: 'من نحن',
                  onTap: () => context.push(AppRoutes.publicPagePath('about')),
                ),
              ],
            ),
            const SizedBox(height: 20),
            Text(
              'لماذا أوردرز هاوس؟',
              style: textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textInk,
              ),
            ),
            const SizedBox(height: 10),
            OhCard(
              child: Column(
                children: const [
                  _FeatureRow(
                    icon: Icons.verified_user_outlined,
                    title: 'طلبات موثوقة',
                    subtitle: 'متابعة واضحة من الإنشاء حتى التسليم.',
                  ),
                  Divider(height: 24),
                  _FeatureRow(
                    icon: Icons.payments_outlined,
                    title: 'دفع آمن',
                    subtitle: 'Stripe — قريباً في التطبيق.',
                  ),
                  Divider(height: 24),
                  _FeatureRow(
                    icon: Icons.support_agent_outlined,
                    title: 'دعم عربي',
                    subtitle: 'واجهة RTL وتجربة قريبة من الويب.',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.iconChipBg,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: AppColors.primary),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(subtitle, style: const TextStyle(color: AppColors.textMuted, height: 1.5)),
            ],
          ),
        ),
      ],
    );
  }
}
