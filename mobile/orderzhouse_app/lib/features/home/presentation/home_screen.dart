import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../../freelancer/presentation/freelancer_home_screen.dart';
import '../../super_admin/presentation/super_admin_shell.dart';
import 'client_home_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    if (auth.user?.usesSuperAdminExperience == true) {
      return const SuperAdminShell();
    }

    if (auth.user?.usesFreelancerExperience == true) {
      return const FreelancerHomeScreen();
    }

    return const ClientHomeScreen();
  }
}
