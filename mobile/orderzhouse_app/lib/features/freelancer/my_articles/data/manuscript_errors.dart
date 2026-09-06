import 'package:dio/dio.dart';

import '../../../../core/errors/api_error_message.dart';
import 'manuscript_copy.dart';

String manuscriptSubmitErrorMessage(Object error) {
  if (error is DioException) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.connectionError) {
      return manuscriptNetworkErrorAr;
    }

    final status = error.response?.statusCode;
    if (status == 401 || status == 403) {
      return manuscriptForbiddenAr;
    }

    final data = error.response?.data;
    String? code;
    String? message;
    if (data is Map) {
      code = '${data['code'] ?? data['publicCode'] ?? data['errorCode'] ?? ''}'.trim();
      final m = data['message'];
      if (m is String && m.trim().isNotEmpty) message = m.trim();
    }

    switch (code) {
      case 'ARTICLE_SUBMISSION_NOT_ALLOWED':
        if (message != null && message.contains('اعتماد')) {
          return manuscriptAlreadySubmittedAr;
        }
        if (message != null && (message.contains('اختيار') || message.contains('حاليا'))) {
          return manuscriptNotAllowedAr;
        }
        return manuscriptNotAllowedAr;
      case 'ARTICLE_SUBMISSION_NOT_REVISABLE':
        return manuscriptRevisionNotRequestedAr;
      case 'ARTICLE_SUBMISSION_TERMS_REQUIRED':
        return manuscriptTermsRequiredAr;
      case 'ARTICLE_FINAL_CONTENT_REQUIRED':
      case 'MISSING_FINAL_ARTICLE_CONTENT':
      case 'ARTICLE_SUBMISSION_INVALID':
        if (message != null && _looksArabic(message)) return message;
        return manuscriptEmptyValidationAr;
      case 'ARTICLE_APPLICATION_NOT_FOUND':
        return manuscriptNotAllowedAr;
    }

    if (status == 409) {
      if (message != null && message.contains('مسبقا')) return manuscriptAlreadySubmittedAr;
      if (message != null && _looksArabic(message)) return message;
      return manuscriptNotAllowedAr;
    }

    if (message != null && _looksArabic(message)) return message;
  }

  return apiErrorMessage(error, fallback: manuscriptErrorFallbackAr);
}

bool _looksArabic(String text) {
  return RegExp(r'[\u0600-\u06FF]').hasMatch(text);
}

/// Client-side validation before calling the API (mirrors web/backend).
String? validateManuscriptForm({
  required String title,
  required String content,
  required bool termsAccepted,
}) {
  final cleanTitle = title.trim();
  final cleanContent = content.trim();
  if (cleanContent.isEmpty) return manuscriptEmptyValidationAr;
  if (cleanContent.length < manuscriptContentMinChars) {
    return manuscriptTooShortValidationAr;
  }
  if (cleanTitle.length < manuscriptTitleMinChars) {
    return manuscriptTitleRequiredAr;
  }
  if (!termsAccepted) return manuscriptTermsRequiredAr;
  return null;
}
