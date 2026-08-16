import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../../../orders/data/order_display_helpers.dart';
import '../data/financial_claim_models.dart';
import '../../../currency/presentation/jod_money_display.dart';

class FinancialClaimCard extends StatelessWidget {
  const FinancialClaimCard({super.key, required this.claim});

  final FinancialClaim claim;

  @override
  Widget build(BuildContext context) {
    final statusLabel = financialClaimStatusLabelAr(claim.status);
    final payoutLabel = financialClaimPayoutStatusLabelAr(claim.payoutStatus);

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            claim.requestTitle.trim().isNotEmpty ? claim.requestTitle : 'مطالبة مالية',
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 16,
              color: AppColors.textInk,
              height: 1.35,
            ),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            alignment: WrapAlignment.end,
            children: [
              _StatusChip(label: statusLabel, tone: _statusTone(claim.status)),
              _StatusChip(label: payoutLabel, tone: _payoutTone(claim.payoutStatus)),
            ],
          ),
          const SizedBox(height: 12),
          _InfoRow(label: 'رقم الطلب', value: claim.orderNumber.trim().isNotEmpty ? claim.orderNumber : '—'),
          _InfoRow(label: 'تاريخ الإنجاز', value: formatOrderDate(claim.actualCompletionDate)),
          _InfoRow(label: 'تاريخ الإرسال', value: formatOrderDate(claim.submittedAt)),
          _InfoRow(
            label: 'نافذة الدفع',
            value: formatPayoutWindowLabel(claim.payoutWindowStart, claim.payoutWindowEnd),
          ),
          const SizedBox(height: 8),
          if (claim.hasAdminPricing) ...[
            _InfoRow(
              label: 'المبلغ الإجمالي',
              valueWidget: JodMoneyDisplay(amount: claim.totalPriceSnapshot),
              emphasized: true,
            ),
            _InfoRow(
              label: 'مبلغ المستقل',
              valueWidget: JodMoneyDisplay(amount: claim.userAmountSnapshot),
              emphasized: true,
            ),
            if (claim.paidAmount != null && claim.paidAmount! > 0)
              _InfoRow(label: 'المدفوع', valueWidget: JodMoneyDisplay(amount: claim.paidAmount)),
            if (claim.remainingAmount != null)
              _InfoRow(label: 'المتبقي', valueWidget: JodMoneyDisplay(amount: claim.remainingAmount)),
          ] else
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.primary.withValues(alpha: 0.15)),
              ),
              child: const Text(
                financialClaimUnpricedMessageAr,
                style: TextStyle(
                  color: AppColors.textInk,
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  height: 1.45,
                ),
                textAlign: TextAlign.right,
              ),
            ),
          if (claim.adminNote != null && claim.adminNote!.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            _NoteBox(
              title: 'ملاحظة الإدارة',
              text: claim.adminNote!.trim(),
              tone: NoteTone.admin,
            ),
          ],
          if (claim.freelancerNote != null && claim.freelancerNote!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            _NoteBox(
              title: 'ملاحظتك',
              text: claim.freelancerNote!.trim(),
              tone: NoteTone.freelancer,
            ),
          ],
        ],
      ),
    );
  }

  _ChipTone _statusTone(String? status) {
    switch (status) {
      case 'paid':
        return _ChipTone.success;
      case 'pending':
        return _ChipTone.warning;
      case 'accepted':
        return _ChipTone.info;
      case 'rejected':
      case 'frozen':
        return _ChipTone.danger;
      default:
        return _ChipTone.muted;
    }
  }

  _ChipTone _payoutTone(String? status) {
    switch (status) {
      case 'paid':
      case 'within_payout_window':
        return _ChipTone.success;
      case 'not_due_yet':
      case 'missing_completion_date':
        return _ChipTone.warning;
      case 'late_after_payout_window':
        return _ChipTone.danger;
      default:
        return _ChipTone.muted;
    }
  }
}

enum _ChipTone { success, warning, info, danger, muted }

enum NoteTone { admin, freelancer }

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});

  final String label;
  final _ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      _ChipTone.success => (AppColors.secondary.withValues(alpha: 0.18), AppColors.primary),
      _ChipTone.warning => (const Color(0xFFFFF4E5), const Color(0xFFB45309)),
      _ChipTone.info => (AppColors.primary.withValues(alpha: 0.1), AppColors.primary),
      _ChipTone.danger => (AppColors.error.withValues(alpha: 0.1), AppColors.error),
      _ChipTone.muted => (AppColors.iconChipBg, AppColors.textMuted),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 12),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.label,
    this.value,
    this.valueWidget,
    this.emphasized = false,
  });

  final String label;
  final String? value;
  final Widget? valueWidget;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: valueWidget ??
                Text(
                  value ?? '—',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    color: AppColors.textInk,
                    fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
                    height: 1.4,
                    fontSize: emphasized ? 15 : 14,
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

class _NoteBox extends StatelessWidget {
  const _NoteBox({
    required this.title,
    required this.text,
    required this.tone,
  });

  final String title;
  final String text;
  final NoteTone tone;

  @override
  Widget build(BuildContext context) {
    final isAdmin = tone == NoteTone.admin;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: isAdmin
            ? AppColors.error.withValues(alpha: 0.06)
            : AppColors.iconChipBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: isAdmin
              ? AppColors.error.withValues(alpha: 0.2)
              : AppColors.textMuted.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: TextStyle(
              color: isAdmin ? AppColors.error : AppColors.textMuted,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 4),
          Text(
            text,
            style: const TextStyle(color: AppColors.textInk, height: 1.45, fontSize: 13),
            textAlign: TextAlign.right,
          ),
        ],
      ),
    );
  }
}
