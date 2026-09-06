import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'mini_articles_api.dart';
import 'mini_articles_models.dart';
import 'mini_articles_side_models.dart';

final miniArticlesRepositoryProvider = Provider<MiniArticlesRepository>((ref) {
  return MiniArticlesRepository(ref.watch(miniArticlesApiProvider));
});

class MiniArticlesHubSnapshot {
  const MiniArticlesHubSnapshot({
    required this.articles,
    required this.bildazo,
    required this.earnedBalance,
    required this.trial,
    required this.conversion,
  });

  final List<MiniArticle> articles;
  final BildazoAuthorLinkStatus bildazo;
  final EarnedBalanceSnapshot earnedBalance;
  final ActivationTrialSnapshot trial;
  final SilverConversionSnapshot conversion;
}

class MiniArticlesRepository {
  MiniArticlesRepository(this._api);

  final MiniArticlesApi _api;

  Future<MiniArticlesHubSnapshot> loadHub() async {
    final articlesFuture = _api.listPublished();
    final bildazoFuture = _api.fetchBildazoLink().catchError((_) => const BildazoAuthorLinkStatus());
    final earnedFuture =
        _api.fetchEarnedBalance().catchError((_) => const EarnedBalanceSnapshot());
    final trialFuture =
        _api.fetchTrial().catchError((_) => const ActivationTrialSnapshot());
    final conversionFuture =
        _api.fetchConversion().catchError((_) => const SilverConversionSnapshot());

    final results = await Future.wait([
      articlesFuture,
      bildazoFuture,
      earnedFuture,
      trialFuture,
      conversionFuture,
    ]);

    return MiniArticlesHubSnapshot(
      articles: results[0] as List<MiniArticle>,
      bildazo: results[1] as BildazoAuthorLinkStatus,
      earnedBalance: results[2] as EarnedBalanceSnapshot,
      trial: results[3] as ActivationTrialSnapshot,
      conversion: results[4] as SilverConversionSnapshot,
    );
  }

  Future<MiniArticleDetailContext> fetchDetail(String articleId) =>
      _api.fetchDetailContext(articleId);

  Future<MiniArticleDetailContext> apply({
    required String articleId,
    String? proposalMessage,
  }) {
    return _api.apply(articleId: articleId, proposalMessage: proposalMessage);
  }

  Future<ActivationTrialSnapshot> activateTrial() => _api.activateTrial();

  Future<void> recordCtaViewed() => _api.recordCtaViewed();

  Future<SilverConversionSnapshot> startSilverCheckout() => _api.startSilverCheckout();
}
