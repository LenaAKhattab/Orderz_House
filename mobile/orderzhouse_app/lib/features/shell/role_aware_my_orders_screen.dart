import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/presentation/auth_controller.dart';
import '../client_orders/presentation/client_my_orders_screen.dart';
import '../freelancer/presentation/freelancer_my_orders_screen.dart';

/// Routes "طلباتي" tab to client or freelancer list based on primary role.
class RoleAwareMyOrdersScreen extends ConsumerWidget {
  const RoleAwareMyOrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    if (!auth.isAuthenticated) {
      return const ClientMyOrdersScreen();
    }

    if (auth.user?.usesFreelancerExperience == true) {
      return const FreelancerMyOrdersScreen();
    }

    return const ClientMyOrdersScreen();
  }
}
