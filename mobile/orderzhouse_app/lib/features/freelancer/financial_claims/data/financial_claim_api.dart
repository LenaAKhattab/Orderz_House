import 'package:dio/dio.dart';

import 'create_financial_claim_models.dart';
import 'done_project_models.dart';
import 'financial_claim_models.dart';

class FinancialClaimApi {
  FinancialClaimApi(this._dio);

  final Dio _dio;

  Future<List<FinancialClaim>> fetchClaims() async {
    final response = await _dio.get<dynamic>('/portal/financial-claims');
    return FinancialClaim.parseListResponse(response.data);
  }

  Future<List<DoneProject>> fetchDoneProjects({
    String q = '',
    int limit = 100,
  }) async {
    final response = await _dio.get<dynamic>(
      '/portal/financial-claims/done-projects',
      queryParameters: {
        if (q.trim().isNotEmpty) 'q': q.trim(),
        'limit': limit.clamp(1, 200),
      },
    );
    return DoneProject.parseListResponse(response.data);
  }

  Future<FinancialClaim> createDoneProjectClaim(CreateDoneProjectClaimPayload payload) async {
    final response = await _dio.post<dynamic>(
      '/portal/financial-claims',
      data: payload.toJson(),
    );
    return parseCreateClaimResponse(response.data);
  }
}