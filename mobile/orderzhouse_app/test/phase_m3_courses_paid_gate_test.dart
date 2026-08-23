import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/core/errors/api_error_message.dart';
import 'package:orderzhouse_app/features/courses/data/course_access.dart';
import 'package:orderzhouse_app/features/courses/data/course_models.dart';
import 'package:orderzhouse_app/features/courses/presentation/course_details_screen.dart';
import 'package:orderzhouse_app/features/courses/presentation/courses_screen.dart';

void main() {
  group('FreelancerCourseSummary lock parsing', () {
    test('parses locked premium course fields (camelCase)', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '4',
        'title': 'دورة 2024 - كتابة المحتوى باللغة العربية',
        'requiresPaidMembership': true,
        'isLocked': true,
        'canAccess': false,
        'upgradeRoute': '/dashboard/freelancer/plans',
        'lockCopyAr': {
          'badge': 'يتطلب اشتراك',
          'message': 'يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.',
          'cta': 'اشترك بإحدى الخطط',
        },
        'progress': {'totalLessons': 10, 'completedLessons': 0, 'percentage': 0},
      });

      expect(course.requiresPaidMembership, isTrue);
      expect(course.isLocked, isTrue);
      expect(course.canAccess, isFalse);
      expect(course.isAccessible, isFalse);
      expect(course.lockCopyAr.badgeOrDefault, courseLockBadgeAr);
      expect(course.lockCopyAr.messageOrDefault, courseLockMessageAr);
      expect(course.lockCopyAr.ctaOrDefault, courseLockCtaAr);
      expect(course.upgradeRoute, '/dashboard/freelancer/plans');
      expect(course.statusLabelAr, courseLockBadgeAr);
    });

    test('parses snake_case and lock_copy alias', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '3',
        'title': 'Content Writing',
        'requires_paid_membership': true,
        'is_locked': true,
        'can_access': false,
        'upgrade_route': '/dashboard/freelancer/plans',
        'lock_copy': {
          'badge': 'يتطلب اشتراك',
          'message': 'يجب الاشتراك بإحدى الخطط للوصول إلى هذه الدورة.',
          'cta': 'اشترك بإحدى الخطط',
        },
      });
      expect(course.isLocked, isTrue);
      expect(course.canAccess, isFalse);
      expect(course.lockCopyAr.messageOrDefault, contains('الاشتراك'));
    });

    test('free onboarding course remains accessible', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '8',
        'title': 'كيفية إنشاء مقال',
        'requiresPaidMembership': false,
        'isLocked': false,
        'canAccess': true,
        'progress': {'totalLessons': 1, 'completedLessons': 0, 'percentage': 0},
      });
      expect(course.isAccessible, isTrue);
      expect(course.statusLabelAr, 'لم تبدأ');
    });

    test('missing lock fields stay backward compatible', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '1',
        'title': 'دورة قديمة',
        'progress': {'totalLessons': 2, 'completedLessons': 1, 'percentage': 50},
      });
      expect(course.isLocked, isFalse);
      expect(course.canAccess, isTrue);
      expect(course.requiresPaidMembership, isFalse);
      expect(course.isAccessible, isTrue);
      expect(course.statusLabelAr, 'قيد التقدّم');
    });

    test('isLocked without canAccess defaults canAccess to false', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '9',
        'title': 'Locked teaser',
        'isLocked': true,
      });
      expect(course.canAccess, isFalse);
      expect(course.isAccessible, isFalse);
    });

    test('accessible counter excludes locked courses', () {
      final courses = [
        FreelancerCourseSummary.fromJson({
          'id': '8',
          'title': 'كيفية إنشاء مقال',
          'isLocked': false,
          'canAccess': true,
        }),
        FreelancerCourseSummary.fromJson({
          'id': '4',
          'title': 'كتابة المحتوى',
          'isLocked': true,
          'canAccess': false,
        }),
        FreelancerCourseSummary.fromJson({
          'id': '3',
          'title': 'content writing',
          'isLocked': true,
          'canAccess': false,
        }),
      ];
      expect(countAccessibleFreelancerCourses(courses), 1);
      expect(accessibleFreelancerCourses(courses).single.id, '8');
    });
  });

  group('COURSE_SUBSCRIPTION_REQUIRED mapping', () {
    DioException dioWithCode(String code) {
      return DioException(
        requestOptions: RequestOptions(path: '/freelancer/courses/4'),
        response: Response(
          requestOptions: RequestOptions(path: '/freelancer/courses/4'),
          statusCode: 403,
          data: {
            'publicCode': code,
            'message': 'forbidden',
          },
        ),
      );
    }

    test('mapCourseAccessErrorMessage', () {
      expect(
        mapCourseAccessErrorMessage(dioWithCode(courseSubscriptionRequiredCode)),
        courseLockMessageAr,
      );
    });

    test('apiErrorMessage prefers publicCode over raw message', () {
      expect(
        apiErrorMessage(dioWithCode(courseSubscriptionRequiredCode)),
        courseLockMessageAr,
      );
    });
  });

  group('Locked course UI', () {
    testWidgets('locked card shows badge, message, CTA and does not open', (tester) async {
      var opened = false;
      final course = FreelancerCourseSummary.fromJson({
        'id': '4',
        'title': 'دورة كتابة المحتوى',
        'isLocked': true,
        'canAccess': false,
        'lockCopyAr': {
          'badge': courseLockBadgeAr,
          'message': courseLockMessageAr,
          'cta': courseLockCtaAr,
        },
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FreelancerCourseCard(
              course: course,
              onOpen: () => opened = true,
            ),
          ),
        ),
      );

      expect(find.text(courseLockBadgeAr), findsOneWidget);
      expect(find.text(courseLockMessageAr), findsOneWidget);
      expect(find.text(courseLockCtaAr), findsOneWidget);
      expect(find.byKey(const ValueKey('course-lock-cta')), findsOneWidget);

      await tester.tap(find.text('دورة كتابة المحتوى'));
      await tester.pump();
      expect(opened, isFalse);
    });

    testWidgets('unlocked free course card can open', (tester) async {
      var opened = false;
      final course = FreelancerCourseSummary.fromJson({
        'id': '8',
        'title': 'كيفية إنشاء مقال',
        'isLocked': false,
        'canAccess': true,
        'progress': {'totalLessons': 1, 'completedLessons': 0, 'percentage': 0},
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FreelancerCourseCard(
              course: course,
              onOpen: () => opened = true,
            ),
          ),
        ),
      );

      expect(find.text(courseLockBadgeAr), findsNothing);
      expect(find.text(courseLockCtaAr), findsNothing);
      await tester.tap(find.text('كيفية إنشاء مقال'));
      await tester.pump();
      expect(opened, isTrue);
    });

    testWidgets('detail locked body hides player and shows CTA', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: CourseLockedAccessBody(
              title: 'دورة مقفلة',
              message: courseLockMessageAr,
              ctaLabel: courseLockCtaAr,
              onUpgrade: () {},
            ),
          ),
        ),
      );

      expect(find.byKey(const ValueKey('course-detail-lock-message')), findsOneWidget);
      expect(find.text(courseLockCtaAr), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });
  });
}
