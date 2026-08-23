import '../../../../core/network/json_helpers.dart';

class BildazoAuthorLinkStatus {
  const BildazoAuthorLinkStatus({
    this.status,
    this.gateEnabled = false,
    this.displayName,
    this.publicId,
    this.profileUrl,
    this.bildazoLinked,
    this.hasBildazoAuthor,
  });

  final String? status;
  final bool gateEnabled;
  final String? displayName;
  final String? publicId;
  final String? profileUrl;
  final bool? bildazoLinked;
  final bool? hasBildazoAuthor;

  bool get isLinked {
    if (bildazoLinked == true || hasBildazoAuthor == true) return true;
    return (status ?? '').trim().toLowerCase() == 'linked';
  }

  bool get shouldBlockApply => gateEnabled && !isLinked;

  String? get resolvedProfileUrl {
    final u = profileUrl?.trim();
    return (u != null && u.isNotEmpty) ? u : null;
  }

  factory BildazoAuthorLinkStatus.fromResponse(dynamic body) {
    if (body is! Map) return const BildazoAuthorLinkStatus();
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'] as Map)
        : Map<String, dynamic>.from(body);
    return BildazoAuthorLinkStatus(
      status: readMapField<String>(data, 'status', 'status'),
      gateEnabled: data['gateEnabled'] == true || data['gate_enabled'] == true,
      displayName: readMapField<String>(data, 'displayName', 'display_name') ??
          readMapField<String>(data, 'authorDisplayName', 'author_display_name'),
      publicId: readMapField<String>(data, 'publicId', 'public_id') ??
          readMapField<String>(data, 'bildazoPublicId', 'bildazo_public_id'),
      profileUrl: readMapField<String>(data, 'profileUrl', 'profile_url') ??
          readMapField<String>(data, 'writerProfileUrl', 'writer_profile_url') ??
          readMapField<String>(data, 'bildazoProfileUrl', 'bildazo_profile_url') ??
          readMapField<String>(data, 'authorProfileUrl', 'author_profile_url'),
      bildazoLinked: data.containsKey('bildazoLinked') || data.containsKey('bildazo_linked')
          ? (data['bildazoLinked'] == true || data['bildazo_linked'] == true)
          : null,
      hasBildazoAuthor:
          data.containsKey('hasBildazoAuthor') || data.containsKey('has_bildazo_author')
              ? (data['hasBildazoAuthor'] == true || data['has_bildazo_author'] == true)
              : null,
    );
  }
}

class EarnedBalanceEntry {
  const EarnedBalanceEntry({
    required this.applicationId,
    this.articleId,
    this.articleTitle,
    this.amountJod,
    this.status,
    this.bildazoUrl,
    this.locked = false,
    this.withdrawable = false,
    this.withdrawalBlockedReason,
  });

  final String applicationId;
  final String? articleId;
  final String? articleTitle;

  /// Writer net only (API never sends gross as this field).
  final String? amountJod;
  final String? status;
  final String? bildazoUrl;
  final bool locked;
  final bool withdrawable;
  final String? withdrawalBlockedReason;

  String get statusKey => (status ?? '').trim().toLowerCase();

  String get statusLabelAr {
    switch (statusKey) {
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

  factory EarnedBalanceEntry.fromJson(Map<String, dynamic> json) {
    // Prefer writer net keys; never treat article gross as earned amount.
    final amount = json['amountJod'] ??
        json['amount_jod'] ??
        json['writerNetJod'] ??
        json['writer_net_jod'];
    return EarnedBalanceEntry(
      applicationId: readString(json, 'applicationId', 'application_id'),
      articleId: readMapField<String>(json, 'articleId', 'article_id'),
      articleTitle: readMapField<String>(json, 'articleTitle', 'article_title'),
      amountJod: amount?.toString(),
      status: readMapField<String>(json, 'status', 'status'),
      bildazoUrl: readMapField<String>(json, 'bildazoUrl', 'bildazo_url') ??
          readMapField<String>(json, 'bildazoArticleUrl', 'bildazo_article_url') ??
          readMapField<String>(json, 'articleUrl', 'article_url'),
      locked: readBool(json, 'locked', 'locked'),
      withdrawable: readBool(json, 'withdrawable', 'withdrawable'),
      withdrawalBlockedReason: readMapField<String>(
        json,
        'withdrawalBlockedReason',
        'withdrawal_blocked_reason',
      ),
    );
  }
}

class EarnedBalanceLockMessages {
  const EarnedBalanceLockMessages({this.headline, this.detail, this.cta});

  final String? headline;
  final String? detail;
  final String? cta;

  factory EarnedBalanceLockMessages.fromJson(dynamic raw) {
    if (raw is! Map) return const EarnedBalanceLockMessages();
    final map = Map<String, dynamic>.from(raw);
    String? pick(String key) {
      final v = map[key];
      if (v == null) return null;
      final s = '$v'.trim();
      return s.isEmpty ? null : s;
    }

    return EarnedBalanceLockMessages(
      headline: pick('headline'),
      detail: pick('detail'),
      cta: pick('cta'),
    );
  }
}

class EarnedBalanceLockPolicy {
  const EarnedBalanceLockPolicy({
    this.state,
    this.graceDays,
    this.graceDaysRemaining,
    this.trialEndsAt,
    this.forfeitureDeadlineAt,
    this.showSilverCta = false,
    this.messagesAr = const EarnedBalanceLockMessages(),
    this.messagesEn = const EarnedBalanceLockMessages(),
  });

  final String? state;
  final int? graceDays;
  final int? graceDaysRemaining;
  final String? trialEndsAt;
  final String? forfeitureDeadlineAt;
  final bool showSilverCta;
  final EarnedBalanceLockMessages messagesAr;
  final EarnedBalanceLockMessages messagesEn;

  String? get headlineAr => messagesAr.headline;
  String? get detailAr => messagesAr.detail;

  factory EarnedBalanceLockPolicy.fromJson(dynamic raw) {
    if (raw is! Map) return const EarnedBalanceLockPolicy();
    final map = Map<String, dynamic>.from(raw);
    final messages = map['messages'];
    Map<String, dynamic>? ar;
    Map<String, dynamic>? en;
    if (messages is Map) {
      final m = Map<String, dynamic>.from(messages);
      if (m['ar'] is Map) ar = Map<String, dynamic>.from(m['ar'] as Map);
      if (m['en'] is Map) en = Map<String, dynamic>.from(m['en'] as Map);
    }
    return EarnedBalanceLockPolicy(
      state: readMapField<String>(map, 'state', 'state'),
      graceDays: readInt(map, 'graceDays', 'grace_days'),
      graceDaysRemaining: readInt(map, 'graceDaysRemaining', 'grace_days_remaining') ??
          readInt(map, 'daysRemaining', 'days_remaining'),
      trialEndsAt: readMapField<String>(map, 'trialEndsAt', 'trial_ends_at'),
      forfeitureDeadlineAt:
          readMapField<String>(map, 'forfeitureDeadlineAt', 'forfeiture_deadline_at') ??
              readMapField<String>(map, 'graceEndsAt', 'grace_ends_at'),
      showSilverCta: readBool(map, 'showSilverCta', 'show_silver_cta') ||
          readBool(map, 'requiresSilver', 'requires_silver'),
      messagesAr: EarnedBalanceLockMessages.fromJson(ar),
      messagesEn: EarnedBalanceLockMessages.fromJson(en),
    );
  }
}

class EarnedBalanceWithdrawalPolicy {
  const EarnedBalanceWithdrawalPolicy({
    this.allowed = false,
    this.reason,
    this.messageAr,
    this.messageEn,
  });

  final bool allowed;
  final String? reason;
  final String? messageAr;
  final String? messageEn;

  factory EarnedBalanceWithdrawalPolicy.fromJson(dynamic raw) {
    if (raw is! Map) return const EarnedBalanceWithdrawalPolicy();
    final map = Map<String, dynamic>.from(raw);
    final hasAllowed = map.containsKey('allowed') || map.containsKey('canWithdraw') || map.containsKey('can_withdraw');
    final allowed = hasAllowed
        ? (readBool(map, 'allowed', 'allowed') ||
            readBool(map, 'canWithdraw', 'can_withdraw'))
        : false;
    return EarnedBalanceWithdrawalPolicy(
      allowed: allowed,
      reason: readMapField<String>(map, 'reason', 'reason'),
      messageAr: readMapField<String>(map, 'messageAr', 'message_ar'),
      messageEn: readMapField<String>(map, 'messageEn', 'message_en'),
    );
  }
}

class EarnedBalanceSnapshot {
  const EarnedBalanceSnapshot({
    this.totalPendingJod = '0.000',
    this.totalLockedPendingJod = '0.000',
    this.totalForfeitedJod = '0.000',
    this.totalAvailableJod = '0.000',
    this.totalAcceptedArticles = 0,
    this.totalPublishedArticles = 0,
    this.writerProfileUrl,
    this.lockPolicy,
    this.withdrawalPolicy,
    this.entries = const [],
  });

  final String totalPendingJod;
  final String totalLockedPendingJod;
  final String totalForfeitedJod;

  /// Net withdrawable only (company-approved settled writer net).
  final String totalAvailableJod;
  final int totalAcceptedArticles;
  final int totalPublishedArticles;
  final String? writerProfileUrl;
  final EarnedBalanceLockPolicy? lockPolicy;
  final EarnedBalanceWithdrawalPolicy? withdrawalPolicy;
  final List<EarnedBalanceEntry> entries;

  /// Prefer explicit locked total; fall back to pending only when entries/policy imply lock.
  String get displayLockedPendingJod {
    final locked = totalLockedPendingJod.trim();
    if (locked.isNotEmpty && locked != '0.000' && locked != '0') return locked;
    final hasPendingEntries = entries.any(
      (e) => e.statusKey == 'pending' || e.statusKey == 'pending_locked',
    );
    final state = (lockPolicy?.state ?? '').trim().toLowerCase();
    final policyLocked = state == 'trial_active_locked' || state == 'grace_period';
    if (hasPendingEntries || policyLocked) return totalPendingJod;
    return '0.000';
  }

  /// True withdrawable net shown to the user (never locked/closed).
  String get displayWithdrawableJod {
    if (withdrawalPolicy?.allowed == true) return totalAvailableJod;
    return '0.000';
  }

  factory EarnedBalanceSnapshot.fromResponse(dynamic body) {
    if (body is! Map) return const EarnedBalanceSnapshot();
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'] as Map)
        : Map<String, dynamic>.from(body);
    final entriesRaw = data['entries'];
    final entries = <EarnedBalanceEntry>[];
    if (entriesRaw is List) {
      for (final row in entriesRaw) {
        if (row is Map) {
          entries.add(EarnedBalanceEntry.fromJson(Map<String, dynamic>.from(row)));
        }
      }
    }

    String money(String camel, String snake, [String fallback = '0.000']) {
      final v = data[camel] ?? data[snake];
      if (v == null) return fallback;
      return v.toString();
    }

    final lockRaw = data['lockPolicy'] ?? data['lock_policy'];
    final withdrawalRaw = data['withdrawalPolicy'] ?? data['withdrawal_policy'];

    return EarnedBalanceSnapshot(
      totalPendingJod: money('totalPendingJod', 'total_pending_jod'),
      totalLockedPendingJod: money('totalLockedPendingJod', 'total_locked_pending_jod'),
      totalForfeitedJod: money('totalForfeitedJod', 'total_forfeited_jod'),
      totalAvailableJod: money(
        'totalAvailableJod',
        'total_available_jod',
        money('totalWithdrawableJod', 'total_withdrawable_jod'),
      ),
      totalAcceptedArticles:
          readInt(data, 'totalAcceptedArticles', 'total_accepted_articles') ?? 0,
      totalPublishedArticles:
          readInt(data, 'totalPublishedArticles', 'total_published_articles') ?? 0,
      writerProfileUrl: readMapField<String>(data, 'writerProfileUrl', 'writer_profile_url'),
      lockPolicy: lockRaw == null ? null : EarnedBalanceLockPolicy.fromJson(lockRaw),
      withdrawalPolicy: withdrawalRaw == null
          ? null
          : EarnedBalanceWithdrawalPolicy.fromJson(withdrawalRaw),
      entries: entries,
    );
  }
}

class ActivationTrialSnapshot {
  const ActivationTrialSnapshot({
    this.engineEnabled = false,
    this.status,
    this.daysRemaining,
    this.trialBidsUsed,
    this.trialBidLimit,
    this.dailyUsed,
    this.dailyLimit,
    this.acceptedWorkCount,
    this.successfulWorkCap,
    this.nextRequiredAction,
  });

  final bool engineEnabled;
  final String? status;
  final int? daysRemaining;
  final int? trialBidsUsed;
  final int? trialBidLimit;
  final int? dailyUsed;
  final int? dailyLimit;
  final int? acceptedWorkCount;
  final int? successfulWorkCap;
  final String? nextRequiredAction;

  factory ActivationTrialSnapshot.fromResponse(dynamic body) {
    if (body is! Map) return const ActivationTrialSnapshot();
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'] as Map)
        : Map<String, dynamic>.from(body);
    final trial = data['trial'] is Map ? Map<String, dynamic>.from(data['trial'] as Map) : <String, dynamic>{};
    final usage = data['usage'] is Map ? Map<String, dynamic>.from(data['usage'] as Map) : <String, dynamic>{};
    return ActivationTrialSnapshot(
      engineEnabled: data['engineEnabled'] == true || data['engine_enabled'] == true,
      status: readMapField<String>(data, 'status', 'status'),
      daysRemaining: readInt(trial, 'daysRemaining', 'days_remaining'),
      trialBidsUsed: readInt(usage, 'trialBidsUsed', 'trial_bids_used') ??
          readInt(trial, 'trialBidsUsed', 'trial_bids_used'),
      trialBidLimit: readInt(usage, 'trialBidLimit', 'trial_bid_limit') ??
          readInt(trial, 'trialBidLimit', 'trial_bid_limit'),
      dailyUsed: readInt(usage, 'dailyUsed', 'daily_used') ?? readInt(trial, 'dailyUsed', 'daily_used'),
      dailyLimit: readInt(usage, 'dailyLimit', 'daily_limit') ??
          readInt(trial, 'dailyBidLimit', 'daily_bid_limit'),
      acceptedWorkCount: readInt(usage, 'acceptedWorkCount', 'accepted_work_count') ??
          readInt(trial, 'acceptedWorkCount', 'accepted_work_count'),
      successfulWorkCap: readInt(usage, 'successfulWorkCap', 'successful_work_cap') ??
          readInt(trial, 'successfulWorkCap', 'successful_work_cap'),
      nextRequiredAction: readMapField<String>(data, 'nextRequiredAction', 'next_required_action'),
    );
  }

  String get statusLabelAr {
    switch ((status ?? '').trim()) {
      case 'not_started':
        return 'التجربة غير مفعّلة';
      case 'eligible':
        return 'مؤهل للتجربة';
      case 'trial_active':
        return 'التجربة نشطة';
      case 'trial_expired_high_intent':
        return 'انتهت التجربة';
      case 'paid_active':
        return 'اشتراك مدفوع نشط';
      default:
        return status?.trim().isNotEmpty == true ? status!.trim() : 'حالة التجربة';
    }
  }
}

class SilverConversionSnapshot {
  const SilverConversionSnapshot({
    this.shouldShowSilverCta = false,
    this.buttonLabel,
    this.priceJod,
    this.plansRoute,
    this.checkoutUrl,
  });

  final bool shouldShowSilverCta;
  final String? buttonLabel;
  final num? priceJod;
  final String? plansRoute;
  final String? checkoutUrl;

  factory SilverConversionSnapshot.fromResponse(dynamic body) {
    if (body is! Map) return const SilverConversionSnapshot();
    final data = body['data'] is Map
        ? Map<String, dynamic>.from(body['data'] as Map)
        : Map<String, dynamic>.from(body);
    final cta = data['cta'] is Map ? Map<String, dynamic>.from(data['cta'] as Map) : <String, dynamic>{};
    final silver = data['silverPlan'] is Map
        ? Map<String, dynamic>.from(data['silverPlan'] as Map)
        : <String, dynamic>{};
    final handoff = data['handoff'] is Map
        ? Map<String, dynamic>.from(data['handoff'] as Map)
        : <String, dynamic>{};
    final price = silver['priceJod'] ?? silver['price_jod'];
    return SilverConversionSnapshot(
      shouldShowSilverCta: data['shouldShowSilverCta'] == true,
      buttonLabel: readMapField<String>(cta, 'buttonLabel', 'button_label'),
      priceJod: price is num ? price : num.tryParse('$price'),
      plansRoute: readMapField<String>(handoff, 'plansRoute', 'plans_route'),
      checkoutUrl: readMapField<String>(data, 'checkoutUrl', 'checkout_url'),
    );
  }
}
