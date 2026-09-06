import '../../../core/network/json_helpers.dart';
import 'freelancer_eligibility_models.dart';

class PublicPlan {
  const PublicPlan({
    required this.id,
    required this.checkoutPlanId,
    required this.title,
    this.name,
    this.durationDays,
    this.priceJod,
    this.stripeCheckoutAmountJod,
    this.features = const [],
    this.orderValueMinJod,
    this.orderValueMaxJod,
    this.isPopular = false,
    this.isFeatured = false,
    this.billingText,
    this.currency = 'JOD',
  });

  final String id;
  final String checkoutPlanId;
  final String title;
  final String? name;
  final int? durationDays;
  final double? priceJod;
  final double? stripeCheckoutAmountJod;
  final List<String> features;
  final double? orderValueMinJod;
  final double? orderValueMaxJod;
  final bool isPopular;
  final bool isFeatured;
  final String? billingText;
  final String currency;

  String get displayTitle {
    final t = title.trim();
    if (t.isNotEmpty) return t;
    final n = name?.trim();
    if (n != null && n.isNotEmpty) return n;
    return 'باقة';
  }

  String get planRefId => checkoutPlanId.isNotEmpty ? checkoutPlanId : id;

  double? get displayPriceJod => stripeCheckoutAmountJod ?? priceJod;

  factory PublicPlan.fromJson(Map<String, dynamic> json) {
    final featuresRaw = json['features'];
    final features = <String>[];
    if (featuresRaw is List) {
      for (final item in featuresRaw) {
        if (item is String && item.trim().isNotEmpty) {
          features.add(item.trim());
        } else if (item is Map) {
          final text = readMapField<String>(Map<String, dynamic>.from(item), 'featureText', 'feature_text');
          if (text != null && text.trim().isNotEmpty) features.add(text.trim());
        }
      }
    }

    return PublicPlan(
      id: readString(json, 'id', 'id'),
      checkoutPlanId: readString(json, 'checkoutPlanId', 'checkout_plan_id', fallback: readString(json, 'id', 'id')),
      title: readString(json, 'title', 'title'),
      name: readMapField<String>(json, 'name', 'name'),
      durationDays: readInt(json, 'durationDays', 'duration_days'),
      priceJod: readDouble(json, 'priceJod', 'price_jod'),
      stripeCheckoutAmountJod: readDouble(json, 'stripeCheckoutAmountJod', 'stripe_checkout_amount_jod'),
      features: features,
      orderValueMinJod: readDouble(json, 'orderValueMinJod', 'order_value_min_jod'),
      orderValueMaxJod: readDouble(json, 'orderValueMaxJod', 'order_value_max_jod'),
      isPopular: readBool(json, 'isPopular', 'is_popular'),
      isFeatured: readBool(json, 'isFeatured', 'is_featured'),
      billingText: readMapField<String>(json, 'billingText', 'billing_text'),
      currency: readMapField<String>(json, 'currency', 'currency') ?? 'JOD',
    );
  }

  static List<PublicPlan> parseListResponse(dynamic body) {
    if (body is! Map) return const [];
    final data = body['data'];
    if (data is! Map) return const [];
    final plans = data['plans'];
    if (plans is! List) return const [];
    return plans
        .whereType<Map>()
        .map((e) => PublicPlan.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}

class FreelancerPlanSummary {
  const FreelancerPlanSummary({
    required this.id,
    this.title,
    this.name,
    this.durationDays,
    this.priceJod,
  });

  final String id;
  final String? title;
  final String? name;
  final int? durationDays;
  final double? priceJod;

  String get displayTitle {
    final t = title?.trim();
    if (t != null && t.isNotEmpty) return t;
    final n = name?.trim();
    if (n != null && n.isNotEmpty) return n;
    return 'باقة';
  }

  factory FreelancerPlanSummary.fromJson(Map<String, dynamic> json) {
    return FreelancerPlanSummary(
      id: readString(json, 'id', 'id'),
      title: readMapField<String>(json, 'title', 'title'),
      name: readMapField<String>(json, 'name', 'name'),
      durationDays: readInt(json, 'durationDays', 'duration_days'),
      priceJod: readDouble(json, 'priceJod', 'price_jod'),
    );
  }
}

class FreelancerSubscriptionSnapshot {
  const FreelancerSubscriptionSnapshot({
    required this.planId,
    this.plan,
    this.status,
    this.activationStatus,
    this.paymentStatus,
    this.expiryDate,
    this.actualStartDate,
  });

  final String planId;
  final FreelancerPlanSummary? plan;
  final String? status;
  final String? activationStatus;
  final String? paymentStatus;
  final String? expiryDate;
  final String? actualStartDate;

  String get displayPlanTitle => plan?.displayTitle ?? 'باقة مجانية';

  factory FreelancerSubscriptionSnapshot.fromJson(Map<String, dynamic> json) {
    final planRaw = json['plan'];
    return FreelancerSubscriptionSnapshot(
      planId: readString(json, 'planId', 'plan_id'),
      plan: planRaw is Map ? FreelancerPlanSummary.fromJson(Map<String, dynamic>.from(planRaw)) : null,
      status: readMapField<String>(json, 'status', 'status'),
      activationStatus: readMapField<String>(json, 'activationStatus', 'activation_status'),
      paymentStatus: readMapField<String>(json, 'paymentStatus', 'payment_status'),
      expiryDate: readMapField<String>(json, 'expiryDate', 'expiry_date'),
      actualStartDate: readMapField<String>(json, 'actualStartDate', 'actual_start_date'),
    );
  }
}

class ActivationFeeStatus {
  const ActivationFeeStatus({
    this.needsPayment = false,
    this.isCurrent = false,
    this.enabled = true,
    this.validUntil,
    this.paidAt,
    this.amountJod,
  });

  final bool needsPayment;
  final bool isCurrent;
  final bool enabled;
  final String? validUntil;
  final String? paidAt;
  final double? amountJod;

  factory ActivationFeeStatus.fromJson(Map<String, dynamic> json) {
    final enabledRaw = json['enabled'] ?? json['Enabled'];
    final enabled = enabledRaw == null ? true : enabledRaw == true || enabledRaw == 'true' || enabledRaw == 1;
    return ActivationFeeStatus(
      needsPayment: readBool(json, 'needsPayment', 'needs_payment'),
      isCurrent: readBool(json, 'isCurrent', 'is_current'),
      enabled: enabled,
      validUntil: readMapField<String>(json, 'validUntil', 'valid_until'),
      paidAt: readMapField<String>(json, 'paidAt', 'paid_at'),
      amountJod: readDouble(json, 'amountJod', 'amount_jod'),
    );
  }
}

class FreelancerSubscriptionBundle {
  const FreelancerSubscriptionBundle({
    this.subscription,
    this.activationFeeStatus,
  });

  final FreelancerSubscriptionSnapshot? subscription;
  final ActivationFeeStatus? activationFeeStatus;

  factory FreelancerSubscriptionBundle.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is! Map) return const FreelancerSubscriptionBundle();
    final map = Map<String, dynamic>.from(data);
    final subRaw = map['subscription'];
    final feeRaw = map['activationFeeStatus'] ?? map['activation_fee_status'];
    return FreelancerSubscriptionBundle(
      subscription: subRaw is Map
          ? FreelancerSubscriptionSnapshot.fromJson(Map<String, dynamic>.from(subRaw))
          : null,
      activationFeeStatus: feeRaw is Map
          ? ActivationFeeStatus.fromJson(Map<String, dynamic>.from(feeRaw))
          : null,
    );
  }
}

class FreelancerPlansSnapshot {
  const FreelancerPlansSnapshot({
    required this.plans,
    this.subscription,
    this.activationFeeStatus,
    this.eligibility,
  });

  final List<PublicPlan> plans;
  final FreelancerSubscriptionSnapshot? subscription;
  final ActivationFeeStatus? activationFeeStatus;
  final FreelancerEligibility? eligibility;
}

bool isCurrentPlanForSubscription(PublicPlan plan, FreelancerSubscriptionSnapshot? subscription) {
  if (subscription == null) return false;
  final currentId = subscription.planId.trim();
  if (currentId.isEmpty) return false;
  return currentId == plan.planRefId || currentId == plan.id;
}

PublicPlan? findPlanForSubscription(List<PublicPlan> plans, FreelancerSubscriptionSnapshot? subscription) {
  if (subscription == null) return null;
  for (final plan in plans) {
    if (isCurrentPlanForSubscription(plan, subscription)) return plan;
  }
  return null;
}

String freelancerSubscriptionStatusLabelAr(String? status) {
  switch (status) {
    case 'active':
      return 'نشط';
    case 'assigned_not_started':
      return 'مُعيَّن — لم يبدأ بعد';
    case 'expired':
      return 'منتهٍ';
    case 'inactive':
      return 'غير نشط';
    case 'cancelled':
      return 'ملغى';
    default:
      return status?.trim().isNotEmpty == true ? status! : '—';
  }
}

String freelancerActivationStatusLabelAr(String? status) {
  switch (status) {
    case 'company_approved':
      return 'موافقة الشركة';
    case 'company_pending':
      return 'بانتظار موافقة الشركة';
    default:
      return status?.trim().isNotEmpty == true ? status! : '—';
  }
}

String freelancerActivationFeeStatusLabelAr(ActivationFeeStatus? status) {
  if (status == null) return '—';
  if (status.enabled == false) return 'غير مطلوبة حالياً';
  if (status.isCurrent) return 'مدفوعة وسارية';
  if (status.needsPayment) return 'مطلوبة — غير مدفوعة';
  return '—';
}

String? formatPlanPriceLabel(PublicPlan plan) {
  final price = plan.displayPriceJod;
  if (price == null) return null;
  if (price <= 0) return 'مجانية';
  final amount = price == price.roundToDouble() ? price.toStringAsFixed(0) : price.toStringAsFixed(2);
  return '$amount ${plan.currency}';
}

String? formatPlanDurationLabel(PublicPlan plan) {
  final billing = plan.billingText?.trim();
  if (billing != null && billing.isNotEmpty) return billing;
  final days = plan.durationDays;
  if (days == null || days <= 0) return null;
  return '$days يوم';
}

String? formatPlanOrderValueRangeLabel({
  double? minJod,
  double? maxJod,
}) {
  if (minJod != null && maxJod != null) {
    return 'قيمة الطلب: ${minJod.toStringAsFixed(0)} – ${maxJod.toStringAsFixed(0)} دينار';
  }
  if (minJod != null) return 'قيمة الطلب من ${minJod.toStringAsFixed(0)} دينار';
  if (maxJod != null) return 'حتى ${maxJod.toStringAsFixed(0)} دينار للطلب';
  return null;
}

String freelancerPlansEligibilityHeadlineAr(FreelancerEligibility? eligibility) {
  if (eligibility == null) return 'حالة الأهلية غير متاحة حالياً.';
  return freelancerEligibilityMessageAr(eligibility);
}

const freelancerWebSubscriptionNoticeAr =
    'سيتم فتح الموقع لإكمال الاشتراك. سجّل الدخول بنفس حسابك، ثم ارجع للتطبيق واضغط تحديث حالة الاشتراك.';

/// Whether to show "complete subscription on web" for a plan card.
bool shouldShowWebSubscriptionButton({
  required PublicPlan plan,
  required bool isCurrentPlan,
  FreelancerSubscriptionSnapshot? subscription,
  ActivationFeeStatus? activationFeeStatus,
}) {
  if (!isCurrentPlan) return true;
  if (activationFeeStatus?.enabled != false && activationFeeStatus?.needsPayment == true) return true;
  if (subscription == null) return true;
  final status = subscription.status?.trim().toLowerCase();
  if (status == 'expired' || status == 'cancelled' || status == 'inactive') return true;
  return false;
}
