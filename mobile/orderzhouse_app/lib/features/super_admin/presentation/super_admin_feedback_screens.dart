import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_actions.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_feedback_models.dart';
import '../data/super_admin_pantry_models.dart';
import 'super_admin_queue_screens.dart';
import 'super_admin_ui.dart';

class SuperAdminFeedbackQueueScreen extends ConsumerWidget {
  const SuperAdminFeedbackQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(superAdminFeedbackQueueProvider);
    return SuperAdminQueueScaffold(
      title: superAdminFeedbackQueueTitleAr,
      onRefresh: () => ref.read(superAdminFeedbackQueueProvider.notifier).refresh(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminFeedbackQueueProvider.notifier).refresh(),
        ),
        data: (items) {
          if (items.isEmpty) {
            return const SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: superAdminFeedbackEmptyAr,
            );
          }
          return ListView.separated(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final item = items[index];
              return SuperAdminQueueCard(
                key: Key('sa-feedback-${item.id}'),
                title: item.userName ?? item.userEmail ?? 'مستخدم',
                subtitle: [
                  if (item.userEmail != null) item.userEmail,
                  feedbackTypeLabelAr(item),
                  if (item.subject != null) item.subject,
                  item.preview,
                  if (item.createdAt != null) formatSuperAdminDate(item.createdAt),
                ].whereType<String>().where((e) => e.trim().isNotEmpty).join('\n'),
                chip: SuperAdminStatusChip(
                  label: item.isNew ? 'جديد' : feedbackStatusLabelAr(item.status),
                  tone: item.isNew ? SuperAdminChipTone.urgent : SuperAdminChipTone.neutral,
                ),
                onTap: () => context.push(AppRoutes.superAdminFeedbackDetailPath(item.id)),
              );
            },
          );
        },
      ),
    );
  }
}

class SuperAdminFeedbackDetailScreen extends ConsumerStatefulWidget {
  const SuperAdminFeedbackDetailScreen({super.key, required this.feedbackId});

  final String feedbackId;

  @override
  ConsumerState<SuperAdminFeedbackDetailScreen> createState() => _SuperAdminFeedbackDetailScreenState();
}

class _SuperAdminFeedbackDetailScreenState extends ConsumerState<SuperAdminFeedbackDetailScreen> {
  bool _busy = false;

  Future<void> _setStatus(String status) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final ok = await ref
          .read(superAdminFeedbackDetailProvider(widget.feedbackId).notifier)
          .updateStatus(status);
      if (!ok || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminFeedbackUpdateSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminFeedbackDetailProvider(widget.feedbackId));
    return SuperAdminQueueScaffold(
      title: superAdminFeedbackQueueTitleAr,
      onRefresh: () =>
          ref.read(superAdminFeedbackDetailProvider(widget.feedbackId).notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: AlwaysScrollableScrollPhysics(),
          children: [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.invalidate(superAdminFeedbackDetailProvider(widget.feedbackId)),
        ),
        data: (item) {
          final status = (item.status ?? '').trim().toLowerCase();
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              OhCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      item.userName ?? 'مستخدم',
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17),
                      textAlign: TextAlign.right,
                    ),
                    const SizedBox(height: 10),
                    _FeedbackRow(label: 'البريد', value: item.userEmail ?? '—'),
                    _FeedbackRow(label: 'النوع', value: feedbackTypeLabelAr(item)),
                    _FeedbackRow(label: 'الحالة', value: feedbackStatusLabelAr(item.status)),
                    if (item.subject != null) _FeedbackRow(label: 'الموضوع', value: item.subject!),
                    if (item.createdAt != null)
                      _FeedbackRow(label: 'التاريخ', value: formatSuperAdminDate(item.createdAt)),
                    if (item.userRole != null) _FeedbackRow(label: 'الدور', value: item.userRole!),
                    const SizedBox(height: 12),
                    Text(
                      item.description ?? '—',
                      textAlign: TextAlign.right,
                      style: const TextStyle(height: 1.6),
                    ),
                    if (item.adminNote != null) ...[
                      const SizedBox(height: 12),
                      _FeedbackRow(label: 'ملاحظة إدارية', value: item.adminNote!),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (status == 'new') ...[
                OhButton(
                  key: const Key('sa-feedback-mark-review'),
                  label: superAdminFeedbackMarkReviewLabelAr,
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _setStatus('in_review'),
                ),
                const SizedBox(height: 8),
              ],
              if (status == 'new' || status == 'in_review') ...[
                OhButton(
                  key: const Key('sa-feedback-resolve'),
                  label: superAdminFeedbackResolveLabelAr,
                  outlined: true,
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _setStatus('resolved'),
                ),
                const SizedBox(height: 8),
                OhButton(
                  key: const Key('sa-feedback-close'),
                  label: superAdminFeedbackCloseLabelAr,
                  outlined: true,
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _setStatus('closed'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _FeedbackRow extends StatelessWidget {
  const _FeedbackRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          ),
          Expanded(
            flex: 3,
            child: Text(value, textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
