import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/app_branding.dart';
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
    // Push/Firebase must NEVER gate auth routing (iOS hang / APNs / getInitialMessage).
    unawaited(push.initialize());
    try {
      await ref.read(authControllerProvider.notifier).bootstrap();
    } catch (_) {
      // AuthController already maps failures to unauthenticated; keep splash moving.
    }
    if (!mounted) return;

    final auth = ref.read(authControllerProvider);
    // Token registration is non-blocking; PushBootstrapListener also triggers it.
    if (auth.isAuthenticated) {
      unawaited(push.onAuthenticated());
    }

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
    final logoWidth = (MediaQuery.sizeOf(context).width * 0.62).clamp(200.0, 320.0);

    return Scaffold(
      backgroundColor: Colors.white,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.asset(
              AppBranding.fullLogoAsset,
              width: logoWidth,
              fit: BoxFit.contain,
              filterQuality: FilterQuality.high,
            ),
            const SizedBox(height: 28),
            const CircularProgressIndicator(color: AppColors.secondary),
          ],
        ),
      ),
    );
  }
}
