/// Arabic copy + UI resolution for freelancer earned balance (web ord20 parity).
library;

import 'mini_articles_side_models.dart';

const earnedBalanceTitleAr = 'الرصيد المكتسب من المقالات';
const earnedBalanceHelperAr =
    'يعرض هذا الرصيد صافي أجر الكاتب من المقالات المقبولة فقط. الأرباح المعلّقة غير قابلة للسحب حتى تفعيل Silver.';
const earnedBalanceLockedHeadlineFallbackAr = 'رصيدك مسجّل لكنه غير قابل للسحب حالياً.';
const earnedBalanceLockedDetailFallbackAr = 'اشترك بإحدى الخطط لتفعيل الرصيد.';
const earnedBalancePlansCtaAr = 'اشترك بإحدى الخطط';
const earnedBalanceGraceFallbackAr = 'متبقي {days} يوم لتفعيل الرصيد قبل إغلاقه.';
const earnedBalanceClosedHeadlineAr = 'انتهت مهلة تفعيل هذا الرصيد.';
const earnedBalanceClosedDetailAr = 'هذا الرصيد لم يعد قابلاً للسحب.';
const earnedBalanceClosedAmountLabelAr = 'رصيد سابق مُغلق';
const earnedBalanceLockedPendingLabelAr = 'معلّق غير قابل للسحب';
const earnedBalanceWithdrawableLabelAr = 'الرصيد القابل للسحب';
const earnedBalanceClaimsCtaAr = 'يمكنك الآن تقديم مطالبة مالية.';
const earnedBalanceClaimsNavAr = 'المطالبات المالية';
const earnedBalanceKycCtaAr = 'تفعيل الحساب';
const earnedBalanceKycPendingAr = 'طلب اعتماد الحساب قيد المراجعة.';
const earnedBalanceKycMessageFallbackAr =
    'الرصيد متاح بعد الاشتراك، لكن السحب يتطلب اعتماد الحساب.';
const earnedBalanceEmptyAr = 'لا توجد مقالات مقبولة بعد.';
const earnedBalanceOpenPlansFailedAr = 'تعذر فتح صفحة الخطط.';

/// Calm status labels — never show "مصادرة" / forfeited / company retained.
String earnedBalanceStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'pending_locked':
      return 'معلّق · غير قابل للسحب';
    case 'pending':
      return 'معلّق';
    case 'forfeited':
      return 'مغلق';
    case 'awaiting_account_approval':
      return 'مُفعّل · بانتظار اعتماد الحساب';
    case 'settled_externally':
      return 'قابل للسحب';
    case 'voided':
      return 'ملغى';
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
      headline: withdrawal?.messageAr ?? earnedBalanceKycMessageFallbackAr,
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
      return 'لا رصيد مكتسب بعد';
    case EarnedBalanceUiKind.closed:
      return 'رصيد سابق مُغلق · غير قابل للسحب';
    case EarnedBalanceUiKind.grace:
    case EarnedBalanceUiKind.lockedPending:
      return 'معلّق: ${snap.displayLockedPendingJod} JOD · غير قابل للسحب';
    case EarnedBalanceUiKind.silverBeforeKyc:
      return 'بانتظار اعتماد الحساب';
    case EarnedBalanceUiKind.withdrawable:
      return 'قابل للسحب: ${snap.totalAvailableJod} JOD';
    case EarnedBalanceUiKind.recordedOnly:
      if (earnedJodPositive(snap.totalAvailableJod) && snap.withdrawalPolicy?.allowed == true) {
        return 'قابل للسحب: ${snap.totalAvailableJod} JOD';
      }
      if (earnedJodPositive(snap.displayLockedPendingJod)) {
        return 'معلّق: ${snap.displayLockedPendingJod} JOD · غير قابل للسحب';
      }
      return 'رصيد مسجّل';
  }
}
