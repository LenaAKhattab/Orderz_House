import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_provider.dart';
import 'create_financial_claim_models.dart';
import 'done_project_models.dart';
import 'financial_claim_api.dart';
import 'financial_claim_models.dart';

final financialClaimApiProvider = Provider<FinancialClaimApi>((ref) {
  return FinancialClaimApi(ref.watch(dioProvider));
});

class FinancialClaimRepository {
  FinancialClaimRepository(this._api);

  final FinancialClaimApi _api;

  Future<List<FinancialClaim>> fetchClaims() => _api.fetchClaims();

  Future<List<DoneProject>> fetchDoneProjects({
    String q = '',
    int limit = 100,
  }) =>
      _api.fetchDoneProjects(q: q, limit: limit);

  Future<FinancialClaim> createDoneProjectClaim({
    required String projectId,
    String? freelancerNote,
  }) {
    final payload = CreateDoneProjectClaimPayload.fromProjectId(
      projectId,
      freelancerNote: freelancerNote,
    );
    return _api.createDoneProjectClaim(payload);
  }
}

final financialClaimRepositoryProvider = Provider<FinancialClaimRepository>((ref) {
  return FinancialClaimRepository(ref.watch(financialClaimApiProvider));
});