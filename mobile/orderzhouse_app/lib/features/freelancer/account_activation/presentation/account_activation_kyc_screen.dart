import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../data/account_activation_kyc_models.dart';
import 'account_activation_kyc_controller.dart';

class AccountActivationKycScreen extends ConsumerStatefulWidget {
  const AccountActivationKycScreen({super.key});

  @override
  ConsumerState<AccountActivationKycScreen> createState() => _AccountActivationKycScreenState();
}

class _AccountActivationKycScreenState extends ConsumerState<AccountActivationKycScreen> {
  File? _front;
  File? _back;
  String? _frontName;
  String? _backName;
  bool _termsAccepted = false;

  Future<void> _pick(bool front) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: false,
      withData: false,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final path = file.path;
    if (path == null || path.isEmpty) return;
    setState(() {
      if (front) {
        _front = File(path);
        _frontName = file.name;
      } else {
        _back = File(path);
        _backName = file.name;
      }
    });
  }

  Future<void> _submit() async {
    final ok = await ref.read(accountActivationKycControllerProvider.notifier).submit(
          idFront: _front,
          idBack: _back,
          termsAccepted: _termsAccepted,
        );
    if (!mounted) return;
    if (ok) {
      setState(() {
        _front = null;
        _back = null;
        _frontName = null;
        _backName = null;
        _termsAccepted = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(accountActivationKycSubmitSuccessAr)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ui = ref.watch(accountActivationKycControllerProvider);
    final status = ui.status;

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text(accountActivationKycPageTitleAr)),
      body: RefreshIndicator(
        onRefresh: () => ref.read(accountActivationKycControllerProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            Text(
              accountActivationKycPageSubtitleAr,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textMuted, height: 1.5),
            ),
            const SizedBox(height: 14),
            if (ui.loading && status == null)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (ui.error != null && status == null)
              OhErrorBanner(message: ui.error!)
            else if (status != null) ...[
              if (status.isCompanyApproved) _StatusCard(
                tone: _Tone.success,
                title: accountActivationKycApprovedAr,
                body: status.messageAr,
              ) else if (status.isPending) _StatusCard(
                tone: _Tone.warning,
                title: accountActivationKycPendingAr,
                body: status.messageAr ?? 'طلبك قيد المراجعة من قبل الإدارة.',
              ) else if (status.isRejected) _StatusCard(
                tone: _Tone.error,
                title: accountActivationKycRejectedHeadlineAr,
                body: status.request?.rejectionReason?.trim().isNotEmpty == true
                    ? status.request!.rejectionReason
                    : status.messageAr,
              ) else
                _StatusCard(
                  tone: _Tone.neutral,
                  title: 'تفعيل الحساب مطلوب',
                  body: status.messageAr ??
                      'ارفع صورة الهوية من الأمام والخلف لإرسال طلب التفعيل.',
                ),
              if (ui.error != null) ...[
                const SizedBox(height: 12),
                OhErrorBanner(message: ui.error!),
              ],
              if (status.showSubmitForm) ...[
                const SizedBox(height: 16),
                OhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _FilePickerRow(
                        label: 'صورة الهوية — الأمام',
                        fileName: _frontName,
                        onPick: ui.submitting ? null : () => _pick(true),
                      ),
                      const SizedBox(height: 12),
                      _FilePickerRow(
                        label: 'صورة الهوية — الخلف',
                        fileName: _backName,
                        onPick: ui.submitting ? null : () => _pick(false),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        accountActivationKycTermsSnapshotAr,
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          color: AppColors.textInk,
                          height: 1.55,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 8),
                      CheckboxListTile(
                        value: _termsAccepted,
                        onChanged: ui.submitting
                            ? null
                            : (v) => setState(() => _termsAccepted = v ?? false),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        title: const Text(
                          'أوافق على الشروط أعلاه',
                          textAlign: TextAlign.right,
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                        ),
                      ),
                      if (ui.localValidationError != null) ...[
                        const SizedBox(height: 8),
                        OhErrorBanner(message: ui.localValidationError!),
                      ],
                      const SizedBox(height: 12),
                      OhButton(
                        label: status.isRejected
                            ? accountActivationKycResubmitCtaAr
                            : 'إرسال طلب التفعيل',
                        isLoading: ui.submitting,
                        onPressed: ui.submitting ? null : _submit,
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

enum _Tone { success, warning, error, neutral }

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.tone, required this.title, this.body});

  final _Tone tone;
  final String title;
  final String? body;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      _Tone.success => (AppColors.success.withValues(alpha: 0.1), AppColors.success),
      _Tone.warning => (const Color(0xFFFFFBEB), const Color(0xFFB45309)),
      _Tone.error => (AppColors.error.withValues(alpha: 0.08), AppColors.error),
      _Tone.neutral => (AppColors.primary.withValues(alpha: 0.06), AppColors.primary),
    };
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.$1,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colors.$2.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            textAlign: TextAlign.right,
            style: TextStyle(
              color: colors.$2,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
          if (body != null && body!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              body!,
              textAlign: TextAlign.right,
              style: const TextStyle(color: AppColors.textInk, height: 1.5),
            ),
          ],
        ],
      ),
    );
  }
}

class _FilePickerRow extends StatelessWidget {
  const _FilePickerRow({
    required this.label,
    required this.fileName,
    required this.onPick,
  });

  final String label;
  final String? fileName;
  final VoidCallback? onPick;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          label,
          textAlign: TextAlign.right,
          style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textInk),
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: onPick,
          icon: const Icon(Icons.image_outlined),
          label: Text(
            fileName?.trim().isNotEmpty == true ? fileName! : 'اختيار صورة',
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
