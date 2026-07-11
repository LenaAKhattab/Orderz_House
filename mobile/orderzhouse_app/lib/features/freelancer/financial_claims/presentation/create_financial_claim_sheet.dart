import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../../../orders/data/order_display_helpers.dart';
import '../data/create_financial_claim_models.dart';
import '../data/done_project_models.dart';
import 'create_financial_claim_controller.dart';

Future<bool?> showCreateFinancialClaimSheet(
  BuildContext context, {
  required DoneProject project,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => CreateFinancialClaimSheet(project: project),
  );
}

class CreateFinancialClaimSheet extends ConsumerStatefulWidget {
  const CreateFinancialClaimSheet({super.key, required this.project});

  final DoneProject project;

  @override
  ConsumerState<CreateFinancialClaimSheet> createState() => _CreateFinancialClaimSheetState();
}

class _CreateFinancialClaimSheetState extends ConsumerState<CreateFinancialClaimSheet> {
  final _noteController = TextEditingController();
  String? _localError;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final noteError = validateFreelancerClaimNote(_noteController.text);
    if (noteError != null) {
      setState(() => _localError = noteError);
      return;
    }

    final controller = ref.read(createFinancialClaimControllerProvider(widget.project.projectId).notifier);
    final state = ref.read(createFinancialClaimControllerProvider(widget.project.projectId));
    if (state.isSubmitting) return;

    setState(() => _localError = null);
    try {
      await controller.submit(freelancerNote: _noteController.text);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (_) {
      if (!mounted) return;
      final err = ref.read(createFinancialClaimControllerProvider(widget.project.projectId)).error;
      setState(() => _localError = err);
    }
  }

  @override
  Widget build(BuildContext context) {
    final project = widget.project;
    final submitState = ref.watch(createFinancialClaimControllerProvider(project.projectId));
    final isSubmitting = submitState.isSubmitting;
    final error = _localError ?? submitState.error;

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 12,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'تأكيد إرسال المطالبة',
              style: TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 18,
                color: AppColors.textInk,
              ),
              textAlign: TextAlign.right,
            ),
            const SizedBox(height: 14),
            OhCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _SummaryRow(
                    label: 'العنوان',
                    value: project.requestTitle.trim().isNotEmpty ? project.requestTitle : '—',
                  ),
                  _SummaryRow(
                    label: 'رقم الطلب',
                    value: project.orderNumber.trim().isNotEmpty ? project.orderNumber : '—',
                  ),
                  _SummaryRow(
                    label: 'تاريخ الإكمال',
                    value: formatOrderDate(project.actualCompletionDate),
                  ),
                  _SummaryRow(
                    label: 'المبلغ',
                    value: formatDoneProjectAmount(project),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
              ),
              child: const Text(
                createFinancialClaimNoticeAr,
                style: TextStyle(
                  color: AppColors.textInk,
                  fontWeight: FontWeight.w600,
                  height: 1.5,
                  fontSize: 13,
                ),
                textAlign: TextAlign.right,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _noteController,
              enabled: !isSubmitting,
              maxLines: 3,
              maxLength: maxFreelancerClaimNoteLength,
              decoration: const InputDecoration(
                labelText: 'ملاحظة للمحاسبة / الإدارة (اختياري)',
                alignLabelWithHint: true,
              ),
            ),
            if (error != null && error.isNotEmpty) ...[
              const SizedBox(height: 8),
              OhErrorBanner(message: error),
            ],
            const SizedBox(height: 14),
            OhButton(
              label: 'إرسال المطالبة',
              isLoading: isSubmitting,
              onPressed: isSubmitting ? null : _submit,
            ),
            const SizedBox(height: 8),
            OhButton(
              label: 'إلغاء',
              outlined: true,
              onPressed: isSubmitting ? null : () => Navigator.of(context).pop(false),
            ),
          ],
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.label, required this.value});

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
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: AppColors.textInk,
                fontWeight: FontWeight.w600,
                height: 1.4,
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
