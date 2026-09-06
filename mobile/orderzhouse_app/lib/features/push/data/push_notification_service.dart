import 'dart:async';
import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../notifications/data/notification_models.dart';
import '../../notifications/navigation/notification_action_resolver.dart';
import '../../notifications/presentation/unread_notifications_controller.dart';
import 'device_token_repository.dart';
import '../navigation/push_pending_navigation.dart';

const kOrderzPushChannelId = 'orderzhouse_default';
const kOrderzPushChannelName = 'Orderz House';

const _kApnsRetryAttempts = 10;
const _kApnsRetryDelay = Duration(seconds: 1);

/// Safe push registration diagnostics — never contains full tokens or secrets.
class PushRegistrationDiagnostics {
  const PushRegistrationDiagnostics({
    required this.platform,
    required this.permissionStatus,
    required this.firebaseReady,
    required this.apnsTokenPresent,
    required this.fcmTokenPresent,
    required this.backendRegisterAttempted,
    required this.backendRegisterSuccess,
    required this.apiHost,
    this.backendStatusCode,
    this.errorCode,
    this.errorMessage,
    this.tokenMasked,
  });

  final String platform;
  final String permissionStatus;
  final bool firebaseReady;
  final bool apnsTokenPresent;
  final bool fcmTokenPresent;
  final bool backendRegisterAttempted;
  final bool backendRegisterSuccess;
  final String apiHost;
  final int? backendStatusCode;
  final String? errorCode;
  final String? errorMessage;
  final String? tokenMasked;

  /// Arabic summary for SnackBar / Dialog (TestFlight-readable).
  String toUserSummary() {
    final lines = <String>[
      'المنصة: $platform',
      'إذن الإشعارات: $permissionStatus',
      'Firebase جاهز: ${firebaseReady ? 'نعم' : 'لا'}',
      if (platform == 'ios') 'APNs موجود: ${apnsTokenPresent ? 'نعم' : 'لا'}',
      'FCM موجود: ${fcmTokenPresent ? 'نعم' : 'لا'}',
      'محاولة التسجيل: ${backendRegisterAttempted ? 'نعم' : 'لا'}',
      'تسجيل السيرفر: ${backendRegisterSuccess ? 'نجح' : 'فشل/لم يتم'}',
      if (backendStatusCode != null) 'رمز السيرفر: $backendStatusCode',
      'API: $apiHost',
      if (tokenMasked != null && tokenMasked!.isNotEmpty) 'Token: $tokenMasked',
      if (errorCode != null && errorCode!.isNotEmpty) 'رمز الخطأ: $errorCode',
      if (errorMessage != null && errorMessage!.isNotEmpty) 'الخطأ: $errorMessage',
    ];
    return lines.join('\n');
  }
}

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
  bool _registerInFlight = false;

  bool get isReady => _firebaseReady;

  Future<void> initialize() async {
    if (_initialized || kIsWeb) return;
    _initialized = true;

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp()
            .timeout(const Duration(seconds: 8));
      }
      _messaging = FirebaseMessaging.instance;
      await _ensureAndroidChannel();
      _firebaseReady = true;
    } catch (e) {
      _firebaseReady = false;
      _safeLog('Firebase unavailable — in-app notifications only.');
      return;
    }

    try {
      _onMessageSub = FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_onOpened);
      _tokenRefreshSub = _messaging!.onTokenRefresh.listen((token) async {
        final auth = _ref.read(authControllerProvider);
        if (!auth.isAuthenticated) return;
        _safeLog(
          'onTokenRefresh fcm present=${token.isNotEmpty} masked=${_maskToken(token)}',
        );
        await _registerTokenQuietly(token);
      });

      final initial = await _messaging!
          .getInitialMessage()
          .timeout(const Duration(seconds: 3));
      if (initial != null) {
        _queueNavigationFromMessage(initial);
      }
    } catch (e) {
      _safeLog('push listeners/initialMessage failed: ${e.runtimeType}');
    }
  }

  /// Call after successful login / session bootstrap. Never before auth.
  Future<void> onAuthenticated() async {
    if (!_firebaseReady || _messaging == null) return;
    final auth = _ref.read(authControllerProvider);
    if (!auth.isAuthenticated) return;
    if (_registerInFlight) return;
    _registerInFlight = true;

    try {
      final settings = await _requestPermissionIfNeeded();
      _safeLog('permission status=${settings?.authorizationStatus.name ?? 'unknown'}');

      // iOS: FCM getToken() is unreliable until APNs token is available.
      if (!kIsWeb && Platform.isIOS) {
        final apnsReady = await _waitForApnsToken();
        if (!apnsReady) {
          _safeLog('apns present=false after $_kApnsRetryAttempts attempts — skip getToken');
          return;
        }
      }

      try {
        final token = await _messaging!.getToken();
        final present = token != null && token.isNotEmpty;
        _safeLog(
          'fcm present=$present${present ? ' masked=${_maskToken(token)}' : ''}',
        );
        if (!present) {
          _safeLog('getToken returned null/empty — not registering');
          return;
        }
        await _registerTokenQuietly(token);
      } catch (e) {
        _safeLog('getToken/register failed: ${e.runtimeType}');
      }
    } finally {
      _registerInFlight = false;
    }
  }

  /// Temporary TestFlight diagnostic — runs full register path and returns safe fields.
  Future<PushRegistrationDiagnostics> runRegistrationDiagnostics() async {
    final platform = _currentPlatform();
    final apiHost = _safeApiHost();

    await initialize();

    final auth = _ref.read(authControllerProvider);
    if (!auth.isAuthenticated) {
      return PushRegistrationDiagnostics(
        platform: platform,
        permissionStatus: 'unknown',
        firebaseReady: _firebaseReady,
        apnsTokenPresent: false,
        fcmTokenPresent: false,
        backendRegisterAttempted: false,
        backendRegisterSuccess: false,
        apiHost: apiHost,
        errorCode: 'NOT_AUTHENTICATED',
        errorMessage: 'يجب تسجيل الدخول أولًا',
      );
    }

    if (!_firebaseReady || _messaging == null) {
      return PushRegistrationDiagnostics(
        platform: platform,
        permissionStatus: 'unknown',
        firebaseReady: false,
        apnsTokenPresent: false,
        fcmTokenPresent: false,
        backendRegisterAttempted: false,
        backendRegisterSuccess: false,
        apiHost: apiHost,
        errorCode: 'FIREBASE_UNAVAILABLE',
        errorMessage: 'Firebase غير متاح على هذا الجهاز',
      );
    }

    String permissionStatus = 'unknown';
    var apnsPresent = false;
    var fcmPresent = false;
    var registerAttempted = false;
    var registerSuccess = false;
    int? statusCode;
    String? errorCode;
    String? errorMessage;
    String? tokenMasked;

    try {
      final settings = await _messaging!.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      _permissionAskedThisSession = true;
      permissionStatus = settings.authorizationStatus.name;
      if (!kIsWeb && Platform.isAndroid) {
        await _local
            .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
            ?.requestNotificationsPermission();
      }
    } catch (e) {
      permissionStatus = 'error';
      errorCode = 'PERMISSION_ERROR';
      errorMessage = _safeErrorMessage(e);
    }

    if (!kIsWeb && Platform.isIOS) {
      apnsPresent = await _waitForApnsToken();
      if (!apnsPresent) {
        errorCode ??= 'APNS_MISSING';
        errorMessage ??= 'APNs token غير متاح بعد المحاولات';
        final result = PushRegistrationDiagnostics(
          platform: platform,
          permissionStatus: permissionStatus,
          firebaseReady: _firebaseReady,
          apnsTokenPresent: false,
          fcmTokenPresent: false,
          backendRegisterAttempted: false,
          backendRegisterSuccess: false,
          apiHost: apiHost,
          errorCode: errorCode,
          errorMessage: errorMessage,
        );
        _safeLog('diagnostics:\n${result.toUserSummary()}');
        return result;
      }
    } else {
      // Android / other: APNs N/A — treat as present for summary clarity.
      apnsPresent = true;
    }

    try {
      final token = await _messaging!.getToken();
      fcmPresent = token != null && token.isNotEmpty;
      if (!fcmPresent) {
        errorCode ??= 'FCM_MISSING';
        errorMessage ??= 'FCM getToken رجع فارغًا';
      } else {
        tokenMasked = _maskToken(token);
        registerAttempted = true;
        try {
          await _tokens.registerToken(token: token, platform: platform);
          registerSuccess = true;
          _safeLog('diagnostics register success platform=$platform masked=$tokenMasked');
        } on DioException catch (e) {
          statusCode = e.response?.statusCode;
          errorCode = e.type.name;
          errorMessage = _safeErrorMessage(e);
          _safeLog(
            'diagnostics register DioFailure status=$statusCode type=${e.type.name}',
          );
        } catch (e) {
          errorCode = e.runtimeType.toString();
          errorMessage = _safeErrorMessage(e);
          _safeLog('diagnostics register failure type=${e.runtimeType}');
        }
      }
    } catch (e) {
      errorCode ??= 'GET_TOKEN_FAILED';
      errorMessage ??= _safeErrorMessage(e);
    }

    final result = PushRegistrationDiagnostics(
      platform: platform,
      permissionStatus: permissionStatus,
      firebaseReady: _firebaseReady,
      apnsTokenPresent: apnsPresent,
      fcmTokenPresent: fcmPresent,
      backendRegisterAttempted: registerAttempted,
      backendRegisterSuccess: registerSuccess,
      apiHost: apiHost,
      backendStatusCode: statusCode,
      errorCode: errorCode,
      errorMessage: errorMessage,
      tokenMasked: tokenMasked,
    );
    _safeLog('diagnostics:\n${result.toUserSummary()}');
    return result;
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

  Future<NotificationSettings?> _requestPermissionIfNeeded() async {
    if (_messaging == null) return null;
    try {
      if (!_permissionAskedThisSession) {
        _permissionAskedThisSession = true;
        final settings = await _messaging!.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
        if (!kIsWeb && Platform.isAndroid) {
          await _local
              .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
              ?.requestNotificationsPermission();
        }
        return settings;
      }
      return _messaging!.getNotificationSettings();
    } catch (_) {
      // Denied — app keeps working with in-app notifications.
      return null;
    }
  }

  /// iOS-only: wait until APNs device token is ready (required before FCM getToken).
  Future<bool> _waitForApnsToken() async {
    final messaging = _messaging;
    if (messaging == null) return false;

    for (var attempt = 1; attempt <= _kApnsRetryAttempts; attempt++) {
      try {
        final apns = await messaging.getAPNSToken();
        final present = apns != null && apns.isNotEmpty;
        if (present) {
          _safeLog('apns present=true attempt=$attempt');
          return true;
        }
        _safeLog('apns present=false attempt=$attempt');
      } catch (e) {
        _safeLog('getAPNSToken error attempt=$attempt type=${e.runtimeType}');
      }
      if (attempt < _kApnsRetryAttempts) {
        await Future<void>.delayed(_kApnsRetryDelay);
      }
    }
    return false;
  }

  Future<void> _registerTokenQuietly(String token) async {
    final auth = _ref.read(authControllerProvider);
    if (!auth.isAuthenticated) return;
    final platform = _currentPlatform();
    try {
      await _tokens.registerToken(token: token, platform: platform);
      _safeLog(
        'register endpoint success platform=$platform masked=${_maskToken(token)}',
      );
    } catch (e) {
      _safeLog(
        'register endpoint failure platform=$platform type=${e.runtimeType}',
      );
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

  static String _currentPlatform() {
    if (!kIsWeb && Platform.isIOS) return 'ios';
    if (!kIsWeb && Platform.isAndroid) return 'android';
    return 'web';
  }

  static String _safeApiHost() {
    try {
      final uri = Uri.tryParse(ApiConstants.baseUrl);
      final host = uri?.host.trim() ?? '';
      return host.isEmpty ? 'unknown' : host;
    } catch (_) {
      return 'unknown';
    }
  }

  /// Safe logs visible in debug + release console (no secrets / full tokens).
  static void _safeLog(String message) {
    debugPrint('[push] $message');
  }
}

/// Masks tokens for logs/UI only (first 8 + last 6). Never log full tokens.
String _maskToken(String token) {
  final t = token.trim();
  if (t.length < 14) return '[redacted]';
  return '${t.substring(0, 8)}…${t.substring(t.length - 6)}';
}

String _safeErrorMessage(Object error) {
  if (error is DioException) {
    final code = error.response?.statusCode;
    final raw = (error.response?.data is Map)
        ? (error.response!.data['message'] ?? error.response!.data['code'])
        : null;
    final msg = raw?.toString().trim();
    if (msg != null && msg.isNotEmpty && msg.length < 120 && !_looksLikeToken(msg)) {
      return code != null ? 'HTTP $code: $msg' : msg;
    }
    return code != null ? 'HTTP $code (${error.type.name})' : error.type.name;
  }
  final s = error.toString().replaceAll(RegExp(r'\s+'), ' ').trim();
  if (_looksLikeToken(s)) return error.runtimeType.toString();
  return s.length > 120 ? '${s.substring(0, 117)}…' : s;
}

bool _looksLikeToken(String value) {
  final v = value.trim();
  if (v.length > 40 && RegExp(r'^[A-Za-z0-9_\-:]+$').hasMatch(v)) return true;
  if (v.contains('-----BEGIN')) return true;
  return false;
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
