import '../../../core/network/json_helpers.dart';
import 'super_admin_kyc_models.dart';

const superAdminComingSoonMessageAr = 'هذه المهمة ستتوفر قريبًا على التطبيق.';
const superAdminUnavailableCardAr = 'غير متاح حاليًا';
const superAdminAccessDeniedAr = 'ليس لديك صلاحية للوصول إلى هذا المورد.';
const superAdminJodSuffixAr = 'د.أ';
const superAdminApproveActivationLabelAr = 'اعتماد التفعيل';
const superAdminOpenWebPanelAr = 'فتح لوحة الويب';
const superAdminActivationTileTitleAr = 'طلبات تفعيل تحتاج إجراء';
const superAdminIdentityQueueTitleAr = 'طلبات توثيق الهوية';
const superAdminSubscriptionActivationQueueTitleAr = 'طلبات تفعيل الاشتراك';
const superAdminLegacyFreeActivationSectionAr = 'طلبات مجانية قديمة تحتاج مراجعة';
const superAdminPackageAssignmentTitleAr = 'إسناد الباقات';
const superAdminFeedbackTileTitleAr = 'مشاكل واقتراحات';
const superAdminActivationListHintAr = 'اضغط للعرض والإجراء';
const superAdminActivationQueueTitleAr = 'طلبات التفعيل';
const superAdminActivationEmptyAr = 'لا توجد طلبات تفعيل بانتظار المراجعة.';
const superAdminPaidSubscriptionActivationEmptyAr =
    'لا توجد طلبات تفعيل اشتراك مدفوع حالياً.';
const superAdminInternalOrdersAuditNoteAr =
    'إدارة الطلبات الداخلية الكاملة ستتوفر في مرحلة A3 — استخدم لوحة الويب مؤقتاً.';
const superAdminInternalOrdersTileTitleAr = 'طلبات داخلية (لوحة الويب)';
const superAdminInternalOrdersHintAr = 'هذه الطلبات متاحة حالياً من لوحة الويب.';
const superAdminInAppActionsSectionAr = 'يحتاج إجراء في التطبيق';
const superAdminWebFollowUpSectionAr = 'متابعة من الويب';
const superAdminWebHandoffFailedAr = 'تعذر فتح لوحة الويب. حاول مرة أخرى.';

const superAdminConfirmApprovalTitleAr = 'تأكيد الاعتماد';
const superAdminConfirmApprovalBodyAr = 'هل تريد اعتماد هذا الحساب؟';
const superAdminUpdateClaimStatusLabelAr = 'تحديث حالة المطالبة';
const superAdminActionReasonLabelAr = 'سبب الإجراء';
const superAdminActionSuccessAr = 'تم تنفيذ الإجراء بنجاح';
const superAdminActionFailedAr = 'تعذر تنفيذ الإجراء. حاول مرة أخرى.';
const superAdminActionNoteTooShortAr = 'أدخل سبب الإجراء (3 أحرف على الأقل).';
const superAdminConfirmActionLabelAr = 'تأكيد';
const superAdminCancelActionLabelAr = 'إلغاء';
const superAdminPantryRelistLabelAr = 'فرصة معاد طرحها';
const superAdminAcceptBidLabelAr = 'قبول العرض';
const superAdminRejectBidLabelAr = 'رفض العرض';
const superAdminApproveDeliveryLabelAr = 'اعتماد التسليم';
const superAdminRequestRevisionLabelAr = 'طلب تعديل';
const superAdminOverrideReasonLabelAr = 'سبب تجاوز المرشح الأول';
const superAdminOverrideReasonHelperAr =
    'هذا العرض ليس المرشح الأول حسب ترتيب التوزيع العادل. يرجى توضيح سبب الاختيار قبل المتابعة.';
const superAdminOverrideReasonTooShortAr = 'سبب التجاوز يجب أن يكون 10 أحرف على الأقل.';
const superAdminOverrideReasonTooLongAr = 'سبب التجاوز يجب ألا يتجاوز 500 حرف.';
const superAdminRecommendedBidLabelAr = 'المرشح الأول';
const superAdminConfirmAcceptBidBodyAr = 'هل تريد قبول هذا العرض؟';
const superAdminConfirmRejectBidBodyAr = 'هل تريد رفض هذا العرض؟';
const superAdminConfirmApproveDeliveryBodyAr = 'هل تريد اعتماد هذا التسليم؟';
const superAdminRevisionNoteLabelAr = 'ملاحظات التعديل';
const superAdminFairOverrideMinChars = 10;
const superAdminFairOverrideMaxChars = 500;
const superAdminSelectApplicantLabelAr = 'اختيار المتقدم';
const superAdminConfirmSelectTitleAr = 'تأكيد الاختيار';
const superAdminConfirmSelectBodyAr = 'هل تريد اختيار هذا المتقدم؟';
const superAdminArticleOverrideHelperAr = 'يجب توضيح سبب اختيار متقدم غير المرشح الأول';
const superAdminRelistArticleLabelAr = 'إعادة طرح المناقصة';
const superAdminConfirmRelistBodyAr =
    'سيتم فتح جولة جديدة بنفس بيانات المقال، ولن يتم احتساب المتقدمين السابقين ضمن الجولة الجديدة.';
const superAdminAssignedApplicantLabelAr = 'تم الاختيار';

String formatSuperAdminJod(num? value) {
  if (value == null) return '—';
  final n = value.toDouble();
  if (!n.isFinite) return '—';
  final text = n == n.roundToDouble() ? n.toStringAsFixed(0) : n.toStringAsFixed(2);
  return '$text $superAdminJodSuffixAr';
}

class SuperAdminCountCard {
  const SuperAdminCountCard({
    required this.available,
    this.count,
    this.pending = false,
  });

  final bool available;
  final int? count;
  /// True while queue-specific counts are being enriched (avoid misleading home-fast totals).
  final bool pending;

  static const unavailable = SuperAdminCountCard(available: false);
  static const refreshing = SuperAdminCountCard(available: true, pending: true);

  factory SuperAdminCountCard.ok(int count) => SuperAdminCountCard(
        available: true,
        count: count < 0 ? 0 : count,
      );
}

class SuperAdminActionCenterSnapshot {
  const SuperAdminActionCenterSnapshot({
    required this.identityRequests,
    required this.subscriptionActivations,
    required this.claims,
    required this.unread,
    required this.pantry,
    required this.articles,
    required this.internalOrders,
    this.packageAssignment,
    this.feedback,
    this.openProjects,
    this.inProgressProjects,
    this.completedProjects,
    this.platformOrdersAvailable = false,
  });

  final SuperAdminCountCard identityRequests;
  final SuperAdminCountCard subscriptionActivations;
  final SuperAdminCountCard claims;
  final SuperAdminCountCard unread;
  final SuperAdminCountCard pantry;
  final SuperAdminCountCard articles;
  final SuperAdminCountCard internalOrders;
  final SuperAdminCountCard? packageAssignment;
  final SuperAdminCountCard? feedback;
  final int? openProjects;
  final int? inProgressProjects;
  final int? completedProjects;
  final bool platformOrdersAvailable;

  /// Backward-compatible combined activation count.
  SuperAdminCountCard get activations {
    if (identityRequests.pending || subscriptionActivations.pending) {
      return SuperAdminCountCard.refreshing;
    }
    if (!identityRequests.available && !subscriptionActivations.available) {
      return SuperAdminCountCard.unavailable;
    }
    final n = (identityRequests.available ? (identityRequests.count ?? 0) : 0) +
        (subscriptionActivations.available ? (subscriptionActivations.count ?? 0) : 0);
    return SuperAdminCountCard.ok(n);
  }

  bool get hasAnyAvailableSection =>
      identityRequests.available ||
      subscriptionActivations.available ||
      claims.available ||
      unread.available ||
      pantry.available ||
      articles.available ||
      internalOrders.available ||
      (packageAssignment?.available ?? false) ||
      (feedback?.available ?? false) ||
      platformOrdersAvailable;

  bool get hasUrgentWork {
    int n(SuperAdminCountCard c) =>
        c.available && !c.pending ? (c.count ?? 0) : 0;
    return n(identityRequests) +
        n(subscriptionActivations) +
        n(claims) +
        n(unread) +
        n(pantry) +
        n(articles) +
        n(feedback ?? const SuperAdminCountCard(available: false)) >
        0;
  }

  SuperAdminActionCenterSnapshot copyWith({
    SuperAdminCountCard? identityRequests,
    SuperAdminCountCard? subscriptionActivations,
    SuperAdminCountCard? claims,
    SuperAdminCountCard? unread,
    SuperAdminCountCard? pantry,
    SuperAdminCountCard? articles,
    SuperAdminCountCard? internalOrders,
    SuperAdminCountCard? packageAssignment,
    SuperAdminCountCard? feedback,
    int? openProjects,
    int? inProgressProjects,
    int? completedProjects,
    bool? platformOrdersAvailable,
  }) {
    return SuperAdminActionCenterSnapshot(
      identityRequests: identityRequests ?? this.identityRequests,
      subscriptionActivations: subscriptionActivations ?? this.subscriptionActivations,
      claims: claims ?? this.claims,
      unread: unread ?? this.unread,
      pantry: pantry ?? this.pantry,
      articles: articles ?? this.articles,
      internalOrders: internalOrders ?? this.internalOrders,
      packageAssignment: packageAssignment ?? this.packageAssignment,
      feedback: feedback ?? this.feedback,
      openProjects: openProjects ?? this.openProjects,
      inProgressProjects: inProgressProjects ?? this.inProgressProjects,
      completedProjects: completedProjects ?? this.completedProjects,
      platformOrdersAvailable: platformOrdersAvailable ?? this.platformOrdersAvailable,
    );
  }
}

class SuperAdminBidCollection {
  const SuperAdminBidCollection({
    this.status,
    this.outcome,
    this.current,
    this.required,
    this.label,
    this.thresholdReached = false,
    this.deadline,
    this.canRelistBidCollection,
    this.relistCount,
  });

  final String? status;
  final String? outcome;
  final int? current;
  final int? required;
  final String? label;
  final bool thresholdReached;
  final String? deadline;
  final bool? canRelistBidCollection;
  final int? relistCount;

  bool get needsAttention {
    final s = (status ?? '').trim().toLowerCase();
    final o = (outcome ?? '').trim().toLowerCase();
    if (s == 'minimum_not_met' || o == 'minimum_not_met') return true;
    if (s == 'threshold_reached' || s == 'eligible_for_assignment') return true;
    if (o == 'threshold_reached') return true;
    if (thresholdReached && s != 'assigned') return true;
    return false;
  }

  String get attentionLabelAr {
    final s = (status ?? '').trim().toLowerCase();
    final o = (outcome ?? '').trim().toLowerCase();
    if (s == 'collecting') return 'جمع العروض';
    if (s == 'minimum_not_met' || o == 'minimum_not_met') {
      return 'لم يكتمل الحد الأدنى';
    }
    if (s == 'eligible_for_assignment') return 'جاهز للإسناد';
    if (s == 'assigned') return superAdminAssignedApplicantLabelAr;
    if (s == 'threshold_reached' || o == 'threshold_reached' || thresholdReached) {
      return 'اكتمل العدد المطلوب';
    }
    if (label != null && label!.trim().isNotEmpty) return label!.trim();
    return s.isEmpty ? '—' : s;
  }

  factory SuperAdminBidCollection.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const SuperAdminBidCollection();
    final hasRelistFlag = json.containsKey('canRelistBidCollection') ||
        json.containsKey('can_relist_bid_collection');
    return SuperAdminBidCollection(
      status: _nullIfEmpty(readString(json, 'bidCollectionStatus', 'bid_collection_status')) ??
          _nullIfEmpty(readString(json, 'status', 'status')),
      outcome: _nullIfEmpty(readString(json, 'bidCollectionOutcome', 'bid_collection_outcome')) ??
          _nullIfEmpty(readString(json, 'outcome', 'outcome')),
      current: readInt(json, 'currentBidCount', 'current_bid_count') ?? readInt(json, 'current', 'current'),
      required: readInt(json, 'requiredBidCount', 'required_bid_count') ??
          readInt(json, 'required', 'required'),
      label: _nullIfEmpty(readString(json, 'label', 'label')),
      thresholdReached: readBool(json, 'thresholdReached', 'threshold_reached'),
      deadline: _nullIfEmpty(readString(json, 'deadline', 'deadline')),
      canRelistBidCollection: hasRelistFlag
          ? readBool(json, 'canRelistBidCollection', 'can_relist_bid_collection')
          : null,
      relistCount: readInt(json, 'relistCount', 'relist_count'),
    );
  }
}

class SuperAdminActivationItem {
  const SuperAdminActivationItem({
    required this.id,
    this.freelancerName,
    this.freelancerEmail,
    this.freelancerUserId,
    this.planId,
    this.planName,
    this.planTitle,
    this.paymentStatus,
    this.activationStatus,
    this.queueKind,
    this.priceJod,
    this.needsCompanyActivation,
    this.source,
    this.assignedByUserId,
    this.notes,
    this.assignedAt,
  });

  final String id;
  final String? freelancerName;
  final String? freelancerEmail;
  final String? freelancerUserId;
  final String? planId;
  final String? planName;
  final String? planTitle;
  final String? paymentStatus;
  final String? activationStatus;
  final String? queueKind;
  final double? priceJod;
  final bool? needsCompanyActivation;
  final String? source;
  final String? assignedByUserId;
  final String? notes;
  final String? assignedAt;

  factory SuperAdminActivationItem.fromJson(Map<String, dynamic> json) {
    final freelancer = json['freelancer'];
    Map<String, dynamic>? f;
    if (freelancer is Map) f = Map<String, dynamic>.from(freelancer);
    final plan = json['plan'];
    Map<String, dynamic>? p;
    if (plan is Map) p = Map<String, dynamic>.from(plan);

    final first = f == null ? '' : readString(f, 'firstName', 'first_name');
    final father = f == null ? '' : readString(f, 'fatherName', 'father_name');
    final family = f == null ? '' : readString(f, 'familyName', 'family_name');
    final name = [first, father, family].where((e) => e.trim().isNotEmpty).join(' ');

    final needsRaw = readMapField<dynamic>(json, 'needsCompanyActivation', 'needs_company_activation');
    bool? needs;
    if (needsRaw is bool) {
      needs = needsRaw;
    } else if (needsRaw != null) {
      needs = needsRaw == true || needsRaw == 1 || needsRaw == 'true' || needsRaw == 't';
    }

    return SuperAdminActivationItem(
      id: readString(json, 'id', 'id'),
      freelancerName: name.isEmpty ? null : name,
      freelancerEmail: f == null ? null : _nullIfEmpty(readString(f, 'email', 'email')),
      freelancerUserId: f == null
          ? _nullIfEmpty(readString(json, 'freelancerUserId', 'freelancer_user_id'))
          : _nullIfEmpty(readString(f, 'id', 'id')),
      planTitle: p == null
          ? null
          : (_nullIfEmpty(readString(p, 'title', 'title')) ??
              _nullIfEmpty(readString(p, 'name', 'name'))),
      planId: p == null ? null : _nullIfEmpty(readString(p, 'id', 'id')),
      planName: p == null ? null : _nullIfEmpty(readString(p, 'name', 'name')),
      paymentStatus: _nullIfEmpty(readString(json, 'paymentStatus', 'payment_status')),
      activationStatus: _nullIfEmpty(readString(json, 'activationStatus', 'activation_status')),
      queueKind: _nullIfEmpty(readString(json, 'activationQueueKind', 'activation_queue_kind')),
      priceJod: p == null ? null : readDouble(p, 'priceJod', 'price_jod'),
      needsCompanyActivation: needs,
      source: _nullIfEmpty(readString(json, 'source', 'source')),
      assignedByUserId: _nullIfEmpty(readString(json, 'assignedByUserId', 'assigned_by_user_id')),
      notes: _nullIfEmpty(readString(json, 'notes', 'notes')),
      assignedAt: _nullIfEmpty(() {
        final assigned = readString(json, 'assignedAt', 'assigned_at');
        if (assigned.trim().isNotEmpty) return assigned;
        return readString(json, 'createdAt', 'created_at');
      }()),
    );
  }
}

class SuperAdminActivationQueueSnapshot {
  const SuperAdminActivationQueueSnapshot({
    required this.kycItems,
    required this.subscriptionItems,
    this.kycSchemaReady = true,
    this.kycLoadFailed = false,
    this.subscriptionLoadFailed = false,
  });

  final List<SuperAdminKycActivationItem> kycItems;
  final List<SuperAdminActivationItem> subscriptionItems;
  final bool kycSchemaReady;
  final bool kycLoadFailed;
  final bool subscriptionLoadFailed;

  bool get isEmpty => kycItems.isEmpty && subscriptionItems.isEmpty;

  int get pendingIdentityCount =>
      kycItems.where((e) => e.isPendingReview).length;
}

class SuperAdminClaimItem {
  const SuperAdminClaimItem({
    required this.id,
    this.requestTitle,
    this.orderNumber,
    this.status,
    this.payoutStatus,
    this.totalPriceJod,
    this.freelancerName,
    this.submittedAt,
  });

  final String id;
  final String? requestTitle;
  final String? orderNumber;
  final String? status;
  final String? payoutStatus;
  final double? totalPriceJod;
  final String? freelancerName;
  final String? submittedAt;

  factory SuperAdminClaimItem.fromJson(Map<String, dynamic> json) {
    final freelancer = json['freelancer'];
    Map<String, dynamic>? f;
    if (freelancer is Map) f = Map<String, dynamic>.from(freelancer);
    final first = f == null ? '' : readString(f, 'firstName', 'first_name');
    final father = f == null ? '' : readString(f, 'fatherName', 'father_name');
    final family = f == null ? '' : readString(f, 'familyName', 'family_name');
    final name = [first, father, family].where((e) => e.trim().isNotEmpty).join(' ');

    return SuperAdminClaimItem(
      id: readString(json, 'id', 'id'),
      requestTitle: _nullIfEmpty(readString(json, 'requestTitle', 'request_title')),
      orderNumber: _nullIfEmpty(readString(json, 'orderNumber', 'order_number')),
      status: _nullIfEmpty(readString(json, 'status', 'status')),
      payoutStatus: _nullIfEmpty(readString(json, 'payoutStatus', 'payout_status')),
      totalPriceJod: readDouble(json, 'totalPriceSnapshot', 'total_price_snapshot') ??
          readDouble(json, 'userAmountSnapshot', 'user_amount_snapshot'),
      freelancerName: name.isEmpty ? null : name,
      submittedAt: _nullIfEmpty(readString(json, 'submittedAt', 'submitted_at')),
    );
  }
}

enum SuperAdminPantryItemKind { request, delivery }

class SuperAdminPantryAttentionItem {
  const SuperAdminPantryAttentionItem({
    required this.id,
    required this.title,
    this.kind,
    this.statusLabel,
    this.progressLabel,
    this.itemKind = SuperAdminPantryItemKind.request,
    this.relistCount,
    this.requestId,
    this.collectionStatus,
    this.requestStatus,
    this.deliveryStatus,
  });

  final String id;
  final String title;
  final String? kind;
  final String? statusLabel;
  final String? progressLabel;
  final SuperAdminPantryItemKind itemKind;
  final int? relistCount;
  final String? requestId;
  final String? collectionStatus;
  final String? requestStatus;
  final String? deliveryStatus;
}

class SuperAdminArticleAttentionItem {
  const SuperAdminArticleAttentionItem({
    required this.id,
    required this.title,
    this.statusLabel,
    this.progressLabel,
    this.valueJod,
    this.articleStatus,
    this.collectionStatus,
    this.collectionOutcome,
    this.relistCount,
    this.createdAt,
    this.deadline,
    this.assigned = false,
    this.canRelistBidCollection,
  });

  final String id;
  final String title;
  final String? statusLabel;
  final String? progressLabel;
  final double? valueJod;
  final String? articleStatus;
  final String? collectionStatus;
  final String? collectionOutcome;
  final int? relistCount;
  final String? createdAt;
  final String? deadline;
  final bool assigned;
  final bool? canRelistBidCollection;
}

SuperAdminActionCenterSnapshot parseHomeFastSnapshot(dynamic body) {
  final data = _unwrapData(body);
  if (data == null) {
    return const SuperAdminActionCenterSnapshot(
      identityRequests: SuperAdminCountCard.unavailable,
      subscriptionActivations: SuperAdminCountCard.unavailable,
      claims: SuperAdminCountCard.unavailable,
      unread: SuperAdminCountCard.unavailable,
      pantry: SuperAdminCountCard.unavailable,
      articles: SuperAdminCountCard.unavailable,
      internalOrders: SuperAdminCountCard.unavailable,
    );
  }

  final summary = data['summary'];
  Map<String, dynamic>? summaryMap;
  if (summary is Map) summaryMap = Map<String, dynamic>.from(summary);
  final attentionRaw = summaryMap?['attention'];
  Map<String, dynamic>? attention;
  if (attentionRaw is Map) attention = Map<String, dynamic>.from(attentionRaw);

  final platformRaw = summaryMap?['platformOrders'] ?? summaryMap?['platform_orders'];
  Map<String, dynamic>? platform;
  if (platformRaw is Map) platform = Map<String, dynamic>.from(platformRaw);

  SuperAdminCountCard attentionCard(String camel, String snake) {
    if (attention == null) return SuperAdminCountCard.unavailable;
    return SuperAdminCountCard.ok(readInt(attention, camel, snake) ?? 0);
  }

  return SuperAdminActionCenterSnapshot(
    identityRequests: SuperAdminCountCard.refreshing,
    subscriptionActivations: SuperAdminCountCard.refreshing,
    claims: attentionCard(
      'financialClaimsPending',
      'financial_claims_pending',
    ),
    unread: attentionCard(
      'unreadNotifications',
      'unread_notifications',
    ),
    pantry: SuperAdminCountCard.unavailable,
    articles: SuperAdminCountCard.unavailable,
    internalOrders: attentionCard(
      'internalOrdersPendingClaims',
      'internal_orders_pending_claims',
    ),
    packageAssignment: SuperAdminCountCard.ok(0),
    openProjects: platform == null ? null : readInt(platform, 'openProjects', 'open_projects'),
    inProgressProjects:
        platform == null ? null : readInt(platform, 'inProgressProjects', 'in_progress_projects'),
    completedProjects:
        platform == null ? null : readInt(platform, 'completedProjects', 'completed_projects'),
    platformOrdersAvailable: platform != null,
  );
}

List<SuperAdminActivationItem> parseActivationQueue(dynamic body) {
  final data = _unwrapData(body);
  final list = data == null
      ? const <Map<String, dynamic>>[]
      : extractList(data, nestedKey: 'subscriptions');
  return list.map(SuperAdminActivationItem.fromJson).toList();
}

int? parseActivationQueueTotal(dynamic body) {
  final data = _unwrapData(body);
  if (data == null) return null;
  final pagination = data['pagination'];
  if (pagination is Map) {
    return readInt(Map<String, dynamic>.from(pagination), 'total', 'total');
  }
  return parseActivationQueue(body).length;
}

List<SuperAdminClaimItem> parseClaimsList(dynamic body) {
  final data = _unwrapData(body);
  final list = data == null ? const <Map<String, dynamic>>[] : extractList(data, nestedKey: 'claims');
  return list.map(SuperAdminClaimItem.fromJson).toList();
}

List<SuperAdminPantryAttentionItem> parsePantryAttention({
  required dynamic requestsBody,
  required dynamic deliveriesBody,
}) {
  final items = <SuperAdminPantryAttentionItem>[];
  final reqData = _unwrapData(requestsBody);
  final requests = reqData == null
      ? const <Map<String, dynamic>>[]
      : extractList(reqData, nestedKey: 'requests');
  for (final row in requests) {
    final collectionRaw = row['bidCollection'] ?? row['bid_collection'];
    Map<String, dynamic>? collectionJson;
    if (collectionRaw is Map) collectionJson = Map<String, dynamic>.from(collectionRaw);
    final collection = SuperAdminBidCollection.fromJson(collectionJson);
    final status = (readString(row, 'status', 'status')).trim().toLowerCase();
    if (!collection.needsAttention &&
        status != 'submitted' &&
        status != 'revision_requested') {
      continue;
    }
    final current = collection.current;
    final required = collection.required;
    final relistCount = readInt(row, 'relistCount', 'relist_count') ?? 0;
    final statusLabel = collection.needsAttention
        ? collection.attentionLabelAr
        : pantryRequestStatusLabelAr(status);
    items.add(
      SuperAdminPantryAttentionItem(
        id: readString(row, 'id', 'id'),
        title: _nullIfEmpty(readString(row, 'title', 'title')) ?? 'طلب بيت المونة',
        kind: status == 'revision_requested' || status == 'submitted'
            ? 'تسليم بانتظار المراجعة'
            : 'جمع عروض',
        statusLabel: statusLabel,
        progressLabel: (current != null && required != null) ? '$current / $required' : null,
        itemKind: SuperAdminPantryItemKind.request,
        relistCount: relistCount,
        collectionStatus: collection.status,
        requestStatus: status,
      ),
    );
  }

  final delData = _unwrapData(deliveriesBody);
  final deliveries = delData == null
      ? const <Map<String, dynamic>>[]
      : extractList(delData, nestedKey: 'deliveries');
  for (final row in deliveries) {
    final status = readString(row, 'status', 'status').trim().toLowerCase();
    if (status != 'submitted' && status != 'revision_requested') continue;
    items.add(
      SuperAdminPantryAttentionItem(
        id: readString(row, 'id', 'id'),
        title: _nullIfEmpty(readString(row, 'requestTitle', 'request_title')) ??
            'تسليم بيت المونة',
        kind: 'تسليم بانتظار المراجعة',
        statusLabel: pantryDeliveryStatusLabelAr(status),
        itemKind: SuperAdminPantryItemKind.delivery,
        requestId: _nullIfEmpty(readString(row, 'pantryRequestId', 'pantry_request_id')),
        deliveryStatus: status,
      ),
    );
  }
  return items;
}

dynamic mergePantryDeliveriesBodies(dynamic submittedBody, dynamic revisionBody) {
  final da = _unwrapData(submittedBody);
  final db = _unwrapData(revisionBody);
  if (da == null && db == null) return submittedBody ?? revisionBody;
  final listA = da == null ? <Map<String, dynamic>>[] : extractList(da, nestedKey: 'deliveries');
  final listB = db == null ? <Map<String, dynamic>>[] : extractList(db, nestedKey: 'deliveries');
  final seen = <String>{};
  final merged = <Map<String, dynamic>>[];
  for (final row in [...listA, ...listB]) {
    final id = readString(row, 'id', 'id');
    if (id.isEmpty || seen.contains(id)) continue;
    seen.add(id);
    merged.add(row);
  }
  return {'data': {'deliveries': merged}};
}

String pantryRequestStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'open_for_bids':
      return 'مفتوح للعروض';
    case 'assigned':
      return 'معيّن';
    case 'revision_requested':
      return 'طلب تعديل';
    case 'approved':
      return 'معتمد';
    case 'submitted':
      return 'تسليم مقدّم';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : 'متابعة';
  }
}

String pantryDeliveryStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'submitted':
      return 'تسليم مقدّم';
    case 'revision_requested':
      return 'طلب تعديل';
    case 'approved':
      return 'معتمد';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : 'تسليم';
  }
}

String pantryCollectionStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'collecting':
      return 'جمع العروض';
    case 'threshold_reached':
      return 'اكتمل العدد المطلوب';
    case 'eligible_for_assignment':
      return 'جاهز للإسناد';
    case 'minimum_not_met':
      return 'لم يكتمل الحد الأدنى';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : '—';
  }
}

List<SuperAdminArticleAttentionItem> parseArticleAttention(dynamic body) {
  final data = _unwrapData(body);
  final articles = data == null
      ? const <Map<String, dynamic>>[]
      : extractList(data, nestedKey: 'articles');
  final items = <SuperAdminArticleAttentionItem>[];
  for (final row in articles) {
    final collectionRaw = row['bidCollection'] ?? row['bid_collection'];
    Map<String, dynamic>? collectionJson;
    if (collectionRaw is Map) collectionJson = Map<String, dynamic>.from(collectionRaw);
    final collection = SuperAdminBidCollection.fromJson(collectionJson);
    if (!collection.needsAttention) continue;
    final current = collection.current;
    final required = collection.required;
    final collectionStatus = (collection.status ?? '').trim().toLowerCase();
    final collectionOutcome = (collection.outcome ?? '').trim().toLowerCase();
    items.add(
      SuperAdminArticleAttentionItem(
        id: readString(row, 'id', 'id'),
        title: _nullIfEmpty(readString(row, 'title', 'title')) ?? 'مقال',
        statusLabel: collection.attentionLabelAr,
        progressLabel: (current != null && required != null) ? '$current / $required' : null,
        valueJod: readDouble(row, 'articleValueJod', 'article_value_jod'),
        articleStatus: _nullIfEmpty(readString(row, 'status', 'status')),
        collectionStatus: collection.status,
        collectionOutcome: collection.outcome,
        relistCount: readInt(row, 'relistCount', 'relist_count') ?? collection.relistCount,
        createdAt: _nullIfEmpty(readString(row, 'createdAt', 'created_at')) ??
            _nullIfEmpty(readString(row, 'publishedAt', 'published_at')),
        deadline: collection.deadline ??
            _nullIfEmpty(readString(row, 'applicationDeadlineAt', 'application_deadline_at')),
        assigned: collectionStatus == 'assigned' || collectionOutcome == 'assigned',
        canRelistBidCollection: collection.canRelistBidCollection,
      ),
    );
  }
  return items;
}

Map<String, dynamic>? _unwrapData(dynamic body) {
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
