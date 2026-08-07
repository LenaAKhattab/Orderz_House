import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../client_orders/data/order_attachment_limits.dart';
import '../../client_orders/data/order_attachment_models.dart';
import '../data/freelancer_my_order_models.dart';

Future<List<SelectedOrderAttachment>?> showSubmitFreelancerDeliverySheet(
  BuildContext context, {
  required FreelancerMyOrder order,
  required bool isSubmitting,
}) {
  return showModalBottomSheet<List<SelectedOrderAttachment>>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => _SubmitFreelancerDeliverySheet(order: order, isSubmitting: isSubmitting),
  );
}

class _SubmitFreelancerDeliverySheet extends StatefulWidget {
  const _SubmitFreelancerDeliverySheet({
    required this.order,
    required this.isSubmitting,
  });

  final FreelancerMyOrder order;
  final bool isSubmitting;

  @override
  State<_SubmitFreelancerDeliverySheet> createState() => _SubmitFreelancerDeliverySheetState();
}

class _SubmitFreelancerDeliverySheetState extends State<_SubmitFreelancerDeliverySheet> {
  final List<SelectedOrderAttachment> _attachments = [];
  String? _error;

  Future<void> _pickFiles() async {
    if (widget.isSubmitting) return;
    final remaining = maxOrderAttachmentCount - _attachments.length;
    if (remaining <= 0) {
      setState(() => _error = orderAttachmentCountMessageAr);
      return;
    }

    final result = await FilePicker.platform.pickFiles(
      allowMultiple: remaining > 1,
      type: FileType.custom,
      allowedExtensions: orderAttachmentAllowedExtensions.toList(),
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;

    final picked = result.files.take(remaining).toList();
    final added = <SelectedOrderAttachment>[];
    var idBase = DateTime.now().microsecondsSinceEpoch;

    for (final platformFile in picked) {
      final attachment = SelectedOrderAttachment.fromPlatformFile(
        platformFile,
        id: '${idBase++}',
      );
      if (attachment != null) added.add(attachment);
    }

    if (added.isEmpty) {
      setState(() => _error = 'تعذر قراءة الملفات المختارة.');
      return;
    }

    final merged = [..._attachments, ...added];
    final validation = validateDeliveryAttachments(merged.map((f) => f.draft).toList());
    setState(() {
      _attachments
        ..clear()
        ..addAll(merged);
      _error = validation.message;
    });
  }

  void _remove(String id) {
    if (widget.isSubmitting) return;
    final next = _attachments.where((f) => f.id != id).toList();
    final validation = validateDeliveryAttachments(next.map((f) => f.draft).toList());
    setState(() {
      _attachments
        ..clear()
        ..addAll(next);
      _error = validation.message;
    });
  }

  void _submit() {
    final validation = validateDeliveryAttachments(_attachments.map((f) => f.draft).toList());
    if (!validation.isValid) {
      setState(() => _error = validation.message);
      return;
    }
    Navigator.of(context).pop(List<SelectedOrderAttachment>.from(_attachments));
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 16 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'تسليم العمل',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 6),
          Text(
            widget.order.title,
            style: const TextStyle(color: AppColors.textMuted, height: 1.4),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 8),
          const Text(
            deliveryAttachmentHelperAr,
            style: TextStyle(color: AppColors.textMuted, fontSize: 13, height: 1.45),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'ملفات التسليم',
                  style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textInk),
                ),
              ),
              OhButton(
                label: 'إضافة ملفات',
                outlined: true,
                onPressed: widget.isSubmitting ? null : _pickFiles,
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600),
              textAlign: TextAlign.right,
            ),
          ],
          if (_attachments.isNotEmpty) ...[
            const SizedBox(height: 12),
            ..._attachments.map(
              (file) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _DeliveryAttachmentTile(
                  file: file,
                  onRemove: widget.isSubmitting ? null : () => _remove(file.id),
                ),
              ),
            ),
          ],
          const SizedBox(height: 16),
          OhButton(
            label: widget.isSubmitting ? 'جارٍ الإرسال...' : 'إرسال التسليم',
            isLoading: widget.isSubmitting,
            onPressed: widget.isSubmitting || _attachments.isEmpty ? null : _submit,
          ),
          const SizedBox(height: 8),
          OhButton(
            label: 'إلغاء',
            outlined: true,
            onPressed: widget.isSubmitting ? null : () => Navigator.of(context).pop(),
          ),
        ],
      ),
    );
  }
}

class _DeliveryAttachmentTile extends StatelessWidget {
  const _DeliveryAttachmentTile({
    required this.file,
    required this.onRemove,
  });

  final SelectedOrderAttachment file;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.iconChipBg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Row(
        children: [
          const Icon(Icons.insert_drive_file_outlined, color: AppColors.primary, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  file.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textInk),
                  textAlign: TextAlign.right,
                ),
                const SizedBox(height: 2),
                Text(
                  formatAttachmentSize(file.size),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  textAlign: TextAlign.right,
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: 'إزالة',
            onPressed: onRemove,
            icon: const Icon(Icons.close, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}
