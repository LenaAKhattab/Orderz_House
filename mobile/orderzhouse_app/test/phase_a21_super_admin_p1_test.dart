import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/core/router/super_admin_access.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_article_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_article_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_feedback_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_package_models.dart';
import 'package:orderzhouse_app/features/super_admin/presentation/super_admin_action_center_screen.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';

void main() {
  group('A2.1 article review actions', () {
    SuperAdminArticleDetail detailWithStatus(String status) {
      return SuperAdminArticleDetail(
        id: 'a1',
        title: 'مقال',
        applications: [
          SuperAdminArticleApplication(id: 'app1', freelancerName: 'كاتب', status: status),
        ],
      );
    }

    test('shows approve/reject/revision only for reviewable statuses', () {
      final selected = detailWithStatus('selected');
      expect(canFinalizeArticleApproval(selected), isTrue);
      expect(canRequestArticleRevision(selected), isTrue);
      expect(canRejectSelectedArticleApplication(selected), isTrue);

      final pending = detailWithStatus('pending');
      expect(canFinalizeArticleApproval(pending), isFalse);
      expect(canRequestArticleRevision(pending), isFalse);
      expect(canRejectSelectedArticleApplication(pending), isFalse);

      final approved = detailWithStatus('approved');
      expect(canFinalizeArticleApproval(approved), isFalse);
      expect(canRejectSelectedArticleApplication(approved), isFalse);
    });

    test('revision and reject require Arabic notes', () {
      expect(validateArticleRevisionNote(''), superAdminArticleRevisionNoteRequiredAr);
      expect(validateArticleRevisionNote('ab'), superAdminArticleRevisionNoteRequiredAr);
      expect(validateArticleRevisionNote('يرجى التعديل'), isNull);
      expect(validateArticleRejectReason(''), superAdminArticleRejectReasonRequiredAr);
      expect(validateArticleRejectReason('لا'), superAdminArticleRejectReasonRequiredAr);
      expect(validateArticleRejectReason('سبب كافٍ'), isNull);
    });
  });

  group('A2.1 feedback', () {
    test('parses list and new count', () {
      final items = parseFeedbackList({
        'data': {
          'items': [
            {
              'id': 1,
              'userName': 'أحمد',
              'userEmail': 'a@t.com',
              'type': 'problem',
              'subject': 'مشكلة',
              'description': 'نص طويل',
              'status': 'new',
              'createdAt': '2026-01-01T00:00:00Z',
            },
          ],
          'summary': {'new': 3},
        },
      });
      expect(items, hasLength(1));
      expect(items.first.isNew, isTrue);
      expect(feedbackTypeLabelAr(items.first), 'مشكلة');
      expect(parseFeedbackNewCount({'data': {'summary': {'new': 3}}}), 3);
    });

    test('notification title maps feedback to مشاكل واقتراحات', () {
      expect(
        notificationDisplayTitle(type: 'feedback.created', entityType: 'feedback'),
        'مشاكل واقتراحات',
      );
    });

    test('notification routes to feedback list/detail for super admin', () {
      final list = resolveNotificationAction(
        const AppNotification(
          id: '1',
          title: 'ملاحظة جديدة',
          message: 'x',
          type: 'feedback.created',
          entityType: 'feedback',
          actionUrl: '/dashboard/super-admin/feedback',
        ),
        currentUserRole: 'super_admin',
      );
      expect(list?.route, AppRoutes.superAdminFeedback);

      final detail = resolveNotificationAction(
        const AppNotification(
          id: '2',
          title: 'ملاحظة جديدة',
          message: 'x',
          type: 'feedback.created',
          entityType: 'feedback',
          entityId: '9',
          actionUrl: '/dashboard/super-admin/feedback/9',
        ),
        currentUserRole: 'super_admin',
      );
      expect(detail?.route, AppRoutes.superAdminFeedbackDetailPath('9'));
    });

    test('freelancer/client cannot open feedback super-admin route', () {
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminFeedback, effectiveRole: 'freelancer'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminFeedback, effectiveRole: 'client'),
        AppRoutes.home,
      );
      expect(
        superAdminRoleRedirect(location: AppRoutes.superAdminFeedback, effectiveRole: 'admin'),
        AppRoutes.home,
      );
    });

    testWidgets('action center shows feedback tile', (tester) async {
      tester.view.physicalSize = const Size(400, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SuperAdminActionCenterView(
              greetingName: 'مشرف',
              initials: 'م',
              unread: 0,
              snapshot: SuperAdminActionCenterSnapshot(
                identityRequests: const SuperAdminCountCard(available: true, count: 0),
                subscriptionActivations: const SuperAdminCountCard(available: true, count: 0),
                claims: const SuperAdminCountCard(available: true, count: 0),
                unread: const SuperAdminCountCard(available: true, count: 0),
                pantry: const SuperAdminCountCard(available: true, count: 0),
                articles: const SuperAdminCountCard(available: true, count: 0),
                internalOrders: const SuperAdminCountCard(available: false),
                feedback: const SuperAdminCountCard(available: true, count: 2),
              ),
              onRetry: () {},
              onRefresh: () async {},
              onAvatarTap: () {},
            ),
          ),
        ),
      );
      expect(find.byKey(const Key('sa-feedback-tile')), findsOneWidget);
      expect(find.text(superAdminFeedbackQueueTitleAr), findsOneWidget);
    });
  });

  group('A2.1 package filters', () {
    SuperAdminFreelancerListItem item({
      required String id,
      String? activation,
      String? subscriptionStatus = 'active',
      bool assignable = false,
      String? ineligible,
    }) {
      return SuperAdminFreelancerListItem(
        id: id,
        displayName: 'U$id',
        email: '$id@t.com',
        activationStatus: activation,
        assignable: assignable,
        ineligibleReason: ineligible,
        subscriptionStatus: subscriptionStatus,
      );
    }

    test('filters by identity, training, and package', () {
      final items = [
        item(id: '1', activation: 'company_approved', assignable: true),
        item(id: '2', activation: 'company_pending', assignable: false, ineligible: 'training'),
        item(id: '3', activation: null, assignable: false),
      ];

      final verified = applyPackageListFilters(
        items,
        const SuperAdminPackageListFilters(identity: PackageIdentityFilter.verified),
      );
      expect(verified.map((e) => e.id), ['1']);

      final incomplete = applyPackageListFilters(
        items,
        const SuperAdminPackageListFilters(training: PackageTrainingFilter.incomplete),
      );
      expect(incomplete.map((e) => e.id).toList(), containsAll(['2', '3']));

      final byPlan = applyPackageListFilters(
        items,
        const SuperAdminPackageListFilters(packageLabel: 'اشتراك مفعّل'),
      );
      expect(byPlan.map((e) => e.id), ['1']);

      final reset = applyPackageListFilters(items, const SuperAdminPackageListFilters());
      expect(reset, hasLength(3));
    });
  });

  group('package user detail mirrors list card', () {
    test('parseFreelancerPackageDetail uses list item profile fields', () {
      final listItem = SuperAdminFreelancerListItem(
        id: '42',
        displayName: 'يوسف وصفي عيسة',
        email: 'yousefayasi89@gmail.com',
        accountStatus: 'active',
        activationStatus: null,
        subscriptionStatus: null,
        assignable: false,
        ineligibleReason: 'training incomplete',
      );

      final detail = parseFreelancerPackageDetail(
        userId: '42',
        subscriptionBody: const {'success': true, 'data': {'subscription': null}},
        eligibilityBody: const {'success': true, 'data': {'eligible': false, 'reason': 'training incomplete'}},
        plansBody: const {'success': true, 'data': {'plans': []}},
        listItem: listItem,
      );

      expect(detail.displayName, 'يوسف وصفي عيسة');
      expect(detail.email, 'yousefayasi89@gmail.com');
      expect(detail.accountStatus, 'active');
      expect(detail.accountStatusLabel, 'نشط');
      expect(detail.planLabel, '—');
      expect(detail.identityStatusLabel, superAdminPackageIdentityUnverifiedAr);
      expect(detail.trainingStatusLabel, superAdminPackageTrainingIncompleteAr);
    });

    test('findPackageListItem returns matching freelancer', () {
      final items = [
        SuperAdminFreelancerListItem(id: '1', displayName: 'A'),
        SuperAdminFreelancerListItem(id: '2', displayName: 'B'),
      ];
      expect(findPackageListItem(items, '2')?.displayName, 'B');
      expect(findPackageListItem(items, '9'), isNull);
    });
  });
}
