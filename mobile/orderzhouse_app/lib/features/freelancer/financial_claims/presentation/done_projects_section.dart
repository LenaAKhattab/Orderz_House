import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../../../orders/data/order_display_helpers.dart';
import '../data/done_project_models.dart';
import 'create_financial_claim_controller.dart';
import 'create_financial_claim_sheet.dart';
import 'done_projects_controller.dart';
import 'financial_claims_controller.dart';

class DoneProjectsSection extends ConsumerStatefulWidget {
  const DoneProjectsSection({
    super.key,
    this.onClaimCreated,
  });

  final VoidCallback? onClaimCreated;

  @override
  ConsumerState<DoneProjectsSection> createState() => _DoneProjectsSectionState();
}

class _DoneProjectsSectionState extends ConsumerState<DoneProjectsSection> {
  final _searchController = TextEditingController();

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(doneProjectsControllerProvider);
    await ref.read(doneProjectsControllerProvider.future);
  }

  Future<void> _refreshAfterClaimCreated() async {
    ref.invalidate(financialClaimsControllerProvider);
    ref.invalidate(doneProjectsControllerProvider);
    await Future.wait([
      ref.read(financialClaimsControllerProvider.future),
      ref.read(doneProjectsControllerProvider.future),
    ]);
    widget.onClaimCreated?.call();
  }

  Future<void> _openCreateClaimSheet(DoneProject project) async {
    final created = await showCreateFinancialClaimSheet(context, project: project);
    if (!mounted || created != true) return;

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('تم إرسال المطالبة المالية بنجاح')),
    );
    await _refreshAfterClaimCreated();
  }

  void _submitSearch() {
    ref.read(doneProjectsSearchQueryProvider.notifier).state = _searchController.text.trim();
  }

  void _clearSearch() {
    _searchController.clear();
    ref.read(doneProjectsSearchQueryProvider.notifier).state = '';
  }

  @override
  Widget build(BuildContext context) {
    final projectsAsync = ref.watch(doneProjectsControllerProvider);
    final activeQuery = ref.watch(doneProjectsSearchQueryProvider);

    return projectsAsync.when(
      loading: () => const OhLoadingBody(message: 'جارٍ تحميل المشاريع...'),
      error: (error, _) => OhErrorBody(
        message: 'تعذر تحميل المشاريع القابلة للمطالبة. حاول مرة أخرى.',
        onRetry: _refresh,
      ),
      data: (projects) => RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            _SearchBar(
              controller: _searchController,
              activeQuery: activeQuery,
              onSearch: _submitSearch,
              onClear: _clearSearch,
            ),
            const SizedBox(height: 14),
            if (projects.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: OhEmptyBody(
                  message: doneProjectsEmptyMessageAr,
                  icon: Icons.work_off_outlined,
                ),
              )
            else
              ...projects.map(
                (project) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DoneProjectCard(
                    project: project,
                    onCreateClaim: () => _openCreateClaimSheet(project),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SearchBar extends StatelessWidget {
  const _SearchBar({
    required this.controller,
    required this.activeQuery,
    required this.onSearch,
    required this.onClear,
  });

  final TextEditingController controller;
  final String activeQuery;
  final VoidCallback onSearch;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => onSearch(),
            decoration: InputDecoration(
              hintText: 'ابحث برقم الطلب أو العنوان',
              prefixIcon: const Icon(Icons.search),
              suffixIcon: activeQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: onClear,
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 10),
          OhButton(
            label: 'بحث',
            outlined: true,
            onPressed: onSearch,
          ),
        ],
      ),
    );
  }
}

class DoneProjectCard extends ConsumerWidget {
  const DoneProjectCard({
    super.key,
    required this.project,
    required this.onCreateClaim,
  });

  final DoneProject project;
  final VoidCallback onCreateClaim;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isSubmitting =
        ref.watch(createFinancialClaimControllerProvider(project.projectId)).isSubmitting;

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            project.requestTitle.trim().isNotEmpty ? project.requestTitle : 'مشروع مكتمل',
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: AppColors.textInk,
              height: 1.35,
            ),
            textAlign: TextAlign.right,
          ),
          if (project.hasMissingCompletionDate) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.error.withValues(alpha: 0.2)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.warning_amber_rounded, color: AppColors.error, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      doneProjectMissingCompletionDateWarningAr,
                      style: TextStyle(
                        color: AppColors.textInk,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                        height: 1.45,
                      ),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          _InfoRow(label: 'رقم الطلب', value: project.orderNumber.trim().isNotEmpty ? project.orderNumber : '—'),
          _InfoRow(label: 'التصنيفات', value: formatDoneProjectCategories(project.categories)),
          _InfoRow(label: 'تاريخ الإكمال', value: formatOrderDate(project.actualCompletionDate)),
          _InfoRow(label: 'مدة العمل', value: formatDurationMinutesLabel(project.durationMinutes)),
          _InfoRow(label: 'المبلغ', value: formatDoneProjectAmount(project)),
          _InfoRow(
            label: 'حالة الدفع',
            value: doneProjectPaymentStatusLabelAr(project.paymentStatus),
          ),
          const SizedBox(height: 12),
          OhButton(
            label: 'إنشاء مطالبة',
            isLoading: isSubmitting,
            onPressed: isSubmitting ? null : onCreateClaim,
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: AppColors.textInk,
                fontWeight: FontWeight.w600,
                height: 1.4,
                fontSize: 14,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}
