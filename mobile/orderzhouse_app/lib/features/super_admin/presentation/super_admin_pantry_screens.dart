import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_actions.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_models.dart';
import '../data/super_admin_pantry_actions.dart';
import '../data/super_admin_pantry_models.dart';
import 'super_admin_action_dialogs.dart';
import 'super_admin_queue_screens.dart';
import 'super_admin_ui.dart';

class SuperAdminPantryRequestScreen extends ConsumerStatefulWidget {
  const SuperAdminPantryRequestScreen({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<SuperAdminPantryRequestScreen> createState() => _SuperAdminPantryRequestScreenState();
}

class _SuperAdminPantryRequestScreenState extends ConsumerState<SuperAdminPantryRequestScreen> {
  bool _promptOpen = false;

  Future<void> _accept(SuperAdminPantryRequestDetail detail, SuperAdminPantryBid bid) async {
    if (_promptOpen || ref.read(superAdminPantryBusyIdProvider) != null) return;
    _promptOpen = true;
    String? overrideReason;
    try {
      if (acceptRequiresOverride(bidId: bid.id, ranking: detail.fairRanking)) {
        overrideReason = await showSuperAdminNoteDialog(
          context: context,
          title: superAdminAcceptBidLabelAr,
          label: superAdminOverrideReasonLabelAr,
          helper: superAdminOverrideReasonHelperAr,
          confirmLabel: superAdminConfirmActionLabelAr,
          minChars: superAdminFairOverrideMinChars,
          maxChars: superAdminFairOverrideMaxChars,
          fieldKey: const Key(superAdminPantryOverrideFieldKey),
          confirmKey: const Key(superAdminPantryAcceptConfirmKey),
        );
        if (overrideReason == null) return;
      } else {
        final ok = await showSuperAdminConfirmDialog(
          context: context,
          title: superAdminAcceptBidLabelAr,
          body: superAdminConfirmAcceptBidBodyAr,
          confirmLabel: superAdminConfirmActionLabelAr,
          confirmKey: const Key(superAdminPantryAcceptConfirmKey),
        );
        if (!ok) return;
      }
    } finally {
      _promptOpen = false;
    }
    if (!mounted) return;
    try {
      final started = await ref.read(superAdminPantryRequestDetailProvider(widget.requestId).notifier).acceptBid(
            bidId: bid.id,
            overrideReason: overrideReason,
          );
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActionSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  Future<void> _reject(SuperAdminPantryBid bid) async {
    if (_promptOpen || ref.read(superAdminPantryBusyIdProvider) != null) return;
    _promptOpen = true;
    final ok = await showSuperAdminConfirmDialog(
      context: context,
      title: superAdminRejectBidLabelAr,
      body: superAdminConfirmRejectBidBodyAr,
      confirmLabel: superAdminConfirmActionLabelAr,
      confirmKey: const Key(superAdminPantryRejectConfirmKey),
    );
    _promptOpen = false;
    if (!ok || !mounted) return;
    try {
      final started =
          await ref.read(superAdminPantryRequestDetailProvider(widget.requestId).notifier).rejectBid(bid.id);
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActionSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminPantryRequestDetailProvider(widget.requestId));
    final busyId = ref.watch(superAdminPantryBusyIdProvider);
    return SuperAdminQueueScaffold(
      title: 'مراجعة عروض بيت المونة',
      onRefresh: () => ref.read(superAdminPantryRequestDetailProvider(widget.requestId).notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () =>
              ref.read(superAdminPantryRequestDetailProvider(widget.requestId).notifier).refreshQuietly(),
        ),
        data: (detail) {
          final current = detail.collection?.current;
          final required = detail.collection?.required;
          final collectionLabel = pantryCollectionStatusLabelAr(detail.collection?.status);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              SuperAdminQueueCard(
                title: detail.title,
                subtitle: [
                  if (current != null && required != null) '$current / $required',
                  collectionLabel,
                  if ((detail.relistCount) > 0) '$superAdminPantryRelistLabelAr (${detail.relistCount})',
                ].join('\n'),
                chip: SuperAdminStatusChip(
                  label: collectionLabel,
                  tone: SuperAdminChipTone.warning,
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'العروض',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primaryDeep),
              ),
              const SizedBox(height: 10),
              if (detail.bids.isEmpty)
                const SuperAdminQueueCard(title: 'لا توجد عروض بعد.'),
              for (final bid in detail.bids) ...[
                SuperAdminQueueCard(
                  title: bid.freelancerName ?? 'مستقل',
                  subtitle: [
                    if (bid.durationDays != null) 'مدة التسليم: ${bid.durationDays} يوم',
                    if (bid.createdAt != null) formatSuperAdminDate(bid.createdAt),
                    pantryBidStatusLabelAr(bid.status),
                  ].where((e) => e.trim().isNotEmpty).join(' · '),
                  meta: formatSuperAdminJod(bid.amountJod),
                  chip: SuperAdminStatusChip(
                    label: isRecommendedPantryBid(bid.id, detail.fairRanking)
                        ? superAdminRecommendedBidLabelAr
                        : pantryBidStatusLabelAr(bid.status),
                    tone: isRecommendedPantryBid(bid.id, detail.fairRanking)
                        ? SuperAdminChipTone.success
                        : SuperAdminChipTone.neutral,
                  ),
                  actions: _bidActions(detail, bid, busyId),
                ),
                const SizedBox(height: 10),
              ],
              if (detail.deliveries.any((d) => (d.status ?? '') == 'submitted')) ...[
                const SizedBox(height: 8),
                const Text(
                  'تسليمات',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primaryDeep),
                ),
                const SizedBox(height: 10),
                for (final delivery in detail.deliveries.where((d) => (d.status ?? '') == 'submitted'))
                  SuperAdminQueueCard(
                    title: delivery.requestTitle ?? 'تسليم بيت المونة',
                    subtitle: pantryDeliveryStatusLabelAr(delivery.status),
                    onTap: () => context.push(AppRoutes.superAdminPantryDeliveryPath(delivery.id)),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget? _bidActions(
    SuperAdminPantryRequestDetail detail,
    SuperAdminPantryBid bid,
    String? busyId,
  ) {
    final canAccept = canAcceptPantryBid(request: detail, bid: bid);
    final canReject = canRejectPantryBid(request: detail, bid: bid);
    if (!canAccept && !canReject) return null;
    final acceptBusy = busyId == 'accept:${bid.id}';
    final rejectBusy = busyId == 'reject:${bid.id}';
    final locked = busyId != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (canAccept)
          OhButton(
            key: Key('sa-accept-bid-${bid.id}'),
            label: superAdminAcceptBidLabelAr,
            isLoading: acceptBusy,
            onPressed: locked ? null : () => _accept(detail, bid),
          ),
        if (canAccept && canReject) const SizedBox(height: 8),
        if (canReject)
          OhButton(
            key: Key('sa-reject-bid-${bid.id}'),
            label: superAdminRejectBidLabelAr,
            outlined: true,
            isLoading: rejectBusy,
            onPressed: locked ? null : () => _reject(bid),
          ),
      ],
    );
  }
}

class SuperAdminPantryDeliveryScreen extends ConsumerStatefulWidget {
  const SuperAdminPantryDeliveryScreen({super.key, required this.deliveryId});

  final String deliveryId;

  @override
  ConsumerState<SuperAdminPantryDeliveryScreen> createState() => _SuperAdminPantryDeliveryScreenState();
}

class _SuperAdminPantryDeliveryScreenState extends ConsumerState<SuperAdminPantryDeliveryScreen> {
  bool _promptOpen = false;

  Future<void> _approve() async {
    if (_promptOpen || ref.read(superAdminPantryBusyIdProvider) != null) return;
    _promptOpen = true;
    final ok = await showSuperAdminConfirmDialog(
      context: context,
      title: superAdminApproveDeliveryLabelAr,
      body: superAdminConfirmApproveDeliveryBodyAr,
      confirmLabel: superAdminConfirmActionLabelAr,
      confirmKey: const Key(superAdminPantryApproveDeliveryConfirmKey),
    );
    _promptOpen = false;
    if (!ok || !mounted) return;
    try {
      final started =
          await ref.read(superAdminPantryDeliveryDetailProvider(widget.deliveryId).notifier).approve();
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActionSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  Future<void> _revision() async {
    if (_promptOpen || ref.read(superAdminPantryBusyIdProvider) != null) return;
    _promptOpen = true;
    final note = await showSuperAdminNoteDialog(
      context: context,
      title: superAdminRequestRevisionLabelAr,
      label: superAdminRevisionNoteLabelAr,
      helper: 'أدخل سبب طلب التعديل (3 أحرف على الأقل).',
      confirmLabel: superAdminConfirmActionLabelAr,
      minChars: 3,
      fieldKey: const Key(superAdminPantryRevisionFieldKey),
      confirmKey: const Key(superAdminPantryRevisionConfirmKey),
    );
    _promptOpen = false;
    if (note == null || !mounted) return;
    try {
      final started = await ref
          .read(superAdminPantryDeliveryDetailProvider(widget.deliveryId).notifier)
          .requestRevision(note);
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActionSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminPantryDeliveryDetailProvider(widget.deliveryId));
    final busyId = ref.watch(superAdminPantryBusyIdProvider);
    return SuperAdminQueueScaffold(
      title: 'مراجعة تسليم بيت المونة',
      onRefresh: () =>
          ref.read(superAdminPantryDeliveryDetailProvider(widget.deliveryId).notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () =>
              ref.read(superAdminPantryDeliveryDetailProvider(widget.deliveryId).notifier).refreshQuietly(),
        ),
        data: (delivery) {
          final canAct = canApprovePantryDelivery(delivery);
          final approveBusy = busyId == 'approve:${delivery.id}';
          final revisionBusy = busyId == 'revision:${delivery.id}';
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              SuperAdminQueueCard(
                title: delivery.requestTitle ?? 'تسليم بيت المونة',
                subtitle: [
                  if (delivery.freelancerName != null) delivery.freelancerName,
                  if (delivery.createdAt != null) formatSuperAdminDate(delivery.createdAt),
                  if (delivery.notes != null && delivery.notes!.trim().isNotEmpty) delivery.notes,
                ].whereType<String>().join('\n'),
                chip: SuperAdminStatusChip(
                  label: pantryDeliveryStatusLabelAr(delivery.status),
                  tone: SuperAdminChipTone.warning,
                ),
                actions: canAct
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          OhButton(
                            key: Key('sa-approve-delivery-${delivery.id}'),
                            label: superAdminApproveDeliveryLabelAr,
                            isLoading: approveBusy,
                            onPressed: busyId != null ? null : _approve,
                          ),
                          const SizedBox(height: 8),
                          OhButton(
                            key: Key('sa-revision-delivery-${delivery.id}'),
                            label: superAdminRequestRevisionLabelAr,
                            outlined: true,
                            isLoading: revisionBusy,
                            onPressed: busyId != null ? null : _revision,
                          ),
                        ],
                      )
                    : null,
              ),
              if (delivery.files.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text(
                  'الملفات',
                  style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.primaryDeep),
                ),
                const SizedBox(height: 8),
                for (final file in delivery.files)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(
                      file.name ?? 'ملف',
                      style: const TextStyle(color: AppColors.textMuted),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

String pantryBidStatusLabelAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'pending':
      return 'معلّق';
    case 'accepted':
      return 'مقبول';
    case 'rejected':
      return 'مرفوض';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : 'عرض';
  }
}
