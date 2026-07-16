import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/app_brand_mark.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../push/data/push_notification_service.dart';
import '../../push/navigation/push_pending_navigation.dart';
import '../presentation/auth_controller.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrap());
  }

  Future<void> _bootstrap() async {
    final push = ref.read(pushNotificationServiceProvider);
    await Future.wait([
      ref.read(authControllerProvider.notifier).bootstrap(),
      push.initialize(),
    ]);
    if (!mounted) return;
    final auth = ref.read(authControllerProvider);
    if (auth.isAuthenticated) {
      await push.onAuthenticated();
    }
    if (!mounted) return;
    final pending = PushPendingNavigation.takeRoute();
    if (pending != null) {
      if (auth.isAuthenticated) {
        context.go(pending);
      } else {
        context.go(AppRoutes.loginWithRedirect(pending));
      }
      return;
    }
    context.go(auth.isAuthenticated ? AppRoutes.home : AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const AppBrandMark(showWhitePlate: true, size: 76),
            const SizedBox(height: 24),
            const CircularProgressIndicator(color: AppColors.secondary),
          ],
        ),
      ),
    );
  }
}
