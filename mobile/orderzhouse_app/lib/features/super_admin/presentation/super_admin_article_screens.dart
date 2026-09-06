import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_actions.dart';
import '../data/super_admin_article_actions.dart';
import '../data/super_admin_article_models.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_models.dart';
import '../data/super_admin_pantry_models.dart';
import 'super_admin_action_dialogs.dart';
import 'super_admin_queue_screens.dart';
import 'super_admin_ui.dart';

class SuperAdminArticleDetailScreen extends ConsumerStatefulWidget {
  const SuperAdminArticleDetailScreen({super.key, required this.articleId});

  final String articleId;

  @override
  ConsumerState<SuperAdminArticleDetailScreen> createState() => _SuperAdminArticleDetailScreenState();
}

class _SuperAdminArticleDetailScreenState extends ConsumerState<SuperAdminArticleDetailScreen> {
  bool _promptOpen = false;

  Future<void> _select(SuperAdminArticleDetail detail, SuperAdminArticleApplication application) async {
    if (_promptOpen || ref.read(superAdminArticlesBusyIdProvider) != null) return;
    _promptOpen = true;
    String? overrideReason;
    try {
      if (selectRequiresOverride(applicationId: application.id, ranking: detail.fairRanking)) {
        overrideReason = await showSuperAdminNoteDialog(
          context: context,
          title: superAdminSelectApplicantLabelAr,
          label: superAdminOverrideReasonLabelAr,
          helper: superAdminArticleOverrideHelperAr,
          confirmLabel: superAdminConfirmActionLabelAr,
          minChars: superAdminFairOverrideMinChars,
          maxChars: superAdminFairOverrideMaxChars,
          fieldKey: const Key(superAdminArticleOverrideFieldKey),
          confirmKey: const Key(superAdminSelectApplicantConfirmKey),
        );
        if (overrideReason == null) return;
      } else {
        final ok = await showSuperAdminConfirmDialog(
          context: context,
          title: superAdminConfirmSelectTitleAr,
          body: superAdminConfirmSelectBodyAr,
          confirmLabel: superAdminConfirmActionLabelAr,
          confirmKey: const Key(superAdminSelectApplicantConfirmKey),
        );
        if (!ok) return;
      }
    } finally {
      _promptOpen = false;
    }
    if (!mounted) return;
    try {
      final started = await ref.read(superAdminArticleDetailProvider(widget.articleId).notifier).selectApplicant(
            applicationId: application.id,
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

  Future<void> _relist() async {
    if (_promptOpen || ref.read(superAdminArticlesBusyIdProvider) != null) return;
    _promptOpen = true;
    final ok = await showSuperAdminConfirmDialog(
      context: context,
      title: superAdminRelistArticleLabelAr,
      body: superAdminConfirmRelistBodyAr,
      confirmLabel: superAdminConfirmActionLabelAr,
      confirmKey: const Key(superAdminRelistArticleConfirmKey),
    );
    _promptOpen = false;
    if (!ok || !mounted) return;
    try {
      final started =
          await ref.read(superAdminArticleDetailProvider(widget.articleId).notifier).relistBidCollection();
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

  Future<void> _approveArticle() async {
    if (_promptOpen || ref.read(superAdminArticlesBusyIdProvider) != null) return;
    _promptOpen = true;
    final ok = await showSuperAdminConfirmDialog(
      context: context,
      title: superAdminApproveArticleLabelAr,
      body: superAdminArticleApproveConfirmAr,
      confirmLabel: superAdminApproveArticleLabelAr,
      confirmKey: const Key(superAdminApproveArticleConfirmKey),
    );
    _promptOpen = false;
    if (!ok || !mounted) return;
    try {
      final started = await ref
          .read(superAdminArticleDetailProvider(widget.articleId).notifier)
          .finalizeSelectedApplicationApproval();
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminArticleApproveSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  Future<void> _requestRevision() async {
    if (_promptOpen || ref.read(superAdminArticlesBusyIdProvider) != null) return;
    _promptOpen = true;
    String? notes;
    try {
      notes = await showSuperAdminNoteDialog(
        context: context,
        title: superAdminRequestArticleRevisionLabelAr,
        label: 'ملاحظات التعديل',
        helper: superAdminArticleRevisionNoteRequiredAr,
        confirmLabel: superAdminRequestArticleRevisionLabelAr,
        minChars: 3,
        maxChars: 2000,
        fieldKey: const Key(superAdminArticleRevisionNoteFieldKey),
        confirmKey: const Key('sa-confirm-article-revision'),
      );
    } finally {
      _promptOpen = false;
    }
    if (notes == null || !mounted) return;
    final validation = validateArticleRevisionNote(notes);
    if (validation != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(validation)));
      return;
    }
    try {
      final started = await ref
          .read(superAdminArticleDetailProvider(widget.articleId).notifier)
          .requestSelectedApplicationRevision(notes);
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminArticleRevisionSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  Future<void> _rejectArticle() async {
    if (_promptOpen || ref.read(superAdminArticlesBusyIdProvider) != null) return;
    _promptOpen = true;
    String? reason;
    try {
      reason = await showSuperAdminNoteDialog(
        context: context,
        title: superAdminRejectArticleLabelAr,
        label: 'سبب الرفض',
        helper: superAdminArticleRejectReasonRequiredAr,
        confirmLabel: superAdminRejectArticleLabelAr,
        minChars: 3,
        maxChars: 2000,
        fieldKey: const Key(superAdminArticleRejectReasonFieldKey),
        confirmKey: const Key(superAdminRejectArticleConfirmKey),
      );
    } finally {
      _promptOpen = false;
    }
    if (reason == null || !mounted) return;
    final validation = validateArticleRejectReason(reason);
    if (validation != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(validation)));
      return;
    }
    try {
      final started = await ref
          .read(superAdminArticleDetailProvider(widget.articleId).notifier)
          .rejectSelectedApplication(rejectionReason: reason);
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminArticleRejectSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  Widget? _reviewActions(SuperAdminArticleDetail detail, String? busyId) {
    final canApprove = canFinalizeArticleApproval(detail);
    final canRevision = canRequestArticleRevision(detail);
    final canReject = canRejectSelectedArticleApplication(detail);
    if (!canApprove && !canRevision && !canReject) return null;
    final locked = busyId != null;
    final app = selectedArticleApplication(detail);
    final approveBusy = app != null && busyId == 'finalize:${app.id}';
    final revisionBusy = app != null && busyId == 'revision:${app.id}';
    final rejectBusy = app != null && busyId == 'reject:${app.id}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (canApprove) ...[
          OhButton(
            key: const Key('sa-approve-article'),
            label: superAdminApproveArticleLabelAr,
            isLoading: approveBusy,
            onPressed: locked ? null : _approveArticle,
          ),
          const SizedBox(height: 8),
        ],
        if (canRevision) ...[
          OhButton(
            key: const Key('sa-request-article-revision'),
            label: superAdminRequestArticleRevisionLabelAr,
            outlined: true,
            isLoading: revisionBusy,
            onPressed: locked ? null : _requestRevision,
          ),
          const SizedBox(height: 8),
        ],
        if (canReject)
          OhButton(
            key: const Key('sa-reject-article'),
            label: superAdminRejectArticleLabelAr,
            outlined: true,
            isLoading: rejectBusy,
            onPressed: locked ? null : _rejectArticle,
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminArticleDetailProvider(widget.articleId));
    final busyId = ref.watch(superAdminArticlesBusyIdProvider);
    return SuperAdminQueueScaffold(
      title: 'مراجعة طلبات المقال',
      onRefresh: () =>
          ref.read(superAdminArticleDetailProvider(widget.articleId).notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () =>
              ref.read(superAdminArticleDetailProvider(widget.articleId).notifier).refreshQuietly(),
        ),
        data: (detail) {
          final current = detail.collection?.current;
          final required = detail.collection?.required;
          final collectionLabel = articleCollectionStatusLabelAr(detail.collection?.status);
          final outcome = (detail.collection?.outcome ?? '').trim();
          final canRelist = canRelistArticleBidCollection(detail);
          final relistBusy = busyId == 'relist:${widget.articleId}';
          final locked = busyId != null;
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              SuperAdminQueueCard(
                title: detail.title,
                subtitle: [
                  if (current != null && required != null) '$current / $required',
                  collectionLabel,
                  if (outcome.isNotEmpty && outcome != (detail.collection?.status ?? ''))
                    articleCollectionStatusLabelAr(outcome),
                  if (detail.relistCount > 0) '$superAdminPantryRelistLabelAr (${detail.relistCount})',
                  if (detail.articleStatus != null) articleStatusLabelAr(detail.articleStatus),
                  if (detail.hasSelectedApplicant) superAdminAssignedApplicantLabelAr,
                  if (detail.createdAt != null) formatSuperAdminDate(detail.createdAt),
                  if (detail.deadline != null) formatSuperAdminDate(detail.deadline),
                ].where((e) => e.trim().isNotEmpty).join('\n'),
                meta: detail.valueJod != null ? formatSuperAdminJod(detail.valueJod) : null,
                chip: SuperAdminStatusChip(
                  label: collectionLabel,
                  tone: _articleChipTone(detail.collection?.status),
                ),
                actions: canRelist
                    ? OhButton(
                        key: const Key('sa-relist-article'),
                        label: superAdminRelistArticleLabelAr,
                        isLoading: relistBusy,
                        onPressed: locked ? null : _relist,
                      )
                    : null,
              ),
              if (_reviewActions(detail, busyId) case final reviewActions?) ...[
                const SizedBox(height: 12),
                reviewActions,
              ],
              const SizedBox(height: 16),
              const Text(
                'المتقدمون',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.primaryDeep),
              ),
              const SizedBox(height: 10),
              if (detail.applications.isEmpty)
                const SuperAdminQueueCard(title: 'لا توجد طلبات بعد.'),
              for (final application in detail.applications) ...[
                SuperAdminQueueCard(
                  title: application.freelancerName ?? 'مستقل',
                  subtitle: [
                    if (application.rank != null) 'الترتيب: ${application.rank}',
                    articleApplicationStatusLabelAr(application.status),
                    if (application.submittedAt != null) formatSuperAdminDate(application.submittedAt),
                  ].where((e) => e.trim().isNotEmpty).join(' · '),
                  chip: SuperAdminStatusChip(
                    label: isRecommendedArticleApplicant(application.id, detail.fairRanking)
                        ? superAdminRecommendedBidLabelAr
                        : articleApplicationStatusLabelAr(application.status),
                    tone: isRecommendedArticleApplicant(application.id, detail.fairRanking)
                        ? SuperAdminChipTone.success
                        : SuperAdminChipTone.neutral,
                  ),
                  actions: _applicationActions(detail, application, busyId),
                ),
                const SizedBox(height: 10),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget? _applicationActions(
    SuperAdminArticleDetail detail,
    SuperAdminArticleApplication application,
    String? busyId,
  ) {
    if (!canSelectArticleApplication(detail: detail, application: application)) return null;
    final selectBusy = busyId == 'select:${application.id}';
    final locked = busyId != null;
    return OhButton(
      key: Key('sa-select-application-${application.id}'),
      label: superAdminSelectApplicantLabelAr,
      isLoading: selectBusy,
      onPressed: locked ? null : () => _select(detail, application),
    );
  }
}

SuperAdminChipTone _articleChipTone(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'minimum_not_met':
      return SuperAdminChipTone.urgent;
    case 'eligible_for_assignment':
    case 'threshold_reached':
    case 'assigned':
      return SuperAdminChipTone.success;
    default:
      return SuperAdminChipTone.warning;
  }
}
