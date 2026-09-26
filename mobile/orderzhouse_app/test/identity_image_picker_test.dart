import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/freelancer/account_activation/data/identity_image_picker.dart';

void main() {
  group('IdentityImagePickResult', () {
    test('success flags', () {
      final tmp = File('${Directory.systemTemp.path}${Platform.pathSeparator}id_ok.jpg');
      final r = IdentityImagePickResult.success(file: tmp, fileName: 'id_ok.jpg');
      expect(r.isSuccess, isTrue);
      expect(r.cancelled, isFalse);
      expect(r.errorMessageAr, isNull);
      expect(r.fileName, 'id_ok.jpg');
    });

    test('cancelled is not success', () {
      const r = IdentityImagePickResult.cancelled();
      expect(r.isSuccess, isFalse);
      expect(r.cancelled, isTrue);
      expect(r.file, isNull);
    });

    test('failure carries Arabic message', () {
      const r = IdentityImagePickResult.failure(identityImagePickFailedAr);
      expect(r.isSuccess, isFalse);
      expect(r.cancelled, isFalse);
      expect(r.errorMessageAr, identityImagePickFailedAr);
    });
  });

  group('identity image constraints', () {
    test('allowed extensions match backend contract', () {
      expect(identityImageAllowedExtensions, containsAll(['jpg', 'jpeg', 'png', 'webp']));
      expect(identityImageAllowedExtensions, isNot(contains('heic')));
      expect(identityImageAllowedExtensions, isNot(contains('gif')));
    });

    test('max size is 5 MiB', () {
      expect(identityImageMaxBytes, 5 * 1024 * 1024);
    });

    test('Arabic error strings are non-empty', () {
      expect(identityImagePickFailedAr.trim(), isNotEmpty);
      expect(identityImagePermissionDeniedAr.trim(), isNotEmpty);
      expect(identityImageUnsupportedFormatAr.trim(), isNotEmpty);
      expect(identityImageTooLargeAr.trim(), isNotEmpty);
    });
  });

  group('validateIdentityPickedFile', () {
    late Directory tempDir;

    setUp(() {
      tempDir = Directory.systemTemp.createTempSync('oh_id_picker_');
    });

    tearDown(() {
      if (tempDir.existsSync()) {
        tempDir.deleteSync(recursive: true);
      }
    });

    test('accepts jpeg under size limit', () async {
      final f = File('${tempDir.path}${Platform.pathSeparator}front.jpeg')
        ..writeAsBytesSync(List<int>.filled(1200, 1));
      final r = await validateIdentityPickedFile(
        name: 'front.jpeg',
        path: f.path,
        reportedSize: 1200,
      );
      expect(r.isSuccess, isTrue);
      expect(r.file!.path, f.path);
      expect(r.fileName, 'front.jpeg');
    });

    test('rejects unsupported heic', () async {
      final f = File('${tempDir.path}${Platform.pathSeparator}id.heic')
        ..writeAsBytesSync(List<int>.filled(100, 2));
      final r = await validateIdentityPickedFile(
        name: 'id.heic',
        path: f.path,
        reportedSize: 100,
      );
      expect(r.isSuccess, isFalse);
      expect(r.errorMessageAr, identityImageUnsupportedFormatAr);
    });

    test('rejects oversize file', () async {
      final f = File('${tempDir.path}${Platform.pathSeparator}big.png')
        ..writeAsBytesSync(const [1, 2, 3]);
      final r = await validateIdentityPickedFile(
        name: 'big.png',
        path: f.path,
        reportedSize: identityImageMaxBytes + 1,
      );
      expect(r.isSuccess, isFalse);
      expect(r.errorMessageAr, identityImageTooLargeAr);
    });

    test('rejects missing path', () async {
      final r = await validateIdentityPickedFile(
        name: 'x.jpg',
        path: null,
        reportedSize: 10,
      );
      expect(r.isSuccess, isFalse);
      expect(r.errorMessageAr, identityImagePickFailedAr);
    });

    test('rejects missing file on disk', () async {
      final r = await validateIdentityPickedFile(
        name: 'ghost.jpg',
        path: '${tempDir.path}${Platform.pathSeparator}ghost.jpg',
        reportedSize: 10,
      );
      expect(r.isSuccess, isFalse);
      expect(r.errorMessageAr, identityImagePickFailedAr);
    });
  });

  group('front/back independence contract', () {
    test('two success results hold distinct files', () {
      final front = File('${Directory.systemTemp.path}${Platform.pathSeparator}front.jpg');
      final back = File('${Directory.systemTemp.path}${Platform.pathSeparator}back.jpg');
      final a = IdentityImagePickResult.success(file: front, fileName: 'front.jpg');
      final b = IdentityImagePickResult.success(file: back, fileName: 'back.jpg');
      expect(a.file!.path, isNot(b.file!.path));
      expect(a.fileName, isNot(b.fileName));
    });
  });
}
