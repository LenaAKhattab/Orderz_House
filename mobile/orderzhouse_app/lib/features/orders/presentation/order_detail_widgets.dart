import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/order_display_helpers.dart';

/// Soft premium section card with optional leading icon.
class OrderSectionCard extends StatelessWidget {
  const OrderSectionCard({
    super.key,
    required this.title,
    required this.children,
    this.icon,
    this.trailing,
  });

  final String title;
  final List<Widget> children;
  final IconData? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.cardBorder.withValues(alpha: 0.55)),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.05),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: AppColors.secondary.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, size: 18, color: AppColors.primary),
                ),
                const SizedBox(width: 10),
              ],
              Expanded(
                child: Text(
                  title,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: AppColors.primaryDeep,
                  ),
                ),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }
}

class OrderInfoRow extends StatelessWidget {
  const OrderInfoRow({
    super.key,
    required this.label,
    required this.value,
    this.icon,
  });

  final String label;
  final String value;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: AppColors.textMuted),
            const SizedBox(width: 8),
          ],
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              value,
              textAlign: TextAlign.left,
              style: const TextStyle(
                color: AppColors.textInk,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Compact 2-column meta grid for order facts.
class OrderInfoGrid extends StatelessWidget {
  const OrderInfoGrid({super.key, required this.items});

  final List<OrderMetaItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final left = items[i];
      final right = i + 1 < items.length ? items[i + 1] : null;
      rows.add(
        Padding(
          padding: EdgeInsets.only(bottom: i + 2 < items.length ? 8 : 0),
          child: Row(
            children: [
              Expanded(child: _MetaTile(item: left)),
              const SizedBox(width: 8),
              Expanded(
                child: right != null ? _MetaTile(item: right) : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      );
    }
    return Column(children: rows);
  }
}

class OrderMetaItem {
  const OrderMetaItem({
    required this.label,
    this.value = '',
    this.valueWidget,
    this.icon,
    this.accent,
  });

  final String label;
  final String value;
  final Widget? valueWidget;
  final IconData? icon;
  final Color? accent;
}

class _MetaTile extends StatelessWidget {
  const _MetaTile({required this.item});

  final OrderMetaItem item;

  @override
  Widget build(BuildContext context) {
    final accent = item.accent ?? AppColors.primary;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (item.icon != null) ...[
                Icon(item.icon, size: 13, color: accent),
                const SizedBox(width: 4),
              ],
              Expanded(
                child: Text(
                  item.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (item.valueWidget != null)
            item.valueWidget!
          else
            Text(
              item.value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: AppColors.textInk,
                fontWeight: FontWeight.w800,
                fontSize: 13,
                height: 1.25,
              ),
            ),
        ],
      ),
    );
  }
}

class OrderStatusBadge extends StatelessWidget {
  const OrderStatusBadge({
    super.key,
    required this.label,
    this.statusKey,
    this.compact = false,
  });

  final String label;
  final String? statusKey;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final style = orderStatusBadgeStyle(statusKey ?? label);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 10,
        vertical: compact ? 4 : 6,
      ),
      decoration: BoxDecoration(
        color: style.background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(style.icon, size: compact ? 12 : 14, color: style.foreground),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: style.foreground,
                fontWeight: FontWeight.w800,
                fontSize: compact ? 11 : 12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class OrderStatusBadgeStyle {
  const OrderStatusBadgeStyle({
    required this.background,
    required this.foreground,
    required this.icon,
  });

  final Color background;
  final Color foreground;
  final IconData icon;
}

OrderStatusBadgeStyle orderStatusBadgeStyle(String? key) {
  final k = (key ?? '').toLowerCase();
  if (k.contains('open_for_bids') || k.contains('مفتوح للعروض')) {
    return OrderStatusBadgeStyle(
      background: AppColors.secondary.withValues(alpha: 0.2),
      foreground: AppColors.primary,
      icon: Icons.gavel_outlined,
    );
  }
  if (k.contains('open_for_freelancers') || k.contains('مفتوح للمستقلين') || k.contains('متاح')) {
    return OrderStatusBadgeStyle(
      background: AppColors.secondary.withValues(alpha: 0.18),
      foreground: AppColors.primaryMid,
      icon: Icons.storefront_outlined,
    );
  }
  if (k.contains('in_progress') || k.contains('قيد التنفيذ') || k.contains('ready_for_work') || k.contains('assigned')) {
    return OrderStatusBadgeStyle(
      background: const Color(0xFFE8F1FF),
      foreground: AppColors.primaryDeep,
      icon: Icons.play_circle_outline,
    );
  }
  if (k.contains('pending_client_review') || k.contains('submitted') || k.contains('بانتظار')) {
    return OrderStatusBadgeStyle(
      background: const Color(0xFFFFF4E5),
      foreground: const Color(0xFFB54708),
      icon: Icons.hourglass_top_rounded,
    );
  }
  if (k.contains('revision') || k.contains('تعديل')) {
    return OrderStatusBadgeStyle(
      background: const Color(0xFFFFF1F3),
      foreground: const Color(0xFFC11574),
      icon: Icons.rate_review_outlined,
    );
  }
  if (k.contains('completed') || k.contains('مكتمل')) {
    return OrderStatusBadgeStyle(
      background: AppColors.success.withValues(alpha: 0.12),
      foreground: AppColors.success,
      icon: Icons.check_circle_outline,
    );
  }
  if (k.contains('cancel') || k.contains('reject') || k.contains('ملغى') || k.contains('مرفوض')) {
    return OrderStatusBadgeStyle(
      background: AppColors.errorSurface,
      foreground: AppColors.error,
      icon: Icons.cancel_outlined,
    );
  }
  if (k.contains('pending_payment') || k.contains('دفع')) {
    return OrderStatusBadgeStyle(
      background: const Color(0xFFFFF4E5),
      foreground: const Color(0xFFB54708),
      icon: Icons.payments_outlined,
    );
  }
  return OrderStatusBadgeStyle(
    background: AppColors.iconChipBg,
    foreground: AppColors.primary,
    icon: Icons.flag_outlined,
  );
}

/// Compact hero summary for order detail screens.
class OrderDetailHeroCard extends StatelessWidget {
  const OrderDetailHeroCard({
    super.key,
    required this.title,
    this.orderId,
    this.statusLabel,
    this.statusKey,
    this.projectTypeLabel,
    this.budgetLabel,
    this.budgetDisplay,
    this.dateLabel,
    this.dateCaption = 'التاريخ',
  });

  final String title;
  final String? orderId;
  final String? statusLabel;
  final String? statusKey;
  final String? projectTypeLabel;
  final String? budgetLabel;
  final Widget? budgetDisplay;
  final String? dateLabel;
  final String dateCaption;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
          colors: [AppColors.primaryDeep, AppColors.primary, AppColors.primaryMid],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.22),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (orderId != null && orderId!.trim().isNotEmpty)
            Text(
              'طلب #$orderId',
              textAlign: TextAlign.right,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.75),
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          if (orderId != null && orderId!.trim().isNotEmpty) const SizedBox(height: 6),
          Text(
            title,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 18,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.end,
            children: [
              if (statusLabel != null)
                OrderStatusBadge(label: statusLabel!, statusKey: statusKey, compact: true),
              if (projectTypeLabel != null)
                _HeroChip(label: projectTypeLabel!, icon: Icons.layers_outlined),
            ],
          ),
          if (budgetDisplay != null || budgetLabel != null || dateLabel != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  if (budgetDisplay != null || budgetLabel != null)
                    Expanded(
                      child: _HeroStat(
                        icon: Icons.payments_outlined,
                        label: 'الميزانية',
                        value: budgetLabel ?? '',
                        valueWidget: budgetDisplay,
                      ),
                    ),
                  if ((budgetDisplay != null || budgetLabel != null) && dateLabel != null)
                    Container(
                      width: 1,
                      height: 34,
                      color: Colors.white.withValues(alpha: 0.2),
                    ),
                  if (dateLabel != null)
                    Expanded(
                      child: _HeroStat(
                        icon: Icons.calendar_today_outlined,
                        label: dateCaption,
                        value: dateLabel!,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  const _HeroChip({required this.label, required this.icon});

  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.white),
          const SizedBox(width: 5),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 11,
            ),
          ),
        ],
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({
    required this.icon,
    required this.label,
    required this.value,
    this.valueWidget,
  });

  final IconData icon;
  final String label;
  final String value;
  final Widget? valueWidget;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 13, color: Colors.white.withValues(alpha: 0.85)),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.8),
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (valueWidget != null)
            valueWidget!
          else
            Text(
              value,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
        ],
      ),
    );
  }
}

class OrderEmptyHint extends StatelessWidget {
  const OrderEmptyHint({
    super.key,
    required this.message,
    this.icon = Icons.inbox_outlined,
  });

  final String message;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        children: [
          Icon(icon, size: 28, color: AppColors.textMuted.withValues(alpha: 0.7)),
          const SizedBox(height: 8),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, height: 1.5, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class OrderPlaceholderAction extends StatelessWidget {
  const OrderPlaceholderAction({
    super.key,
    required this.label,
    this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OhButton(
      label: label,
      onPressed: onPressed,
      outlined: onPressed != null,
    );
  }
}

class OrderDisabledAction extends StatelessWidget {
  const OrderDisabledAction({super.key, required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: 0.65,
      child: OhButton(label: label, onPressed: null, outlined: true),
    );
  }
}

String formatOrderDateLabel(String? raw) => formatOrderDate(raw);
