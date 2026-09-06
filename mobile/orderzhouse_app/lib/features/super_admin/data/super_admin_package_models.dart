import '../../../core/network/json_helpers.dart';

const superAdminPackageLegacySectionAr = 'باقات قديمة / مؤرشفة';
const superAdminPackageChangeConfirmAr = 'هل أنت متأكد من تغيير الباقة؟';
const superAdminPackageAssignSuccessAr = 'تم تغيير الباقة بنجاح.';
const superAdminPackageTrainingUnavailableAr =
    'إكمال التدريب يتم عبر مسار المتدرب — لا يتوفر تعديل يدوي من التطبيق.';
const superAdminPackageVerifyUnavailableAr =
    'توثيق الحساب يتم من صفحة طلبات توثيق الهوية عند وجود طلب معلّق.';
const superAdminPackageFilterAllAr = 'الكل';
const superAdminPackageFilterPackageAr = 'الباقة';
const superAdminPackageFilterIdentityAr = 'حالة التوثيق';
const superAdminPackageFilterTrainingAr = 'حالة التدريب';
const superAdminPackageIdentityVerifiedAr = 'موثق';
const superAdminPackageIdentityUnverifiedAr = 'غير موثق';
const superAdminPackageIdentityPendingAr = 'قيد المراجعة';
const superAdminPackageTrainingDoneAr = 'مكتمل';
const superAdminPackageTrainingIncompleteAr = 'غير مكتمل';

enum PackageIdentityFilter { all, verified, unverified, pending }

enum PackageTrainingFilter { all, completed, incomplete }

class SuperAdminPackageListFilters {
  const SuperAdminPackageListFilters({
    this.packageLabel,
    this.identity = PackageIdentityFilter.all,
    this.training = PackageTrainingFilter.all,
  });

  final String? packageLabel;
  final PackageIdentityFilter identity;
  final PackageTrainingFilter training;

  bool get isDefault =>
      (packageLabel == null || packageLabel!.isEmpty) &&
      identity == PackageIdentityFilter.all &&
      training == PackageTrainingFilter.all;

  SuperAdminPackageListFilters copyWith({
    String? packageLabel,
    PackageIdentityFilter? identity,
    PackageTrainingFilter? training,
    bool clearPackage = false,
  }) {
    return SuperAdminPackageListFilters(
      packageLabel: clearPackage ? null : (packageLabel ?? this.packageLabel),
      identity: identity ?? this.identity,
      training: training ?? this.training,
    );
  }
}

bool matchesPackageListFilters(SuperAdminFreelancerListItem item, SuperAdminPackageListFilters filters) {
  if (filters.packageLabel != null && filters.packageLabel!.trim().isNotEmpty) {
    if (item.planLabel != filters.packageLabel) return false;
  }
  switch (filters.identity) {
    case PackageIdentityFilter.all:
      break;
    case PackageIdentityFilter.verified:
      if (item.identityStatusLabel != superAdminPackageIdentityVerifiedAr) return false;
    case PackageIdentityFilter.unverified:
      if (item.identityStatusLabel != superAdminPackageIdentityUnverifiedAr) return false;
    case PackageIdentityFilter.pending:
      if (item.identityStatusLabel != superAdminPackageIdentityPendingAr) return false;
  }
  switch (filters.training) {
    case PackageTrainingFilter.all:
      break;
    case PackageTrainingFilter.completed:
      if (item.trainingStatusLabel != superAdminPackageTrainingDoneAr) return false;
    case PackageTrainingFilter.incomplete:
      if (item.trainingStatusLabel != superAdminPackageTrainingIncompleteAr) return false;
  }
  return true;
}

List<SuperAdminFreelancerListItem> applyPackageListFilters(
  List<SuperAdminFreelancerListItem> items,
  SuperAdminPackageListFilters filters,
) {
  if (filters.isDefault) return items;
  return items.where((e) => matchesPackageListFilters(e, filters)).toList();
}

class SuperAdminFreelancerListItem {
  const SuperAdminFreelancerListItem({
    required this.id,
    this.displayName,
    this.email,
    this.accountStatus,
    this.emailVerified = false,
    this.activationStatus,
    this.paymentStatus,
    this.subscriptionStatus,
    this.assignable = false,
    this.ineligibleReason,
  });

  final String id;
  final String? displayName;
  final String? email;
  final String? accountStatus;
  final bool emailVerified;
  final String? activationStatus;
  final String? paymentStatus;
  final String? subscriptionStatus;
  final bool assignable;
  final String? ineligibleReason;

  String get identityStatusLabel => identityStatusLabelFromActivation(activationStatus);

  String get trainingStatusLabel => packageTrainingStatusLabel(
        eligible: assignable,
        ineligibleReason: ineligibleReason,
      );

  String get planLabel => packagePlanLabel(
        activationStatus: activationStatus,
        subscriptionStatus: subscriptionStatus,
      );

  factory SuperAdminFreelancerListItem.fromJson(Map<String, dynamic> json) {
    final sub = json['subscription'];
    Map<String, dynamic>? s;
    if (sub is Map) s = Map<String, dynamic>.from(sub);
    return SuperAdminFreelancerListItem(
      id: readString(json, 'id', 'id'),
      displayName: _nullIfEmpty(readString(json, 'displayName', 'display_name')) ??
          _nullIfEmpty(readString(json, 'fullName', 'full_name')) ??
          _nullIfEmpty(readString(json, 'name', 'name')),
      email: _nullIfEmpty(readString(json, 'email', 'email')),
      accountStatus: _nullIfEmpty(readString(json, 'status', 'status')),
      emailVerified: readBool(json, 'emailVerified', 'email_verified'),
      activationStatus: s == null ? null : _nullIfEmpty(readString(s, 'activationStatus', 'activation_status')),
      paymentStatus: s == null ? null : _nullIfEmpty(readString(s, 'paymentStatus', 'payment_status')),
      subscriptionStatus: s == null ? null : _nullIfEmpty(readString(s, 'status', 'status')),
      assignable: readBool(json, 'assignable', 'assignable'),
      ineligibleReason: _nullIfEmpty(readString(json, 'ineligibleReason', 'ineligible_reason')),
    );
  }
}

class SuperAdminAssignablePlan {
  const SuperAdminAssignablePlan({
    required this.id,
    this.name,
    this.title,
    this.priceJod,
    this.isActive = true,
    this.marketplaceTier,
    this.isLegacy = false,
  });

  final String id;
  final String? name;
  final String? title;
  final double? priceJod;
  final bool isActive;
  final String? marketplaceTier;
  final bool isLegacy;

  String get displayTitle => (title ?? name ?? id).trim();

  factory SuperAdminAssignablePlan.fromJson(Map<String, dynamic> json) {
    final name = _nullIfEmpty(readString(json, 'name', 'name')) ?? '';
    final title = _nullIfEmpty(readString(json, 'title', 'title'));
    final tier = detectMarketplaceTier(name: name, title: title);
    final legacy = tier == null && !_isCanonicalActiveTier(name, title);
    return SuperAdminAssignablePlan(
      id: readString(json, 'id', 'id'),
      name: name.isEmpty ? null : name,
      title: title,
      priceJod: readDouble(json, 'priceJod', 'price_jod'),
      isActive: readBool(json, 'isActive', 'is_active', fallback: true),
      marketplaceTier: tier,
      isLegacy: legacy,
    );
  }
}

class SuperAdminFreelancerPackageDetail {
  const SuperAdminFreelancerPackageDetail({
    required this.userId,
    this.displayName,
    this.email,
    this.phone,
    this.accountStatus,
    this.planTitle,
    this.planName,
    this.subscriptionStatus,
    this.activationStatus,
    this.paymentStatus,
    this.expiresAt,
    this.eligible = false,
    this.eligibilityReason,
    this.assignablePlans = const [],
  });

  final String userId;
  final String? displayName;
  final String? email;
  final String? phone;
  final String? accountStatus;
  final String? planTitle;
  final String? planName;
  final String? subscriptionStatus;
  final String? activationStatus;
  final String? paymentStatus;
  final String? expiresAt;
  final bool eligible;
  final String? eligibilityReason;
  final List<SuperAdminAssignablePlan> assignablePlans;

  String get identityStatusLabel => identityStatusLabelFromActivation(activationStatus);

  String get trainingStatusLabel => packageTrainingStatusLabel(
        eligible: eligible,
        ineligibleReason: eligibilityReason,
      );

  String get planLabel => packagePlanLabel(
        activationStatus: activationStatus,
        subscriptionStatus: subscriptionStatus,
      );

  String get accountStatusLabel =>
      accountStatus == 'active' ? 'نشط' : 'غير نشط';
}

String packagePlanLabel({String? activationStatus, String? subscriptionStatus}) {
  final activation = (activationStatus ?? '').trim().toLowerCase();
  if (activation.isEmpty && subscriptionStatus == null) return '—';
  if (activation == 'company_approved') return 'اشتراك مفعّل';
  if (activation == 'company_pending') return 'بانتظار تفعيل';
  return subscriptionStatusLabelAr(subscriptionStatus);
}

String packageTrainingStatusLabel({
  required bool eligible,
  String? ineligibleReason,
}) {
  final reason = (ineligibleReason ?? '').trim();
  if (reason.contains('تدريب') || reason.toLowerCase().contains('training')) {
    return superAdminPackageTrainingIncompleteAr;
  }
  if (eligible) return superAdminPackageTrainingDoneAr;
  return superAdminPackageTrainingIncompleteAr;
}

SuperAdminFreelancerListItem? findPackageListItem(
  List<SuperAdminFreelancerListItem> items,
  String userId,
) {
  for (final item in items) {
    if (item.id == userId) return item;
  }
  return null;
}

String identityStatusLabelFromActivation(String? activationStatus) {
  switch ((activationStatus ?? '').trim().toLowerCase()) {
    case 'company_approved':
      return superAdminPackageIdentityVerifiedAr;
    case 'company_pending':
      return superAdminPackageIdentityPendingAr;
    default:
      return superAdminPackageIdentityUnverifiedAr;
  }
}

String subscriptionStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'active':
      return 'نشط';
    case 'assigned_not_started':
      return 'معيّن — لم يبدأ';
    case 'inactive':
      return 'غير نشط';
    case 'cancelled':
      return 'ملغى';
    case 'expired':
      return 'منتهٍ';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

String? detectMarketplaceTier({required String name, String? title}) {
  final hay = '${name.toLowerCase()} ${(title ?? '').toLowerCase()}';
  if (hay.contains('elite')) return 'ELITE';
  if (hay.contains('pro')) return 'PRO';
  if (hay.contains('silver')) return 'SILVER';
  if (hay.contains('starter') || hay.contains('start')) return 'STARTER';
  return null;
}

bool _isCanonicalActiveTier(String name, String? title) {
  return detectMarketplaceTier(name: name, title: title) != null;
}

List<SuperAdminFreelancerListItem> parseFreelancerSearchList(dynamic body) {
  final data = _unwrap(body);
  if (data == null) return const [];
  final raw = data['freelancers'] ?? data['items'] ?? data['results'];
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => SuperAdminFreelancerListItem.fromJson(Map<String, dynamic>.from(e)))
      .toList();
}

List<SuperAdminAssignablePlan> parseAssignablePlans(dynamic body) {
  final data = _unwrap(body);
  if (data == null) return const [];
  final raw = data['plans'];
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => SuperAdminAssignablePlan.fromJson(Map<String, dynamic>.from(e)))
      .where((p) => p.isActive)
      .toList();
}

SuperAdminFreelancerPackageDetail parseFreelancerPackageDetail({
  required String userId,
  required dynamic subscriptionBody,
  required dynamic eligibilityBody,
  required dynamic plansBody,
  SuperAdminFreelancerListItem? listItem,
}) {
  final subData = _unwrap(subscriptionBody);
  Map<String, dynamic>? sub;
  final subRaw = subData?['subscription'];
  if (subRaw is Map) {
    sub = Map<String, dynamic>.from(subRaw);
  } else if (subData != null && subData['id'] != null) {
    sub = subData;
  }

  final planRaw = sub?['plan'];
  Map<String, dynamic>? plan;
  if (planRaw is Map) plan = Map<String, dynamic>.from(planRaw);

  final eligData = _unwrap(eligibilityBody);
  final eligible = eligData == null ? false : readBool(eligData, 'eligible', 'eligible');
  final reason = eligData == null
      ? null
      : _nullIfEmpty(readString(eligData, 'reason', 'reason'));

  final activationStatus = sub == null
      ? listItem?.activationStatus
      : (_nullIfEmpty(readString(sub, 'activationStatus', 'activation_status')) ??
          listItem?.activationStatus);
  final subscriptionStatus = sub == null
      ? listItem?.subscriptionStatus
      : (_nullIfEmpty(readString(sub, 'status', 'status')) ?? listItem?.subscriptionStatus);

  return SuperAdminFreelancerPackageDetail(
    userId: userId,
    displayName: listItem?.displayName,
    email: listItem?.email,
    accountStatus: listItem?.accountStatus,
    planTitle: plan == null
        ? null
        : (_nullIfEmpty(readString(plan, 'title', 'title')) ??
            _nullIfEmpty(readString(plan, 'name', 'name'))),
    planName: plan == null ? null : _nullIfEmpty(readString(plan, 'name', 'name')),
    subscriptionStatus: subscriptionStatus,
    activationStatus: activationStatus,
    paymentStatus: sub == null ? listItem?.paymentStatus : _nullIfEmpty(readString(sub, 'paymentStatus', 'payment_status')),
    expiresAt: sub == null
        ? null
        : (_nullIfEmpty(readString(sub, 'expiresAt', 'expires_at')) ??
            _nullIfEmpty(readString(sub, 'endAt', 'end_at'))),
    eligible: eligible,
    eligibilityReason: reason ?? listItem?.ineligibleReason,
    assignablePlans: parseAssignablePlans(plansBody),
  );
}

Map<String, dynamic>? _unwrap(dynamic body) {
  if (body is! Map) return null;
  final map = Map<String, dynamic>.from(body);
  final data = map['data'];
  if (data is Map) return Map<String, dynamic>.from(data);
  return map;
}

String? _nullIfEmpty(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}
