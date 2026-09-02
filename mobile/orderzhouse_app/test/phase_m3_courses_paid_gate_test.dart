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
        'isLockedByPlan': true,
        'canAccess': false,
        'requiredTierCode': 'silver',
        'upgradeRoute': '/dashboard/freelancer/plans',
        'lockCopyAr': {
          'badge': coursePlanLockBadgeAr,
          'message': coursePlanLockMessageAr,
          'cta': coursePlanLockCtaAr,
        },
        'progress': {'totalLessons': 10, 'completedLessons': 0, 'percentage': 0},
      });

      expect(course.requiresPaidMembership, isTrue);
      expect(course.isLockedByPlan, isTrue);
      expect(course.canAccess, isFalse);
      expect(course.isAccessible, isFalse);
      expect(course.requiredTierCode, 'silver');
      expect(course.lockCopyAr.messageOrDefault, coursePlanLockMessageAr);
      expect(course.lockCopyAr.ctaOrDefault, coursePlanLockCtaAr);
      expect(course.upgradeRoute, '/dashboard/freelancer/plans');
      expect(course.statusLabelAr, coursePlanLockBadgeAr);
    });

    test('parses snake_case and lock_copy alias', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '3',
        'title': 'Content Writing',
        'requires_paid_membership': true,
        'is_locked_by_plan': true,
        'can_access': false,
        'upgrade_route': '/dashboard/freelancer/plans',
        'lock_copy': {
          'badge': coursePlanLockBadgeAr,
          'message': coursePlanLockMessageAr,
          'cta': coursePlanLockCtaAr,
        },
      });
      expect(course.isLockedByPlan, isTrue);
      expect(course.canAccess, isFalse);
      expect(course.lockCopyAr.messageOrDefault, contains('باقات أعلى'));
    });

    test('free onboarding course remains accessible', () {
      final course = FreelancerCourseSummary.fromJson({
        'id': '8',
        'title': 'كيفية إنشاء مقال',
        'requiresPaidMembership': false,
        'isLockedByPlan': false,
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
      expect(course.isLockedByPlan, isFalse);
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
          'isLockedByPlan': false,
          'canAccess': true,
        }),
        FreelancerCourseSummary.fromJson({
          'id': '4',
          'title': 'كتابة المحتوى',
          'isLockedByPlan': true,
          'canAccess': false,
        }),
        FreelancerCourseSummary.fromJson({
          'id': '3',
          'title': 'content writing',
          'isLockedByPlan': true,
          'canAccess': false,
        }),
      ];
      expect(countAccessibleFreelancerCourses(courses), 1);
      expect(accessibleFreelancerCourses(courses).single.id, '8');
    });
  });

  group('Course access error mapping', () {
    DioException dioWithCode(String code) {
      return DioException(
        requestOptions: RequestOptions(path: '/freelancer/courses/4'),
        response: Response(
          requestOptions: RequestOptions(path: '/freelancer/courses/4'),
          statusCode: 403,
          data: {
            'code': code,
            'message': 'forbidden',
          },
        ),
      );
    }

    test('COURSE_PLAN_UPGRADE_REQUIRED mapping', () {
      expect(
        mapCourseAccessErrorMessage(dioWithCode(coursePlanUpgradeRequiredCode)),
        coursePlanLockMessageAr,
      );
      expect(
        courseLockCtaForError(dioWithCode(coursePlanUpgradeRequiredCode)),
        coursePlanLockCtaAr,
      );
    });

    test('COURSE_SUBSCRIPTION_REQUIRED legacy mapping', () {
      expect(
        mapCourseAccessErrorMessage(dioWithCode(courseSubscriptionRequiredCode)),
        courseLockMessageAr,
      );
    });

    test('apiErrorMessage prefers publicCode over raw message', () {
      expect(
        apiErrorMessage(dioWithCode(coursePlanUpgradeRequiredCode)),
        coursePlanLockMessageAr,
      );
    });
  });

  group('Locked course UI', () {
    testWidgets('locked card shows badge, message, CTA and does not open', (tester) async {
      var opened = false;
      final course = FreelancerCourseSummary.fromJson({
        'id': '4',
        'title': 'دورة كتابة المحتوى',
        'isLockedByPlan': true,
        'canAccess': false,
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

      expect(find.text(coursePlanLockBadgeAr), findsOneWidget);
      expect(find.text(coursePlanLockMessageAr), findsOneWidget);
      expect(find.text(coursePlanLockCtaAr), findsOneWidget);
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
        'isLockedByPlan': false,
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

      expect(find.text(coursePlanLockBadgeAr), findsNothing);
      expect(find.text(coursePlanLockCtaAr), findsNothing);
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
              message: coursePlanLockMessageAr,
              ctaLabel: coursePlanLockCtaAr,
              onUpgrade: () {},
            ),
          ),
        ),
      );

      expect(find.byKey(const ValueKey('course-detail-lock-message')), findsOneWidget);
      expect(find.text(coursePlanLockCtaAr), findsOneWidget);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });
  });
}
