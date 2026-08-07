import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/branding/app_branding.dart';

void main() {
  group('AppBranding', () {
    test('logo asset points at official company mark', () {
      expect(AppBranding.logoAsset, 'assets/branding/company_logo.png');
      expect(File(AppBranding.logoAsset).existsSync(), isTrue);
    });

    test('full logo asset exists for splash', () {
      expect(AppBranding.fullLogoAsset, 'assets/branding/full_logo.png');
      expect(File(AppBranding.fullLogoAsset).existsSync(), isTrue);
    });

    test('about body uses Arabic brand not package name', () {
      expect(AppBranding.aboutBody, contains(AppBranding.displayNameAr));
      expect(AppBranding.aboutBody.toLowerCase(), isNot(contains('orderzhouse_app')));
    });

    test('English display name is Orderz House', () {
      expect(AppBranding.displayNameEn, 'Orderz House');
    });
  });

  group('user-facing UI strings', () {
    test('profile screen does not show orderzhouse_app to users', () {
      final profile = File('lib/features/profile/presentation/profile_screen.dart').readAsStringSync();
      expect(profile, isNot(contains('orderzhouse_app')));
      expect(profile, contains('AppBranding.aboutBody'));
    });

    test('splash screen shows full logo asset', () {
      final splash = File('lib/features/auth/presentation/splash_screen.dart').readAsStringSync();
      expect(splash, contains('AppBranding.fullLogoAsset'));
      expect(splash, contains('Image.asset'));
      expect(splash, isNot(contains('orderzhouse_app')));
    });

    test('Android manifest label is Orderz House', () {
      final manifest =
          File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      expect(manifest, contains('android:label="Orderz House"'));
      expect(manifest, isNot(contains('orderzhouse_app')));
    });

    test('iOS Info.plist display name is Orderz House', () {
      final plist = File('ios/Runner/Info.plist').readAsStringSync();
      expect(plist, contains('<string>Orderz House</string>'));
      expect(plist, contains('CFBundleDisplayName'));
      expect(plist, isNot(contains('Orderzhouse App')));
    });

    test('MaterialApp title uses English display name', () {
      final app = File('lib/app.dart').readAsStringSync();
      expect(app, contains('title: AppBranding.displayNameEn'));
    });
  });
}
