import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import 'super_admin_actions.dart';
import 'super_admin_api.dart';
import 'super_admin_article_actions.dart';
import 'super_admin_article_models.dart';
import 'super_admin_models.dart';
import 'super_admin_pantry_actions.dart';
import 'super_admin_pantry_models.dart';

final superAdminActivationBusyIdProvider = StateProvider<String?>((ref) => null);
final superAdminClaimsBusyIdProvider = StateProvider<String?>((ref) => null);
final superAdminPantryBusyIdProvider = StateProvider<String?>((ref) => null);
final superAdminArticlesBusyIdProvider = StateProvider<String?>((ref) => null);

String superAdminLoadErrorMessage(Object error) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    if (status == 401 || status == 403) return superAdminAccessDeniedAr;
  }
  return apiErrorMessage(error, fallback: 'تعذر تحميل مركز المهام.');
}

final superAdminActionCenterProvider =
    AsyncNotifierProvider<SuperAdminActionCenterNotifier, SuperAdminActionCenterSnapshot>(
  SuperAdminActionCenterNotifier.new,
);

class SuperAdminActionCenterNotifier extends AsyncNotifier<SuperAdminActionCenterSnapshot> {
  static const _fetchTimeout = Duration(seconds: 12);
  int _loadGeneration = 0;

  @override
  Future<SuperAdminActionCenterSnapshot> build() => _load();

  Future<void> refresh() async {
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<dynamic> _tryFetch(Future<dynamic> Function() run) async {
    try {
      return await run().timeout(_fetchTimeout);
    } catch (_) {
      return null;
    }
  }

  /// First paint uses only `home-fast`. Pantry/article lists are too heavy to block the spinner.
  Future<SuperAdminActionCenterSnapshot> _load() async {
    final gen = ++_loadGeneration;
    final snapshot = await _loadHomeSnapshot();
    unawaited(_enrichPantryAndArticles(gen));
    return snapshot;
  }

  Future<SuperAdminActionCenterSnapshot> _loadHomeSnapshot() async {
    final api = ref.read(superAdminApiProvider);
    final homeRaw = await _tryFetch(api.fetchHomeFast);
    if (homeRaw == null) {
      throw SuperAdminEndpointUnavailable('تعذر تحميل مركز المهام.');
    }
    return parseHomeFastSnapshot(homeRaw);
  }

  Future<void> _enrichPantryAndArticles(int gen) async {
    final api = ref.read(superAdminApiProvider);
    final extras = await Future.wait<dynamic>([
      _tryFetch(api.fetchPantryRequests),
      _tryFetch(() => api.fetchPantryDeliveries()),
      _tryFetch(() => api.fetchMarketplaceArticles()),
    ]);
    if (gen != _loadGeneration) return;

    final current = state.valueOrNull;
    if (current == null) return;

    SuperAdminCountCard pantry = current.pantry;
    final requestsRaw = extras[0];
    final deliveriesRaw = extras[1];
    if (requestsRaw != null || deliveriesRaw != null) {
      try {
        pantry = SuperAdminCountCard.ok(
          parsePantryAttention(
            requestsBody: requestsRaw ?? {'data': {'requests': []}},
            deliveriesBody: deliveriesRaw ?? {'data': {'deliveries': []}},
          ).length,
        );
      } catch (_) {}
    }

    SuperAdminCountCard articles = current.articles;
    final articlesRaw = extras[2];
    if (articlesRaw != null) {
      try {
        articles = SuperAdminCountCard.ok(parseArticleAttention(articlesRaw).length);
      } catch (_) {}
    }

    if (gen != _loadGeneration) return;
    if (identical(pantry, current.pantry) && identical(articles, current.articles)) return;
    state = AsyncData(current.copyWith(pantry: pantry, articles: articles));
  }
}

final superAdminActivationQueueProvider =
    AsyncNotifierProvider<SuperAdminActivationQueueNotifier, List<SuperAdminActivationItem>>(
  SuperAdminActivationQueueNotifier.new,
);

class SuperAdminActivationQueueNotifier extends AsyncNotifier<List<SuperAdminActivationItem>> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();

  @override
  Future<List<SuperAdminActivationItem>> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<List<SuperAdminActivationItem>> _load() async {
    final raw = await ref.read(superAdminApiProvider).fetchActivationQueue();
    return parseActivationQueue(raw);
  }

  /// Returns false if another action is already in flight.
  Future<bool> approve(String subscriptionId) async {
    if (!_inFlight.tryStart(subscriptionId)) return false;
    ref.read(superAdminActivationBusyIdProvider.notifier).state = subscriptionId;
    try {
      await ref.read(superAdminApiProvider).approveCompanyActivation(subscriptionId);
      try {
        await refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {
        // Approval already succeeded; counts refresh is best-effort.
      }
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminActivationBusyIdProvider.notifier).state = null;
    }
  }
}

final superAdminClaimsQueueProvider =
    AsyncNotifierProvider<SuperAdminClaimsQueueNotifier, List<SuperAdminClaimItem>>(
  SuperAdminClaimsQueueNotifier.new,
);

class SuperAdminClaimsQueueNotifier extends AsyncNotifier<List<SuperAdminClaimItem>> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();

  @override
  Future<List<SuperAdminClaimItem>> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<List<SuperAdminClaimItem>> _load() async {
    final raw = await ref.read(superAdminApiProvider).fetchPendingClaims();
    return parseClaimsList(raw);
  }

  /// Returns false if another action is already in flight.
  Future<bool> updateStatus({
    required String claimId,
    required String status,
    String? adminNote,
  }) async {
    if (!isAllowedClaimStatusAction(status)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    final noteError = validateClaimAdminNote(status: status, note: adminNote ?? '');
    if (noteError != null) {
      throw SuperAdminEndpointUnavailable(noteError);
    }
    if (!_inFlight.tryStart(claimId)) return false;
    ref.read(superAdminClaimsBusyIdProvider.notifier).state = claimId;
    try {
      await ref.read(superAdminApiProvider).updateFinancialClaimStatus(
            claimId: claimId,
            status: status,
            adminNote: adminNote,
          );
      try {
        await refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {
        // Status update already succeeded; counts refresh is best-effort.
      }
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminClaimsBusyIdProvider.notifier).state = null;
    }
  }
}

final superAdminPantryQueueProvider =
    AsyncNotifierProvider<SuperAdminPantryQueueNotifier, List<SuperAdminPantryAttentionItem>>(
  SuperAdminPantryQueueNotifier.new,
);

class SuperAdminPantryQueueNotifier extends AsyncNotifier<List<SuperAdminPantryAttentionItem>> {
  @override
  Future<List<SuperAdminPantryAttentionItem>> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<List<SuperAdminPantryAttentionItem>> _load() async {
    final api = ref.read(superAdminApiProvider);
    final requests = await api.fetchPantryRequests();
    final deliveries = await api.fetchPantryDeliveries(status: null);
    return parsePantryAttention(requestsBody: requests, deliveriesBody: deliveries);
  }
}

final superAdminPantryRequestDetailProvider = AsyncNotifierProvider.autoDispose
    .family<SuperAdminPantryRequestDetailNotifier, SuperAdminPantryRequestDetail, String>(
  SuperAdminPantryRequestDetailNotifier.new,
);

class SuperAdminPantryRequestDetailNotifier
    extends AutoDisposeFamilyAsyncNotifier<SuperAdminPantryRequestDetail, String> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();

  @override
  Future<SuperAdminPantryRequestDetail> build(String requestId) => _load();

  Future<SuperAdminPantryRequestDetail> _load() async {
    final raw = await ref.read(superAdminApiProvider).fetchPantryRequestDetail(arg);
    return parsePantryRequestDetail(raw);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<bool> acceptBid({required String bidId, String? overrideReason}) async {
    final detail = state.valueOrNull;
    if (detail == null) return false;
    final bid = detail.bids.where((b) => b.id == bidId).firstOrNull;
    if (bid == null || !canAcceptPantryBid(request: detail, bid: bid)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (acceptRequiresOverride(bidId: bidId, ranking: detail.fairRanking)) {
      final error = validatePantryOverrideReason(overrideReason ?? '');
      if (error != null) throw SuperAdminEndpointUnavailable(error);
    }
    if (!_inFlight.tryStart('accept:$bidId')) return false;
    ref.read(superAdminPantryBusyIdProvider.notifier).state = 'accept:$bidId';
    try {
      await ref.read(superAdminApiProvider).acceptPantryBid(
            requestId: arg,
            bidId: bidId,
            overrideReason: overrideReason,
          );
      try {
        await refreshQuietly();
        await ref.read(superAdminPantryQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminPantryBusyIdProvider.notifier).state = null;
    }
  }

  Future<bool> rejectBid(String bidId) async {
    final detail = state.valueOrNull;
    if (detail == null) return false;
    final bid = detail.bids.where((b) => b.id == bidId).firstOrNull;
    if (bid == null || !canRejectPantryBid(request: detail, bid: bid)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (!_inFlight.tryStart('reject:$bidId')) return false;
    ref.read(superAdminPantryBusyIdProvider.notifier).state = 'reject:$bidId';
    try {
      await ref.read(superAdminApiProvider).rejectPantryBid(requestId: arg, bidId: bidId);
      try {
        await refreshQuietly();
        await ref.read(superAdminPantryQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminPantryBusyIdProvider.notifier).state = null;
    }
  }
}

final superAdminPantryDeliveryDetailProvider = AsyncNotifierProvider.autoDispose
    .family<SuperAdminPantryDeliveryDetailNotifier, SuperAdminPantryDeliveryDetail, String>(
  SuperAdminPantryDeliveryDetailNotifier.new,
);

class SuperAdminPantryDeliveryDetailNotifier
    extends AutoDisposeFamilyAsyncNotifier<SuperAdminPantryDeliveryDetail, String> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();

  @override
  Future<SuperAdminPantryDeliveryDetail> build(String deliveryId) => _load();

  Future<SuperAdminPantryDeliveryDetail> _load() async {
    final raw = await ref.read(superAdminApiProvider).fetchPantryDeliveries(status: null);
    final found = parsePantryDeliveryById(raw, arg);
    if (found == null) {
      throw SuperAdminEndpointUnavailable('التسليم غير موجود.');
    }
    return found;
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<bool> approve() async {
    final detail = state.valueOrNull;
    if (detail == null || !canApprovePantryDelivery(detail)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (!_inFlight.tryStart('approve:$arg')) return false;
    ref.read(superAdminPantryBusyIdProvider.notifier).state = 'approve:$arg';
    try {
      await ref.read(superAdminApiProvider).approvePantryDelivery(arg);
      try {
        await refreshQuietly();
        await ref.read(superAdminPantryQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminPantryBusyIdProvider.notifier).state = null;
    }
  }

  Future<bool> requestRevision(String feedback) async {
    final noteError = validatePantryRevisionNote(feedback);
    if (noteError != null) throw SuperAdminEndpointUnavailable(noteError);
    final detail = state.valueOrNull;
    if (detail == null || !canRequestPantryRevision(detail)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (!_inFlight.tryStart('revision:$arg')) return false;
    ref.read(superAdminPantryBusyIdProvider.notifier).state = 'revision:$arg';
    try {
      await ref.read(superAdminApiProvider).requestPantryDeliveryRevision(
            deliveryId: arg,
            feedback: feedback,
          );
      try {
        await refreshQuietly();
        await ref.read(superAdminPantryQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminPantryBusyIdProvider.notifier).state = null;
    }
  }
}

final superAdminArticlesQueueProvider =
    AsyncNotifierProvider<SuperAdminArticlesQueueNotifier, List<SuperAdminArticleAttentionItem>>(
  SuperAdminArticlesQueueNotifier.new,
);

class SuperAdminArticlesQueueNotifier extends AsyncNotifier<List<SuperAdminArticleAttentionItem>> {
  @override
  Future<List<SuperAdminArticleAttentionItem>> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<List<SuperAdminArticleAttentionItem>> _load() async {
    final raw = await ref.read(superAdminApiProvider).fetchMarketplaceArticles();
    return parseArticleAttention(raw);
  }
}

final superAdminArticleDetailProvider = AsyncNotifierProvider.autoDispose
    .family<SuperAdminArticleDetailNotifier, SuperAdminArticleDetail, String>(
  SuperAdminArticleDetailNotifier.new,
);

class SuperAdminArticleDetailNotifier
    extends AutoDisposeFamilyAsyncNotifier<SuperAdminArticleDetail, String> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();

  @override
  Future<SuperAdminArticleDetail> build(String articleId) => _load();

  Future<SuperAdminArticleDetail> _load() async {
    final api = ref.read(superAdminApiProvider);
    dynamic articleRaw;
    try {
      articleRaw = await api.fetchMarketplaceArticle(arg);
    } catch (_) {
      articleRaw = null;
    }
    final applicationsRaw = await api.fetchArticleApplications(arg);
    return parseArticleDetail(
      articleId: arg,
      articleBody: articleRaw,
      applicationsBody: applicationsRaw,
    );
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<bool> selectApplicant({
    required String applicationId,
    String? overrideReason,
  }) async {
    final detail = state.valueOrNull;
    if (detail == null) return false;
    final application = detail.applications.where((a) => a.id == applicationId).firstOrNull;
    if (application == null ||
        !canSelectArticleApplication(detail: detail, application: application)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (selectRequiresOverride(applicationId: applicationId, ranking: detail.fairRanking)) {
      final error = validateArticleOverrideReason(overrideReason ?? '');
      if (error != null) throw SuperAdminEndpointUnavailable(error);
    }
    if (!_inFlight.tryStart('select:$applicationId')) return false;
    ref.read(superAdminArticlesBusyIdProvider.notifier).state = 'select:$applicationId';
    try {
      await ref.read(superAdminApiProvider).selectArticleApplication(
            applicationId: applicationId,
            overrideReason: overrideReason,
          );
      try {
        await refreshQuietly();
        await ref.read(superAdminArticlesQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminArticlesBusyIdProvider.notifier).state = null;
    }
  }

  Future<bool> relistBidCollection() async {
    final detail = state.valueOrNull;
    if (detail == null || !canRelistArticleBidCollection(detail)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (!_inFlight.tryStart('relist:$arg')) return false;
    ref.read(superAdminArticlesBusyIdProvider.notifier).state = 'relist:$arg';
    try {
      await ref.read(superAdminApiProvider).relistArticleBidCollection(arg);
      try {
        await refreshQuietly();
        await ref.read(superAdminArticlesQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminArticlesBusyIdProvider.notifier).state = null;
    }
  }
}
