// Phase A10 / M1 / Android-Parity-01 — Plan upgrade CTA helpers for pool/order/course locks.

const planUpgradeDefaultHeadlineAr = 'هذا الطلب متاح لباقات أعلى. قم بترقية خطتك لاستلامه.';
const planUpgradeDefaultActionAr = 'ترقية الخطة';
const planUpgradeButtonLabelAr = 'ترقية الباقة';
const planUpgradeViewPlansButtonAr = 'عرض الباقات';
const planUpgradeOpenFailedAr =
    'تعذر فتح صفحة الخطط. يمكنك فتح الموقع من الملف الشخصي أو المحاولة لاحقاً.';

const planTooLowHeadlineAr = 'قيمة هذا الطلب أعلى من حد باقتك الحالية';
const noActivePlanHeadlineAr = 'فعّل باقتك لاستلام الطلبات';
const internalPlanConfigHeadlineAr =
    'تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.';

const coursePlanUpgradeHeadlineAr = 'هذه الدورة متاحة لباقات أعلى';
const coursePlanUpgradeButtonAr = 'ترقية الباقة';

const _planLockReasons = {
  'ARTICLE_ACCESS_LEVEL_INSUFFICIENT',
  'ARTICLE_NO_USABLE_MEMBERSHIP',
  'COURSE_PLAN_UPGRADE_REQUIRED',
  'plan_locked',
  'PLAN_LOCKED',
  'isLockedByPlan',
  'PLAN_TOO_LOW',
  'NO_ACTIVE_PLAN',
};

const _nonPlanBlockReasons = {
  'INSUFFICIENT_BID_CREDITS',
  'ARTICLE_BID_ECONOMY_DISABLED',
  'ARTICLE_APPLICATIONS_ENGINE_OFF',
  'ARTICLE_BID_COLLECTION_THRESHOLD_REACHED',
  'ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET',
  'ARTICLE_BID_COLLECTION_DEADLINE_PASSED',
  'BILDAZO_AUTHOR_LINK_REQUIRED',
  'EMAIL_NOT_VERIFIED',
  'COMPANY_APPROVAL_REQUIRED',
  'TRAINING_REQUIRED',
  'CAMPAIGN_PAUSED',
  'ACTIVATION_CAMPAIGN_PAUSED',
  'ACTIVATION_ENGINE_GATED',
  'KYC_REQUIRED',
};

enum PlanUpgradeCtaMode { upgrade, support }

bool isPlanUpgradeReason(String? reason) {
  if (reason == null || reason.trim().isEmpty) return false;
  final code = reason.trim();
  if (_nonPlanBlockReasons.contains(code)) return false;
  if (_planLockReasons.contains(code)) return true;
  return false;
}

String? normalizeRequiredTierCode(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final code = raw.trim().toLowerCase();
  if (code == 'free' || code == 'starter') return null;
  if (code == 'silver' || code == 'pro' || code == 'elite') return code;
  if (code.contains('silver') || code.contains('50')) return 'silver';
  if (code.contains('elite')) return 'elite';
  if (code.contains('pro') || code.contains('platinum')) return 'pro';
  return code;
}

String? formatRequiredTierLabel(String? tierCode) {
  final code = normalizeRequiredTierCode(tierCode);
  if (code == null) return null;
  if (code == 'silver') return 'Silver';
  if (code == 'pro') return 'Pro';
  if (code == 'elite') return 'Elite';
  return code;
}

String _normalizeReasonCode(String? reason) => (reason ?? '').trim().toUpperCase();

class PlanUpgradeCtaCopy {
  const PlanUpgradeCtaCopy({
    required this.headline,
    required this.button,
    this.action,
    this.requiredTierCode,
    this.tierHint,
    this.mode = PlanUpgradeCtaMode.upgrade,
  });

  final String headline;
  final String? action;
  final String button;
  final String? requiredTierCode;
  final String? tierHint;
  final PlanUpgradeCtaMode mode;

  bool get showButton => mode == PlanUpgradeCtaMode.upgrade && button.trim().isNotEmpty;
}

PlanUpgradeCtaCopy buildPlanUpgradeCopy({
  String? requiredTierCode,
  String? requiredPlanLabel,
  String? reason,
}) {
  final code = _normalizeReasonCode(reason);
  final tier = normalizeRequiredTierCode(requiredTierCode);
  final tierLabel = formatRequiredTierLabel(tier) ??
      (requiredPlanLabel != null && requiredPlanLabel.trim().isNotEmpty
          ? requiredPlanLabel.trim()
          : null);

  if (code == 'INTERNAL_PLAN_CONFIGURATION') {
    return const PlanUpgradeCtaCopy(
      headline: internalPlanConfigHeadlineAr,
      button: '',
      mode: PlanUpgradeCtaMode.support,
    );
  }

  if (code == 'NO_ACTIVE_PLAN') {
    return const PlanUpgradeCtaCopy(
      headline: noActivePlanHeadlineAr,
      button: planUpgradeViewPlansButtonAr,
    );
  }

  if (code == 'COURSE_PLAN_UPGRADE_REQUIRED') {
    return PlanUpgradeCtaCopy(
      headline: coursePlanUpgradeHeadlineAr,
      button: coursePlanUpgradeButtonAr,
      requiredTierCode: tier,
      tierHint: tierLabel != null ? 'متاحة بعد ترقية الباقة' : null,
    );
  }

  if (code == 'PLAN_TOO_LOW') {
    return PlanUpgradeCtaCopy(
      headline: planTooLowHeadlineAr,
      button: planUpgradeButtonLabelAr,
      requiredTierCode: tier,
    );
  }

  final headline = tierLabel != null
      ? 'هذا الطلب متاح لباقات أعلى (ابتداءً من $tierLabel). قم بترقية خطتك لاستلامه.'
      : planUpgradeDefaultHeadlineAr;
  final tierHint = tierLabel != null ? 'متاح ابتداءً من خطة $tierLabel.' : null;

  return PlanUpgradeCtaCopy(
    headline: headline,
    action: planUpgradeDefaultActionAr,
    button: planUpgradeButtonLabelAr,
    requiredTierCode: tier,
    tierHint: tierHint,
  );
}

class PlanUpgradeCtaProps {
  const PlanUpgradeCtaProps({
    this.requiredTierCode,
    this.requiredPlanLabel,
    this.reason = 'plan_locked',
    this.mode = PlanUpgradeCtaMode.upgrade,
  });

  final String? requiredTierCode;
  final String? requiredPlanLabel;
  final String reason;
  final PlanUpgradeCtaMode mode;
}

/// Resolve CTA from pool eligibility payload.
PlanUpgradeCtaProps? planUpgradePropsFromPoolEligibility({
  bool? isLockedByPlan,
  bool? planConfigurationError,
  String? requiredTierCode,
  String? requiredPlanLabel,
  String? lockReason,
  String? reasonCode,
}) {
  if (isLockedByPlan != true) return null;

  final code = _normalizeReasonCode(reasonCode);

  if (planConfigurationError == true || code == 'INTERNAL_PLAN_CONFIGURATION') {
    return const PlanUpgradeCtaProps(
      reason: 'INTERNAL_PLAN_CONFIGURATION',
      mode: PlanUpgradeCtaMode.support,
    );
  }

  if (code.isNotEmpty && _nonPlanBlockReasons.contains(code)) return null;

  if (code == 'NO_ACTIVE_PLAN') {
    return const PlanUpgradeCtaProps(reason: 'NO_ACTIVE_PLAN');
  }

  final reason = code.isNotEmpty ? code : (lockReason ?? '').trim();
  if (reason.isNotEmpty && _nonPlanBlockReasons.contains(reason)) return null;
  if (reason.isNotEmpty && !isPlanUpgradeReason(reason) && !_looksLikePlanCopy(reason)) {
    // Unknown reason with explicit isLockedByPlan still shows CTA.
  }

  return PlanUpgradeCtaProps(
    requiredTierCode: requiredTierCode,
    requiredPlanLabel: requiredPlanLabel,
    reason: code.isNotEmpty ? code : (reason.isEmpty ? 'PLAN_TOO_LOW' : reason),
  );
}

bool _looksLikePlanCopy(String reason) {
  final lower = reason.toLowerCase();
  return lower.contains('باق') ||
      lower.contains('اشتراك') ||
      lower.contains('plan') ||
      lower.contains('tier');
}
