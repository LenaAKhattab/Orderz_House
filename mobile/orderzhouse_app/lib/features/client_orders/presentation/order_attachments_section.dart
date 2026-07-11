import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/order_attachment_limits.dart';
import '../data/order_attachment_models.dart';
import 'create_order_controller.dart';

class OrderAttachmentsSection extends ConsumerWidget {
  const OrderAttachmentsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(createOrderControllerProvider);
    final notifier = ref.read(createOrderControllerProvider.notifier);
    final attachments = state.attachments;
    final error = state.attachmentsError;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'المرفقات',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
              ),
            ),
            OhButton(
              label: 'إضافة ملفات',
              outlined: true,
              onPressed: state.isSubmitting ? null : () => _pickFiles(context, ref),
            ),
          ],
        ),
        const SizedBox(height: 6),
        const Text(
          orderAttachmentOptionalNoteAr,
          style: TextStyle(color: AppColors.textMuted, height: 1.45),
        ),
        const SizedBox(height: 4),
        const Text(
          orderAttachmentHelperAr,
          style: TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.4),
        ),
        if (error != null) ...[
          const SizedBox(height: 8),
          Text(error, style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
        ],
        if (attachments.isNotEmpty) ...[
          const SizedBox(height: 12),
          ...attachments.map(
            (file) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AttachmentTile(
                file: file,
                onRemove: state.isSubmitting ? null : () => notifier.removeAttachment(file.id),
              ),
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _pickFiles(BuildContext context, WidgetRef ref) async {
    final notifier = ref.read(createOrderControllerProvider.notifier);
    final state = ref.read(createOrderControllerProvider);
    final remaining = maxOrderAttachmentCount - state.attachments.length;
    if (remaining <= 0) {
      notifier.setAttachmentsError(orderAttachmentCountMessageAr);
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
      if (attachment != null) {
        added.add(attachment);
      }
    }

    if (added.isEmpty) {
      notifier.setAttachmentsError('تعذر قراءة الملفات المختارة.');
      return;
    }

    notifier.addAttachments(added);
  }
}

class _AttachmentTile extends StatelessWidget {
  const _AttachmentTile({
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
                ),
                const SizedBox(height: 2),
                Text(
                  formatAttachmentSize(file.size),
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
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
