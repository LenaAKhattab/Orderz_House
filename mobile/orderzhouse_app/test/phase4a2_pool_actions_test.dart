import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_pool_actions_api.dart';
import 'package:orderzhouse_app/features/freelancer/data/freelancer_pool_actions_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/pool_order_participation_helpers.dart';
import 'package:orderzhouse_app/features/orders/data/pool_order_models.dart';

void main() {
  group('FreelancerPoolActionsApi', () {
    test('take request sends no body', () async {
      dynamic capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedData = options.data;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'order': {'id': 42, 'title': 'طلب', 'projectType': 'fixed'},
                  },
                },
              ),
            );
          },
        ),
      );
      final api = FreelancerPoolActionsApi(dio);
      await api.takePoolOrder('42');
      expect(capturedData, isNull);
    });

    test('bid request payload excludes identity fields', () async {
      Map<String, dynamic>? capturedData;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            capturedData = options.data as Map<String, dynamic>?;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'order': {'id': 7, 'title': 'مناقصة', 'projectType': 'bidding'},
                  },
                },
              ),
            );
          },
        ),
      );
      final api = FreelancerPoolActionsApi(dio);
      await api.submitPoolBid('7', const SubmitPoolBidPayload(amount: 50, message: 'عرض'));
      expect(capturedData, isNotNull);
      final data = capturedData!;
      expect(data.keys, containsAll(['amount', 'message']));
      expect(data.containsKey('userId'), isFalse);
      expect(data.containsKey('freelancerId'), isFalse);
      expect(data.containsKey('status'), isFalse);
    });
  });

  group('SubmitPoolBidPayload', () {
    test('toJson contains amount and optional message only', () {
      const payload = SubmitPoolBidPayload(amount: 120, message: 'عرضي');
      final json = payload.toJson();
      expect(json.keys, containsAll(['amount', 'message']));
      expect(json.containsKey('userId'), isFalse);
      expect(json.containsKey('freelancerId'), isFalse);
      expect(json.containsKey('status'), isFalse);
      expect(json.containsKey('orderStatus'), isFalse);
      expect(json['amount'], 120);
      expect(json['message'], 'عرضي');
    });

    test('omits empty message', () {
      const payload = SubmitPoolBidPayload(amount: 50);
      final json = payload.toJson();
      expect(json.keys, ['amount']);
    });
  });

  group('Bid amount validation', () {
    test('rejects empty amount', () {
      expect(
        validatePoolBidAmount(rawAmount: '', bidBudgetMin: 10, bidBudgetMax: 200),
        isNotNull,
      );
    });

    test('rejects out of range', () {
      expect(
        validatePoolBidAmount(rawAmount: '5', bidBudgetMin: 10, bidBudgetMax: 100),
        contains('نطاق'),
      );
    });

    test('accepts valid in-range amount', () {
      expect(
        validatePoolBidAmount(rawAmount: '50', bidBudgetMin: 10, bidBudgetMax: 100),
        isNull,
      );
    });
  });

  group('Take response parsing', () {
    test('fromResponse parses order after take', () {
      final order = PoolOrder.fromResponse({
        'success': true,
        'data': {
          'order': {
            'id': 3,
            'title': 'تصميم',
            'projectType': 'fixed',
            'hasAssignedFreelancer': true,
            'receivedAt': '2026-01-01T00:00:00.000Z',
          },
        },
      });
      expect(isPoolOrderTakenAsAssignment(order), isTrue);
    });

    test('participation registered without assignment', () {
      const order = PoolOrder(
        id: '1',
        title: 'طلب',
        projectType: 'fixed',
        myBid: PoolMyParticipation(id: '9', status: 'pending'),
      );
      expect(isPoolOrderTakenAsAssignment(order), isFalse);
      expect(poolParticipationStatusLabelAr(order), contains('مشاركتك'));
    });
  });

  group('Role action visibility', () {
    test('guest/client/freelancer flags', () {
      const guest = null;
      const client = AuthUser(id: '1', email: 'c@x.com', primaryRole: 'client', roles: ['client']);
      const freelancer = AuthUser(id: '2', email: 'f@x.com', primaryRole: 'freelancer', roles: ['freelancer']);

      expect(guest == null, isTrue);
      expect(client.usesClientExperience, isTrue);
      expect(client.usesFreelancerExperience, isFalse);
      expect(freelancer.usesFreelancerExperience, isTrue);
      expect(freelancer.usesClientExperience, isFalse);
    });

    test('plan lock blocks actions', () {
      const order = PoolOrder(
        id: '1',
        title: 'طلب',
        projectType: 'fixed',
        poolEligibility: PoolPlanEligibility(isLockedByPlan: true),
      );
      expect(poolFreelancerCanTakeOrBid(order), isFalse);
      expect(isPoolOrderLockedByPlan(order), isTrue);
    });

    test('bidding with pending bid blocks repeat', () {
      const order = PoolOrder(
        id: '1',
        title: 'طلب',
        projectType: 'bidding',
        myBid: PoolMyParticipation(status: 'pending'),
      );
      expect(poolFreelancerCanTakeOrBid(order), isFalse);
    });
  });

  group('Pool participation parsing', () {
    test('parses myBid and poolEligibility from detail json', () {
      final order = PoolOrder.fromJson({
        'id': 10,
        'title': 'مناقصة',
        'projectType': 'bidding',
        'poolEligibility': {'isLockedByPlan': false},
        'myBid': {'id': '5', 'status': 'pending', 'amount': 80},
      });
      expect(order.myBid?.status, 'pending');
      expect(order.isPlanLocked, isFalse);
    });
  });
}
