import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/presentation/auth_controller.dart';
import '../../notifications/data/notification_models.dart';
import '../../notifications/navigation/notification_action_resolver.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import 'device_token_repository.dart';
import '../navigation/push_pending_navigation.dart';

const kOrderzPushChannelId = 'orderzhouse_default';
const kOrderzPushChannelName = 'Orderz House';

/// Top-level background handler (must stay outside any class).
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
  } catch (_) {
    // Ignore — OS already displayed the notification payload.
  }
}

/// Optional Firebase + FCM. Safe no-op when Firebase is not configured.
class PushNotificationService {
  PushNotificationService({
    required DeviceTokenRepository tokenRepository,
    required Ref ref,
  })  : _tokens = tokenRepository,
        _ref = ref;

  final DeviceTokenRepository _tokens;
  final Ref _ref;

  FirebaseMessaging? _messaging;
  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _onMessageSub;
  StreamSubscription<RemoteMessage>? _openedSub;
  bool _initialized = false;
  bool _firebaseReady = false;
  bool _permissionAskedThisSession = false;

  bool get isReady => _firebaseReady;

  Future<void> initialize() async {
    if (_initialized || kIsWeb) return;
    _initialized = true;

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
      _messaging = FirebaseMessaging.instance;
      await _ensureAndroidChannel();
      _firebaseReady = true;
    } catch (e) {
      _firebaseReady = false;
      if (kDebugMode) {
        debugPrint('[push] Firebase unavailable — in-app notifications only.');
      }
      return;
    }

    _onMessageSub = FirebaseMessaging.onMessage.listen(_onForegroundMessage);
    _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_onOpened);
    _tokenRefreshSub = _messaging!.onTokenRefresh.listen((token) async {
      final auth = _ref.read(authControllerProvider);
      if (!auth.isAuthenticated) return;
      await _registerTokenQuietly(token);
    });

    final initial = await _messaging!.getInitialMessage();
    if (initial != null) {
      _queueNavigationFromMessage(initial);
    }
  }

  /// Call after successful login / session bootstrap. Never before auth.
  Future<void> onAuthenticated() async {
    if (!_firebaseReady || _messaging == null) return;
    final auth = _ref.read(authControllerProvider);
    if (!auth.isAuthenticated) return;

    await _requestPermissionIfNeeded();
    try {
      final token = await _messaging!.getToken();
      if (token == null || token.isEmpty) return;
      await _registerTokenQuietly(token);
    } catch (_) {
      // Permission denied / Play Services missing — continue with in-app only.
    }
  }

  /// Best-effort deactivate before clearing local session.
  Future<void> onLogout() async {
    try {
      await _tokens.deactivateCurrentToken();
    } catch (_) {}
    await clearLocalFcmToken();
  }

  Future<void> clearLocalFcmToken() async {
    try {
      await _messaging?.deleteToken();
    } catch (_) {}
  }

  Future<void> dispose() async {
    await _tokenRefreshSub?.cancel();
    await _onMessageSub?.cancel();
    await _openedSub?.cancel();
  }

  Future<void> _ensureAndroidChannel() async {
    if (kIsWeb || !Platform.isAndroid) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    await _local.initialize(
      const InitializationSettings(android: android),
    );
    const channel = AndroidNotificationChannel(
      kOrderzPushChannelId,
      kOrderzPushChannelName,
      description: 'تنبيهات Orderz House',
      importance: Importance.high,
    );
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);
  }

  Future<void> _requestPermissionIfNeeded() async {
    if (_permissionAskedThisSession || _messaging == null) return;
    _permissionAskedThisSession = true;
    try {
      await _messaging!.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (!kIsWeb && Platform.isAndroid) {
        await _local
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      }
    } catch (_) {
      // Denied — app keeps working with in-app notifications.
    }
  }

  Future<void> _registerTokenQuietly(String token) async {
    final auth = _ref.read(authControllerProvider);
    if (!auth.isAuthenticated) return;
    final platform = (!kIsWeb && Platform.isIOS)
        ? 'ios'
        : (!kIsWeb && Platform.isAndroid)
            ? 'android'
            : 'web';
    try {
      await _tokens.registerToken(token: token, platform: platform);
    } catch (_) {
      // Network / auth race — ignore; refresh will retry.
    }
  }

  void _onForegroundMessage(RemoteMessage message) {
    // Avoid duplicate tray noise while the app is open — refresh unread badge.
    _ref.invalidate(unreadNotificationsControllerProvider);
  }

  void _onOpened(RemoteMessage message) {
    _queueNavigationFromMessage(message);
  }

  void _queueNavigationFromMessage(RemoteMessage message) {
    final notification = notificationFromRemoteMessage(message);
    final role = _ref.read(authControllerProvider).user?.effectiveRole;
    final target = resolveNotificationAction(notification, currentUserRole: role);
    if (target == null) {
      // Fallback: open notifications list when payload cannot be resolved safely.
      PushPendingNavigation.setRoute('/notifications');
      return;
    }
    PushPendingNavigation.setRoute(target.route);
  }
}

/// Builds a minimal [AppNotification] from FCM data (no sensitive fields).
AppNotification notificationFromRemoteMessage(RemoteMessage message) {
  final data = message.data;
  final n = message.notification;
  return AppNotification(
    id: (data['notificationId'] ?? data['notification_id'] ?? '').toString(),
    title: (n?.title ?? data['title'] ?? 'Orderz House').toString(),
    message: (n?.body ?? data['body'] ?? '').toString(),
    type: _nullable(data['type']),
    entityType: _nullable(data['entityType'] ?? data['entity_type']),
    entityId: _nullable(data['entityId'] ?? data['entity_id'] ?? data['orderId']),
    actionUrl: _nullable(data['actionUrl'] ?? data['link']),
    recipientRole: _nullable(data['recipientRole'] ?? data['role']),
  );
}

String? _nullable(Object? value) {
  final s = value?.toString().trim();
  if (s == null || s.isEmpty) return null;
  return s;
}

final pushNotificationServiceProvider = Provider<PushNotificationService>((ref) {
  final service = PushNotificationService(
    tokenRepository: ref.watch(deviceTokenRepositoryProvider),
    ref: ref,
  );
  ref.onDispose(() {
    unawaited(service.dispose());
  });
  return service;
});
