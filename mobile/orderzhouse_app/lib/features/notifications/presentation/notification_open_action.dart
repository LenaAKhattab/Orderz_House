import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../super_admin/data/super_admin_models.dart';
import '../data/notification_models.dart';
import '../navigation/notification_action_resolver.dart';

/// Resolves whether a notification bottom sheet should show a safe open action.
NotificationActionTarget? notificationOpenActionTarget({
  required AppNotification notification,
  String? currentUserRole,
}) {
  return resolveNotificationAction(notification, currentUserRole: currentUserRole);
}

/// Navigates using [target.route] only — never [AppNotification.actionUrl].
void openNotificationActionTarget(BuildContext context, NotificationActionTarget target) {
  final route = target.route.trim();
  if (route.isEmpty) return;
  Navigator.of(context).pop();
  context.push(route);
  if (target.showComingSoonMessage) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminComingSoonMessageAr)),
      );
    });
  }
}
