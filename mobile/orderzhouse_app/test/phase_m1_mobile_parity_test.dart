import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/freelancer/account_activation/data/account_activation_kyc_models.dart';
import 'package:orderzhouse_app/features/freelancer/data/plan_upgrade_cta.dart';
import 'package:orderzhouse_app/features/freelancer/data/pool_order_participation_helpers.dart';
import 'package:orderzhouse_app/features/freelancer/financial_claims/data/create_financial_claim_models.dart';
import 'package:orderzhouse_app/features/orders/data/pool_order_models.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_actions.dart';
import 'package:orderzhouse_app/features/super_admin/data/super_admin_models.dart';

void main() {
  group('AccountActivationKycStatus', () {
    test('parses not submitted / can submit', () {
      final status = AccountActivationKycStatus.fromResponse({
        'data': {
          'schemaReady': true,
          'activationStatus': 'company_pending',
          'isCompanyApproved': false,
          'request': null,
          'canSubmit': true,
          'canResubmit': true,
          'termsVersion': 'freelancer_account_activation_terms_2026-08-v1',
          'messageAr': 'يرجى رفع صورة الهوية',
        },
      });
      expect(status.isCompanyApproved, isFalse);
      expect(status.isPending, isFalse);
      expect(status.isRejected, isFalse);
      expect(status.showSubmitForm, isTrue);
      expect(status.canSubmit, isTrue);
    });

    test('parses pending_review', () {
      final status = AccountActivationKycStatus.fromResponse({
        'data': {
          'isCompanyApproved': false,
          'canSubmit': false,
          'canResubmit': false,
          'request': {
            'id': '12',
            'status': 'pending_review',
          },
          'messageAr': 'طلبك قيد المراجعة من قبل الإدارة.',
        },
      });
      expect(status.isPending, isTrue);
      expect(status.showSubmitForm, isFalse);
      expect(status.messageAr, contains('قيد المراجعة'));
    });

    test('parses rejected with reason and allows resubmit form', () {
      final status = AccountActivationKycStatus.fromResponse({
        'data': {
          'activationStatus': 'company_rejected',
          'isCompanyApproved': false,
          'canSubmit': true,
          'canResubmit': true,
          'request': {
            'id': '9',
            'status': 'rejected',
            'rejectionReason': 'الصورة غير واضحة',
          },
        },
      });
      expect(status.isRejected, isTrue);
      expect(status.request?.rejectionReason, 'الصورة غير واضحة');
      expect(status.showSubmitForm, isTrue);
    });

    test('parses approved', () {
      final status = AccountActivationKycStatus.fromResponse({
        'data': {
          'activationStatus': 'company_approved',
          'isCompanyApproved': true,
          'canSubmit': false,
          'request': {'id': '1', 'status': 'approved'},
          'messageAr': 'تم تفعيل حسابك.',
        },
      });
      expect(status.isCompanyApproved, isTrue);
      expect(status.showSubmitForm, isFalse);
    });

    test('submit validation requires files and terms', () {
      expect(
        validateAccountActivationSubmit(hasFront: false, hasBack: true, termsAccepted: true),
        accountActivationKycFilesRequiredAr,
      );
      expect(
        validateAccountActivationSubmit(hasFront: true, hasBack: false, termsAccepted: true),
        accountActivationKycFilesRequiredAr,
      );
      expect(
        validateAccountActivationSubmit(hasFront: true, hasBack: true, termsAccepted: false),
        accountActivationKycTermsRequiredAr,
      );
      expect(
        validateAccountActivationSubmit(hasFront: true, hasBack: true, termsAccepted: true),
        isNull,
      );
    });
  });

  group('financial claims KYC/F1 error mapping', () {
    DioException errFor(String code, {int status = 403}) {
      return DioException(
        requestOptions: RequestOptions(path: '/portal/financial-claims'),
        response: Response(
          requestOptions: RequestOptions(path: '/portal/financial-claims'),
          statusCode: status,
          data: {'success': false, 'code': code, 'message': 'backend'},
        ),
      );
    }

    test('maps FREELANCER_KYC_REQUIRED', () {
      expect(
        mapFinancialClaimCreateErrorMessage(errFor('FREELANCER_KYC_REQUIRED')),
        'لا يمكن إنشاء مطالبة مالية قبل تفعيل الحساب.',
      );
    });

    test('maps FREELANCER_KYC_PENDING_REVIEW', () {
      expect(
        mapFinancialClaimCreateErrorMessage(errFor('FREELANCER_KYC_PENDING_REVIEW')),
        'طلب تفعيل حسابك قيد المراجعة.',
      );
    });

    test('maps FREELANCER_KYC_REJECTED', () {
      expect(
        mapFinancialClaimCreateErrorMessage(errFor('FREELANCER_KYC_REJECTED')),
        contains('تم رفض طلب تفعيل حسابك'),
      );
    });

    test('maps FINANCIAL_CLAIM_PRICING_NOT_ALLOWED', () {
      expect(
        mapFinancialClaimCreateErrorMessage(errFor('FINANCIAL_CLAIM_PRICING_NOT_ALLOWED', status: 400)),
        contains('لا يمكن إرسال مبالغ'),
      );
    });

    test('maps FINANCIAL_CLAIM_PAYMENT_LEDGER_REQUIRED', () {
      expect(
        mapFinancialClaimCreateErrorMessage(
          errFor('FINANCIAL_CLAIM_PAYMENT_LEDGER_REQUIRED', status: 409),
        ),
        contains('تسجيل دفعة مالية'),
      );
    });

    test('create payload still forbids pricing keys', () {
      expect(
        isSafeCreateDoneProjectClaimPayload({
          'mode': doneProjectClaimMode,
          'projectId': 1,
          'totalPriceSnapshot': 10,
        }),
        isFalse,
      );
      expect(
        isSafeCreateDoneProjectClaimPayload({
          'mode': doneProjectClaimMode,
          'projectId': 1,
        }),
        isTrue,
      );
    });
  });

  group('plan upgrade CTA', () {
    test('appears for plan-locked pool eligibility', () {
      final props = planUpgradePropsFromPoolEligibility(
        isLockedByPlan: true,
        requiredTierCode: 'silver',
      );
      expect(props, isNotNull);
      final copy = buildPlanUpgradeCopy(requiredTierCode: props!.requiredTierCode);
      expect(copy.headline, contains('Silver'));
      expect(copy.action, planUpgradeDefaultActionAr);
      expect(copy.tierHint, contains('Silver'));
    });

    test('not shown for non-plan lock reasons', () {
      expect(
        planUpgradePropsFromPoolEligibility(
          isLockedByPlan: true,
          lockReason: 'INSUFFICIENT_BID_CREDITS',
        ),
        isNull,
      );
      expect(
        planUpgradePropsFromPoolEligibility(
          isLockedByPlan: true,
          lockReason: 'BILDAZO_AUTHOR_LINK_REQUIRED',
        ),
        isNull,
      );
      expect(
        planUpgradePropsFromPoolEligibility(
          isLockedByPlan: true,
          lockReason: 'TRAINING_REQUIRED',
        ),
        isNull,
      );
      expect(isPlanUpgradeReason('CAMPAIGN_PAUSED'), isFalse);
      expect(isPlanUpgradeReason('EMAIL_NOT_VERIFIED'), isFalse);
    });

    test('pool helper resolves CTA from PoolOrder', () {
      final order = PoolOrder(
        id: '1',
        title: 'طلب',
        poolEligibility: const PoolPlanEligibility(
          isLockedByPlan: true,
          requiredTierCode: 'pro',
        ),
      );
      final props = poolOrderPlanUpgradeProps(order);
      expect(props?.requiredTierCode, 'pro');
      expect(isPoolOrderLockedByPlan(order), isTrue);
    });
  });

  group('Super Admin activation safety M1', () {
    test('in-app approve is disabled even for pending items', () {
      final item = SuperAdminActivationItem.fromJson({
        'id': '10',
        'activationStatus': 'company_pending',
        'paymentStatus': 'paid',
        'needsCompanyActivation': true,
      });
      expect(wouldHaveBeenApprovableActivation(item), isTrue);
      expect(canApproveActivation(item), isFalse);
      expect(isMobileCompanyActivateDisabled(), isTrue);
    });
  });
}
