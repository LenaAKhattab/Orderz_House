import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_actions.dart';
import '../data/super_admin_article_models.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_kyc_models.dart';
import '../data/super_admin_models.dart';
import '../data/super_admin_pantry_models.dart';
import 'super_admin_action_dialogs.dart';
import 'super_admin_ui.dart';
import '../../../core/i18n/i18n.dart';

class SuperAdminIdentityQueueScreen extends ConsumerWidget {
  const SuperAdminIdentityQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(superAdminIdentityQueueProvider);
    return SuperAdminQueueScaffold(
      title: superAdminIdentityQueueTitleAr,
      onRefresh: () => ref.read(superAdminIdentityQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminIdentityQueueProvider.notifier).refresh(),
        ),
        data: (snapshot) {
          if (snapshot.loadFailed && snapshot.pendingItems.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: true,
              message: tr('تعذّر تحميل طلبات التوثيق. حاول مرة أخرى.'),
              onRetry: () => ref.read(superAdminIdentityQueueProvider.notifier).refresh(),
            );
          }
          final kycItems = snapshot.pendingItems;
          if (kycItems.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: superAdminActivationEmptyAr,
            );
          }
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: kycItems.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) => _KycQueueCard(item: kycItems[index]),
          );
        },
      ),
    );
  }
}

class SuperAdminSubscriptionActivationQueueScreen extends ConsumerWidget {
  const SuperAdminSubscriptionActivationQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(superAdminActivationQueueProvider);
    return SuperAdminQueueScaffold(
      title: superAdminSubscriptionActivationQueueTitleAr,
      onRefresh: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
        ),
        data: (snapshot) {
          if (snapshot.subscriptionLoadFailed) {
            return SuperAdminQueueErrorOrEmpty(
              isError: true,
              message: tr('تعذّر تحميل طلبات تفعيل الاشتراك. حاول مرة أخرى.'),
              onRetry: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
            );
          }
          final classified = snapshot.subscriptionClassification;
          if (classified.paidActionable.isEmpty && classified.legacyFree.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: superAdminPaidSubscriptionActivationEmptyAr,
            );
          }
          final sections = <Widget>[];
          if (classified.paidActionable.isNotEmpty) {
            sections.add(_SectionHeader(title: tr('طلبات مدفوعة')));
            sections.addAll(classified.paidActionable.map((e) => _SubscriptionQueueCard(item: e)));
          } else {
            sections.add(
              Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  superAdminPaidSubscriptionActivationEmptyAr,
                  textAlign: TextAlign.start,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.4),
                ),
              ),
            );
          }
          if (classified.legacyFree.isNotEmpty) {
            if (sections.isNotEmpty) sections.add(const SizedBox(height: 8));
            sections.add(_SectionHeader(title: superAdminLegacyFreeActivationSectionAr));
            sections.add(
              Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  tr('هذه الطلبات ليست تفعيل اشتراك مدفوع — راجعها يدوياً أو عالجها من الويب.'),
                  textAlign: TextAlign.start,
                  style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
                ),
              ),
            );
            sections.addAll(classified.legacyFree.map((e) => _SubscriptionQueueCard(item: e, legacy: true)));
          }
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              for (var i = 0; i < sections.length; i++) ...[
                if (i > 0) const SizedBox(height: 10),
                sections[i],
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Backward-compatible combined queue — prefer split identity/subscription screens.
class SuperAdminActivationQueueScreen extends ConsumerStatefulWidget {
  const SuperAdminActivationQueueScreen({super.key});

  @override
  ConsumerState<SuperAdminActivationQueueScreen> createState() =>
      _SuperAdminActivationQueueScreenState();
}

class _SuperAdminActivationQueueScreenState extends ConsumerState<SuperAdminActivationQueueScreen> {
  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminActivationQueueProvider);
    return SuperAdminQueueScaffold(
      title: superAdminActivationQueueTitleAr,
      onRefresh: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
        ),
        data: (snapshot) {
          final kycItems = snapshot.kycItems.where((e) => e.isPendingReview).toList();
          final subItems = snapshot.subscriptionClassification.paidActionable;
          if (kycItems.isEmpty && subItems.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: superAdminActivationEmptyAr,
            );
          }
          final total = kycItems.length + subItems.length + (kycItems.isNotEmpty && subItems.isNotEmpty ? 2 : 1);
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: total,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              var cursor = index;
              if (kycItems.isNotEmpty) {
                if (cursor == 0) {
                  return _SectionHeader(title: superAdminActivationKycSectionAr);
                }
                cursor -= 1;
                if (cursor < kycItems.length) {
                  return _KycQueueCard(item: kycItems[cursor]);
                }
                cursor -= kycItems.length;
              }
              if (subItems.isNotEmpty) {
                if (cursor == 0) {
                  return _SectionHeader(title: superAdminActivationSubscriptionSectionAr);
                }
                cursor -= 1;
                return _SubscriptionQueueCard(item: subItems[cursor]);
              }
              return const SizedBox.shrink();
            },
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 2),
      child: Text(
        title,
        textAlign: TextAlign.start,
        style: const TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: 15,
          color: AppColors.primaryDeep,
        ),
      ),
    );
  }
}

class _KycQueueCard extends StatelessWidget {
  const _KycQueueCard({required this.item});

  final SuperAdminKycActivationItem item;

  @override
  Widget build(BuildContext context) {
    final docsLabel = (item.hasFrontImage || item.hasBackImage)
        ? superAdminActivationDocumentsAvailableAr
        : superAdminActivationNoDocumentsAr;
    return SuperAdminQueueCard(
      key: Key('sa-kyc-queue-${item.id}'),
      title: item.freelancerName ?? item.freelancerEmail ?? tr('مستقل'),
      subtitle: [
        if (item.freelancerEmail != null) item.freelancerEmail,
        docsLabel,
        if (item.submittedAt != null) formatSuperAdminDate(item.submittedAt),
      ].whereType<String>().join('\n'),
      chip: SuperAdminStatusChip(
        label: kycStatusLabelAr(item.status),
        tone: SuperAdminChipTone.urgent,
      ),
      onTap: () => context.push(AppRoutes.superAdminActivationKycPath(item.id)),
    );
  }
}

class _SubscriptionQueueCard extends StatelessWidget {
  const _SubscriptionQueueCard({required this.item, this.legacy = false});

  final SuperAdminActivationItem item;
  final bool legacy;

  @override
  Widget build(BuildContext context) {
    return SuperAdminQueueCard(
      key: Key('sa-subscription-queue-${item.id}'),
      title: item.freelancerName ?? item.freelancerEmail ?? tr('مستقل'),
      subtitle: [
        if (item.planTitle != null) item.planTitle,
        if (item.freelancerEmail != null) item.freelancerEmail,
        if (item.assignedAt != null) formatSuperAdminDate(item.assignedAt),
      ].whereType<String>().join('\n'),
      meta: item.priceJod != null && item.priceJod! > 0 ? formatSuperAdminJod(item.priceJod) : null,
      chip: SuperAdminStatusChip(
        label: legacy ? tr('مراجعة يدوية') : tr('بانتظار تفعيل الاشتراك'),
        tone: legacy ? SuperAdminChipTone.neutral : SuperAdminChipTone.warning,
      ),
      onTap: legacy
          ? null
          : () => context.push(AppRoutes.superAdminActivationSubscriptionPath(item.id)),
    );
  }
}

class SuperAdminClaimsQueueScreen extends ConsumerStatefulWidget {
  const SuperAdminClaimsQueueScreen({super.key});

  @override
  ConsumerState<SuperAdminClaimsQueueScreen> createState() => _SuperAdminClaimsQueueScreenState();
}

class _SuperAdminClaimsQueueScreenState extends ConsumerState<SuperAdminClaimsQueueScreen> {
  bool _promptOpen = false;

  Future<void> _updateStatus(SuperAdminClaimItem item) async {
    if (_promptOpen) return;
    if (ref.read(superAdminClaimsBusyIdProvider) != null) return;

    _promptOpen = true;
    final request = await showSuperAdminClaimStatusDialog(context);
    _promptOpen = false;
    if (request == null || !mounted) return;
    if (ref.read(superAdminClaimsBusyIdProvider) != null) return;

    try {
      final started = await ref.read(superAdminClaimsQueueProvider.notifier).updateStatus(
            claimId: item.id,
            status: request.status,
            adminNote: request.adminNote,
          );
      if (!started) return;
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionSuccessAr)),
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
    final async = ref.watch(superAdminClaimsQueueProvider);
    final busyId = ref.watch(superAdminClaimsBusyIdProvider);
    return SuperAdminQueueScaffold(
      title: tr('المطالبات المالية'),
      onRefresh: () => ref.read(superAdminClaimsQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminClaimsQueueProvider.notifier).refresh(),
        ),
        data: (items) {
          if (items.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: tr('لا توجد مطالبات تحتاج إجراء.'),
            );
          }
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              final canUpdate = canUpdatePendingClaimStatus(item);
              final busy = busyId == item.id;
              return SuperAdminQueueCard(
                title: item.requestTitle ?? tr('مطالبة مالية'),
                subtitle: [
                  if (item.freelancerName != null) item.freelancerName,
                  if (item.orderNumber != null) trf('طلب {0}', [item.orderNumber]),
                ].whereType<String>().join(' · '),
                meta: formatSuperAdminJod(item.totalPriceJod),
                chip: SuperAdminStatusChip(
                  label: _claimStatusAr(item.status),
                  tone: SuperAdminChipTone.urgent,
                ),
                actions: canUpdate
                    ? OhButton(
                        key: Key('sa-update-claim-status-${item.id}'),
                        label: superAdminUpdateClaimStatusLabelAr,
                        isLoading: busy,
                        onPressed: busyId != null ? null : () => _updateStatus(item),
                      )
                    : null,
              );
            },
          );
        },
      ),
    );
  }
}

class SuperAdminPantryQueueScreen extends ConsumerWidget {
  const SuperAdminPantryQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(superAdminPantryQueueProvider);
    return SuperAdminQueueScaffold(
      title: tr('بيت المونة'),
      onRefresh: () => ref.read(superAdminPantryQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminPantryQueueProvider.notifier).refresh(),
        ),
        data: (items) {
          if (items.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: tr('لا توجد طلبات بيت مونة تحتاج متابعة.'),
            );
          }
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              final relist = (item.relistCount ?? 0) > 0
                  ? '$superAdminPantryRelistLabelAr (${item.relistCount})'
                  : null;
              return SuperAdminQueueCard(
                title: item.title,
                subtitle: [
                  ?item.kind,
                  ?relist,
                ].join('\n'),
                meta: item.progressLabel,
                chip: SuperAdminStatusChip(
                  label: item.statusLabel ?? tr('متابعة'),
                  tone: _pantryChipTone(item),
                ),
                onTap: () {
                  if (item.itemKind == SuperAdminPantryItemKind.delivery) {
                    context.push(AppRoutes.superAdminPantryDeliveryPath(item.id));
                  } else {
                    context.push(AppRoutes.superAdminPantryRequestPath(item.id));
                  }
                },
              );
            },
          );
        },
      ),
    );
  }
}

SuperAdminChipTone _pantryChipTone(SuperAdminPantryAttentionItem item) {
  final collection = (item.collectionStatus ?? '').trim().toLowerCase();
  final delivery = (item.deliveryStatus ?? '').trim().toLowerCase();
  final request = (item.requestStatus ?? '').trim().toLowerCase();
  if (collection == 'minimum_not_met' || delivery == 'submitted') {
    return SuperAdminChipTone.urgent;
  }
  if (collection == 'eligible_for_assignment' ||
      collection == 'threshold_reached' ||
      delivery == 'approved' ||
      request == 'approved') {
    return SuperAdminChipTone.success;
  }
  if (collection == 'collecting') return SuperAdminChipTone.neutral;
  return SuperAdminChipTone.warning;
}

class SuperAdminArticlesQueueScreen extends ConsumerWidget {
  const SuperAdminArticlesQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(superAdminArticlesQueueProvider);
    return SuperAdminQueueScaffold(
      title: tr('المقالات'),
      onRefresh: () => ref.read(superAdminArticlesQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminArticlesQueueProvider.notifier).refresh(),
        ),
        data: (items) {
          if (items.isEmpty) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: tr('لا توجد مقالات تحتاج متابعة.'),
            );
          }
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              final relist = (item.relistCount ?? 0) > 0
                  ? '$superAdminPantryRelistLabelAr (${item.relistCount})'
                  : null;
              final created = formatSuperAdminDate(item.createdAt);
              final deadline = formatSuperAdminDate(item.deadline);
              return SuperAdminQueueCard(
                title: item.title,
                subtitle: [
                  if (item.articleStatus != null) articleStatusLabelAr(item.articleStatus),
                  if (item.assigned) superAdminAssignedApplicantLabelAr,
                  ?relist,
                  if (created.isNotEmpty) created,
                  if (deadline.isNotEmpty) deadline,
                ].where((e) => e.trim().isNotEmpty).join('\n'),
                meta: [
                  if (item.progressLabel != null) item.progressLabel!,
                  if (item.valueJod != null) formatSuperAdminJod(item.valueJod),
                ].join(' · '),
                chip: SuperAdminStatusChip(
                  label: item.statusLabel ?? tr('متابعة'),
                  tone: _articleQueueChipTone(item),
                ),
                onTap: () => context.push(AppRoutes.superAdminArticlePath(item.id)),
              );
            },
          );
        },
      ),
    );
  }
}

SuperAdminChipTone _articleQueueChipTone(SuperAdminArticleAttentionItem item) {
  final collection = (item.collectionStatus ?? '').trim().toLowerCase();
  if (collection == 'minimum_not_met' ||
      (item.collectionOutcome ?? '').trim().toLowerCase() == 'minimum_not_met') {
    return SuperAdminChipTone.urgent;
  }
  if (collection == 'eligible_for_assignment' ||
      collection == 'threshold_reached' ||
      collection == 'assigned' ||
      item.assigned) {
    return SuperAdminChipTone.success;
  }
  return SuperAdminChipTone.warning;
}

class OhLikeLoading extends StatelessWidget {
  const OhLikeLoading({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: CircularProgressIndicator(),
      ),
    );
  }
}

String _activationStatusAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'company_pending':
      return tr('بانتظار تفعيل الشركة');
    case 'company_approved':
      return tr('تم التفعيل');
    case 'company_rejected':
      return tr('مرفوض');
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : tr('بانتظار المراجعة');
  }
}

String _claimStatusAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'pending':
      return tr('قيد المراجعة');
    case 'accepted':
      return tr('مقبولة');
    case 'rejected':
      return tr('مرفوضة');
    case 'frozen':
      return tr('مجمدة');
    case 'requires_in_person_review':
      return tr('تحتاج مراجعة حضورية');
    case 'paid':
      return tr('مدفوعة');
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : tr('قيد المراجعة');
  }
}
