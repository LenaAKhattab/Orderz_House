import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/branding/app_brand_mark.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
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
    await ref.read(authControllerProvider.notifier).bootstrap();
    if (!mounted) return;
    final auth = ref.read(authControllerProvider);
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
