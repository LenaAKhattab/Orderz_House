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

  /// Web: `PATCH /api/admin/subscriptions/:id/company-activate` (no body).
  Future<void> approveCompanyActivation(String subscriptionId) async {
    await _dio.patch<dynamic>('/admin/subscriptions/$subscriptionId/company-activate');
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
}

class SuperAdminEndpointUnavailable implements Exception {
  SuperAdminEndpointUnavailable(this.message);
  final String message;

  @override
  String toString() => message;
}
