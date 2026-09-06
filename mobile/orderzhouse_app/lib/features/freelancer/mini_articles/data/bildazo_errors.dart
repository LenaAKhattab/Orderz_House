import 'package:dio/dio.dart';

import 'bildazo_copy.dart';

export 'bildazo_copy.dart';

String? extractBildazoErrorCode(Object error) {
  if (error is! DioException) return null;
  final data = error.response?.data;
  if (data is Map) {
    final code = data['code'] ?? data['publicCode'] ?? data['errorCode'];
    if (code != null) return code.toString().trim();
  }
  return null;
}

/// Maps Bildazo-related API failures to Arabic (no raw enum/code to user).
String mapBildazoActionErrorMessage(Object error, {String? fallback}) {
  final code = extractBildazoErrorCode(error);
  switch (code) {
    case 'BILDAZO_AUTHOR_LINK_REQUIRED':
    case 'BILDAZO_NOT_LINKED':
    case 'AUTHOR_LINK_REQUIRED':
      return bildazoNotLinkedErrorAr;
    case 'BILDAZO_PROFILE_INCOMPLETE':
    case 'BILDAZO_PROFILE_MISSING':
    case 'AUTHOR_PROFILE_INCOMPLETE':
    case 'MISSING_BILDAZO_PROFILE':
      return bildazoIncompleteProfileErrorAr;
  }

  if (error is DioException) {
    final status = error.response?.statusCode;
    if (status == 401 || status == 403) return bildazoPermissionErrorAr;

    final data = error.response?.data;
    if (data is Map) {
      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) {
        final m = message.trim();
        // Prefer mapped Arabic over English/raw codes.
        if (RegExp(r'[\u0600-\u06FF]').hasMatch(m) && !m.contains('_')) {
          return m;
        }
      }
    }
  }

  return fallback ?? bildazoActionFallbackErrorAr;
}
