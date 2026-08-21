import 'package:dio/dio.dart';

import '../../../../core/errors/api_error_message.dart';
import 'financial_claim_models.dart';

const int maxFreelancerClaimNoteLength = 5000;
const String doneProjectClaimMode = 'done_project';

const createFinancialClaimNoticeAr =
    'سيتم إرسال مطالبة مالية لهذا المشروع. ستقوم الإدارة بمراجعتها وتسعيرها قبل الدفع.';

class CreateDoneProjectClaimPayload {
  const CreateDoneProjectClaimPayload({
    required this.projectId,
    this.freelancerNote,
  });

  final int projectId;
  final String? freelancerNote;

  factory CreateDoneProjectClaimPayload.fromProjectId(
    String projectId, {
    String? freelancerNote,
  }) {
    final id = int.tryParse(projectId.trim());
    if (id == null || id < 1) {
      throw ArgumentError('projectId غير صالح.');
    }
    return CreateDoneProjectClaimPayload(
      projectId: id,
      freelancerNote: freelancerNote,
    );
  }

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'mode': doneProjectClaimMode,
      'projectId': projectId,
    };
    final note = freelancerNote?.trim();
    if (note != null && note.isNotEmpty) {
      map['freelancerNote'] = note;
    }
    return map;
  }
}

String? validateFreelancerClaimNote(String? raw) {
  final trimmed = raw?.trim() ?? '';
  if (trimmed.isEmpty) return null;
  if (trimmed.length > maxFreelancerClaimNoteLength) {
    return 'الملاحظة طويلة جداً (الحد الأقصى $maxFreelancerClaimNoteLength حرف).';
  }
  return null;
}

/// Allowed POST body keys for done_project claims (Phase 4D-3).
const createDoneProjectClaimAllowedKeys = {'mode', 'projectId', 'freelancerNote'};

bool isSafeCreateDoneProjectClaimPayload(Map<String, dynamic> json) {
  if (!createDoneProjectClaimAllowedKeys.containsAll(json.keys.toSet())) {
    return false;
  }
  if (json['mode'] != doneProjectClaimMode) return false;
  if (json['projectId'] is! int) return false;

  const forbiddenKeys = {
    'userId',
    'freelancerId',
    'status',
    'payoutStatus',
    'totalPriceSnapshot',
    'userAmountSnapshot',
    'companyAmountSnapshot',
    'userPercentageSnapshot',
    'companyPercentageSnapshot',
    'paidAmount',
    'remainingAmount',
    'paymentStatus',
    'adminNote',
    'orderNumber',
    'requestTitle',
    'categories',
    'durationMinutes',
    'actualCompletionDate',
  };
  for (final key in forbiddenKeys) {
    if (json.containsKey(key)) return false;
  }
  return true;
}

FinancialClaim parseCreateClaimResponse(dynamic body) {
  if (body is! Map) {
    throw ArgumentError('استجابة غير متوقعة من إنشاء المطالبة.');
  }
  final data = body['data'];
  if (data is! Map) {
    throw ArgumentError('استجابة غير متوقعة من إنشاء المطالبة.');
  }
  final claim = data['claim'];
  if (claim is! Map) {
    throw ArgumentError('استجابة غير متوقعة من إنشاء المطالبة.');
  }
  return FinancialClaim.fromJson(Map<String, dynamic>.from(claim));
}

String mapFinancialClaimCreateErrorMessage(
  Object error, {
  String fallback = 'تعذر إرسال المطالبة المالية.',
}) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    final data = error.response?.data;
    String? code;
    if (data is Map) {
      final raw = data['code'] ?? data['publicCode'] ?? data['errorCode'];
      if (raw != null) code = raw.toString().trim();
    }
    final backend = apiErrorMessage(error, fallback: '').trim();

    switch (code) {
      case 'FREELANCER_KYC_REQUIRED':
        return 'لا يمكن إنشاء مطالبة مالية قبل تفعيل الحساب.';
      case 'FREELANCER_KYC_PENDING_REVIEW':
        return 'طلب تفعيل حسابك قيد المراجعة.';
      case 'FREELANCER_KYC_REJECTED':
        return 'تم رفض طلب تفعيل حسابك. يرجى مراجعة السبب وإعادة إرسال الطلب.';
      case 'FINANCIAL_CLAIM_PRICING_NOT_ALLOWED':
        return 'لا يمكن إرسال مبالغ أو أسعار من التطبيق عند إنشاء المطالبة.';
      case 'FINANCIAL_CLAIM_PAYMENT_LEDGER_REQUIRED':
        return 'لا يمكن تعليم المطالبة كمدفوعة من هنا. يجب تسجيل دفعة مالية.';
    }

    if (status == 409) {
      if (backend.contains('مسبق') || backend.contains('مسبقاً')) {
        return 'تم إرسال مطالبة لهذا المشروع مسبقًا';
      }
      if (backend.contains('غير مكتمل')) {
        return 'هذا المشروع غير مؤهل للمطالبة';
      }
    }
    if (status == 403) {
      return 'لا تملك صلاحية على هذا المشروع';
    }
    if (backend.isNotEmpty) return backend;
  }
  return apiErrorMessage(error, fallback: fallback);
}
