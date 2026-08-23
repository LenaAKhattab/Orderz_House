import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/super_admin/data/super_admin_api.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_controllers.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_kyc_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_queue_screens.dart';

class A24FakeSuperAdminApi extends SuperAdminApi {
  A24FakeSuperAdminApi() : super(Dio());

  int kycCalls = 0;
  int subscriptionCalls = 0;
  Duration kycDelay = Duration.zero;
  Duration subscriptionDelay = Duration.zero;
  bool kycFails = false;
  bool subscriptionFails = false;
  List<Map<String, dynamic>> kycItems = [];

  @override
  Future<dynamic> fetchKycActivationRequests({
    String? status = 'pending_review',
    int page = 1,
    int limit = 50,
  }) async {
    kycCalls++;
    if (kycDelay > Duration.zero) await Future<void>.delayed(kycDelay);
    if (kycFails) throw DioException(requestOptions: RequestOptions(path: '/kyc'));
    return {
      'data': {
        'schemaReady': true,
        'items': kycItems,
        'total': kycItems.length,
      },
    };
  }

  @override
  Future<dynamic> fetchActivationQueue({int page = 1, int limit = 20}) async {
    subscriptionCalls++;
    if (subscriptionDelay > Duration.zero) await Future<void>.delayed(subscriptionDelay);
    if (subscriptionFails) throw DioException(requestOptions: RequestOptions(path: '/subs'));
    return {
      'data': {
        'subscriptions': [],
        'pagination': {'total': 0},
      },
    };
  }
}

Map<String, dynamic> _kycItem(int i) => {
      'id': '$i',
      'freelancerUserId': 'f$i',
      'status': 'pending_review',
      'freelancerName': 'مستقل $i',
      'freelancerEmail': 'user$i@test.com',
      'submittedAt': '2026-08-01T10:00:00Z',
    };

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('A2.4 identity queue provider', () {
    test('renders 13 mocked pending requests without waiting for subscription', () async {
      final api = A24FakeSuperAdminApi()
        ..kycItems = List.generate(13, _kycItem)
        ..subscriptionDelay = const Duration(seconds: 30);

      final container = ProviderContainer(overrides: [superAdminApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);

      final future = container.read(superAdminIdentityQueueProvider.future);
      await future;

      expect(api.kycCalls, 1);
      expect(api.subscriptionCalls, 0);
      final snap = container.read(superAdminIdentityQueueProvider).value!;
      expect(snap.pendingItems, hasLength(13));
      expect(snap.loadFailed, isFalse);
    });

    test('shows cards when KYC succeeds and subscription would fail', () async {
      final api = A24FakeSuperAdminApi()
        ..kycItems = [_kycItem(1)]
        ..subscriptionFails = true;

      final container = ProviderContainer(overrides: [superAdminApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);

      final snap = await container.read(superAdminIdentityQueueProvider.future);
      expect(snap.pendingItems, hasLength(1));
      expect(snap.loadFailed, isFalse);
      expect(api.subscriptionCalls, 0);
    });

    test('retry state when KYC fails and no data exists', () async {
      final api = A24FakeSuperAdminApi()..kycFails = true;

      final container = ProviderContainer(overrides: [superAdminApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);

      final snap = await container.read(superAdminIdentityQueueProvider.future);
      expect(snap.pendingItems, isEmpty);
      expect(snap.loadFailed, isTrue);
    });

    test('combined activation queue loads KYC and subscription in parallel', () async {
      final api = A24FakeSuperAdminApi()
        ..kycItems = [_kycItem(1)]
        ..kycDelay = const Duration(milliseconds: 50)
        ..subscriptionDelay = const Duration(milliseconds: 50);

      final container = ProviderContainer(overrides: [superAdminApiProvider.overrideWithValue(api)]);
      addTearDown(container.dispose);

      final sw = Stopwatch()..start();
      await container.read(superAdminActivationQueueProvider.future);
      sw.stop();

      expect(api.kycCalls, 1);
      expect(api.subscriptionCalls, 1);
      expect(sw.elapsedMilliseconds, lessThan(180));
    });
  });

  group('A2.4 identity queue UI', () {
    testWidgets('renders KYC cards and does not fetch document bytes', (tester) async {
      final api = A24FakeSuperAdminApi()
        ..kycItems = List.generate(13, _kycItem)
        ..kycDelay = const Duration(milliseconds: 100)
        ..subscriptionDelay = const Duration(seconds: 30);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminIdentityQueueScreen()),
        ),
      );

      await tester.pump();
      expect(find.byType(OhLikeLoading), findsOneWidget);

      await tester.pumpAndSettle();
      expect(api.subscriptionCalls, 0);
      expect(find.text('قيد المراجعة'), findsWidgets);
      expect(find.text('مستقل 1'), findsOneWidget);
      expect(find.textContaining('user1@test.com'), findsOneWidget);
      expect(find.byKey(const Key('sa-kyc-queue-1')), findsOneWidget);
    });

    testWidgets('shows retry when KYC fails', (tester) async {
      final api = A24FakeSuperAdminApi()..kycFails = true;

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminIdentityQueueScreen()),
        ),
      );

      await tester.pumpAndSettle();
      expect(find.textContaining('تعذّر تحميل طلبات التوثيق'), findsOneWidget);
      expect(find.text('إعادة المحاولة'), findsOneWidget);
    });

    testWidgets('no blank screen when KYC data exists', (tester) async {
      final api = A24FakeSuperAdminApi()..kycItems = [_kycItem(7), _kycItem(8)];

      await tester.pumpWidget(
        ProviderScope(
          overrides: [superAdminApiProvider.overrideWithValue(api)],
          child: const MaterialApp(home: SuperAdminIdentityQueueScreen()),
        ),
      );

      await tester.pumpAndSettle();
      expect(find.byType(OhLikeLoading), findsNothing);
      expect(find.text('مستقل 7'), findsOneWidget);
      expect(find.text('مستقل 8'), findsOneWidget);
    });
  });

  group('A2.4 KYC list card metadata', () {
    test('badge uses قيد المراجعة for pending_review', () {
      final item = SuperAdminKycActivationItem.fromJson(_kycItem(1));
      expect(kycStatusLabelAr(item.status), 'قيد المراجعة');
      expect(item.isPendingReview, isTrue);
    });
  });
}
