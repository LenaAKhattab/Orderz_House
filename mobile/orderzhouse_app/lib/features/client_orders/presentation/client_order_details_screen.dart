import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../../core/files/order_file_download_paths.dart';
import '../../orders/presentation/order_detail_widgets.dart';
import '../../orders/presentation/order_file_download_tile.dart';
import '../data/client_delivery_review_models.dart';
import '../data/client_order_models.dart';
import '../data/client_order_review_models.dart';
import '../data/client_order_bid_models.dart';
import 'client_delivery_review_controller.dart';
import 'client_order_bids_section.dart';
import 'client_order_review_controller.dart';
import 'client_order_review_sheet.dart';
import 'client_orders_controller.dart';
import 'order_payment_actions.dart';
import 'request_delivery_revision_sheet.dart';

class ClientOrderDetailsScreen extends ConsumerWidget {
  const ClientOrderDetailsScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOrder = ref.watch(clientOrderDetailProvider(orderId));
    final auth = ref.watch(authControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تفاصيل طلبي')),
      body: asyncOrder.when(
        loading: () => const OhLoadingBody(message: 'جاري تحميل التفاصيل...'),
        error: (error, _) => OhErrorBody(
          message: apiErrorMessage(error, fallback: 'تعذر تحميل تفاصيل الطلب.'),
          onRetry: () => ref.invalidate(clientOrderDetailProvider(orderId)),
        ),
        data: (order) => _ClientOrderDetailBody(
          orderId: orderId,
          order: order,
          auth: auth,
        ),
      ),
    );
  }
}

class _ClientOrderDetailBody extends ConsumerWidget {
  const _ClientOrderDetailBody({
    required this.orderId,
    required this.order,
    required this.auth,
  });

  final String orderId;
  final ClientOrder order;
  final AuthState auth;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isClient = auth.user?.usesClientExperience == true;
    final showBids = isClient &&
        clientOrderShowsBidsSection(
          projectType: order.projectType,
          orderStatus: order.orderStatus,
          bidsCount: order.bidsCount,
        );
    final showDeliveryReview = isClient && clientShowsDeliveryReviewSection(order);
    final showFreelancerReview = clientCanShowFreelancerReviewSection(
      isClient: isClient,
      orderStatus: order.orderStatus,
      hasAssignedFreelancer: order.hasAssignedFreelancer,
    );

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
            OrderInfoRow(label: 'حالة الطلب', value: order.statusLabel, icon: Icons.flag_outlined),
            OrderInfoRow(
              label: 'تاريخ الإنشاء',
              value: formatOrderDateLabel(order.createdAt),
              icon: Icons.calendar_today_outlined,
            ),
            if (order.durationText != null)
              OrderInfoRow(label: 'المدة', value: order.durationText!, icon: Icons.schedule_outlined),
            if (order.dueAt != null)
              OrderInfoRow(
                label: 'موعد التسليم',
                value: formatOrderDateLabel(order.dueAt),
                icon: Icons.event_outlined,
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (order.description != null && order.description!.trim().isNotEmpty)
          OrderSectionCard(
            title: 'الوصف',
            children: [
              Text(
                order.description!.trim(),
                style: const TextStyle(color: AppColors.textInk, height: 1.7, fontSize: 15),
              ),
            ],
          ),
        if (order.description != null && order.description!.trim().isNotEmpty) const SizedBox(height: 12),
        OrderSectionCard(
          title: 'الميزانية والحالة',
          children: [
            if (order.budgetLabel != null)
              OrderInfoRow(label: 'الميزانية', value: order.budgetLabel!, icon: Icons.payments_outlined),
            if (order.paymentStatus != null)
              OrderInfoRow(
                label: 'حالة الدفع',
                value: order.paymentStatusLabel,
                icon: Icons.credit_card_outlined,
              ),
            if (order.paymentAmount != null)
              OrderInfoRow(
                label: 'مبلغ الدفع',
                value: '${order.paymentAmount!.toStringAsFixed(0)} ${order.currencyCode ?? 'JOD'}',
                icon: Icons.paid_outlined,
              ),
            OrderInfoRow(
              label: 'حالة التنفيذ',
              value: order.hasAssignedFreelancer ? 'قيد التنفيذ / معيّن' : 'بانتظار التعيين',
              icon: Icons.engineering_outlined,
            ),
            if (order.assignedFreelancerLabel != null)
              OrderInfoRow(
                label: 'المستقل',
                value: order.assignedFreelancerLabel!,
                icon: Icons.person_outline,
              ),
          ],
        ),
        if (showBids) ...[
          const SizedBox(height: 12),
          ClientOrderBidsSection(
            orderId: orderId,
            currencyCode: order.currencyCode,
          ),
        ],
        if (showDeliveryReview) ...[
          const SizedBox(height: 12),
          OrderSectionCard(
            title: 'مراجعة التسليم',
            children: [
              _ClientDeliveryReviewSection(orderId: orderId, order: order),
            ],
          ),
        ],
        if (showFreelancerReview) ...[
          const SizedBox(height: 12),
          OrderSectionCard(
            title: 'تقييم المستقل',
            children: [
              _ClientFreelancerReviewSection(orderId: orderId, order: order),
            ],
          ),
        ],
        const SizedBox(height: 12),
        OrderSectionCard(
          title: 'الإجراءات',
          children: [
            if (order.needsPayment)
              ClientOrderPaymentSection(
                orderId: order.id,
                needsPayment: true,
              )
            else if (!isClient)
              const Text(
                'مراجعة التسليم متاحة لحساب العميل فقط.',
                style: TextStyle(color: AppColors.textMuted),
              )
            else if (!clientCanApproveDelivery(order) && !clientCanRequestRevision(order))
              const Text(
                'لا توجد إجراءات متاحة حالياً.',
                style: TextStyle(color: AppColors.textMuted),
              ),
          ],
        ),
      ],
    );
  }
}

class _ClientFreelancerReviewSection extends ConsumerWidget {
  const _ClientFreelancerReviewSection({
    required this.orderId,
    required this.order,
  });

  final String orderId;
  final ClientOrder order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final eligible = clientOrderEligibleForReviewSubmit(
      orderStatus: order.orderStatus,
      hasAssignedFreelancer: order.hasAssignedFreelancer,
    );

    if (!eligible) {
      return Text(
        clientFreelancerReviewHeadlineAr(orderStatus: order.orderStatus, status: null),
        style: const TextStyle(color: AppColors.textMuted, height: 1.5),
        textAlign: TextAlign.right,
      );
    }

    final statusAsync = ref.watch(clientOrderReviewStatusProvider(orderId));

    return statusAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            apiErrorMessage(error, fallback: 'تعذر تحميل حالة التقييم.'),
            style: const TextStyle(color: AppColors.error, height: 1.5),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 8),
          OhButton(
            label: 'إعادة المحاولة',
            outlined: true,
            onPressed: () => ref.invalidate(clientOrderReviewStatusProvider(orderId)),
          ),
        ],
      ),
      data: (status) => _ClientFreelancerReviewContent(
        orderId: orderId,
        order: order,
        status: status,
      ),
    );
  }
}

class _ClientFreelancerReviewContent extends ConsumerStatefulWidget {
  const _ClientFreelancerReviewContent({
    required this.orderId,
    required this.order,
    required this.status,
  });

  final String orderId;
  final ClientOrder order;
  final ClientOrderReviewStatus status;

  @override
  ConsumerState<_ClientFreelancerReviewContent> createState() => _ClientFreelancerReviewContentState();
}

class _ClientFreelancerReviewContentState extends ConsumerState<_ClientFreelancerReviewContent> {
  Future<void> _openReviewSheet({bool update = false}) async {
    final existing = widget.status.existingReview;
    final reviewState = ref.read(clientOrderReviewControllerProvider(widget.orderId));
    final payload = await showClientOrderReviewSheet(
      context,
      orderTitle: widget.order.title,
      freelancerName: widget.status.freelancerName,
      isSubmitting: reviewState.isSubmitting,
      initial: update && existing != null
          ? SubmitClientOrderReviewPayload(
              rating: existing.rating,
              reviewText: existing.reviewText,
            )
          : null,
    );
    if (payload == null || !mounted) return;

    try {
      await ref
          .read(clientOrderReviewControllerProvider(widget.orderId).notifier)
          .submitReview(payload, update: update);
      if (!mounted) return;
      ref.invalidate(clientOrderReviewStatusProvider(widget.orderId));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(update ? 'تم تحديث تقييمك.' : 'شكراً — تم إرسال تقييمك.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(apiErrorMessage(e, fallback: 'تعذر إرسال التقييم.')),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.status;
    final review = status.existingReview;
    final reviewState = ref.watch(clientOrderReviewControllerProvider(widget.orderId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          clientFreelancerReviewHeadlineAr(
            orderStatus: widget.order.orderStatus,
            status: status,
          ),
          style: const TextStyle(
            color: AppColors.textInk,
            fontWeight: FontWeight.w600,
            height: 1.5,
          ),
          textAlign: TextAlign.right,
        ),
        if (review != null) ...[
          const SizedBox(height: 12),
          ReviewStarsDisplay(rating: review.rating),
          const SizedBox(height: 6),
          Text(
            reviewStarsLabelAr(review.rating),
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            textAlign: TextAlign.right,
          ),
          if (review.reviewText != null && review.reviewText!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.reviewText!.trim(),
              style: const TextStyle(color: AppColors.textInk, height: 1.5),
              textAlign: TextAlign.right,
            ),
          ],
        ],
        if (status.canSubmit) ...[
          const SizedBox(height: 12),
          OhButton(
            label: reviewState.isSubmitting ? 'جارٍ الإرسال...' : 'قيّم المستقل',
            isLoading: reviewState.isSubmitting,
            onPressed: reviewState.isSubmitting ? null : () => _openReviewSheet(),
          ),
        ] else if (review?.canEdit == true) ...[
          const SizedBox(height: 12),
          OhButton(
            label: reviewState.isSubmitting ? 'جارٍ الحفظ...' : 'تعديل التقييم',
            outlined: true,
            isLoading: reviewState.isSubmitting,
            onPressed: reviewState.isSubmitting ? null : () => _openReviewSheet(update: true),
          ),
        ],
      ],
    );
  }
}

class _ClientDeliveryReviewSection extends ConsumerStatefulWidget {
  const _ClientDeliveryReviewSection({required this.orderId, required this.order});

  final String orderId;
  final ClientOrder order;

  @override
  ConsumerState<_ClientDeliveryReviewSection> createState() => _ClientDeliveryReviewSectionState();
}

class _ClientDeliveryReviewSectionState extends ConsumerState<_ClientDeliveryReviewSection> {
  Future<void> _confirmApprove() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('قبول التسليم'),
        content: const Text('هل أنت متأكد من قبول التسليم وإنهاء الطلب؟'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('تأكيد')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await ref.read(clientDeliveryReviewControllerProvider(widget.orderId).notifier).approveDelivery();
      if (!mounted) return;
      ref.invalidate(clientOrderDetailProvider(widget.orderId));
      ref.invalidate(clientOrderReviewStatusProvider(widget.orderId));
      ref.read(clientOrdersControllerProvider.notifier).load(refresh: true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم قبول التسليم وإكمال الطلب بنجاح.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(apiErrorMessage(e, fallback: 'تعذر قبول التسليم.')),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  Future<void> _openRevisionSheet() async {
    final reviewState = ref.read(clientDeliveryReviewControllerProvider(widget.orderId));
    final payload = await showRequestDeliveryRevisionSheet(
      context,
      isSubmitting: reviewState.isRequestingRevision,
    );
    if (payload == null || !mounted) return;

    try {
      await ref
          .read(clientDeliveryReviewControllerProvider(widget.orderId).notifier)
          .requestRevision(payload);
      if (!mounted) return;
      ref.invalidate(clientOrderDetailProvider(widget.orderId));
      ref.read(clientOrdersControllerProvider.notifier).load(refresh: true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم إرسال طلب التعديل بنجاح.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(apiErrorMessage(e, fallback: 'تعذر إرسال طلب التعديل.')),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final reviewState = ref.watch(clientDeliveryReviewControllerProvider(widget.orderId));
    final submission = clientCurrentDeliverySubmission(order);
    final canApprove = clientCanApproveDelivery(order);
    final canRevise = clientCanRequestRevision(order);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          clientDeliveryReviewHeadlineAr(order),
          style: const TextStyle(
            color: AppColors.textInk,
            fontWeight: FontWeight.w700,
            height: 1.5,
          ),
          textAlign: TextAlign.right,
        ),
        if (submission != null) ...[
          const SizedBox(height: 12),
          _DeliverySummaryCard(orderId: widget.orderId, submission: submission),
        ],
        if (canApprove || canRevise) ...[
          const SizedBox(height: 16),
          if (canApprove)
            OhButton(
              label: reviewState.isApproving ? 'جارٍ القبول...' : 'قبول التسليم',
              isLoading: reviewState.isApproving,
              onPressed: reviewState.isBusy ? null : _confirmApprove,
            ),
          if (canApprove && canRevise) const SizedBox(height: 8),
          if (canRevise)
            OhButton(
              label: reviewState.isRequestingRevision ? 'جارٍ الإرسال...' : 'طلب تعديل',
              outlined: true,
              isLoading: reviewState.isRequestingRevision,
              onPressed: reviewState.isBusy ? null : _openRevisionSheet,
            ),
        ],
      ],
    );
  }
}

class _DeliverySummaryCard extends StatelessWidget {
  const _DeliverySummaryCard({
    required this.orderId,
    required this.submission,
  });

  final String orderId;
  final ClientOrderSubmissionSummary submission;

  @override
  Widget build(BuildContext context) {
    return Container(
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
            'الحالة: ${submission.displayStatus}',
            style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          if (submission.displayDate != null) ...[
            const SizedBox(height: 4),
            Text(
              'تاريخ التسليم: ${formatOrderDateLabel(submission.displayDate)}',
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
            const Text(
              'ملفات التسليم:',
              style: TextStyle(fontWeight: FontWeight.w600, color: AppColors.textInk, fontSize: 13),
              textAlign: TextAlign.right,
            ),
            const SizedBox(height: 4),
            ...submission.files.map(
              (file) => OrderFileDownloadTile(
                orderId: orderId,
                role: OrderFileDownloadRole.client,
                file: file,
              ),
            ),
          ] else if (submission.fileNames.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...submission.fileNames.map(
              (name) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Text(
                  '• $name',
                  style: const TextStyle(color: AppColors.textInk, fontSize: 13, height: 1.4),
                  textAlign: TextAlign.right,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
