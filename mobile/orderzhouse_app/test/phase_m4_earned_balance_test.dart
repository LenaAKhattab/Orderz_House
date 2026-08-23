import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/earned_balance_copy.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/data/mini_articles_side_models.dart';
import 'package:orderzhouse_app/features/freelancer/mini_articles/presentation/mini_articles_widgets.dart';

void main() {
  group('EarnedBalanceSnapshot parsing (M4)', () {
    test('parses lockPolicy, withdrawalPolicy, totals camelCase', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalPendingJod': '1.200',
          'totalLockedPendingJod': '1.200',
          'totalForfeitedJod': '0.000',
          'totalAvailableJod': '0.000',
          'totalAcceptedArticles': 2,
          'totalPublishedArticles': 1,
          'lockPolicy': {
            'state': 'trial_active_locked',
            'graceDays': 40,
            'graceDaysRemaining': 12,
            'showSilverCta': true,
            'messages': {
              'ar': {
                'headline': 'أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.',
                'detail': 'أرباحك محفوظة وتصبح قابلة للسحب بعد تفعيل Silver.',
              },
            },
          },
          'withdrawalPolicy': {
            'allowed': false,
            'reason': 'company_kyc_required',
            'messageAr': earnedBalanceKycMessageFallbackAr,
          },
          'entries': [
            {
              'applicationId': 'a1',
              'amountJod': '0.700',
              'status': 'pending_locked',
              'locked': true,
              'withdrawable': false,
            },
          ],
        },
      });

      expect(snap.totalLockedPendingJod, '1.200');
      expect(snap.totalAvailableJod, '0.000');
      expect(snap.lockPolicy?.state, 'trial_active_locked');
      expect(snap.lockPolicy?.graceDaysRemaining, 12);
      expect(snap.lockPolicy?.showSilverCta, isTrue);
      expect(snap.lockPolicy?.headlineAr, contains('غير قابلة للسحب'));
      expect(snap.withdrawalPolicy?.allowed, isFalse);
      expect(snap.entries.first.statusLabelAr, 'معلّق · غير قابل للسحب');
      expect(snap.entries.first.locked, isTrue);
      expect(snap.displayWithdrawableJod, '0.000');
    });

    test('parses snake_case aliases', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'total_pending_jod': '0.500',
          'total_locked_pending_jod': '0.500',
          'total_forfeited_jod': '0.100',
          'total_available_jod': '2.000',
          'lock_policy': {
            'state': 'grace_period',
            'grace_days_remaining': 5,
            'show_silver_cta': true,
            'messages': {
              'ar': {'headline': 'h', 'detail': 'd'},
            },
          },
          'withdrawal_policy': {'allowed': true},
        },
      });
      expect(snap.totalLockedPendingJod, '0.500');
      expect(snap.totalForfeitedJod, '0.100');
      expect(snap.totalAvailableJod, '2.000');
      expect(snap.lockPolicy?.graceDaysRemaining, 5);
      expect(snap.withdrawalPolicy?.allowed, isTrue);
    });

    test('backward compatible when new fields absent', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalPendingJod': '0.300',
          'totalAcceptedArticles': 1,
          'entries': [
            {'applicationId': 'x', 'amountJod': '0.300', 'status': 'pending'},
          ],
        },
      });
      expect(snap.totalPendingJod, '0.300');
      expect(snap.totalLockedPendingJod, '0.000');
      expect(snap.totalAvailableJod, '0.000');
      expect(snap.lockPolicy, isNull);
      expect(snap.withdrawalPolicy, isNull);
      expect(snap.displayLockedPendingJod, '0.300');
    });

    test('net-only — never stores gross article value as available', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalAvailableJod': '0.700',
          'totalArticleValueJod': '10.000',
          'companyShareJod': '3.000',
          'grossArticleValue': '10.000',
          'entries': [
            {
              'applicationId': '1',
              'amountJod': '0.700',
              'writer_net_jod': '0.700',
              'articleGrossJod': '10.000',
              'status': 'settled_externally',
              'withdrawable': true,
            },
          ],
          'withdrawalPolicy': {'allowed': true},
        },
      });
      expect(snap.totalAvailableJod, '0.700');
      expect(snap.entries.first.amountJod, '0.700');
      expect(snap.toString(), isNot(contains('10.000')));
      expect(snap.displayWithdrawableJod, '0.700');
    });
  });

  group('resolveEarnedBalanceUiState', () {
    test('Starter locked pending shows plans CTA', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalLockedPendingJod': '1.000',
          'totalPendingJod': '1.000',
          'lockPolicy': {
            'state': 'trial_active_locked',
            'showSilverCta': true,
            'messages': {
              'ar': {
                'headline': 'أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.',
                'detail': 'أرباحك محفوظة وتصبح قابلة للسحب بعد تفعيل Silver.',
              },
            },
          },
          'withdrawalPolicy': {'allowed': false, 'reason': 'company_kyc_required'},
          'entries': [
            {'applicationId': '1', 'amountJod': '1.000', 'status': 'pending_locked', 'locked': true},
          ],
        },
      });
      final ui = resolveEarnedBalanceUiState(snap);
      expect(ui.kind, EarnedBalanceUiKind.lockedPending);
      expect(ui.showPlansCta, isTrue);
      expect(ui.showClaimsCta, isFalse);
      expect(ui.showWithdrawableAmount, isFalse);
      expect(earnedBalanceDashboardSummaryAr(snap), contains('غير قابل للسحب'));
      expect(earnedBalanceDashboardSummaryAr(snap), isNot(contains('قابل للسحب: 1')));
    });

    test('grace countdown state', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalLockedPendingJod': '0.800',
          'lockPolicy': {
            'state': 'grace_period',
            'graceDaysRemaining': 7,
            'showSilverCta': true,
            'messages': {
              'ar': {
                'headline': 'أرباحك محفوظة لكنها غير قابلة للسحب حاليًا.',
                'detail': 'متبقي 7 يوم لتفعيل السحب قبل إغلاق الرصيد.',
              },
            },
          },
          'entries': [
            {'applicationId': '1', 'amountJod': '0.800', 'status': 'pending_locked'},
          ],
        },
      });
      final ui = resolveEarnedBalanceUiState(snap);
      expect(ui.kind, EarnedBalanceUiKind.grace);
      expect(ui.detail, contains('7'));
      expect(ui.showPlansCta, isTrue);
    });

    test('closed/forfeited calm Arabic — no harsh wording', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalForfeitedJod': '1.500',
          'totalLockedPendingJod': '0.000',
          'totalAvailableJod': '0.000',
          'lockPolicy': {
            'state': 'forfeited_closed',
            'showSilverCta': true,
            'messages': {
              'ar': {
                'headline': 'انتهت مهلة تفعيل الأرباح.',
                'detail': 'الرصيد المعلّق السابق لم يعد متاحًا للسحب.',
              },
            },
          },
          'entries': [
            {'applicationId': '1', 'amountJod': '1.500', 'status': 'forfeited'},
          ],
        },
      });
      final ui = resolveEarnedBalanceUiState(snap);
      expect(ui.kind, EarnedBalanceUiKind.closed);
      expect(ui.showPlansCta, isFalse);
      expect(ui.showClaimsCta, isFalse);
      expect(ui.headline, isNot(contains('مصادرة')));
      expect(ui.detail, isNot(contains('forfeit')));
      expect(ui.detail!.toLowerCase(), isNot(contains('company')));
      expect(earnedBalanceStatusLabelAr('forfeited'), 'مغلق');
    });

    test('Silver before KYC', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalAvailableJod': '0.000',
          'lockPolicy': {'state': 'released', 'showSilverCta': false},
          'withdrawalPolicy': {
            'allowed': false,
            'reason': 'company_kyc_required',
            'messageAr': earnedBalanceKycMessageFallbackAr,
          },
          'entries': [
            {
              'applicationId': '1',
              'amountJod': '2.000',
              'status': 'awaiting_account_approval',
              'withdrawable': false,
            },
          ],
        },
      });
      final ui = resolveEarnedBalanceUiState(snap);
      expect(ui.kind, EarnedBalanceUiKind.silverBeforeKyc);
      expect(ui.headline, contains('اعتماد الحساب'));
      expect(ui.showKycPending, isTrue);
      expect(ui.showClaimsCta, isFalse);
      expect(snap.displayWithdrawableJod, '0.000');
    });

    test('KYC approved withdrawable', () {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalAvailableJod': '2.500',
          'withdrawalPolicy': {'allowed': true},
          'lockPolicy': {'state': 'released', 'showSilverCta': false},
          'entries': [
            {
              'applicationId': '1',
              'amountJod': '2.500',
              'status': 'settled_externally',
              'withdrawable': true,
            },
          ],
        },
      });
      final ui = resolveEarnedBalanceUiState(snap);
      expect(ui.kind, EarnedBalanceUiKind.withdrawable);
      expect(ui.showClaimsCta, isTrue);
      expect(ui.showWithdrawableAmount, isTrue);
      expect(earnedBalanceDashboardSummaryAr(snap), contains('قابل للسحب: 2.500'));
    });
  });

  group('EarnedBalancePanel UI', () {
    testWidgets('locked pending shows plans CTA and not withdrawable amount', (tester) async {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalLockedPendingJod': '1.000',
          'totalAvailableJod': '0.000',
          'lockPolicy': {
            'state': 'trial_active_locked',
            'showSilverCta': true,
            'messages': {
              'ar': {
                'headline': earnedBalanceLockedHeadlineFallbackAr,
                'detail': earnedBalanceLockedDetailFallbackAr,
              },
            },
          },
          'entries': [
            {'applicationId': '1', 'articleTitle': 'مقال', 'amountJod': '1.000', 'status': 'pending_locked', 'locked': true},
          ],
        },
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: EarnedBalancePanel(snapshot: snap))),
      );

      expect(find.text(earnedBalanceTitleAr), findsOneWidget);
      expect(find.byKey(const ValueKey('earned-balance-plans-cta')), findsOneWidget);
      expect(find.byKey(const ValueKey('earned-balance-claims-cta')), findsNothing);
      expect(find.byKey(const ValueKey('earned-balance-withdrawable')), findsNothing);
      expect(find.textContaining('معلّق غير قابل للسحب'), findsOneWidget);
      expect(find.textContaining('صافي المستقل: 1.000 JOD'), findsOneWidget);
    });

    testWidgets('closed state shows calm copy', (tester) async {
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalForfeitedJod': '0.900',
          'lockPolicy': {
            'state': 'forfeited_closed',
            'messages': {
              'ar': {
                'headline': earnedBalanceClosedHeadlineAr,
                'detail': earnedBalanceClosedDetailAr,
              },
            },
          },
          'entries': [
            {'applicationId': '1', 'amountJod': '0.900', 'status': 'forfeited'},
          ],
        },
      });

      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: EarnedBalancePanel(snapshot: snap))),
      );

      expect(find.text(earnedBalanceClosedHeadlineAr), findsOneWidget);
      expect(find.textContaining('مصادرة'), findsNothing);
      expect(find.byKey(const ValueKey('earned-balance-plans-cta')), findsNothing);
      expect(find.byKey(const ValueKey('earned-balance-claims-cta')), findsNothing);
    });

    testWidgets('KYC approved shows claims CTA with withdrawable net', (tester) async {
      var claimsOpened = false;
      final snap = EarnedBalanceSnapshot.fromResponse({
        'data': {
          'totalAvailableJod': '1.100',
          'withdrawalPolicy': {'allowed': true},
          'entries': [
            {
              'applicationId': '1',
              'articleTitle': 'مقال ب',
              'amountJod': '1.100',
              'status': 'settled_externally',
              'withdrawable': true,
            },
          ],
        },
      });

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: EarnedBalancePanel(
              snapshot: snap,
              onOpenClaims: () => claimsOpened = true,
            ),
          ),
        ),
      );

      expect(find.byKey(const ValueKey('earned-balance-withdrawable')), findsOneWidget);
      expect(find.textContaining('1.100'), findsWidgets);
      await tester.tap(find.byKey(const ValueKey('earned-balance-claims-cta')));
      await tester.pump();
      expect(claimsOpened, isTrue);
    });
  });
}
