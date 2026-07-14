import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/config/environment_config.dart';

void main() {
  group('production constants', () {
    test('release API fallback is orderzhouse.com/api', () {
      expect(EnvironmentConfig.productionApiBaseUrl, 'https://orderzhouse.com/api');
    });

    test('release WEB fallback is orderzhouse.com', () {
      expect(EnvironmentConfig.productionWebBaseUrl, 'https://orderzhouse.com');
    });
  });

  group('resolveApiBaseUrl', () {
    test('release without dart-define uses production HTTPS', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(isRelease: true),
        EnvironmentConfig.productionApiBaseUrl,
      );
    });

    test('release never returns 10.0.2.2 fallback', () {
      final url = EnvironmentConfig.resolveApiBaseUrl(isRelease: true, isAndroid: true);
      expect(url, isNot(contains('10.0.2.2')));
      expect(url, startsWith('https://'));
    });

    test('release never returns localhost fallback', () {
      final url = EnvironmentConfig.resolveApiBaseUrl(isRelease: true, isAndroid: false);
      expect(url, isNot(contains('localhost')));
      expect(url, startsWith('https://'));
    });

    test('release rejects http dart-define and uses production fallback', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(
          dartDefine: 'http://10.0.2.2:5000/api',
          isRelease: true,
        ),
        EnvironmentConfig.productionApiBaseUrl,
      );
    });

    test('release accepts https dart-define', () {
      const staging = 'https://staging-api.orderzhouse.com/api';
      expect(
        EnvironmentConfig.resolveApiBaseUrl(dartDefine: staging, isRelease: true),
        staging,
      );
    });

    test('debug Android fallback is 10.0.2.2', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(isRelease: false, isAndroid: true),
        'http://10.0.2.2:5000/api',
      );
    });

    test('debug non-Android fallback is localhost', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(isRelease: false, isAndroid: false),
        'http://localhost:5000/api',
      );
    });

    test('dart-define takes priority in debug', () {
      const custom = 'http://192.168.1.5:5000/api';
      expect(
        EnvironmentConfig.resolveApiBaseUrl(dartDefine: custom, isRelease: false),
        custom,
      );
    });

    test('dotenv used in debug when dart-define empty', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(
          dotEnvValue: 'http://192.168.0.10:5000/api',
          isRelease: false,
        ),
        'http://192.168.0.10:5000/api',
      );
    });

    test('dotenv ignored in release', () {
      expect(
        EnvironmentConfig.resolveApiBaseUrl(
          dotEnvValue: 'http://10.0.2.2:5000/api',
          isRelease: true,
        ),
        EnvironmentConfig.productionApiBaseUrl,
      );
    });
  });

  group('resolveWebBaseUrl', () {
    test('release without dart-define uses production HTTPS', () {
      expect(
        EnvironmentConfig.resolveWebBaseUrl(isRelease: true),
        EnvironmentConfig.productionWebBaseUrl,
      );
    });

    test('release rejects http dart-define', () {
      expect(
        EnvironmentConfig.resolveWebBaseUrl(
          dartDefine: 'http://localhost:5173',
          isRelease: true,
        ),
        EnvironmentConfig.productionWebBaseUrl,
      );
    });

    test('debug Android web fallback is 10.0.2.2', () {
      expect(
        EnvironmentConfig.resolveWebBaseUrl(isRelease: false, isAndroid: true),
        'http://10.0.2.2:5173',
      );
    });

    test('debug desktop web fallback is localhost', () {
      expect(
        EnvironmentConfig.resolveWebBaseUrl(isRelease: false, isAndroid: false),
        'http://localhost:5173',
      );
    });
  });

  group('isSafeReleaseUrl', () {
    test('rejects http', () {
      expect(EnvironmentConfig.isSafeReleaseUrl('http://api.orderzhouse.com/api'), isFalse);
    });

    test('rejects local hosts', () {
      expect(EnvironmentConfig.isSafeReleaseUrl('https://localhost/api'), isFalse);
      expect(EnvironmentConfig.isSafeReleaseUrl('https://10.0.2.2/api'), isFalse);
      expect(EnvironmentConfig.isSafeReleaseUrl('https://127.0.0.1/api'), isFalse);
    });

    test('accepts production https', () {
      expect(
        EnvironmentConfig.isSafeReleaseUrl('https://orderzhouse.com/api'),
        isTrue,
      );
    });
  });

  group('Stripe checkout launch URL guard', () {
    test('release rejects http checkout URL', () {
      expect(
        EnvironmentConfig.isSafeExternalLaunchUrl(
          'http://checkout.stripe.com/pay/cs_test_abc',
          isRelease: true,
        ),
        isFalse,
      );
    });

    test('debug allows http checkout URL', () {
      expect(
        EnvironmentConfig.isSafeExternalLaunchUrl(
          'http://checkout.stripe.com/pay/cs_test_abc',
          isRelease: false,
        ),
        isTrue,
      );
    });

    test('release allows https checkout URL', () {
      expect(
        EnvironmentConfig.isSafeExternalLaunchUrl(
          'https://checkout.stripe.com/pay/cs_test_abc',
          isRelease: true,
        ),
        isTrue,
      );
    });

    test('release still allows https cs_live_ at URL-safety layer', () {
      // Live-session blocking is handled by stripe_checkout_launcher in non-release only.
      expect(
        EnvironmentConfig.isSafeExternalLaunchUrl(
          'https://checkout.stripe.com/c/pay/cs_live_prod',
          isRelease: true,
        ),
        isTrue,
      );
    });
  });

  group('profile dev env card', () {
    test('dev environment card is not shown on profile', () {
      final src = File('lib/features/profile/presentation/profile_screen.dart').readAsStringSync();
      expect(src, isNot(contains('_DevEnvCard')));
      expect(src, isNot(contains('بيئة التطوير')));
      expect(src, isNot(contains('ApiConstants.baseUrl')));
    });
  });

  group('pubspec assets', () {
    test('.env is not bundled as a Flutter asset', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      expect(pubspec, isNot(contains('- .env\n')));
      expect(pubspec, contains('.env.example'));
    });
  });
}
