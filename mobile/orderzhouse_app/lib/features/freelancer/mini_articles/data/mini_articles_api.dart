import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_provider.dart';
import 'mini_articles_models.dart';
import 'mini_articles_side_models.dart';

final miniArticlesApiProvider = Provider<MiniArticlesApi>((ref) {
  return MiniArticlesApi(ref.watch(dioProvider));
});

class MiniArticlesApi {
  MiniArticlesApi(this._dio);

  final Dio _dio;

  Future<List<MiniArticle>> listPublished({int limit = 50, int offset = 0}) async {
    final response = await _dio.get<dynamic>(
      '/marketplace-articles',
      queryParameters: {'limit': limit, 'offset': offset},
    );
    return MiniArticle.parseListResponse(response.data);
  }

  Future<MiniArticleDetailContext> fetchDetailContext(String articleId) async {
    final response = await _dio.get<dynamic>(
      '/freelancer/marketplace-articles/$articleId/application',
    );
    return MiniArticleDetailContext.fromResponse(response.data);
  }

  Future<MiniArticleDetailContext> apply({
    required String articleId,
    String? proposalMessage,
  }) async {
    final response = await _dio.post<dynamic>(
      '/freelancer/marketplace-articles/$articleId/applications',
      data: {
        if (proposalMessage != null && proposalMessage.trim().isNotEmpty)
          'proposalMessage': proposalMessage.trim(),
      },
    );
    // Prefer fresh context after apply.
    try {
      return await fetchDetailContext(articleId);
    } catch (_) {
      final data = response.data;
      if (data is Map && data['data'] is Map) {
        final map = Map<String, dynamic>.from(data['data'] as Map);
        final app = map['application'];
        final article = map['article'];
        if (article is Map) {
          return MiniArticleDetailContext(
            article: MiniArticle.fromJson(Map<String, dynamic>.from(article)),
            application: app is Map
                ? ArticleApplication.fromJson(Map<String, dynamic>.from(app))
                : null,
            eligibility: ArticleApplicationEligibility.fromJson(map['eligibility']),
          );
        }
      }
      return fetchDetailContext(articleId);
    }
  }

  Future<BildazoAuthorLinkStatus> fetchBildazoLink() async {
    final response = await _dio.get<dynamic>('/freelancer/bildazo-author-link/me');
    return BildazoAuthorLinkStatus.fromResponse(response.data);
  }

  Future<EarnedBalanceSnapshot> fetchEarnedBalance() async {
    final response = await _dio.get<dynamic>('/freelancer/activation/earned-balance');
    return EarnedBalanceSnapshot.fromResponse(response.data);
  }

  Future<ActivationTrialSnapshot> fetchTrial() async {
    final response = await _dio.get<dynamic>('/freelancer/activation-trial');
    return ActivationTrialSnapshot.fromResponse(response.data);
  }

  Future<ActivationTrialSnapshot> activateTrial() async {
    final response = await _dio.post<dynamic>('/freelancer/activation-trial/activate');
    return ActivationTrialSnapshot.fromResponse(response.data);
  }

  Future<SilverConversionSnapshot> fetchConversion() async {
    final response = await _dio.get<dynamic>('/freelancer/activation/conversion');
    return SilverConversionSnapshot.fromResponse(response.data);
  }

  Future<void> recordCtaViewed() async {
    await _dio.post<dynamic>('/freelancer/activation/conversion/cta-viewed');
  }

  Future<SilverConversionSnapshot> startSilverCheckout() async {
    final response = await _dio.post<dynamic>('/freelancer/activation/conversion/start-silver-checkout');
    return SilverConversionSnapshot.fromResponse(response.data);
  }
}
