import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/ads/data/mobile_ads_path.dart';
import 'package:orderzhouse_app/features/ads/data/popup_ad_dismiss_store.dart';
import 'package:orderzhouse_app/features/ads/data/popup_ad_models.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';

void main() {
  group('MobileAdsPath', () {
    test('maps freelancer home to dashboard path', () {
      const user = AuthUser(
        id: '1',
        email: 'f@x.com',
        role: 'freelancer',
        primaryRole: 'freelancer',
      );
      expect(
        MobileAdsPath.webPathnameForLocation('/home', user: user),
        '/dashboard/freelancer',
      );
    });

    test('blocks create-order and payment routes', () {
      expect(MobileAdsPath.isPopupRouteBlocked('/client/orders/create'), isTrue);
      expect(MobileAdsPath.isPopupRouteBlocked('/payment/return?checkout=success'), isTrue);
      expect(MobileAdsPath.isPopupRouteBlocked('/login'), isTrue);
      expect(MobileAdsPath.isPopupRouteBlocked('/home'), isFalse);
    });
  });

  group('PopupAdDismissStore', () {
    setUp(PopupAdDismissStore.clearSessionForTests);

    test('session frequency dismisses once', () async {
      final store = PopupAdDismissStore();
      const ad = PopupAd(id: '9', frequency: 'session', titleAr: 't');
      expect(await store.isDismissed(ad, '/dashboard/freelancer'), isFalse);
      await store.markDismissed(ad, '/dashboard/freelancer');
      expect(await store.isDismissed(ad, '/dashboard/freelancer'), isTrue);
      expect(await store.pickToShow([ad], '/dashboard/freelancer'), isNull);
    });
  });
}
