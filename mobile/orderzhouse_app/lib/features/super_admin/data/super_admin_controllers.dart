import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import 'super_admin_actions.dart';
import 'super_admin_api.dart';
import 'super_admin_article_actions.dart';
import 'super_admin_article_models.dart';
import 'super_admin_kyc_models.dart';
import 'super_admin_models.dart';
import 'super_admin_feedback_models.dart';
import 'super_admin_package_models.dart';
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
    unawaited(_enrichPantryArticlesAndActivations(gen));
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

  Future<void> _enrichPantryArticlesAndActivations(int gen) async {
    final api = ref.read(superAdminApiProvider);
    final extras = await Future.wait<dynamic>([
      _tryFetch(api.fetchPantryRequests),
      _tryFetch(() => api.fetchPantryDeliveries()),
      _tryFetch(() => api.fetchMarketplaceArticles()),
      _tryFetch(() => api.fetchKycActivationRequests(limit: 20)),
      _tryFetch(() => api.fetchActivationQueue()),
      _tryFetch(() => api.fetchSuperAdminFeedback(limit: 20)),
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

    SuperAdminCountCard identity = current.identityRequests;
    SuperAdminCountCard subscription = current.subscriptionActivations;
    final kycRaw = extras[3];
    final subsRaw = extras[4];
    if (kycRaw != null || subsRaw != null) {
      try {
        final kyc = kycRaw != null ? parseKycActivationList(kycRaw) : null;
        final subs = subsRaw != null ? parseActivationQueue(subsRaw) : const <SuperAdminActivationItem>[];
        if (kyc != null) {
          identity = SuperAdminCountCard.ok(identityActionableCount(kyc.items));
        }
        if (subsRaw != null) {
          subscription = SuperAdminCountCard.ok(subscriptionActionableCount(subs));
        }
      } catch (_) {}
    }

    SuperAdminCountCard? feedback = current.feedback;
    final feedbackRaw = extras[5];
    if (feedbackRaw != null) {
      try {
        feedback = SuperAdminCountCard.ok(parseFeedbackNewCount(feedbackRaw) ?? 0);
      } catch (_) {}
    }

    if (gen != _loadGeneration) return;
    if (identical(pantry, current.pantry) &&
        identical(articles, current.articles) &&
        identical(identity, current.identityRequests) &&
        identical(subscription, current.subscriptionActivations) &&
        identical(feedback, current.feedback)) {
      return;
    }
    state = AsyncData(
      current.copyWith(
        identityRequests: identity,
        subscriptionActivations: subscription,
        pantry: pantry,
        articles: articles,
        feedback: feedback,
      ),
    );
  }
}

final superAdminIdentityQueueProvider =
    AsyncNotifierProvider<SuperAdminIdentityQueueNotifier, SuperAdminIdentityQueueSnapshot>(
  SuperAdminIdentityQueueNotifier.new,
);

/// KYC-only queue — renders as soon as identity API returns (no subscription wait).
class SuperAdminIdentityQueueNotifier extends AsyncNotifier<SuperAdminIdentityQueueSnapshot> {
  static const _fetchTimeout = Duration(seconds: 12);

  @override
  Future<SuperAdminIdentityQueueSnapshot> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<SuperAdminIdentityQueueSnapshot> _load() async {
    try {
      final raw = await ref
          .read(superAdminApiProvider)
          .fetchKycActivationRequests(limit: 20)
          .timeout(_fetchTimeout);
      final parsed = parseKycActivationList(raw);
      return SuperAdminIdentityQueueSnapshot(
        items: parsed.items,
        schemaReady: parsed.schemaReady,
      );
    } catch (_) {
      return const SuperAdminIdentityQueueSnapshot(items: [], loadFailed: true);
    }
  }
}

final superAdminActivationQueueProvider =
    AsyncNotifierProvider<SuperAdminActivationQueueNotifier, SuperAdminActivationQueueSnapshot>(
  SuperAdminActivationQueueNotifier.new,
);

class SuperAdminActivationQueueNotifier extends AsyncNotifier<SuperAdminActivationQueueSnapshot> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();
  static const _fetchTimeout = Duration(seconds: 12);

  @override
  Future<SuperAdminActivationQueueSnapshot> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<SuperAdminActivationQueueSnapshot> _load() async {
    final api = ref.read(superAdminApiProvider);
    List<SuperAdminKycActivationItem> kycItems = const [];
    var kycSchemaReady = true;
    var kycLoadFailed = false;
    List<SuperAdminActivationItem> subscriptionItems = const [];
    var subscriptionLoadFailed = false;
    Object? fatalError;

    final results = await Future.wait<Object?>([
      api
          .fetchKycActivationRequests(limit: 20)
          .timeout(_fetchTimeout)
          .then<dynamic>((v) => v)
          .catchError((Object e) {
        kycLoadFailed = true;
        fatalError ??= e;
        return null;
      }),
      api
          .fetchActivationQueue()
          .timeout(_fetchTimeout)
          .then<dynamic>((v) => v)
          .catchError((Object e) {
        subscriptionLoadFailed = true;
        fatalError ??= e;
        return null;
      }),
    ]);

    final kycRaw = results[0];
    if (kycRaw != null) {
      try {
        final kyc = parseKycActivationList(kycRaw);
        kycItems = kyc.items;
        kycSchemaReady = kyc.schemaReady;
      } catch (error) {
        kycLoadFailed = true;
        fatalError ??= error;
      }
    }

    final subsRaw = results[1];
    if (subsRaw != null) {
      try {
        subscriptionItems = parseActivationQueue(subsRaw);
      } catch (error) {
        subscriptionLoadFailed = true;
        fatalError ??= error;
      }
    }

    if (kycLoadFailed && subscriptionLoadFailed) {
      Error.throwWithStackTrace(
        fatalError ?? SuperAdminEndpointUnavailable('تعذر تحميل مركز المهام.'),
        StackTrace.current,
      );
    }

    return SuperAdminActivationQueueSnapshot(
      kycItems: kycItems,
      subscriptionItems: subscriptionItems,
      kycSchemaReady: kycSchemaReady,
      kycLoadFailed: kycLoadFailed,
      subscriptionLoadFailed: subscriptionLoadFailed,
    );
  }

  /// Returns false if another action is already in flight.
  Future<bool> approveKyc(String requestId) async {
    if (!_inFlight.tryStart('kyc:$requestId')) return false;
    ref.read(superAdminActivationBusyIdProvider.notifier).state = 'kyc:$requestId';
    try {
      await ref.read(superAdminApiProvider).approveKycActivationRequest(requestId);
      await _refreshAfterAction();
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminActivationBusyIdProvider.notifier).state = null;
    }
  }

  Future<bool> rejectKyc({
    required String requestId,
    required String rejectionReason,
    String? adminNotes,
  }) async {
    final reasonError = validateKycRejectionReason(rejectionReason);
    if (reasonError != null) throw SuperAdminEndpointUnavailable(reasonError);
    if (!_inFlight.tryStart('kyc:$requestId')) return false;
    ref.read(superAdminActivationBusyIdProvider.notifier).state = 'kyc:$requestId';
    try {
      await ref.read(superAdminApiProvider).rejectKycActivationRequest(
            requestId: requestId,
            rejectionReason: rejectionReason,
            adminNotes: adminNotes,
          );
      await _refreshAfterAction();
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminActivationBusyIdProvider.notifier).state = null;
    }
  }

  /// Returns false if another action is already in flight.
  Future<bool> approveSubscription({
    required String subscriptionId,
    required String overrideReason,
  }) async {
    final reasonError = validateActivationOverrideReason(overrideReason);
    if (reasonError != null) throw SuperAdminEndpointUnavailable(reasonError);
    if (!_inFlight.tryStart('sub:$subscriptionId')) return false;
    ref.read(superAdminActivationBusyIdProvider.notifier).state = 'sub:$subscriptionId';
    try {
      await ref.read(superAdminApiProvider).approveCompanyActivation(
            subscriptionId,
            overrideReason: overrideReason,
          );
      await _refreshAfterAction();
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminActivationBusyIdProvider.notifier).state = null;
    }
  }

  Future<void> _refreshAfterAction() async {
    try {
      await refreshQuietly();
      unawaited(ref.read(superAdminIdentityQueueProvider.notifier).refreshQuietly());
      unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
    } catch (_) {}
  }
}

final superAdminKycActivationDetailProvider = AsyncNotifierProvider.autoDispose
    .family<SuperAdminKycActivationDetailNotifier, SuperAdminKycActivationDetail, String>(
  SuperAdminKycActivationDetailNotifier.new,
);

class SuperAdminKycActivationDetailNotifier
    extends AutoDisposeFamilyAsyncNotifier<SuperAdminKycActivationDetail, String> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();

  @override
  Future<SuperAdminKycActivationDetail> build(String requestId) => _load();

  Future<SuperAdminKycActivationDetail> _load() async {
    final raw = await ref.read(superAdminApiProvider).fetchKycActivationRequestDetail(arg);
    return parseKycActivationDetail(raw);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<bool> approve() async {
    final detail = state.valueOrNull;
    if (detail == null || !canApproveKycActivationRequest(detail.request)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (!_inFlight.tryStart('kyc:$arg')) return false;
    ref.read(superAdminActivationBusyIdProvider.notifier).state = 'kyc:$arg';
    try {
      await ref.read(superAdminApiProvider).approveKycActivationRequest(arg);
      try {
        await refreshQuietly();
        await ref.read(superAdminIdentityQueueProvider.notifier).refreshQuietly();
        await ref.read(superAdminActivationQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
      return true;
    } finally {
      _inFlight.end();
      ref.read(superAdminActivationBusyIdProvider.notifier).state = null;
    }
  }

  Future<bool> reject({
    required String rejectionReason,
    String? adminNotes,
  }) async {
    final reasonError = validateKycRejectionReason(rejectionReason);
    if (reasonError != null) throw SuperAdminEndpointUnavailable(reasonError);
    final detail = state.valueOrNull;
    if (detail == null || !canApproveKycActivationRequest(detail.request)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    if (!_inFlight.tryStart('kyc:$arg')) return false;
    ref.read(superAdminActivationBusyIdProvider.notifier).state = 'kyc:$arg';
    try {
      await ref.read(superAdminApiProvider).rejectKycActivationRequest(
            requestId: arg,
            rejectionReason: rejectionReason,
            adminNotes: adminNotes,
          );
      try {
        await refreshQuietly();
        await ref.read(superAdminIdentityQueueProvider.notifier).refreshQuietly();
        await ref.read(superAdminActivationQueueProvider.notifier).refreshQuietly();
        unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      } catch (_) {}
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
  static const _fetchTimeout = Duration(seconds: 12);

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
    final results = await Future.wait<dynamic>([
      api.fetchPantryRequests().timeout(_fetchTimeout),
      api.fetchPantryDeliveries(status: 'submitted').timeout(_fetchTimeout),
      api.fetchPantryDeliveries(status: 'revision_requested').timeout(_fetchTimeout),
    ]);
    return parsePantryAttention(
      requestsBody: results[0],
      deliveriesBody: mergePantryDeliveriesBodies(results[1], results[2]),
    );
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
  static const _fetchTimeout = Duration(seconds: 12);

  @override
  Future<SuperAdminPantryDeliveryDetail> build(String deliveryId) => _load();

  Future<SuperAdminPantryDeliveryDetail> _load() async {
    final api = ref.read(superAdminApiProvider);
    for (final status in ['submitted', 'revision_requested']) {
      final raw = await api.fetchPantryDeliveries(status: status).timeout(_fetchTimeout);
      final found = parsePantryDeliveryById(raw, arg);
      if (found != null) return found;
    }
    throw SuperAdminEndpointUnavailable('التسليم غير موجود.');
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
  static const _fetchTimeout = Duration(seconds: 12);

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
    final raw = await ref
        .read(superAdminApiProvider)
        .fetchMarketplaceArticles()
        .timeout(_fetchTimeout);
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

  Future<bool> rejectSelectedApplication({required String rejectionReason}) async {
    final reasonError = validateArticleRejectReason(rejectionReason);
    if (reasonError != null) throw SuperAdminEndpointUnavailable(reasonError);
    final detail = state.valueOrNull;
    if (detail == null || !canRejectSelectedArticleApplication(detail)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    final app = selectedArticleApplication(detail)!;
    if (!_inFlight.tryStart('reject:${app.id}')) return false;
    ref.read(superAdminArticlesBusyIdProvider.notifier).state = 'reject:${app.id}';
    try {
      await ref.read(superAdminApiProvider).rejectArticleApplication(app.id);
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

  Future<bool> requestSelectedApplicationRevision(String reviewerNotes) async {
    final noteError = validateArticleRevisionNote(reviewerNotes);
    if (noteError != null) throw SuperAdminEndpointUnavailable(noteError);
    final detail = state.valueOrNull;
    if (detail == null || !canRequestArticleRevision(detail)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    final app = selectedArticleApplication(detail)!;
    if (!_inFlight.tryStart('revision:${app.id}')) return false;
    ref.read(superAdminArticlesBusyIdProvider.notifier).state = 'revision:${app.id}';
    try {
      await ref.read(superAdminApiProvider).requestArticleApplicationRevision(
            applicationId: app.id,
            reviewerNotes: reviewerNotes,
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

  Future<bool> finalizeSelectedApplicationApproval() async {
    final detail = state.valueOrNull;
    if (detail == null || !canFinalizeArticleApproval(detail)) {
      throw SuperAdminEndpointUnavailable(superAdminActionFailedAr);
    }
    final app = selectedArticleApplication(detail)!;
    if (!_inFlight.tryStart('finalize:${app.id}')) return false;
    ref.read(superAdminArticlesBusyIdProvider.notifier).state = 'finalize:${app.id}';
    try {
      await ref.read(superAdminApiProvider).finalizeArticleApplicationApproval(app.id);
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

final superAdminPackageAssignmentProvider =
    AsyncNotifierProvider<SuperAdminPackageAssignmentNotifier, List<SuperAdminFreelancerListItem>>(
  SuperAdminPackageAssignmentNotifier.new,
);

class SuperAdminPackageAssignmentNotifier extends AsyncNotifier<List<SuperAdminFreelancerListItem>> {
  static const _fetchTimeout = Duration(seconds: 12);
  String _query = '';

  String get query => _query;

  @override
  Future<List<SuperAdminFreelancerListItem>> build() => _load();

  Future<void> refresh({String? query}) async {
    if (query != null) _query = query.trim();
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly({String? query}) async {
    if (query != null) _query = query.trim();
    state = await AsyncValue.guard(_load);
  }

  Future<List<SuperAdminFreelancerListItem>> _load() async {
    final raw = await ref
        .read(superAdminApiProvider)
        .searchFreelancers(q: _query.isEmpty ? null : _query, limit: 50)
        .timeout(_fetchTimeout);
    return parseFreelancerSearchList(raw);
  }
}

final superAdminPackageUserDetailProvider = AsyncNotifierProvider.autoDispose
    .family<SuperAdminPackageUserDetailNotifier, SuperAdminFreelancerPackageDetail, String>(
  SuperAdminPackageUserDetailNotifier.new,
);

class SuperAdminPackageUserDetailNotifier
    extends AutoDisposeFamilyAsyncNotifier<SuperAdminFreelancerPackageDetail, String> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();
  static const _fetchTimeout = Duration(seconds: 12);

  @override
  Future<SuperAdminFreelancerPackageDetail> build(String userId) => _load();

  Future<SuperAdminFreelancerListItem?> _resolvePackageListItem() async {
    final cached = ref.read(superAdminPackageAssignmentProvider).valueOrNull;
    if (cached != null) {
      final hit = findPackageListItem(cached, arg);
      if (hit != null) return hit;
    }
    final raw = await ref
        .read(superAdminApiProvider)
        .searchFreelancers(q: arg, limit: 5)
        .timeout(_fetchTimeout);
    return findPackageListItem(parseFreelancerSearchList(raw), arg);
  }

  Future<SuperAdminFreelancerPackageDetail> _load() async {
    final api = ref.read(superAdminApiProvider);
    final results = await Future.wait<dynamic>([
      api.fetchFreelancerSubscription(arg).timeout(_fetchTimeout),
      api.fetchFreelancerEligibility(arg).timeout(_fetchTimeout),
      api.fetchAssignablePlans().timeout(_fetchTimeout),
      _resolvePackageListItem(),
    ]);
    return parseFreelancerPackageDetail(
      userId: arg,
      subscriptionBody: results[0],
      eligibilityBody: results[1],
      plansBody: results[2],
      listItem: results[3] as SuperAdminFreelancerListItem?,
    );
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<bool> assignPlan({required String planId, String? notes}) async {
    if (!_inFlight.tryStart('assign:$arg')) return false;
    try {
      await ref.read(superAdminApiProvider).assignSubscriptionPlan(
            freelancerUserId: arg,
            planId: planId,
            notes: notes,
          );
      await refreshQuietly();
      unawaited(ref.read(superAdminPackageAssignmentProvider.notifier).refreshQuietly());
      unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      return true;
    } finally {
      _inFlight.end();
    }
  }
}

final superAdminFeedbackQueueProvider =
    AsyncNotifierProvider<SuperAdminFeedbackQueueNotifier, List<SuperAdminFeedbackItem>>(
  SuperAdminFeedbackQueueNotifier.new,
);

class SuperAdminFeedbackQueueNotifier extends AsyncNotifier<List<SuperAdminFeedbackItem>> {
  static const _fetchTimeout = Duration(seconds: 12);

  @override
  Future<List<SuperAdminFeedbackItem>> build() => _load();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<List<SuperAdminFeedbackItem>> _load() async {
    final raw = await ref
        .read(superAdminApiProvider)
        .fetchSuperAdminFeedback(limit: 50)
        .timeout(_fetchTimeout);
    return parseFeedbackList(raw);
  }
}

final superAdminFeedbackDetailProvider = AsyncNotifierProvider.autoDispose
    .family<SuperAdminFeedbackDetailNotifier, SuperAdminFeedbackItem, String>(
  SuperAdminFeedbackDetailNotifier.new,
);

class SuperAdminFeedbackDetailNotifier
    extends AutoDisposeFamilyAsyncNotifier<SuperAdminFeedbackItem, String> {
  final SuperAdminInFlightGuard _inFlight = SuperAdminInFlightGuard();
  static const _fetchTimeout = Duration(seconds: 12);

  @override
  Future<SuperAdminFeedbackItem> build(String feedbackId) => _load();

  Future<SuperAdminFeedbackItem> _load() async {
    final raw =
        await ref.read(superAdminApiProvider).fetchSuperAdminFeedbackDetail(arg).timeout(_fetchTimeout);
    final item = parseFeedbackDetail(raw);
    if (item == null) throw SuperAdminEndpointUnavailable('الملاحظة غير موجودة.');
    return item;
  }

  Future<void> refreshQuietly() async {
    state = await AsyncValue.guard(_load);
  }

  Future<bool> updateStatus(String status, {String? adminNote}) async {
    if (!_inFlight.tryStart('feedback:$arg')) return false;
    try {
      await ref.read(superAdminApiProvider).updateSuperAdminFeedbackStatus(
            feedbackId: arg,
            status: status,
            adminNote: adminNote,
          );
      await refreshQuietly();
      unawaited(ref.read(superAdminFeedbackQueueProvider.notifier).refreshQuietly());
      unawaited(ref.read(superAdminActionCenterProvider.notifier).refreshQuietly());
      return true;
    } finally {
      _inFlight.end();
    }
  }
}
