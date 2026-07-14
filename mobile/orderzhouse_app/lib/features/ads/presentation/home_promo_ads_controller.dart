import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../data/public_ad_models.dart';
import '../data/public_ads_api.dart';

const kHomeAdsPlacement = 'home_right_panel';

final publicAdsApiProvider = Provider<PublicAdsApi>((ref) {
  return PublicAdsApi(ref.watch(dioProvider));
});

final homePromoAdsProvider =
    AsyncNotifierProvider.autoDispose<HomePromoAdsController, List<PublicAd>>(
  HomePromoAdsController.new,
);

class HomePromoAdsController extends AutoDisposeAsyncNotifier<List<PublicAd>> {
  Timer? _poll;
  final Set<String> _impressed = <String>{};

  @override
  Future<List<PublicAd>> build() async {
    ref.onDispose(() => _poll?.cancel());
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _silentRefresh());
    return _fetch();
  }

  Future<List<PublicAd>> _fetch() async {
    final api = ref.read(publicAdsApiProvider);
    final ads = await api.listAds(placement: kHomeAdsPlacement);
    return ads.where((a) => a.isCurrentlyVisible).toList();
  }

  Future<void> _silentRefresh() async {
    try {
      final next = await _fetch();
      state = AsyncData(next);
    } catch (_) {
      /* keep previous */
    }
  }

  Future<void> trackImpression(PublicAd ad) async {
    if (_impressed.contains(ad.id)) return;
    _impressed.add(ad.id);
    await ref.read(publicAdsApiProvider).trackImpression(ad.id, placement: kHomeAdsPlacement);
  }

  Future<void> trackClick(PublicAd ad) async {
    await ref.read(publicAdsApiProvider).trackClick(ad.id, placement: kHomeAdsPlacement);
  }
}
