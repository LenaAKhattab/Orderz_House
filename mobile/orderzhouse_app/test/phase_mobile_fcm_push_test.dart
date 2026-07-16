import 'package:dio/dio.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/push/data/device_token_api.dart';
import 'package:orderzhouse_app/features/push/data/device_token_repository.dart';
import 'package:orderzhouse_app/features/push/data/push_notification_service.dart';
import 'package:orderzhouse_app/features/push/navigation/push_pending_navigation.dart';

class _FakeDeviceTokenApi extends DeviceTokenApi {
  _FakeDeviceTokenApi() : super(Dio());

  final List<Map<String, dynamic>> registered = [];
  final List<String> deactivated = [];
  int deactivateAllCalls = 0;

  @override
  Future<void> registerPushToken({
    required String token,
    required String platform,
    String? deviceId,
    String? appVersion,
  }) async {
    registered.add({
      'token': token,
      'platform': platform,
      'deviceId': deviceId,
      'appVersion': appVersion,
    });
  }

  @override
  Future<void> deactivatePushToken(String token) async {
    deactivated.add(token);
  }

  @override
  Future<void> deactivateAllPushTokens() async {
    deactivateAllCalls += 1;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    PushPendingNavigation.clear();
  });

  group('DeviceTokenRepository', () {
    test('registerToken persists cache and calls API', () async {
      final api = _FakeDeviceTokenApi();
      final prefs = await SharedPreferences.getInstance();
      final repo = DeviceTokenRepository(api: api, prefs: prefs);

      await repo.registerToken(
        token: 'fcm_token_abcdefghijklmnop',
        platform: 'android',
        appVersion: '1.0.5',
      );

      expect(api.registered, hasLength(1));
      expect(api.registered.first['platform'], 'android');
      expect(await repo.readCachedToken(), 'fcm_token_abcdefghijklmnop');
      expect(DeviceTokenRepository.debugMaskToken('fcm_token_abcdefghijklmnop'), isNot(contains('fcm_token_abcdefghijklmnop')));
    });

    test('deactivateCurrentToken clears cache', () async {
      final api = _FakeDeviceTokenApi();
      final prefs = await SharedPreferences.getInstance();
      final repo = DeviceTokenRepository(api: api, prefs: prefs);
      await repo.cacheToken('fcm_token_abcdefghijklmnop');
      await repo.deactivateCurrentToken();
      expect(api.deactivated, ['fcm_token_abcdefghijklmnop']);
      expect(await repo.readCachedToken(), isNull);
    });

    test('skips register when token too short', () async {
      final api = _FakeDeviceTokenApi();
      final prefs = await SharedPreferences.getInstance();
      final repo = DeviceTokenRepository(api: api, prefs: prefs);
      await repo.registerToken(token: 'short', platform: 'android');
      expect(api.registered, isEmpty);
    });
  });

  group('PushPendingNavigation', () {
    test('rejects unsafe http routes', () {
      PushPendingNavigation.setRoute('https://evil.example/x');
      expect(PushPendingNavigation.peekRoute(), isNull);
      PushPendingNavigation.setRoute('/client/orders/12');
      expect(PushPendingNavigation.takeRoute(), '/client/orders/12');
      expect(PushPendingNavigation.peekRoute(), isNull);
    });
  });

  group('notificationFromRemoteMessage + resolver', () {
    test('tap payload resolves to safe client order route', () {
      final message = RemoteMessage(
        data: {
          'notificationId': '99',
          'type': 'order_update',
          'entityType': 'order',
          'entityId': '55',
          'actionUrl': '/dashboard/client/my-orders?orderId=55',
          'recipientRole': 'client',
        },
      );
      final notification = notificationFromRemoteMessage(message);
      final target = resolveNotificationAction(
        notification,
        currentUserRole: 'client',
      );
      expect(target?.route, AppRoutes.clientOrderPath('55'));
    });

    test('rejects raw https actionUrl', () {
      final message = RemoteMessage(
        data: {
          'actionUrl': 'https://orderzhouse.com/dashboard/client/my-orders?orderId=1',
          'recipientRole': 'client',
        },
      );
      final notification = notificationFromRemoteMessage(message);
      final target = resolveNotificationAction(
        notification,
        currentUserRole: 'client',
      );
      expect(target, isNull);
    });
  });
}
