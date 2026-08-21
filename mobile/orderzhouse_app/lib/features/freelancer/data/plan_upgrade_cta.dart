// Phase A10 / M1 — Plan upgrade CTA helpers for pool/order plan locks.
// Only for plan/tier/value locks — not Bids, Bildazo, training, verification, campaigns.

const planUpgradeDefaultHeadlineAr = 'هذا الطلب يحتاج خطة أعلى.';
const planUpgradeDefaultActionAr = 'رقِّ خطتك للحصول على هذا الطلب.';
const planUpgradeButtonLabelAr = 'عرض الخطط';
const planUpgradeOpenFailedAr =
    'تعذر فتح صفحة الخطط. يمكنك فتح الموقع من الملف الشخصي أو المحاولة لاحقاً.';

const _planLockReasons = {
  'ARTICLE_ACCESS_LEVEL_INSUFFICIENT',
  'ARTICLE_NO_USABLE_MEMBERSHIP',
  'plan_locked',
  'PLAN_LOCKED',
  'isLockedByPlan',
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
};

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

class PlanUpgradeCtaCopy {
  const PlanUpgradeCtaCopy({
    required this.headline,
    required this.action,
    required this.button,
    this.requiredTierCode,
    this.tierHint,
  });

  final String headline;
  final String action;
  final String button;
  final String? requiredTierCode;
  final String? tierHint;
}

PlanUpgradeCtaCopy buildPlanUpgradeCopy({
  String? requiredTierCode,
  String? requiredPlanLabel,
}) {
  final tier = normalizeRequiredTierCode(requiredTierCode);
  final tierLabel = formatRequiredTierLabel(tier) ??
      (requiredPlanLabel != null && requiredPlanLabel.trim().isNotEmpty
          ? requiredPlanLabel.trim()
          : null);

  final headline = tierLabel != null
      ? 'هذا الطلب يحتاج خطة $tierLabel.'
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
  });

  final String? requiredTierCode;
  final String? requiredPlanLabel;
  final String reason;
}

/// Resolve CTA from pool eligibility payload.
PlanUpgradeCtaProps? planUpgradePropsFromPoolEligibility({
  bool? isLockedByPlan,
  bool? planConfigurationError,
  String? requiredTierCode,
  String? requiredPlanLabel,
  String? lockReason,
}) {
  if (isLockedByPlan != true) return null;
  if (planConfigurationError == true) return null;
  final reason = (lockReason ?? '').trim();
  if (reason.isNotEmpty && _nonPlanBlockReasons.contains(reason)) return null;
  if (reason.isNotEmpty && !isPlanUpgradeReason(reason) && !_looksLikePlanCopy(reason)) {
    // Unknown reason with explicit isLockedByPlan still shows CTA.
  }
  return PlanUpgradeCtaProps(
    requiredTierCode: requiredTierCode,
    requiredPlanLabel: requiredPlanLabel,
    reason: reason.isEmpty ? 'plan_locked' : reason,
  );
}

bool _looksLikePlanCopy(String reason) {
  final lower = reason.toLowerCase();
  return lower.contains('باق') ||
      lower.contains('اشتراك') ||
      lower.contains('plan') ||
      lower.contains('tier');
}
