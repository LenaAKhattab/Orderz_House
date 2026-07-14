import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Phase 5D — Android signing readiness', () {
    test('key.properties.example exists with placeholders only', () {
      final example = File('android/key.properties.example').readAsStringSync();
      expect(example, contains('YOUR_STORE_PASSWORD'));
      expect(example, contains('YOUR_KEY_PASSWORD'));
      expect(example, contains('keyAlias=upload'));
      expect(example, contains('storeFile=keystores/pitchbook-upload.jks'));
    });

    test('gitignore protects key.properties and keystores', () {
      final rootGitignore = File('.gitignore').readAsStringSync();
      final androidGitignore = File('android/.gitignore').readAsStringSync();

      expect(rootGitignore, contains('key.properties'));
      expect(rootGitignore, contains('*.jks'));
      expect(rootGitignore, contains('*.keystore'));
      expect(androidGitignore, contains('key.properties'));
      expect(androidGitignore, contains('*.jks'));
    });

    test('release docs include signing and build commands', () {
      final docs = File('../../docs/MOBILE_RELEASE.md').readAsStringSync();
      expect(docs, contains('keytool -genkey'));
      expect(docs, contains('flutter build apk --release'));
      expect(docs, contains('flutter build appbundle --release'));
      expect(docs, contains('key.properties.example'));
    });

    test('build.gradle.kts requires key.properties for release', () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle, contains('key.properties'));
      expect(gradle, contains('taskGraph.whenReady'));
      expect(gradle, isNot(contains('signingConfigs.getByName("debug")')));
    });

    test('applicationId matches Google Play', () {
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      expect(gradle, contains('applicationId = "com.orderzhouse.app"'));
      expect(gradle, contains('namespace = "com.orderzhouse.app"'));
    });

    test('tracked files do not contain real store passwords', () {
      final example = File('android/key.properties.example').readAsStringSync();
      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      final docs = File('../../docs/MOBILE_RELEASE.md').readAsStringSync();

      for (final content in [example, gradle, docs]) {
        expect(content.toLowerCase(), isNot(contains('storepassword=mypassword')));
        expect(content.toLowerCase(), isNot(contains('storepassword=secret')));
      }
    });
  });
}
