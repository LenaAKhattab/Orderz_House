import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../data/special_offer_api.dart';
import '../data/special_offer_models.dart';

final specialOfferApiProvider = Provider<SpecialOfferApi>((ref) {
  return SpecialOfferApi(ref.watch(dioProvider));
});

final publicSpecialOfferProvider = FutureProvider.autoDispose<SpecialOfferPackage?>((ref) async {
  return ref.read(specialOfferApiProvider).fetchPublicOffer();
});
