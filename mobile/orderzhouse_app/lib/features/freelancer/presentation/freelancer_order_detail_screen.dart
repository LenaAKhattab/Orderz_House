import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/files/order_file_download_paths.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../client_orders/data/order_attachment_limits.dart';
import '../../orders/presentation/order_detail_widgets.dart';
import '../../orders/presentation/order_file_download_tile.dart';
import '../data/freelancer_delivery_models.dart';
import '../data/freelancer_my_order_models.dart';
import '../data/freelancer_my_orders_repository.dart';
import 'freelancer_delivery_controller.dart';
import 'freelancer_my_orders_controller.dart';
import 'submit_freelancer_delivery_sheet.dart';

final freelancerOrderDetailProvider =
    FutureProvider.autoDispose.family<FreelancerMyOrder, String>((ref, orderId) {
  return ref.read(freelancerMyOrdersRepositoryProvider).fetchMyOrderById(orderId);
});

class FreelancerOrderDetailScreen extends ConsumerWidget {
  const FreelancerOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOrder = ref.watch(freelancerOrderDetailProvider(orderId));

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تفاصيل الطلب')),
      body: asyncOrder.when(
        loading: () => const OhLoadingBody(message: 'جاري تحميل التفاصيل...'),
        error: (error, _) => OhErrorBody(
          message: apiErrorMessage(error, fallback: 'تعذر تحميل تفاصيل الطلب.'),
          onRetry: () => ref.invalidate(freelancerOrderDetailProvider(orderId)),
        ),
        data: (order) => _FreelancerOrderDetailBody(orderId: orderId, order: order),
      ),
    );
  }
}

class _FreelancerOrderDetailBody extends ConsumerWidget {
  const _FreelancerOrderDetailBody({required this.orderId, required this.order});

  final String orderId;
  final FreelancerMyOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        Text(
          order.title,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 22,
            color: AppColors.textInk,
            height: 1.35,
          ),
        ),
        const SizedBox(height: 16),
        OrderSectionCard(
          title: 'معلومات الطلب',
          children: [
            if (order.category?.name != null)
              OrderInfoRow(label: 'التصنيف', value: order.category!.name!, icon: Icons.category_outlined),
            OrderInfoRow(label: 'نوع الطلب', value: order.projectTypeLabel, icon: Icons.layers_outlined),
            OrderInfoRow(label: 'الحالة', value: order.statusLabel, icon: Icons.flag_outlined),
            if (order.budgetLabel != null)
              OrderInfoRow(label: 'الميزانية', value: order.budgetLabel!, icon: Icons.payments_outlined),
            if (order.durationText != null)
              OrderInfoRow(label: 'المدة', value: order.durationText!, icon: Icons.schedule_outlined),
            if (order.dueAt != null)
              OrderInfoRow(
                label: 'موعد التسليم',
                value: formatOrderDateLabel(order.dueAt),
                icon: Icons.event_outlined,
              ),
            if (order.createdAt != null)
              OrderInfoRow(
                label: 'تاريخ الإنشاء',
                value: formatOrderDateLabel(order.createdAt),
                icon: Icons.calendar_today_outlined,
              ),
            if (order.updatedAt != null)
              OrderInfoRow(
                label: 'آخر تحديث',
                value: formatOrderDateLabel(order.updatedAt),
                icon: Icons.update,
              ),
          ],
        ),
        if (order.description != null && order.description!.trim().isNotEmpty) ...[
          const SizedBox(height: 12),
          OrderSectionCard(
            title: 'الوصف',
            children: [
              Text(
                order.description!.trim(),
                style: const TextStyle(color: AppColors.textInk, height: 1.7, fontSize: 15),
              ),
            ],
          ),
        ],
        if (order.briefFiles.isNotEmpty) ...[
          const SizedBox(height: 12),
          OrderSectionCard(
            title: 'مرفقات الطلب',
            children: order.briefFiles
                .map(
                  (file) => OrderFileDownloadTile(
                    orderId: orderId,
                    role: OrderFileDownloadRole.freelancer,
                    file: file,
                  ),
                )
                .toList(),
          ),
        ],
        if (order.submissionHistory != null && order.submissionHistory!.submissions.isNotEmpty) ...[
          const SizedBox(height: 12),
          OrderSectionCard(
            title: 'سجل التسليم',
            children: order.submissionHistory!.submissions
                .map((s) => _SubmissionHistoryRow(orderId: orderId, submission: s))
                .toList(),
          ),
        ],
        const SizedBox(height: 12),
        OrderSectionCard(
          title: 'التسليم',
          children: [
            _FreelancerDeliverySection(orderId: orderId, order: order),
          ],
        ),
      ],
    );
  }
}

class _SubmissionHistoryRow extends StatelessWidget {
  const _SubmissionHistoryRow({
    required this.orderId,
    required this.submission,
  });

  final String orderId;
  final FreelancerOrderSubmission submission;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.iconChipBg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppColors.cardBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              submission.statusLabel,
              style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textInk),
              textAlign: TextAlign.right,
            ),
            if (submission.submittedAt != null) ...[
              const SizedBox(height: 4),
              Text(
                'تاريخ التسليم: ${formatOrderDateLabel(submission.submittedAt)}',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                textAlign: TextAlign.right,
              ),
            ],
            const SizedBox(height: 4),
            Text(
              'عدد الملفات: ${submission.filesCount}',
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
              textAlign: TextAlign.right,
            ),
            if (submission.files.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...submission.files.map(
                (file) => OrderFileDownloadTile(
                  orderId: orderId,
                  role: OrderFileDownloadRole.freelancer,
                  file: file,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FreelancerDeliverySection extends ConsumerStatefulWidget {
  const _FreelancerDeliverySection({required this.orderId, required this.order});

  final String orderId;
  final FreelancerMyOrder order;

  @override
  ConsumerState<_FreelancerDeliverySection> createState() => _FreelancerDeliverySectionState();
}

class _FreelancerDeliverySectionState extends ConsumerState<_FreelancerDeliverySection> {
  Future<void> _openDeliverySheet() async {
    final deliveryState = ref.read(freelancerDeliveryControllerProvider(widget.orderId));
    final attachments = await showSubmitFreelancerDeliverySheet(
      context,
      order: widget.order,
      isSubmitting: deliveryState.isSubmitting,
    );
    if (attachments == null || attachments.isEmpty || !mounted) return;

    try {
      await ref.read(freelancerDeliveryControllerProvider(widget.orderId).notifier).submitDelivery(attachments);
      if (!mounted) return;
      ref.invalidate(freelancerOrderDetailProvider(widget.orderId));
      ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال التسليم بنجاح — بانتظار مراجعة العميل.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(apiErrorMessage(e, fallback: 'تعذر إرسال التسليم.')),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final deliveryState = ref.watch(freelancerDeliveryControllerProvider(widget.orderId));
    final canDeliver = freelancerCanDeliverOrder(order);
    final revisionNote = order.clientRevisionNote?.trim();

    if (canDeliver) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (revisionNote != null && revisionNote.isNotEmpty) ...[
            Text(
              'العميل طلب تعديلات، يمكنك إرسال تسليم جديد.',
              style: const TextStyle(color: AppColors.textInk, height: 1.5, fontWeight: FontWeight.w600),
              textAlign: TextAlign.right,
            ),
            const SizedBox(height: 10),
          ],
          const Text(
            deliveryAttachmentHelperAr,
            style: TextStyle(color: AppColors.textMuted, height: 1.45),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 12),
          OhButton(
            label: deliveryState.isSubmitting ? 'جارٍ الإرسال...' : 'تسليم العمل',
            isLoading: deliveryState.isSubmitting,
            onPressed: deliveryState.isSubmitting ? null : _openDeliverySheet,
          ),
        ],
      );
    }

    final message = freelancerDeliveryBlockedMessageAr(order);
    return OrderDisabledAction(label: message ?? 'لا يمكن التسليم حالياً.');
  }
}
