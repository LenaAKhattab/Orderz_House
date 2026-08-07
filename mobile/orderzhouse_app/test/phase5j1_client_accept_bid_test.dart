import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/utils/stripe_checkout_launcher.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_bid_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_orders_api.dart';

void main() {
  group('ClientOrderBid parsing', () {
    test('parses sanitized bid fields', () {
      final bid = ClientOrderBid.fromJson({
        'id': 42,
        'orderId': 10,
        'amount': 75.5,
        'status': 'pending',
        'message': 'أقدر أنجز خلال أسبوع',
        'createdAt': '2026-07-10T12:00:00.000Z',
        'displayName': 'أحمد المستقل',
      });

      expect(bid.id, '42');
      expect(bid.orderId, '10');
      expect(bid.amount, 75.5);
      expect(bid.message, 'أقدر أنجز خلال أسبوع');
      expect(bid.status, 'pending');
      expect(bid.displayName, 'أحمد المستقل');
      expect(bid.freelancerLabel, 'أحمد المستقل');
      expect(bid.canAccept, isTrue);
      expect(bid.canReject, isTrue);
      expect(bid.statusLabel, 'قيد الانتظار');
    });

    test('falls back to مستقل when displayName missing', () {
      final bid = ClientOrderBid.fromJson({'id': '9', 'status': 'pending'});
      expect(bid.freelancerLabel, 'مستقل');
    });

    test('accepts bidId alias', () {
      final bid = ClientOrderBid.fromJson({'bidId': '88', 'status': 'rejected'});
      expect(bid.id, '88');
      expect(bid.canAccept, isFalse);
      expect(bid.canReject, isFalse);
    });
  });

  group('ClientOrderBidsResult', () {
    test('parses list response', () {
      final result = ClientOrderBidsResult.fromResponse({
        'success': true,
        'data': {
          'bids': [
            {
              'id': 1,
              'amount': 50,
              'status': 'pending',
              'displayName': 'سارة',
              'createdAt': '2026-07-11T08:00:00.000Z',
            },
          ],
          'orderSummary': {'hasOpenPool': true, 'currencyCode': 'JOD'},
        },
      });

      expect(result.hasOpenPool, isTrue);
      expect(result.currencyCode, 'JOD');
      expect(result.bids, hasLength(1));
      expect(result.bids.first.displayName, 'سارة');
      expect(result.bids.first.amount, 50);
    });
  });

  group('AcceptBidResult', () {
    test('parses checkout fields', () {
      final result = AcceptBidResult.fromResponse({
        'success': true,
        'data': {
          'requiresPayment': true,
          'paymentPurpose': 'selected_bid_payment',
          'checkoutUrl': 'https://checkout.stripe.com/c/pay/cs_test_abc',
          'sessionId': 'cs_test_abc',
        },
      });

      expect(result.requiresPayment, isTrue);
      expect(result.paymentPurpose, 'selected_bid_payment');
      expect(result.hasCheckoutUrl, isTrue);
      expect(result.checkoutUrl, contains('cs_test_'));
      expect(result.sessionId, 'cs_test_abc');
    });
  });

  group('ClientOrdersApi bid endpoints', () {
    test('listOrderBids uses GET /client/orders/:id/bids', () async {
      String? path;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            path = options.path;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'bids': [],
                    'orderSummary': {'hasOpenPool': true},
                  },
                },
              ),
            );
          },
        ),
      );

      final api = ClientOrdersApi(dio);
      final result = await api.listOrderBids('21');
      expect(path, '/client/orders/21/bids');
      expect(result.hasOpenPool, isTrue);
    });

    test('acceptOrderBid posts bidId only', () async {
      String? path;
      Map<String, dynamic>? body;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            path = options.path;
            body = options.data as Map<String, dynamic>?;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {
                    'requiresPayment': true,
                    'checkoutUrl': 'https://checkout.stripe.com/c/pay/cs_test_x',
                    'sessionId': 'cs_test_x',
                  },
                },
              ),
            );
          },
        ),
      );

      final api = ClientOrdersApi(dio);
      final result = await api.acceptOrderBid(orderId: '21', bidId: '99');

      expect(path, '/client/orders/21/bids/accept');
      expect(body, isNotNull);
      expect(body!.keys, ['bidId']);
      expect(body!['bidId'], '99');
      expect(body!.containsKey('userId'), isFalse);
      expect(body!.containsKey('clientId'), isFalse);
      expect(body!.containsKey('status'), isFalse);
      expect(result.checkoutUrl, contains('cs_test_'));
    });

    test('rejectOrderBid posts bidId only', () async {
      String? path;
      Map<String, dynamic>? body;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            path = options.path;
            body = options.data as Map<String, dynamic>?;
            handler.resolve(
              Response(
                requestOptions: options,
                data: {
                  'success': true,
                  'data': {'success': true},
                },
              ),
            );
          },
        ),
      );

      final api = ClientOrdersApi(dio);
      await api.rejectOrderBid(orderId: '21', bidId: '77');

      expect(path, '/client/orders/21/bids/reject');
      expect(body!.keys, ['bidId']);
      expect(body!['bidId'], '77');
      expect(body!.containsKey('userId'), isFalse);
      expect(body!.containsKey('clientId'), isFalse);
      expect(body!.containsKey('status'), isFalse);
    });
  });

  group('clientOrderShowsBidsSection', () {
    test('true for bidding project type', () {
      expect(
        clientOrderShowsBidsSection(projectType: 'bidding', orderStatus: 'open_for_bids'),
        isTrue,
      );
    });

    test('false for fixed without bids', () {
      expect(
        clientOrderShowsBidsSection(projectType: 'fixed', orderStatus: 'pending_payment'),
        isFalse,
      );
    });
  });

  group('Stripe live checkout guard helpers', () {
    test('detects cs_live_', () {
      expect(
        isStripeLiveCheckoutUrl('https://checkout.stripe.com/c/pay/cs_live_abc'),
        isTrue,
      );
      expect(
        isStripeLiveCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_abc'),
        isFalse,
      );
    });

    test('detects cs_test_', () {
      expect(
        isStripeTestCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_abc'),
        isTrue,
      );
    });

    test('launchStripeCheckoutUrl blocks cs_live_ in non-release', () async {
      // flutter_test runs with kReleaseMode == false
      final result = await launchStripeCheckoutUrl(
        'https://checkout.stripe.com/c/pay/cs_live_blocked_qa',
      );
      expect(result.launched, isFalse);
      expect(result.blockedLiveCheckout, isTrue);
      expect(result.message, contains('Live'));
    });
  });

  group('Bid card UI labels', () {
    testWidgets('renders freelancer name, amount, and actions', (tester) async {
      final bid = ClientOrderBid.fromJson({
        'id': '5',
        'amount': 120,
        'status': 'pending',
        'message': 'رسالة العرض',
        'createdAt': '2026-07-11T10:00:00.000Z',
        'displayName': 'ليان',
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.rtl,
              child: Column(
                children: [
                  Text(bid.freelancerLabel),
                  Text('${bid.amount!.toStringAsFixed(0)} JOD'),
                  Text(bid.message!),
                  Text(bid.statusLabel),
                  if (bid.canAccept) const Text('قبول العرض'),
                  if (bid.canReject) const Text('رفض العرض'),
                ],
              ),
            ),
          ),
        ),
      );

      expect(find.text('ليان'), findsOneWidget);
      expect(find.text('120 JOD'), findsOneWidget);
      expect(find.text('رسالة العرض'), findsOneWidget);
      expect(find.text('قبول العرض'), findsOneWidget);
      expect(find.text('رفض العرض'), findsOneWidget);
    });
  });
}
