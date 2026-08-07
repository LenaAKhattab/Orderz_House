import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/presentation/auth_controller.dart';
import '../categories/presentation/services_screen.dart';
import '../courses/presentation/courses_screen.dart';

/// Shell tab 4: courses for freelancers, services for clients.
class RoleAwareCoursesOrServicesTab extends ConsumerWidget {
  const RoleAwareCoursesOrServicesTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    // Courses are freelancer-only; clients (and any non-freelancer role) get services.
    if (user?.usesFreelancerExperience == true) {
      return const CoursesScreen();
    }
    return const ServicesScreen();
  }
}
