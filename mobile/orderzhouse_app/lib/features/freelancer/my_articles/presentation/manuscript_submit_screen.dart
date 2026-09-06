import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../data/manuscript_copy.dart';
import '../data/manuscript_errors.dart';
import '../data/my_articles_api.dart';
import 'manuscript_submit_args.dart';
import 'my_articles_controllers.dart';

class ManuscriptSubmitScreen extends ConsumerStatefulWidget {
  const ManuscriptSubmitScreen({
    super.key,
    required this.args,
  });

  final ManuscriptSubmitArgs args;

  @override
  ConsumerState<ManuscriptSubmitScreen> createState() => _ManuscriptSubmitScreenState();
}

class _ManuscriptSubmitScreenState extends ConsumerState<ManuscriptSubmitScreen> {
  late final TextEditingController _titleCtrl;
  late final TextEditingController _contentCtrl;
  bool _termsAccepted = false;
  bool _sending = false;
  String? _error;

  bool get _isRevision => widget.args.isRevision;

  @override
  void initState() {
    super.initState();
    final seedTitle = (widget.args.articleTitle ?? '').trim();
    _titleCtrl = TextEditingController(text: seedTitle);
    _contentCtrl = TextEditingController();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _contentCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending) return;
    final validation = validateManuscriptForm(
      title: _titleCtrl.text,
      content: _contentCtrl.text,
      termsAccepted: _termsAccepted,
    );
    if (validation != null) {
      setState(() => _error = validation);
      return;
    }

    setState(() {
      _sending = true;
      _error = null;
    });

    try {
      await ref.read(myArticlesApiProvider).submitFinalManuscript(
            applicationId: widget.args.applicationId,
            title: _titleCtrl.text,
            content: _contentCtrl.text,
            termsAccepted: true,
          );
      // Refresh portfolio list if still alive.
      try {
        await ref.read(myArticlesControllerProvider.notifier).refresh();
      } catch (_) {
        // Screen may be outside provider tree lifetime — ignore.
      }
      if (!mounted) return;
      // Parent route shows the success snackbar after pop (scaffold stays mounted).
      Navigator.of(context).pop(_isRevision ? 'revision' : 'first');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = manuscriptSubmitErrorMessage(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _isRevision ? manuscriptRevisionTitleAr : manuscriptSubmitTitleAr;
    final buttonLabel = _sending
        ? manuscriptSendingAr
        : (_isRevision ? manuscriptRevisionButtonAr : manuscriptSubmitButtonAr);
    final articleTitle = (widget.args.articleTitle ?? '').trim();
    final note = (widget.args.revisionNote ?? '').trim();

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
        children: [
          if (articleTitle.isNotEmpty) ...[
            Text(
              articleTitle,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 16,
                color: AppColors.textInk,
                height: 1.35,
              ),
            ),
            const SizedBox(height: 8),
          ],
          if ((widget.args.statusLabelAr ?? '').trim().isNotEmpty)
            Text(
              '$manuscriptStatusContextAr: ${widget.args.statusLabelAr}',
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          if (_isRevision && note.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              key: const ValueKey('manuscript-revision-note'),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF4E5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    manuscriptRevisionNotesLabelAr,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: Color(0xFFB54708),
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    note,
                    textAlign: TextAlign.right,
                    style: const TextStyle(height: 1.45, color: AppColors.textInk),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          OhTextField(
            controller: _titleCtrl,
            label: manuscriptTitleLabelAr,
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: 12),
          Text(
            manuscriptContentLabelAr,
            textAlign: TextAlign.right,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 6),
          TextField(
            key: const ValueKey('manuscript-content-field'),
            controller: _contentCtrl,
            maxLines: 10,
            minLines: 6,
            textAlign: TextAlign.right,
            decoration: const InputDecoration(
              hintText: manuscriptContentPlaceholderAr,
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            key: const ValueKey('manuscript-terms-checkbox'),
            value: _termsAccepted,
            onChanged: _sending
                ? null
                : (v) => setState(() => _termsAccepted = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: const Text(
              manuscriptTermsCopyAr,
              textAlign: TextAlign.right,
              style: TextStyle(fontSize: 13, height: 1.45),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            OhErrorBanner(message: _error!),
          ],
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: OhButton(
            key: const ValueKey('manuscript-submit-button'),
            label: buttonLabel,
            isLoading: _sending,
            onPressed: _sending ? null : _submit,
          ),
        ),
      ),
    );
  }
}
