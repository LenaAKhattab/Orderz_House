import '../../../../core/network/json_helpers.dart';

class BildazoAuthorLinkStatus {
  const BildazoAuthorLinkStatus({
    this.status,
    this.gateEnabled = false,
    this.displayName,
    this.publicId,
  });

  final String? status;
  final bool gateEnabled;
  final String? displayName;
  final String? publicId;

  bool get isLinked => (status ?? '').trim().toLowerCase() == 'linked';
  bool get shouldBlockApply => gateEnabled && !isLinked;

  factory BildazoAuthorLinkStatus.fromResponse(dynamic body) {
    if (body is! Map) return const BildazoAuthorLinkStatus();
    final data = body['data'] is Map ? Map<String, dynamic>.from(body['data'] as Map) : Map<String, dynamic>.from(body);
    return BildazoAuthorLinkStatus(
      status: readMapField<String>(data, 'status', 'status'),
      gateEnabled: data['gateEnabled'] == true || data['gate_enabled'] == true,
      displayName: readMapField<String>(data, 'displayName', 'display_name') ??
          readMapField<String>(data, 'authorDisplayName', 'author_display_name'),
      publicId: readMapField<String>(data, 'publicId', 'public_id') ??
          readMapField<String>(data, 'bildazoPublicId', 'bildazo_public_id'),
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
  });

  final String applicationId;
  final String? articleId;
  final String? articleTitle;
  final String? amountJod;
  final String? status;
  final String? bildazoUrl;

  String get statusLabelAr {
    switch ((status ?? '').trim().toLowerCase()) {
      case 'pending':
        return 'قيد المعالجة';
      case 'settled_externally':
        return 'مسجّل';
      case 'voided':
        return 'ملغى';
      default:
        return status?.trim().isNotEmpty == true ? status!.trim() : '—';
    }
  }

  factory EarnedBalanceEntry.fromJson(Map<String, dynamic> json) {
    return EarnedBalanceEntry(
      applicationId: readString(json, 'applicationId', 'application_id'),
      articleId: readMapField<String>(json, 'articleId', 'article_id'),
      articleTitle: readMapField<String>(json, 'articleTitle', 'article_title'),
      amountJod: (json['amountJod'] ?? json['amount_jod'])?.toString(),
      status: readMapField<String>(json, 'status', 'status'),
      bildazoUrl: readMapField<String>(json, 'bildazoUrl', 'bildazo_url'),
    );
  }
}

class EarnedBalanceSnapshot {
  const EarnedBalanceSnapshot({
    this.totalPendingJod = '0.000',
    this.totalAcceptedArticles = 0,
    this.totalPublishedArticles = 0,
    this.entries = const [],
  });

  final String totalPendingJod;
  final int totalAcceptedArticles;
  final int totalPublishedArticles;
  final List<EarnedBalanceEntry> entries;

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
    return EarnedBalanceSnapshot(
      totalPendingJod: (data['totalPendingJod'] ?? data['total_pending_jod'] ?? '0.000').toString(),
      totalAcceptedArticles:
          readInt(data, 'totalAcceptedArticles', 'total_accepted_articles') ?? 0,
      totalPublishedArticles:
          readInt(data, 'totalPublishedArticles', 'total_published_articles') ?? 0,
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
