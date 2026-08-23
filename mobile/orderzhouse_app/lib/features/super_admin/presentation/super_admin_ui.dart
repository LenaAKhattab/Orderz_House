import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/super_admin_models.dart';

void showSuperAdminComingSoonSnack(BuildContext context) {
  ScaffoldMessenger.of(context).showSnackBar(
    const SnackBar(content: Text(superAdminComingSoonMessageAr)),
  );
}

class SuperAdminStatusChip extends StatelessWidget {
  const SuperAdminStatusChip({super.key, required this.label, this.tone = SuperAdminChipTone.neutral});

  final String label;
  final SuperAdminChipTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = switch (tone) {
      SuperAdminChipTone.urgent => (const Color(0xFFFEF3F2), AppColors.error),
      SuperAdminChipTone.success => (const Color(0xFFECFDF3), AppColors.success),
      SuperAdminChipTone.warning => (const Color(0xFFFFFBEB), const Color(0xFFB45309)),
      SuperAdminChipTone.neutral => (AppColors.iconChipBg, AppColors.primary),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colors.$1,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: colors.$2, fontWeight: FontWeight.w700, fontSize: 11),
      ),
    );
  }
}

enum SuperAdminChipTone { urgent, success, warning, neutral }

class SuperAdminQueueScaffold extends StatelessWidget {
  const SuperAdminQueueScaffold({
    super.key,
    required this.title,
    required this.onRefresh,
    required this.body,
  });

  final String title;
  final Future<void> Function() onRefresh;
  final Widget body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: Text(title)),
      body: RefreshIndicator(
        onRefresh: onRefresh,
        child: body,
      ),
    );
  }
}

class SuperAdminQueueCard extends StatelessWidget {
  const SuperAdminQueueCard({
    super.key,
    required this.title,
    this.subtitle,
    this.meta,
    this.chip,
    this.trailing,
    this.actions,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final String? meta;
  final Widget? chip;
  final Widget? trailing;
  final Widget? actions;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: AppColors.primaryDeep,
                      ),
                    ),
                    if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(subtitle!, style: const TextStyle(color: AppColors.textMuted, height: 1.4)),
                    ],
                    if (meta != null && meta!.trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        meta!,
                        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary),
                      ),
                    ],
                    if (chip != null) ...[
                      const SizedBox(height: 10),
                      Align(alignment: AlignmentDirectional.centerStart, child: chip),
                    ],
                  ],
                ),
              ),
              ?trailing,
            ],
          ),
          if (actions != null) ...[
            const SizedBox(height: 12),
            actions!,
          ],
        ],
      ),
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: card,
      ),
    );
  }
}

class SuperAdminCountTile extends StatelessWidget {
  const SuperAdminCountTile({
    super.key,
    required this.title,
    required this.card,
    required this.icon,
    this.onTap,
    this.comingSoon = false,
    this.webHandoff = false,
    this.hint,
    this.onPrimaryCta,
    this.primaryCtaLabel,
    this.primaryCtaKey,
  });

  final String title;
  final SuperAdminCountCard card;
  final IconData icon;
  final VoidCallback? onTap;
  final bool comingSoon;
  final bool webHandoff;
  final String? hint;
  final VoidCallback? onPrimaryCta;
  final String? primaryCtaLabel;
  final Key? primaryCtaKey;

  @override
  Widget build(BuildContext context) {
    final available = card.available;
    final count = card.count;
    final resolvedHint = card.pending
        ? 'جارٍ التحديث'
        : (hint ??
            (available
                ? (webHandoff || comingSoon
                    ? superAdminOpenWebPanelAr
                    : 'اضغط للعرض')
                : superAdminUnavailableCardAr));

    VoidCallback? resolvedTap;
    if (available) {
      if (comingSoon && onTap == null && onPrimaryCta == null) {
        resolvedTap = () => showSuperAdminComingSoonSnack(context);
      } else {
        resolvedTap = onTap;
      }
    }

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: resolvedTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.cardBorder),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.iconChipBg,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryDeep,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          resolvedHint,
                          style: const TextStyle(color: AppColors.textMuted, fontSize: 12, height: 1.35),
                        ),
                      ],
                    ),
                  ),
                  Text(
                    card.pending ? '…' : (available ? '${count ?? 0}' : '—'),
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: available &&
                              !card.pending &&
                              (count ?? 0) > 0
                          ? AppColors.error
                          : AppColors.primaryDeep,
                    ),
                  ),
                ],
              ),
              if (available && onPrimaryCta != null) ...[
                const SizedBox(height: 12),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: TextButton.icon(
                    key: primaryCtaKey ?? const Key('sa-count-tile-web-cta'),
                    onPressed: onPrimaryCta,
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: Text(primaryCtaLabel ?? superAdminOpenWebPanelAr),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class SuperAdminQueueErrorOrEmpty extends StatelessWidget {
  const SuperAdminQueueErrorOrEmpty({
    super.key,
    required this.isError,
    required this.message,
    this.onRetry,
  });

  final bool isError;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    if (isError) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 280,
            child: OhErrorBody(message: message, onRetry: onRetry ?? () {}),
          ),
        ],
      );
    }
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 80),
        SizedBox(
          height: 220,
          child: OhEmptyBody(message: message, icon: Icons.inbox_outlined),
        ),
      ],
    );
  }
}
