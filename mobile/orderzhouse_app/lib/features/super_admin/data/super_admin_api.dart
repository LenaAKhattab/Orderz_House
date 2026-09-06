import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';

final superAdminApiProvider = Provider<SuperAdminApi>((ref) {
  return SuperAdminApi(ref.watch(dioProvider));
});

/// Super Admin Phase 1A reads + Phase 1B/1C-A/1C-B safe writes.
/// No disk cache. No pricing, payout, ledger, reject-application, or auto-assign.
class SuperAdminApi {
  SuperAdminApi(this._dio);

  final Dio _dio;

  Future<dynamic> fetchHomeFast() async {
    final response = await _dio.get<dynamic>('/superadmin/dashboard/home-fast');
    return response.data;
  }

  Future<dynamic> fetchActivationQueue({int page = 1, int limit = 20}) async {
    final response = await _dio.get<dynamic>(
      '/admin/subscriptions/activation-queue',
      queryParameters: {'page': page, 'limit': limit},
    );
    return response.data;
  }

  Future<dynamic> fetchPendingClaims() async {
    final response = await _dio.get<dynamic>(
      '/super-admin/financial-claims',
      queryParameters: {'status': 'pending'},
    );
    return response.data;
  }

  Future<dynamic> fetchPantryRequests() async {
    final response = await _dio.get<dynamic>('/admin/pantry/requests');
    return response.data;
  }

  Future<dynamic> fetchPantryDeliveries({String? status = 'submitted'}) async {
    final response = await _dio.get<dynamic>(
      '/admin/pantry/deliveries',
      queryParameters: {
        'status': ?status,
      },
    );
    return response.data;
  }

  Future<dynamic> fetchPantryRequestDetail(String requestId) async {
    final response = await _dio.get<dynamic>('/admin/pantry/requests/$requestId');
    return response.data;
  }

  Future<void> acceptPantryBid({
    required String requestId,
    required String bidId,
    String? overrideReason,
  }) async {
    final reason = overrideReason?.trim();
    await _dio.post<dynamic>(
      '/admin/pantry/requests/$requestId/bids/$bidId/accept',
      data: {
        if (reason != null && reason.isNotEmpty) 'overrideReason': reason,
      },
    );
  }

  Future<void> rejectPantryBid({
    required String requestId,
    required String bidId,
  }) async {
    await _dio.post<dynamic>('/admin/pantry/requests/$requestId/bids/$bidId/reject');
  }

  Future<void> approvePantryDelivery(String deliveryId) async {
    await _dio.post<dynamic>('/admin/pantry/deliveries/$deliveryId/approve', data: <String, dynamic>{});
  }

  Future<void> requestPantryDeliveryRevision({
    required String deliveryId,
    required String feedback,
  }) async {
    await _dio.post<dynamic>(
      '/admin/pantry/deliveries/$deliveryId/request-revision',
      data: {'feedback': feedback.trim()},
    );
  }

  Future<dynamic> fetchMarketplaceArticles({int limit = 50, int offset = 0}) async {
    final response = await _dio.get<dynamic>(
      '/super-admin/marketplace-articles',
      queryParameters: {'limit': limit, 'offset': offset, 'includeFake': 'true'},
    );
    return response.data;
  }

  Future<dynamic> fetchMarketplaceArticle(String articleId) async {
    final response = await _dio.get<dynamic>('/super-admin/marketplace-articles/$articleId');
    return response.data;
  }

  Future<dynamic> fetchArticleApplications(String articleId) async {
    final response = await _dio.get<dynamic>(
      '/super-admin/marketplace-articles/$articleId/applications',
    );
    return response.data;
  }

  /// Web: `POST /api/super-admin/article-applications/:applicationId/select`.
  Future<void> selectArticleApplication({
    required String applicationId,
    String? overrideReason,
  }) async {
    final reason = overrideReason?.trim();
    await _dio.post<dynamic>(
      '/super-admin/article-applications/$applicationId/select',
      data: {
        if (reason != null && reason.isNotEmpty) 'overrideReason': reason,
      },
    );
  }

  /// Web: `POST /api/super-admin/marketplace-articles/:articleId/relist-bid-collection`.
  Future<void> relistArticleBidCollection(String articleId) async {
    await _dio.post<dynamic>(
      '/super-admin/marketplace-articles/$articleId/relist-bid-collection',
      data: <String, dynamic>{},
    );
  }

  /// Web: `PATCH /api/admin/subscriptions/:id/company-activate`.
  Future<void> approveCompanyActivation(
    String subscriptionId, {
    String? overrideReason,
  }) async {
    final reason = overrideReason?.trim();
    await _dio.patch<dynamic>(
      '/admin/subscriptions/$subscriptionId/company-activate',
      data: {
        if (reason != null && reason.isNotEmpty) 'overrideReason': reason,
      },
    );
  }

  Future<dynamic> fetchKycActivationRequests({
    String? status = 'pending_review',
    int page = 1,
    int limit = 20,
  }) async {
    final response = await _dio.get<dynamic>(
      '/super-admin/freelancer-activation-requests',
      queryParameters: {
        if (status != null && status.isNotEmpty) 'status': status,
        'page': page,
        'limit': limit,
      },
    );
    return response.data;
  }

  Future<dynamic> fetchKycActivationRequestDetail(String requestId) async {
    final response = await _dio.get<dynamic>(
      '/super-admin/freelancer-activation-requests/$requestId',
    );
    return response.data;
  }

  Future<void> approveKycActivationRequest(String requestId) async {
    await _dio.post<dynamic>(
      '/super-admin/freelancer-activation-requests/$requestId/approve',
    );
  }

  Future<void> rejectKycActivationRequest({
    required String requestId,
    required String rejectionReason,
    String? adminNotes,
  }) async {
    final note = adminNotes?.trim();
    await _dio.post<dynamic>(
      '/super-admin/freelancer-activation-requests/$requestId/reject',
      data: {
        'rejectionReason': rejectionReason.trim(),
        if (note != null && note.isNotEmpty) 'adminNotes': note,
      },
    );
  }

  /// Authenticated binary fetch — never expose public URLs.
  Future<List<int>> fetchKycActivationFileBytes({
    required String requestId,
    required String side,
  }) async {
    final response = await _dio.get<List<int>>(
      '/super-admin/freelancer-activation-requests/$requestId/files/$side',
      queryParameters: {'disposition': 'inline'},
      options: Options(responseType: ResponseType.bytes),
    );
    return response.data ?? const [];
  }

  /// Web: `PATCH /api/super-admin/financial-claims/:id/status`.
  /// Body is `status` + optional `adminNote` only.
  Future<void> updateFinancialClaimStatus({
    required String claimId,
    required String status,
    String? adminNote,
  }) async {
    final note = adminNote?.trim();
    await _dio.patch<dynamic>(
      '/super-admin/financial-claims/$claimId/status',
      data: {
        'status': status,
        if (note != null && note.isNotEmpty) 'adminNote': note,
      },
    );
  }

  Future<dynamic> searchFreelancers({String? q, int limit = 50}) async {
    final response = await _dio.get<dynamic>(
      '/admin/freelancers',
      queryParameters: {
        if (q != null && q.trim().isNotEmpty) 'q': q.trim(),
        'limit': limit.clamp(1, 100),
      },
    );
    return response.data;
  }

  Future<dynamic> fetchFreelancerSubscription(String freelancerUserId) async {
    final response = await _dio.get<dynamic>('/admin/freelancers/$freelancerUserId/subscription');
    return response.data;
  }

  Future<dynamic> fetchFreelancerEligibility(String freelancerUserId) async {
    final response = await _dio.get<dynamic>('/admin/freelancers/$freelancerUserId/eligibility');
    return response.data;
  }

  Future<dynamic> fetchAssignablePlans() async {
    final response = await _dio.get<dynamic>('/admin/subscriptions/assignable-plans');
    return response.data;
  }

  Future<void> assignSubscriptionPlan({
    required String freelancerUserId,
    required String planId,
    String? notes,
  }) async {
    final note = notes?.trim();
    await _dio.post<dynamic>(
      '/admin/subscriptions/assign',
      data: {
        'freelancerUserId': int.parse(freelancerUserId),
        'planId': int.parse(planId),
        if (note != null && note.isNotEmpty) 'notes': note,
      },
    );
  }

  Future<dynamic> fetchSuperAdminFeedback({String? status, int limit = 50, int offset = 0}) async {
    final response = await _dio.get<dynamic>(
      '/super-admin/feedback',
      queryParameters: {
        if (status != null && status.isNotEmpty) 'status': status,
        'limit': limit.clamp(1, 100),
        'offset': offset.clamp(0, 10000),
      },
    );
    return response.data;
  }

  Future<dynamic> fetchSuperAdminFeedbackDetail(String feedbackId) async {
    final response = await _dio.get<dynamic>('/super-admin/feedback/$feedbackId');
    return response.data;
  }

  Future<void> updateSuperAdminFeedbackStatus({
    required String feedbackId,
    required String status,
    String? adminNote,
  }) async {
    final note = adminNote?.trim();
    await _dio.patch<dynamic>(
      '/super-admin/feedback/$feedbackId',
      data: {
        'status': status,
        if (note != null && note.isNotEmpty) 'adminNote': note,
      },
    );
  }

  Future<void> rejectArticleApplication(String applicationId) async {
    await _dio.post<dynamic>('/super-admin/article-applications/$applicationId/reject');
  }

  Future<void> requestArticleApplicationRevision({
    required String applicationId,
    required String reviewerNotes,
  }) async {
    await _dio.post<dynamic>(
      '/super-admin/article-applications/$applicationId/request-revision',
      data: {'reviewerNotes': reviewerNotes.trim()},
    );
  }

  Future<void> finalizeArticleApplicationApproval(String applicationId) async {
    await _dio.post<dynamic>(
      '/super-admin/article-applications/$applicationId/finalize-approval',
    );
  }
}

class SuperAdminEndpointUnavailable implements Exception {
  SuperAdminEndpointUnavailable(this.message);
  final String message;

  @override
  String toString() => message;
}
