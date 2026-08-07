import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../auth/presentation/auth_controller.dart';
import '../data/financial_claim_models.dart';
import '../data/financial_claim_repository.dart';

class FinancialClaimsSnapshot {
  const FinancialClaimsSnapshot({
    required this.claims,
    required this.summary,
  });

  final List<FinancialClaim> claims;
  final FinancialClaimsSummary summary;
}

final financialClaimsControllerProvider =
    FutureProvider.autoDispose<FinancialClaimsSnapshot>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (!auth.isAuthenticated || auth.user?.isFreelancerAccount != true) {
    return const FinancialClaimsSnapshot(
      claims: [],
      summary: FinancialClaimsSummary(total: 0, underReview: 0, paid: 0, due: 0),
    );
  }

  final repo = ref.read(financialClaimRepositoryProvider);
  final claims = await repo.fetchClaims();
  return FinancialClaimsSnapshot(
    claims: claims,
    summary: FinancialClaimsSummary.fromClaims(claims),
  );
});
