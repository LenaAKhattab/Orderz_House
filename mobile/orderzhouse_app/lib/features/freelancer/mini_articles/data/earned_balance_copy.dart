/// Arabic copy + UI resolution for freelancer earned balance (web ord20 parity).
library;

import 'mini_articles_side_models.dart';
import '../../../../core/i18n/server_text.dart';
import '../../../../core/i18n/i18n.dart';

String get earnedBalanceTitleAr => tr('الرصيد المكتسب من المقالات');
String get earnedBalanceHelperAr => tr('يعرض هذا الرصيد صافي أجر الكاتب من المقالات المقبولة فقط. الأرباح المعلّقة غير قابلة للسحب حتى تفعيل Silver.');
String get earnedBalanceLockedHeadlineFallbackAr => tr('رصيدك مسجّل لكنه غير قابل للسحب حالياً.');
String get earnedBalanceLockedDetailFallbackAr => tr('اشترك بإحدى الخطط لتفعيل الرصيد.');
String get earnedBalancePlansCtaAr => tr('اشترك بإحدى الخطط');
String get earnedBalanceGraceFallbackAr => tr('متبقي {days} يوم لتفعيل الرصيد قبل إغلاقه.');
String get earnedBalanceClosedHeadlineAr => tr('انتهت مهلة تفعيل هذا الرصيد.');
String get earnedBalanceClosedDetailAr => tr('هذا الرصيد لم يعد قابلاً للسحب.');
String get earnedBalanceClosedAmountLabelAr => tr('رصيد سابق مُغلق');
String get earnedBalanceLockedPendingLabelAr => tr('معلّق غير قابل للسحب');
String get earnedBalanceWithdrawableLabelAr => tr('الرصيد القابل للسحب');
String get earnedBalanceClaimsCtaAr => tr('يمكنك الآن تقديم مطالبة مالية.');
String get earnedBalanceClaimsNavAr => tr('المطالبات المالية');
String get earnedBalanceKycCtaAr => tr('تفعيل الحساب');
String get earnedBalanceKycPendingAr => tr('طلب اعتماد الحساب قيد المراجعة.');
String get earnedBalanceKycMessageFallbackAr => tr('الرصيد متاح بعد الاشتراك، لكن السحب يتطلب اعتماد الحساب.');
String get earnedBalanceEmptyAr => tr('لا توجد مقالات مقبولة بعد.');
String get earnedBalanceOpenPlansFailedAr => tr('تعذر فتح صفحة الخطط.');

/// Calm status labels — never show "مصادرة" / forfeited / company retained.
String earnedBalanceStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'pending_locked':
      return tr('معلّق · غير قابل للسحب');
    case 'pending':
      return tr('معلّق');
    case 'forfeited':
      return tr('مغلق');
    case 'awaiting_account_approval':
      return tr('مُفعّل · بانتظار اعتماد الحساب');
    case 'settled_externally':
      return tr('قابل للسحب');
    case 'voided':
      return tr('ملغى');
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

enum EarnedBalanceUiKind {
  empty,
  lockedPending,
  grace,
  closed,
  silverBeforeKyc,
  withdrawable,
  recordedOnly,
}

class EarnedBalanceUiState {
  const EarnedBalanceUiState({
    required this.kind,
    this.headline,
    this.detail,
    this.showPlansCta = false,
    this.showKycCta = false,
    this.showKycPending = false,
    this.showClaimsCta = false,
    this.showClosedAmount = false,
    this.showLockedPendingAmount = false,
    this.showWithdrawableAmount = false,
  });

  final EarnedBalanceUiKind kind;
  final String? headline;
  final String? detail;
  final bool showPlansCta;
  final bool showKycCta;
  final bool showKycPending;
  final bool showClaimsCta;
  final bool showClosedAmount;
  final bool showLockedPendingAmount;
  final bool showWithdrawableAmount;
}

double parseEarnedJod(String? raw) {
  if (raw == null) return 0;
  return double.tryParse(raw.trim().replaceAll(',', '')) ?? 0;
}

bool earnedJodPositive(String? raw) => parseEarnedJod(raw) > 0;

String graceDetailAr(int days) =>
    earnedBalanceGraceFallbackAr.replaceAll('{days}', '$days');

/// Resolves display state from API snapshot (mobile-only; mirrors web panel rules).
EarnedBalanceUiState resolveEarnedBalanceUiState(EarnedBalanceSnapshot snap) {
  final lock = snap.lockPolicy;
  final withdrawal = snap.withdrawalPolicy;
  final state = (lock?.state ?? '').trim().toLowerCase();
  final forfeitedClosed = state == 'forfeited_closed';
  final inGrace = state == 'grace_period';
  final trialLocked = state == 'trial_active_locked';

  final lockedPending = snap.displayLockedPendingJod;
  final available = snap.totalAvailableJod;
  final forfeited = snap.totalForfeitedJod;
  final hasLocked = earnedJodPositive(lockedPending);
  final hasAvailable = earnedJodPositive(available);
  final hasForfeited = earnedJodPositive(forfeited) || forfeitedClosed;
  final hasAwaitingKyc = snap.entries.any((e) => e.statusKey == 'awaiting_account_approval');
  final kycBlocked = withdrawal?.allowed == false &&
      ((withdrawal?.reason ?? '') == 'company_kyc_required' || hasAwaitingKyc);
  final kycAllowed = withdrawal?.allowed == true;

  final apiHeadline = lock?.headlineAr;
  final apiDetail = lock?.detailAr;
  final days = lock?.graceDaysRemaining;

  if (snap.entries.isEmpty &&
      !earnedJodPositive(snap.totalPendingJod) &&
      !hasAvailable &&
      !hasForfeited &&
      lock == null) {
    return const EarnedBalanceUiState(kind: EarnedBalanceUiKind.empty);
  }

  if (forfeitedClosed) {
    return EarnedBalanceUiState(
      kind: EarnedBalanceUiKind.closed,
      headline: apiHeadline ?? earnedBalanceClosedHeadlineAr,
      detail: apiDetail ?? earnedBalanceClosedDetailAr,
      showClosedAmount: hasForfeited,
      showPlansCta: false,
    );
  }

  if (inGrace) {
    return EarnedBalanceUiState(
      kind: EarnedBalanceUiKind.grace,
      headline: apiHeadline ?? earnedBalanceLockedHeadlineFallbackAr,
      detail: apiDetail ??
          (days != null ? graceDetailAr(days) : earnedBalanceLockedDetailFallbackAr),
      showPlansCta: lock?.showSilverCta != false,
      showLockedPendingAmount: true,
      showClosedAmount: hasForfeited,
    );
  }

  if (trialLocked || (hasLocked && (lock?.showSilverCta == true || lock != null))) {
    return EarnedBalanceUiState(
      kind: EarnedBalanceUiKind.lockedPending,
      headline: apiHeadline ?? earnedBalanceLockedHeadlineFallbackAr,
      detail: apiDetail ?? earnedBalanceLockedDetailFallbackAr,
      showPlansCta: lock?.showSilverCta != false,
      showLockedPendingAmount: true,
      showClosedAmount: hasForfeited,
    );
  }

  if (kycBlocked) {
    return EarnedBalanceUiState(
      kind: EarnedBalanceUiKind.silverBeforeKyc,
      headline: withdrawal?.messageAr == null
        ? earnedBalanceKycMessageFallbackAr
        : localizeServerText(withdrawal!.messageAr!, fallback: earnedBalanceKycMessageFallbackAr),
      detail: hasAwaitingKyc ? earnedBalanceKycPendingAr : null,
      showKycCta: !hasAwaitingKyc,
      showKycPending: hasAwaitingKyc,
      showLockedPendingAmount: hasLocked,
      showClosedAmount: hasForfeited,
    );
  }

  if (kycAllowed && hasAvailable) {
    return EarnedBalanceUiState(
      kind: EarnedBalanceUiKind.withdrawable,
      headline: earnedBalanceWithdrawableLabelAr,
      detail: earnedBalanceClaimsCtaAr,
      showClaimsCta: true,
      showWithdrawableAmount: true,
      showLockedPendingAmount: hasLocked,
      showClosedAmount: hasForfeited,
    );
  }

  if (hasForfeited && !hasLocked && !hasAvailable) {
    return EarnedBalanceUiState(
      kind: EarnedBalanceUiKind.closed,
      headline: earnedBalanceClosedHeadlineAr,
      detail: earnedBalanceClosedDetailAr,
      showClosedAmount: true,
    );
  }

  return EarnedBalanceUiState(
    kind: EarnedBalanceUiKind.recordedOnly,
    headline: apiHeadline,
    detail: apiDetail,
    showLockedPendingAmount: hasLocked,
    showClosedAmount: hasForfeited,
    showWithdrawableAmount: hasAvailable && kycAllowed,
    showClaimsCta: hasAvailable && kycAllowed,
    showPlansCta: lock?.showSilverCta == true,
    showKycCta: kycBlocked && !hasAwaitingKyc,
    showKycPending: kycBlocked && hasAwaitingKyc,
  );
}

/// Compact dashboard line — never treats locked/closed as withdrawable.
String earnedBalanceDashboardSummaryAr(EarnedBalanceSnapshot snap) {
  final ui = resolveEarnedBalanceUiState(snap);
  switch (ui.kind) {
    case EarnedBalanceUiKind.empty:
      return tr('لا رصيد مكتسب بعد');
    case EarnedBalanceUiKind.closed:
      return tr('رصيد سابق مُغلق · غير قابل للسحب');
    case EarnedBalanceUiKind.grace:
    case EarnedBalanceUiKind.lockedPending:
      return trf('معلّق: {0} JOD · غير قابل للسحب', [snap.displayLockedPendingJod]);
    case EarnedBalanceUiKind.silverBeforeKyc:
      return tr('بانتظار اعتماد الحساب');
    case EarnedBalanceUiKind.withdrawable:
      return trf('قابل للسحب: {0} JOD', [snap.totalAvailableJod]);
    case EarnedBalanceUiKind.recordedOnly:
      if (earnedJodPositive(snap.totalAvailableJod) && snap.withdrawalPolicy?.allowed == true) {
        return trf('قابل للسحب: {0} JOD', [snap.totalAvailableJod]);
      }
      if (earnedJodPositive(snap.displayLockedPendingJod)) {
        return trf('معلّق: {0} JOD · غير قابل للسحب', [snap.displayLockedPendingJod]);
      }
      return tr('رصيد مسجّل');
  }
}
