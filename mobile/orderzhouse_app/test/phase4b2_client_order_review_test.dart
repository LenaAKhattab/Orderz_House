import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_review_api.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_review_models.dart';

void main() {
  group('SubmitClientOrderReviewPayload', () {
    test('toJson contains rating and optional reviewText only', () {
      const payload = SubmitClientOrderReviewPayload(
        rating: 5,
        reviewText: 'تجربة ممتازة مع المستقل',
      );
      final json = payload.toJson();
      expect(json.keys, containsAll(['rating', 'reviewText']));
      expect(json.containsKey('userId'), isFalse);
      expect(json.containsKey('freelancerId'), isFalse);
      expect(json.containsKey('status'), isFalse);
      expect(json.containsKey('orderStatus'), isFalse);
      expect(json['rating'], 5);
    });

    test('omits empty reviewText', () {
      const payload = SubmitClientOrderReviewPayload(rating: 4);
      expect(payload.toJson().keys, ['rating']);
    });
  });

  group('Review validation', () {
    test('rating required between 1 and 5', () {
      expect(validateClientReviewRating(null), isNotNull);
      expect(validateClientReviewRating(0), isNotNull);
      expect(validateClientReviewRating(6), isNotNull);
      expect(validateClientReviewRating(3), isNull);
    });

    test('reviewText optional but min length when provided', () {
      expect(validateClientReviewText(''), isNull);
      expect(validateClientReviewText('قصير'), isNotNull);
      expect(validateClientReviewText('تجربة جيدة جداً'), isNull);
    });
  });

  group('canReview rules', () {
    test('submit only when completed with freelancer', () {
      expect(
        clientOrderEligibleForReviewSubmit(
          orderStatus: 'completed',
          hasAssignedFreelancer: true,
        ),
        isTrue,
      );
      expect(
        clientOrderEligibleForReviewSubmit(
          orderStatus: 'pending_client_review',
          hasAssignedFreelancer: true,
        ),
        isFalse,
      );
    });

    test('section visible for client even before completed', () {
      expect(
        clientCanShowFreelancerReviewSection(
          isClient: true,
          orderStatus: 'in_progress',
          hasAssignedFreelancer: true,
        ),
        isTrue,
      );
      expect(
        clientCanShowFreelancerReviewSection(
          isClient: false,
          orderStatus: 'completed',
          hasAssignedFreelancer: true,
        ),
        isFalse,
      );
    });
  });

  group('Review status parsing', () {
    test('fromResponse parses existing review', () {
      final status = ClientOrderReviewStatus.fromResponse({
        'success': true,
        'data': {
          'canSubmit': false,
          'freelancerName': 'أحمد م.',
          'existingReview': {
            'id': '9',
            'rating': 5,
            'reviewText': 'عمل رائع ومتقن',
            'canEdit': false,
          },
        },
      });
      expect(status.canSubmit, isFalse);
      expect(status.existingReview?.rating, 5);
      expect(status.existingReview?.reviewText, 'عمل رائع ومتقن');
      expect(status.freelancerName, 'أحمد م.');
    });
  });

  group('ClientOrderReviewApi', () {
    test('submit posts rating payload without identity fields', () async {
      Map<String, dynamic>? captured;
      final dio = Dio(BaseOptions(baseUrl: 'http://test'));
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            captured = options.data as Map<String, dynamic>?;
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 201,
                data: {
                  'success': true,
                  'data': {
                    'review': {
                      'id': '1',
                      'rating': 5,
                      'reviewText': 'ممتاز جداً فعلاً',
                      'canEdit': true,
                    },
                  },
                },
              ),
            );
          },
        ),
      );

      final api = ClientOrderReviewApi(dio);
      final review = await api.submitReview(
        '12',
        const SubmitClientOrderReviewPayload(rating: 5, reviewText: 'ممتاز جداً فعلاً'),
      );

      expect(captured, isNotNull);
      final body = captured!;
      expect(body.keys, containsAll(['rating', 'reviewText']));
      expect(body.containsKey('userId'), isFalse);
      expect(body.containsKey('status'), isFalse);
      expect(review.rating, 5);
    });

    test('approve-like GET has no body', () async {
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
                  'data': {'canSubmit': true, 'freelancerName': 'سارة'},
                },
              ),
            );
          },
        ),
      );

      final api = ClientOrderReviewApi(dio);
      final status = await api.fetchReviewStatus('8');
      expect(capturedData, isNull);
      expect(status.canSubmit, isTrue);
    });
  });

  group('Role visibility', () {
    test('client role can show review section', () {
      const client = AuthUser(id: '1', email: 'c@x.com', primaryRole: 'client', roles: ['client']);
      const freelancer = AuthUser(id: '2', email: 'f@x.com', primaryRole: 'freelancer', roles: ['freelancer']);
      expect(client.usesClientExperience, isTrue);
      expect(freelancer.usesClientExperience, isFalse);
    });

    test('completed order without files still parses', () {
      final order = ClientOrder.fromJson({
        'id': '1',
        'title': 'طلب',
        'orderStatus': 'completed',
        'hasAssignedFreelancer': true,
      });
      expect(order.orderStatus, 'completed');
      expect(
        clientOrderEligibleForReviewSubmit(
          orderStatus: order.orderStatus,
          hasAssignedFreelancer: order.hasAssignedFreelancer,
        ),
        isTrue,
      );
    });
  });
}
