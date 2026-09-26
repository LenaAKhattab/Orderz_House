import 'dart:io';

import 'package:file_picker/file_picker.dart';

/// Backend-aligned identity image constraints (JPEG/PNG/WebP, ≤ 5 MB).
const identityImageAllowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
const identityImageMaxBytes = 5 * 1024 * 1024;

const identityImagePickFailedAr =
    'تعذر معالجة الصورة المختارة. يرجى اختيار صورة أخرى والمحاولة مجددًا.';
const identityImagePermissionDeniedAr =
    'تعذر الوصول إلى الصور. يرجى السماح بالوصول من إعدادات الجهاز.';
const identityImageUnsupportedFormatAr =
    'صيغة الصورة غير مدعومة. يُسمح بـ JPEG أو PNG أو WebP فقط.';
const identityImageTooLargeAr =
    'حجم صورة الهوية يتجاوز الحد المسموح (5 ميغابايت).';

class IdentityImagePickResult {
  const IdentityImagePickResult.success({
    required this.file,
    required this.fileName,
  })  : errorMessageAr = null,
        cancelled = false;

  const IdentityImagePickResult.cancelled()
      : file = null,
        fileName = null,
        errorMessageAr = null,
        cancelled = true;

  const IdentityImagePickResult.failure(this.errorMessageAr)
      : file = null,
        fileName = null,
        cancelled = false;

  final File? file;
  final String? fileName;
  final String? errorMessageAr;
  final bool cancelled;

  bool get isSuccess => file != null && errorMessageAr == null && !cancelled;
}

/// Safe identity-photo picker for Account Activation KYC.
///
/// Do **not** use [FileType.image] with default compression on Android:
/// file_picker 8.x runs native `compressImage()` which:
/// - decodes the full-resolution bitmap (OOM risk),
/// - writes into public Pictures without scoped-storage grants,
/// - can throw uncaught [RuntimeException]/[NullPointerException] on a worker
///   thread and terminate the process (looks like an immediate app exit).
///
/// Prefer SAF via [FileType.custom] + [allowCompression] false.
Future<IdentityImagePickResult> pickIdentityImageFile() async {
  try {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: identityImageAllowedExtensions,
      allowMultiple: false,
      withData: false,
      allowCompression: false,
      compressionQuality: 0,
    );

    if (result == null || result.files.isEmpty) {
      return const IdentityImagePickResult.cancelled();
    }

    final platformFile = result.files.first;
    return validateIdentityPickedFile(
      name: platformFile.name,
      path: platformFile.path,
      reportedSize: platformFile.size,
    );
  } on Exception catch (e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('permission') || msg.contains('access')) {
      return const IdentityImagePickResult.failure(identityImagePermissionDeniedAr);
    }
    return const IdentityImagePickResult.failure(identityImagePickFailedAr);
  } catch (_) {
    return const IdentityImagePickResult.failure(identityImagePickFailedAr);
  }
}

/// Maps a picker platform-file payload into a validated identity image result.
Future<IdentityImagePickResult> validateIdentityPickedFile({
  required String? name,
  required String? path,
  required int reportedSize,
}) async {
  final trimmedName = (name ?? '').trim();
  final ext = _extensionOf(trimmedName.isNotEmpty ? trimmedName : (path ?? ''));
  if (!_isAllowedExtension(ext)) {
    return const IdentityImagePickResult.failure(identityImageUnsupportedFormatAr);
  }

  if (path == null || path.isEmpty) {
    return const IdentityImagePickResult.failure(identityImagePickFailedAr);
  }

  final file = File(path);
  if (!await file.exists()) {
    return const IdentityImagePickResult.failure(identityImagePickFailedAr);
  }

  final size = reportedSize > 0 ? reportedSize : await file.length();
  if (size <= 0) {
    return const IdentityImagePickResult.failure(identityImagePickFailedAr);
  }
  if (size > identityImageMaxBytes) {
    return const IdentityImagePickResult.failure(identityImageTooLargeAr);
  }

  return IdentityImagePickResult.success(
    file: file,
    fileName: trimmedName.isNotEmpty ? trimmedName : file.uri.pathSegments.last,
  );
}

String _extensionOf(String nameOrPath) {
  final base = nameOrPath.split(Platform.pathSeparator).last;
  final dot = base.lastIndexOf('.');
  if (dot < 0 || dot == base.length - 1) return '';
  return base.substring(dot + 1).toLowerCase();
}

bool _isAllowedExtension(String ext) {
  return identityImageAllowedExtensions.contains(ext.toLowerCase());
}
