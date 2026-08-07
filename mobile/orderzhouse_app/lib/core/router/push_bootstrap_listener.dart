import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/presentation/auth_controller.dart';
import '../../features/push/data/push_notification_service.dart';
import '../../features/push/navigation/push_pending_navigation.dart';
import 'app_router.dart';

/// Keeps FCM token in sync with auth and applies pending push navigation after login.
class PushBootstrapListener extends ConsumerStatefulWidget {
  const PushBootstrapListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<PushBootstrapListener> createState() => _PushBootstrapListenerState();
}

class _PushBootstrapListenerState extends ConsumerState<PushBootstrapListener> {
  AuthStatus? _lastStatus;

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (_lastStatus == next.status && prev?.user?.id == next.user?.id) return;
      final wasAuthed = prev?.isAuthenticated == true;
      _lastStatus = next.status;
      if (next.isAuthenticated) {
        ref.read(pushNotificationServiceProvider).onAuthenticated();
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final pending = PushPendingNavigation.takeRoute();
          if (pending == null) return;
          ref.read(routerProvider).go(pending);
        });
      } else if (wasAuthed && !next.isAuthenticated) {
        // Access token already cleared — drop local FCM registration only.
        ref.read(pushNotificationServiceProvider).clearLocalFcmToken();
      }
    });
    return widget.child;
  }
}
