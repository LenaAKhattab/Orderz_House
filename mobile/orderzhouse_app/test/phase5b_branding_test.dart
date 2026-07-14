import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/branding/app_branding.dart';

void main() {
  group('AppBranding', () {
    test('logo asset points at official company mark', () {
      expect(AppBranding.logoAsset, 'assets/branding/company_logo.png');
      expect(File(AppBranding.logoAsset).existsSync(), isTrue);
    });

    test('about body uses Arabic brand not package name', () {
      expect(AppBranding.aboutBody, contains(AppBranding.displayNameAr));
      expect(AppBranding.aboutBody.toLowerCase(), isNot(contains('orderzhouse_app')));
    });
  });

  group('user-facing UI strings', () {
    test('profile screen does not show orderzhouse_app to users', () {
      final profile = File('lib/features/profile/presentation/profile_screen.dart').readAsStringSync();
      expect(profile, isNot(contains('orderzhouse_app')));
      expect(profile, contains('AppBranding.aboutBody'));
    });

    test('splash screen shows branded title via AppBrandMark', () {
      final splash = File('lib/features/auth/presentation/splash_screen.dart').readAsStringSync();
      expect(splash, contains('AppBrandMark'));
      expect(splash, isNot(contains('orderzhouse_app')));
    });

    test('Android manifest label is Arabic display name', () {
      final manifest =
          File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      expect(manifest, contains('android:label="ORDERZHOUSE"'));
      expect(manifest, isNot(contains('orderzhouse_app')));
    });

    test('iOS Info.plist display name is Arabic', () {
      final plist = File('ios/Runner/Info.plist').readAsStringSync();
      expect(plist, contains('ORDERZHOUSE'));
      expect(plist, isNot(contains('Orderzhouse App')));
    });
  });
}
