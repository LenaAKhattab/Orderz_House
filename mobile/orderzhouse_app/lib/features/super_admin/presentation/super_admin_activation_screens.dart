import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_actions.dart';
import '../data/super_admin_api.dart';
import '../data/super_admin_controllers.dart';
import '../data/super_admin_kyc_models.dart';
import '../data/super_admin_models.dart';
import '../data/super_admin_pantry_models.dart';
import 'super_admin_action_dialogs.dart';
import 'super_admin_queue_screens.dart';
import 'super_admin_ui.dart';

class SuperAdminActivationKycDetailScreen extends ConsumerStatefulWidget {
  const SuperAdminActivationKycDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  ConsumerState<SuperAdminActivationKycDetailScreen> createState() =>
      _SuperAdminActivationKycDetailScreenState();
}

class _SuperAdminActivationKycDetailScreenState extends ConsumerState<SuperAdminActivationKycDetailScreen> {
  bool _promptOpen = false;

  Future<void> _approve() async {
    if (_promptOpen || ref.read(superAdminActivationBusyIdProvider) != null) return;
    _promptOpen = true;
    final ok = await showSuperAdminKycApproveDialog(context);
    _promptOpen = false;
    if (!ok || !mounted) return;
    try {
      final started =
          await ref.read(superAdminKycActivationDetailProvider(widget.requestId).notifier).approve();
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActivationApproveSuccessAr)),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  Future<void> _reject() async {
    if (_promptOpen || ref.read(superAdminActivationBusyIdProvider) != null) return;
    _promptOpen = true;
    final payload = await showSuperAdminKycRejectDialog(context);
    _promptOpen = false;
    if (payload == null || !mounted) return;
    try {
      final started = await ref
          .read(superAdminKycActivationDetailProvider(widget.requestId).notifier)
          .reject(
            rejectionReason: payload.rejectionReason,
            adminNotes: payload.adminNotes,
          );
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActivationRejectSuccessAr)),
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
    final async = ref.watch(superAdminKycActivationDetailProvider(widget.requestId));
    final busyId = ref.watch(superAdminActivationBusyIdProvider);
    final busy = busyId == 'kyc:${widget.requestId}';
    return SuperAdminQueueScaffold(
      title: superAdminActivationDetailTitleAr,
      onRefresh: () =>
          ref.read(superAdminKycActivationDetailProvider(widget.requestId).notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () =>
              ref.read(superAdminKycActivationDetailProvider(widget.requestId).notifier).refreshQuietly(),
        ),
        data: (detail) {
          final request = detail.request;
          final freelancer = detail.freelancer;
          final pending = canApproveKycActivationRequest(request);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              _DetailRow(label: 'المستقل', value: freelancer?.name ?? '—'),
              _DetailRow(label: 'البريد', value: freelancer?.email ?? '—'),
              if (freelancer?.phone != null) _DetailRow(label: 'الهاتف', value: freelancer!.phone!),
              _DetailRow(label: 'الحالة', value: kycStatusLabelAr(request.status)),
              _DetailRow(label: 'تاريخ الإرسال', value: formatSuperAdminDate(request.submittedAt)),
              if (request.reviewedAt != null)
                _DetailRow(label: 'تاريخ المراجعة', value: formatSuperAdminDate(request.reviewedAt)),
              if (request.termsAcceptedAt != null)
                _DetailRow(
                  label: 'الموافقة على الشروط',
                  value: formatSuperAdminDate(request.termsAcceptedAt),
                ),
              if (request.termsVersion != null)
                _DetailRow(label: 'إصدار الشروط', value: request.termsVersion!),
              if (request.rejectionReason != null)
                _DetailRow(label: 'سبب الرفض السابق', value: request.rejectionReason!),
              if (request.adminNotes != null)
                _DetailRow(label: 'ملاحظات داخلية', value: request.adminNotes!),
              const SizedBox(height: 16),
              if (detail.hasFrontFile || request.hasFrontImage)
                SuperAdminKycSecureImage(
                  requestId: widget.requestId,
                  side: 'front',
                  label: superAdminActivationIdFrontLabelAr,
                ),
              if (detail.hasBackFile || request.hasBackImage)
                SuperAdminKycSecureImage(
                  requestId: widget.requestId,
                  side: 'back',
                  label: superAdminActivationIdBackLabelAr,
                ),
              if (!detail.hasFrontFile &&
                  !detail.hasBackFile &&
                  !request.hasFrontImage &&
                  !request.hasBackImage)
                const Text(
                  superAdminActivationNoDocumentsAr,
                  textAlign: TextAlign.right,
                  style: TextStyle(color: AppColors.textMuted),
                ),
              if (pending) ...[
                const SizedBox(height: 20),
                OhButton(
                  key: Key('sa-approve-kyc-${widget.requestId}'),
                  label: superAdminApproveActivationLabelAr,
                  isLoading: busy,
                  onPressed: busyId != null ? null : _approve,
                ),
                const SizedBox(height: 10),
                OhButton(
                  key: Key('sa-reject-kyc-${widget.requestId}'),
                  label: superAdminActivationRejectButtonAr,
                  outlined: true,
                  isLoading: busy,
                  onPressed: busyId != null ? null : _reject,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class SuperAdminActivationSubscriptionDetailScreen extends ConsumerStatefulWidget {
  const SuperAdminActivationSubscriptionDetailScreen({super.key, required this.subscriptionId});

  final String subscriptionId;

  @override
  ConsumerState<SuperAdminActivationSubscriptionDetailScreen> createState() =>
      _SuperAdminActivationSubscriptionDetailScreenState();
}

class _SuperAdminActivationSubscriptionDetailScreenState
    extends ConsumerState<SuperAdminActivationSubscriptionDetailScreen> {
  bool _promptOpen = false;

  SuperAdminActivationItem? _findItem(SuperAdminActivationQueueSnapshot snapshot) {
    for (final item in snapshot.subscriptionItems) {
      if (item.id == widget.subscriptionId) return item;
    }
    return null;
  }

  Future<void> _approve(SuperAdminActivationItem item) async {
    if (_promptOpen || ref.read(superAdminActivationBusyIdProvider) != null) return;
    _promptOpen = true;
    final overrideReason = await showSuperAdminNoteDialog(
      context: context,
      title: superAdminApproveActivationLabelAr,
      label: superAdminActivationOverrideReasonLabelAr,
      helper: superAdminActivationOverrideHelperAr,
      confirmLabel: superAdminApproveActivationLabelAr,
      minChars: 1,
      fieldKey: const Key('sa-activation-override-reason'),
      confirmKey: const Key('sa-confirm-subscription-activation'),
    );
    _promptOpen = false;
    if (overrideReason == null || !mounted) return;
    try {
      final started = await ref.read(superAdminActivationQueueProvider.notifier).approveSubscription(
            subscriptionId: item.id,
            overrideReason: overrideReason,
          );
      if (!started || !mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(superAdminActivationApproveSuccessAr)),
      );
      if (mounted) context.pop();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(superAdminActionErrorMessage(error))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(superAdminActivationQueueProvider);
    final busyId = ref.watch(superAdminActivationBusyIdProvider);
    final busy = busyId == 'sub:${widget.subscriptionId}';
    return SuperAdminQueueScaffold(
      title: superAdminActivationDetailTitleAr,
      onRefresh: () => ref.read(superAdminActivationQueueProvider.notifier).refreshQuietly(),
      body: async.when(
        loading: () => ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: const [SizedBox(height: 120), OhLikeLoading()],
        ),
        error: (error, _) => SuperAdminQueueErrorOrEmpty(
          isError: true,
          message: superAdminLoadErrorMessage(error),
          onRetry: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
        ),
        data: (snapshot) {
          final item = _findItem(snapshot);
          if (item == null) {
            return SuperAdminQueueErrorOrEmpty(
              isError: false,
              message: 'الاشتراك غير موجود في قائمة التفعيل.',
              onRetry: () => ref.read(superAdminActivationQueueProvider.notifier).refresh(),
            );
          }
          final canApprove = canApproveActivation(item);
          return ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              _DetailRow(label: 'المستقل', value: item.freelancerName ?? '—'),
              _DetailRow(label: 'البريد', value: item.freelancerEmail ?? '—'),
              _DetailRow(label: 'الخطة', value: item.planTitle ?? '—'),
              _DetailRow(label: 'المبلغ', value: formatSuperAdminJod(item.priceJod)),
              _DetailRow(label: 'حالة الدفع', value: item.paymentStatus ?? '—'),
              _DetailRow(label: 'حالة التفعيل', value: _activationStatusAr(item.activationStatus)),
              if (item.queueKind != null) _DetailRow(label: 'نوع الطلب', value: item.queueKind!),
              const SizedBox(height: 8),
              const Text(
                superAdminActivationOverrideHelperAr,
                textAlign: TextAlign.right,
                style: TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.4),
              ),
              if (canApprove) ...[
                const SizedBox(height: 20),
                OhButton(
                  key: Key('sa-approve-subscription-${item.id}'),
                  label: superAdminApproveActivationLabelAr,
                  isLoading: busy,
                  onPressed: busyId != null ? null : () => _approve(item),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class SuperAdminKycSecureImage extends ConsumerStatefulWidget {
  const SuperAdminKycSecureImage({
    super.key,
    required this.requestId,
    required this.side,
    required this.label,
  });

  final String requestId;
  final String side;
  final String label;

  @override
  ConsumerState<SuperAdminKycSecureImage> createState() => _SuperAdminKycSecureImageState();
}

class _SuperAdminKycSecureImageState extends ConsumerState<SuperAdminKycSecureImage> {
  Uint8List? _bytes;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant SuperAdminKycSecureImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.requestId != widget.requestId || oldWidget.side != widget.side) {
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _bytes = null;
    });
    try {
      final raw = await ref.read(superAdminApiProvider).fetchKycActivationFileBytes(
            requestId: widget.requestId,
            side: widget.side,
          );
      if (!mounted) return;
      if (raw.isEmpty) {
        setState(() {
          _loading = false;
          _error = superAdminActivationImageLoadFailedAr;
        });
        return;
      }
      setState(() {
        _bytes = Uint8List.fromList(raw);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = superAdminActivationImageLoadFailedAr;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.label,
            textAlign: TextAlign.right,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          const SizedBox(height: 8),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            Text(
              _error!,
              key: Key('sa-kyc-image-error-${widget.side}-${widget.requestId}'),
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.error),
            )
          else if (_bytes != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                _bytes!,
                key: Key('sa-kyc-image-${widget.side}-${widget.requestId}'),
                fit: BoxFit.contain,
                gaplessPlayback: true,
              ),
            ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        '$label: $value',
        key: Key('sa-detail-$label'),
        textAlign: TextAlign.right,
        style: const TextStyle(color: AppColors.textInk, height: 1.45, fontSize: 14),
      ),
    );
  }
}

String _activationStatusAr(String? status) {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'company_pending':
      return 'بانتظار تفعيل الشركة';
    case 'company_approved':
      return 'تم التفعيل';
    case 'company_rejected':
      return 'مرفوض';
    default:
      return status?.trim().isNotEmpty == true ? status!.trim() : 'بانتظار المراجعة';
  }
}
