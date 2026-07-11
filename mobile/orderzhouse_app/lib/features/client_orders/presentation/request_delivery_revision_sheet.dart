import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/client_delivery_review_models.dart';

Future<RequestDeliveryRevisionPayload?> showRequestDeliveryRevisionSheet(
  BuildContext context, {
  required bool isSubmitting,
}) {
  return showModalBottomSheet<RequestDeliveryRevisionPayload>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (context) => _RequestDeliveryRevisionSheet(isSubmitting: isSubmitting),
  );
}

class _RequestDeliveryRevisionSheet extends StatefulWidget {
  const _RequestDeliveryRevisionSheet({required this.isSubmitting});

  final bool isSubmitting;

  @override
  State<_RequestDeliveryRevisionSheet> createState() => _RequestDeliveryRevisionSheetState();
}

class _RequestDeliveryRevisionSheetState extends State<_RequestDeliveryRevisionSheet> {
  final _noteController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  void _submit() {
    final validation = validateDeliveryRevisionNote(_noteController.text);
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }
    Navigator.of(context).pop(RequestDeliveryRevisionPayload(note: _noteController.text));
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
            'طلب تعديل',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 8),
          const Text(
            'اشرح التعديلات المطلوبة من المستقل بوضوح.',
            style: TextStyle(color: AppColors.textMuted, height: 1.45),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 16),
          OhTextField(
            controller: _noteController,
            label: 'ملاحظات التعديل',
            hint: 'مثال: عدّل الألوان ووسّع الهوامش...',
            keyboardType: TextInputType.multiline,
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600),
              textAlign: TextAlign.right,
            ),
          ],
          const SizedBox(height: 16),
          OhButton(
            label: widget.isSubmitting ? 'جارٍ الإرسال...' : 'إرسال طلب التعديل',
            isLoading: widget.isSubmitting,
            onPressed: widget.isSubmitting ? null : _submit,
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
