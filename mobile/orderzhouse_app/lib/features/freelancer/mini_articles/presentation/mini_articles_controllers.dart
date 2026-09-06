import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/errors/api_error_message.dart';
import '../data/mini_articles_copy.dart';
import '../data/mini_articles_models.dart';
import '../data/mini_articles_repository.dart';
import '../data/mini_articles_side_models.dart';

class MiniArticlesHubState {
  const MiniArticlesHubState({
    this.loading = true,
    this.refreshing = false,
    this.error,
    this.articles = const [],
    this.bildazo = const BildazoAuthorLinkStatus(),
    this.earnedBalance = const EarnedBalanceSnapshot(),
    this.trial = const ActivationTrialSnapshot(),
    this.conversion = const SilverConversionSnapshot(),
    this.trialBusy = false,
    this.trialError,
    this.silverBusy = false,
    this.silverError,
    this.silverMessage,
  });

  final bool loading;
  final bool refreshing;
  final String? error;
  final List<MiniArticle> articles;
  final BildazoAuthorLinkStatus bildazo;
  final EarnedBalanceSnapshot earnedBalance;
  final ActivationTrialSnapshot trial;
  final SilverConversionSnapshot conversion;
  final bool trialBusy;
  final String? trialError;
  final bool silverBusy;
  final String? silverError;
  final String? silverMessage;

  MiniArticlesHubState copyWith({
    bool? loading,
    bool? refreshing,
    String? error,
    List<MiniArticle>? articles,
    BildazoAuthorLinkStatus? bildazo,
    EarnedBalanceSnapshot? earnedBalance,
    ActivationTrialSnapshot? trial,
    SilverConversionSnapshot? conversion,
    bool? trialBusy,
    String? trialError,
    bool? silverBusy,
    String? silverError,
    String? silverMessage,
    bool clearError = false,
    bool clearTrialError = false,
    bool clearSilver = false,
  }) {
    return MiniArticlesHubState(
      loading: loading ?? this.loading,
      refreshing: refreshing ?? this.refreshing,
      error: clearError ? null : (error ?? this.error),
      articles: articles ?? this.articles,
      bildazo: bildazo ?? this.bildazo,
      earnedBalance: earnedBalance ?? this.earnedBalance,
      trial: trial ?? this.trial,
      conversion: conversion ?? this.conversion,
      trialBusy: trialBusy ?? this.trialBusy,
      trialError: clearTrialError ? null : (trialError ?? this.trialError),
      silverBusy: silverBusy ?? this.silverBusy,
      silverError: clearSilver ? null : (silverError ?? this.silverError),
      silverMessage: clearSilver ? null : (silverMessage ?? this.silverMessage),
    );
  }
}

final miniArticlesHubControllerProvider =
    StateNotifierProvider.autoDispose<MiniArticlesHubController, MiniArticlesHubState>(
  (ref) => MiniArticlesHubController(ref)..refresh(),
);

class MiniArticlesHubController extends StateNotifier<MiniArticlesHubState> {
  MiniArticlesHubController(this._ref) : super(const MiniArticlesHubState());

  final Ref _ref;
  bool _ctaViewed = false;

  Future<void> refresh() async {
    final first = state.articles.isEmpty;
    state = state.copyWith(
      loading: first,
      refreshing: !first,
      clearError: true,
      clearTrialError: true,
      clearSilver: true,
    );
    try {
      final hub = await _ref.read(miniArticlesRepositoryProvider).loadHub();
      state = state.copyWith(
        loading: false,
        refreshing: false,
        articles: hub.articles,
        bildazo: hub.bildazo,
        earnedBalance: hub.earnedBalance,
        trial: hub.trial,
        conversion: hub.conversion,
        clearError: true,
      );
      if (hub.conversion.shouldShowSilverCta && !_ctaViewed) {
        _ctaViewed = true;
        // ignore: unawaited_futures
        _ref.read(miniArticlesRepositoryProvider).recordCtaViewed();
      }
    } catch (e) {
      state = state.copyWith(
        loading: false,
        refreshing: false,
        error: apiErrorMessage(e, fallback: 'تعذر تحميل المقالات.'),
      );
    }
  }

  Future<void> activateTrial() async {
    if (state.trialBusy) return;
    state = state.copyWith(trialBusy: true, clearTrialError: true);
    try {
      final trial = await _ref.read(miniArticlesRepositoryProvider).activateTrial();
      state = state.copyWith(trial: trial, trialBusy: false, clearTrialError: true);
      await refresh();
    } catch (e) {
      state = state.copyWith(
        trialBusy: false,
        trialError: mapMiniArticleApplyErrorMessage(e, fallback: 'تعذر تفعيل التجربة.'),
      );
    }
  }

  Future<String?> startSilverCheckout() async {
    if (state.silverBusy) return null;
    state = state.copyWith(silverBusy: true, clearSilver: true);
    try {
      final result = await _ref.read(miniArticlesRepositoryProvider).startSilverCheckout();
      state = state.copyWith(
        silverBusy: false,
        silverMessage: result.checkoutUrl == null ? 'تم تجهيز طلب الترقية إلى Silver.' : null,
        conversion: result.shouldShowSilverCta ? result : state.conversion,
      );
      return result.checkoutUrl;
    } catch (e) {
      state = state.copyWith(
        silverBusy: false,
        silverError: apiErrorMessage(e, fallback: 'تعذر بدء ترقية Silver.'),
      );
      return null;
    }
  }
}

class MiniArticleDetailState {
  const MiniArticleDetailState({
    this.loading = true,
    this.applying = false,
    this.error,
    this.applyError,
    this.context,
  });

  final bool loading;
  final bool applying;
  final String? error;
  final String? applyError;
  final MiniArticleDetailContext? context;

  MiniArticleDetailState copyWith({
    bool? loading,
    bool? applying,
    String? error,
    String? applyError,
    MiniArticleDetailContext? context,
    bool clearError = false,
    bool clearApplyError = false,
  }) {
    return MiniArticleDetailState(
      loading: loading ?? this.loading,
      applying: applying ?? this.applying,
      error: clearError ? null : (error ?? this.error),
      applyError: clearApplyError ? null : (applyError ?? this.applyError),
      context: context ?? this.context,
    );
  }
}

final miniArticleDetailControllerProvider = StateNotifierProvider.autoDispose
    .family<MiniArticleDetailController, MiniArticleDetailState, String>(
  (ref, articleId) => MiniArticleDetailController(ref, articleId)..refresh(),
);

class MiniArticleDetailController extends StateNotifier<MiniArticleDetailState> {
  MiniArticleDetailController(this._ref, this.articleId) : super(const MiniArticleDetailState());

  final Ref _ref;
  final String articleId;

  Future<void> refresh() async {
    state = state.copyWith(loading: true, clearError: true, clearApplyError: true);
    try {
      final ctx = await _ref.read(miniArticlesRepositoryProvider).fetchDetail(articleId);
      state = state.copyWith(loading: false, context: ctx, clearError: true);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: apiErrorMessage(e, fallback: 'تعذر تحميل المقال.'),
      );
    }
  }

  Future<bool> apply({String? proposalMessage}) async {
    if (state.applying) return false;
    if (state.context?.application != null) return false;
    state = state.copyWith(applying: true, clearApplyError: true);
    try {
      final ctx = await _ref.read(miniArticlesRepositoryProvider).apply(
            articleId: articleId,
            proposalMessage: proposalMessage,
          );
      state = state.copyWith(applying: false, context: ctx, clearApplyError: true);
      return true;
    } catch (e) {
      state = state.copyWith(
        applying: false,
        applyError: mapMiniArticleApplyErrorMessage(e),
      );
      await refresh();
      return false;
    }
  }
}
