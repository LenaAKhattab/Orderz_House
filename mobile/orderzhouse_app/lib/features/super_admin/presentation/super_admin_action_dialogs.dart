import 'package:flutter/material.dart';

import '../data/super_admin_actions.dart';
import '../data/super_admin_models.dart';

const superAdminConfirmActivationButtonKey = Key('sa-confirm-activation');
const superAdminConfirmClaimStatusButtonKey = Key('sa-confirm-claim-status');
const superAdminClaimNoteFieldKey = Key('sa-claim-note');

Future<bool> showSuperAdminApproveActivationDialog(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      title: const Text(superAdminConfirmApprovalTitleAr),
      content: const Text(superAdminConfirmApprovalBodyAr),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text(superAdminCancelActionLabelAr),
        ),
        FilledButton(
          key: superAdminConfirmActivationButtonKey,
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text(superAdminApproveActivationLabelAr),
        ),
      ],
    ),
  );
  return result == true;
}

Future<SuperAdminClaimStatusRequest?> showSuperAdminClaimStatusDialog(BuildContext context) {
  return showDialog<SuperAdminClaimStatusRequest>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => const SuperAdminClaimStatusDialog(),
  );
}

class SuperAdminClaimStatusDialog extends StatefulWidget {
  const SuperAdminClaimStatusDialog({super.key});

  @override
  State<SuperAdminClaimStatusDialog> createState() => _SuperAdminClaimStatusDialogState();
}

class _SuperAdminClaimStatusDialogState extends State<SuperAdminClaimStatusDialog> {
  String? _status;
  final _noteController = TextEditingController();
  bool _submitted = false;
  String? _noteError;

  @override
  void initState() {
    super.initState();
    _noteController.addListener(() {
      if (_noteError != null) {
        setState(() => _noteError = validateClaimAdminNote(status: _status ?? '', note: _noteController.text));
      } else {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      !_submitted &&
      canSubmitClaimStatusAction(status: _status, note: _noteController.text);

  bool get _needsNote => _status != null && claimStatusRequiresNote(_status!);

  void _submit() {
    if (_submitted) return;
    final status = _status;
    if (status == null) return;
    final noteError = validateClaimAdminNote(status: status, note: _noteController.text);
    if (noteError != null) {
      setState(() => _noteError = noteError);
      return;
    }
    if (!isAllowedClaimStatusAction(status)) return;
    _submitted = true;
    final note = _noteController.text.trim();
    Navigator.of(context).pop(
      SuperAdminClaimStatusRequest(
        status: status,
        adminNote: note.isEmpty ? null : note,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text(superAdminUpdateClaimStatusLabelAr),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final option in superAdminClaimStatusOptions)
              ListTile(
                title: Text(option.labelAr),
                selected: _status == option.status,
                leading: Icon(
                  _status == option.status ? Icons.radio_button_checked : Icons.radio_button_off,
                ),
                onTap: _submitted
                    ? null
                    : () {
                        setState(() {
                          _status = option.status;
                          _noteError = null;
                        });
                      },
              ),
            if (_needsNote) ...[
              const SizedBox(height: 8),
              TextField(
                key: superAdminClaimNoteFieldKey,
                controller: _noteController,
                enabled: !_submitted,
                minLines: 2,
                maxLines: 4,
                decoration: InputDecoration(
                  labelText: superAdminActionReasonLabelAr,
                  errorText: _noteError ??
                      (validateClaimAdminNote(status: _status ?? '', note: _noteController.text)),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitted ? null : () => Navigator.of(context).pop(),
          child: const Text(superAdminCancelActionLabelAr),
        ),
        FilledButton(
          key: superAdminConfirmClaimStatusButtonKey,
          onPressed: _canSubmit ? _submit : null,
          child: const Text(superAdminConfirmActionLabelAr),
        ),
      ],
    );
  }
}

Future<bool> showSuperAdminConfirmDialog({
  required BuildContext context,
  required String title,
  required String body,
  required String confirmLabel,
  Key? confirmKey,
}) async {
  final result = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text(superAdminCancelActionLabelAr),
        ),
        FilledButton(
          key: confirmKey,
          onPressed: () => Navigator.of(ctx).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return result == true;
}

Future<String?> showSuperAdminNoteDialog({
  required BuildContext context,
  required String title,
  required String label,
  required String helper,
  required String confirmLabel,
  required int minChars,
  int maxChars = 500,
  Key? fieldKey,
  Key? confirmKey,
}) {
  return showDialog<String>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => _SuperAdminNoteDialog(
      title: title,
      label: label,
      helper: helper,
      confirmLabel: confirmLabel,
      minChars: minChars,
      maxChars: maxChars,
      fieldKey: fieldKey,
      confirmKey: confirmKey,
    ),
  );
}

class _SuperAdminNoteDialog extends StatefulWidget {
  const _SuperAdminNoteDialog({
    required this.title,
    required this.label,
    required this.helper,
    required this.confirmLabel,
    required this.minChars,
    required this.maxChars,
    this.fieldKey,
    this.confirmKey,
  });

  final String title;
  final String label;
  final String helper;
  final String confirmLabel;
  final int minChars;
  final int maxChars;
  final Key? fieldKey;
  final Key? confirmKey;

  @override
  State<_SuperAdminNoteDialog> createState() => _SuperAdminNoteDialogState();
}

class _SuperAdminNoteDialogState extends State<_SuperAdminNoteDialog> {
  final _controller = TextEditingController();
  bool _submitted = false;

  @override
  void initState() {
    super.initState();
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _valid {
    final len = _controller.text.trim().length;
    return len >= widget.minChars && len <= widget.maxChars;
  }

  void _submit() {
    if (_submitted || !_valid) return;
    _submitted = true;
    Navigator.of(context).pop(_controller.text.trim());
  }

  @override
  Widget build(BuildContext context) {
    final len = _controller.text.trim().length;
    final error = len > 0 && len < widget.minChars
        ? 'أدخل ${widget.minChars} أحرف على الأقل.'
        : (len > widget.maxChars ? 'الحد الأقصى ${widget.maxChars} حرفاً.' : null);
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.helper, style: const TextStyle(height: 1.4)),
            const SizedBox(height: 12),
            TextField(
              key: widget.fieldKey,
              controller: _controller,
              enabled: !_submitted,
              minLines: 2,
              maxLines: 5,
              maxLength: widget.maxChars,
              decoration: InputDecoration(
                labelText: widget.label,
                errorText: error,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _submitted ? null : () => Navigator.of(context).pop(),
          child: const Text(superAdminCancelActionLabelAr),
        ),
        FilledButton(
          key: widget.confirmKey,
          onPressed: _valid && !_submitted ? _submit : null,
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

