import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import 'public_page_models.dart';
import 'public_pages_api.dart';

final publicPagesApiProvider = Provider<PublicPagesApi>((ref) {
  return PublicPagesApi(ref.watch(dioProvider));
});

class PublicPagesRepository {
  PublicPagesRepository(this._api);

  final PublicPagesApi _api;

  Future<PublicSitePage> fetchBySlug(String slug) => _api.fetchBySlug(slug);
}

final publicPagesRepositoryProvider = Provider<PublicPagesRepository>((ref) {
  return PublicPagesRepository(ref.watch(publicPagesApiProvider));
});

final publicPageProvider = FutureProvider.family<PublicSitePage, String>((ref, slug) async {
  return ref.watch(publicPagesRepositoryProvider).fetchBySlug(slug);
});
