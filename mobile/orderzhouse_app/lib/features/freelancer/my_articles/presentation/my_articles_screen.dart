import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/widgets/oh_widgets.dart';
import '../../../auth/presentation/auth_controller.dart';
import '../data/manuscript_copy.dart';
import '../data/my_articles_copy.dart';
import '../data/my_articles_models.dart';
import 'manuscript_submit_args.dart';
import 'my_articles_controllers.dart';

class MyArticlesScreen extends ConsumerWidget {
  const MyArticlesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final ui = ref.watch(myArticlesControllerProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text(myArticlesTitleAr)),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                const Text(
                  myArticlesUnauthorizedAr,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                const SizedBox(height: 16),
                OhButton(
                  label: 'تسجيل الدخول',
                  onPressed: () => context.push(AppRoutes.login),
                ),
              ],
            ),
          ),
        ),
      );
    }

    if (auth.user?.isFreelancerAccount != true) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text(myArticlesTitleAr)),
        body: const OhEmptyBody(
          message: 'هذه الصفحة متاحة للمستقلين فقط.',
          icon: Icons.person_off_outlined,
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text(myArticlesTitleAr)),
      body: RefreshIndicator(
        onRefresh: () => ref.read(myArticlesControllerProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            const Text(
              myArticlesSubtitleAr,
              textAlign: TextAlign.right,
              style: TextStyle(color: AppColors.textMuted, height: 1.5),
            ),
            const SizedBox(height: 12),
            _StatusFilters(
              selected: ui.statusFilter,
              onSelected: (key) =>
                  ref.read(myArticlesControllerProvider.notifier).setStatusFilter(key),
            ),
            const SizedBox(height: 12),
            if (ui.loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: OhLoadingBody(),
              )
            else if (ui.error != null)
              OhErrorBody(
                message: ui.error!,
                onRetry: () => ref.read(myArticlesControllerProvider.notifier).refresh(),
              )
            else if (ui.snapshot.items.isEmpty)
              const OhEmptyBody(
                message: '$myArticlesEmptyTitleAr\n$myArticlesEmptyDescAr',
                icon: Icons.article_outlined,
              )
            else
              ...ui.snapshot.items.map(
                (item) => MyArticleCard(
                  item: item,
                  fallbackWriterProfileUrl: ui.snapshot.writerProfileUrl,
                  onSubmitManuscript: () => _openManuscriptSubmit(context, ref, item, isRevision: false),
                  onResubmitManuscript: () => _openManuscriptSubmit(context, ref, item, isRevision: true),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _openManuscriptSubmit(
    BuildContext context,
    WidgetRef ref,
    MyArticleItem item, {
    required bool isRevision,
  }) async {
    final result = await context.push<String>(
      AppRoutes.freelancerMyArticleSubmitPath(item.applicationId),
      extra: ManuscriptSubmitArgs(
        applicationId: item.applicationId,
        articleId: item.articleId,
        articleTitle: item.title,
        revisionNote: item.revisionNote,
        isRevision: isRevision,
        statusLabelAr: item.statusLabelAr,
      ),
    );
    if (!context.mounted) return;
    if (result == 'first' || result == 'revision') {
      final msg =
          result == 'revision' ? manuscriptSuccessRevisionAr : manuscriptSuccessFirstAr;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      await ref.read(myArticlesControllerProvider.notifier).refresh();
    }
  }
}

class _StatusFilters extends StatelessWidget {
  const _StatusFilters({required this.selected, required this.onSelected});

  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.end,
      children: [
        for (final key in myArticlesPortfolioFilterKeys)
          FilterChip(
            key: ValueKey('my-articles-filter-$key'),
            label: Text(myArticlesFilterLabelAr(key)),
            selected: selected == key,
            onSelected: (_) => onSelected(key),
            showCheckmark: false,
          ),
      ],
    );
  }
}

/// Portfolio card — exported for widget tests.
class MyArticleCard extends StatelessWidget {
  const MyArticleCard({
    super.key,
    required this.item,
    this.fallbackWriterProfileUrl,
    this.onOpenUrl,
    this.onSubmitManuscript,
    this.onResubmitManuscript,
  });

  final MyArticleItem item;
  final String? fallbackWriterProfileUrl;
  final Future<bool> Function(String url)? onOpenUrl;
  final VoidCallback? onSubmitManuscript;
  final VoidCallback? onResubmitManuscript;

  String? get _profileUrl {
    final fromItem = item.resolvedWriterProfileUrl;
    if (fromItem != null) return fromItem;
    final fallback = fallbackWriterProfileUrl?.trim();
    return (fallback != null && fallback.isNotEmpty) ? fallback : null;
  }

  Future<void> _open(BuildContext context, String? url) async {
    final raw = url?.trim();
    if (raw == null || raw.isEmpty) return;
    final opener = onOpenUrl;
    final ok = opener != null
        ? await opener(raw)
        : await () async {
            final uri = Uri.tryParse(raw);
            if (uri == null) return false;
            return launchUrl(uri, mode: LaunchMode.externalApplication);
          }();
    if (!context.mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(myArticlesOpenLinkFailedAr)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final assigned = formatMyArticlesDateAr(item.assignedAt);
    final submitted = formatMyArticlesDateAr(item.submittedAt);
    final articleUrl = item.resolvedArticleUrl;
    final profileUrl = _profileUrl;
    final showPublishSuccess = item.isPublishedOnBildazo;
    final showSubmit = item.showSubmitManuscriptAction;
    final showResubmit = item.showResubmitManuscriptAction;

    return OhCard(
      key: ValueKey('my-articles-card-${item.applicationId}'),
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            (item.title?.trim().isNotEmpty == true) ? item.title!.trim() : '—',
            textAlign: TextAlign.right,
            style: const TextStyle(
              fontWeight: FontWeight.w800,
              fontSize: 15,
              color: AppColors.textInk,
              height: 1.35,
            ),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: _StatusBadge(
              label: item.statusLabelAr,
              status: item.portfolioStatus,
            ),
          ),
          const SizedBox(height: 10),
          if (assigned != null)
            _MetaRow(label: myArticlesAssignedAtAr, value: assigned),
          if (submitted != null)
            _MetaRow(label: myArticlesSubmittedAtAr, value: submitted),
          if (item.grossAmountJod != null && item.grossAmountJod!.trim().isNotEmpty)
            _MetaRow(
              label: myArticlesGrossLabelAr,
              value: '${item.grossAmountJod} د.أ (قيمة المقال — ليست للسحب)',
            ),
          if (item.freelancerNetJod != null && item.freelancerNetJod!.trim().isNotEmpty)
            _MetaRow(
              label: myArticlesNetLabelAr,
              value: '${item.freelancerNetJod} د.أ',
              emphasize: true,
            ),
          if (item.reviewStatus != null && item.reviewStatus!.trim().isNotEmpty)
            _MetaRow(
              label: myArticlesReviewLabelAr,
              value: myArticlesPortfolioStatusLabelAr(item.reviewStatus),
            ),
          if (item.publishStatus != null && item.publishStatus!.trim().isNotEmpty)
            _MetaRow(
              label: myArticlesPublishLabelAr,
              value: myArticlesPortfolioStatusLabelAr(item.publishStatus),
            ),
          if (item.portfolioStatus == 'revision_requested' &&
              item.revisionNote != null &&
              item.revisionNote!.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              manuscriptRevisionNotesLabelAr,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12,
                color: AppColors.textMuted,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              item.revisionNote!.trim(),
              textAlign: TextAlign.right,
              style: const TextStyle(height: 1.45, color: AppColors.textInk),
            ),
          ],
          if (showPublishSuccess) ...[
            const SizedBox(height: 12),
            Container(
              key: ValueKey('my-articles-publish-${item.applicationId}'),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF3),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    myArticlesPublishSuccessAr,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF027A48),
                      height: 1.45,
                    ),
                  ),
                  if (articleUrl != null) ...[
                    const SizedBox(height: 10),
                    OhButton(
                      key: ValueKey('my-articles-view-article-${item.applicationId}'),
                      label: myArticlesViewArticleAr,
                      onPressed: () => _open(context, articleUrl),
                    ),
                  ],
                  if (profileUrl != null) ...[
                    const SizedBox(height: 8),
                    OhButton(
                      key: ValueKey('my-articles-view-profile-${item.applicationId}'),
                      label: myArticlesViewProfileAr,
                      outlined: true,
                      onPressed: () => _open(context, profileUrl),
                    ),
                  ],
                ],
              ),
            ),
          ] else if (profileUrl != null) ...[
            const SizedBox(height: 10),
            OhButton(
              key: ValueKey('my-articles-view-profile-${item.applicationId}'),
              label: myArticlesViewProfileAr,
              outlined: true,
              onPressed: () => _open(context, profileUrl),
            ),
          ],
          if (!showPublishSuccess && showSubmit) ...[
            const SizedBox(height: 10),
            OhButton(
              key: ValueKey('my-articles-submit-${item.applicationId}'),
              label: manuscriptActionSubmitAr,
              onPressed: onSubmitManuscript,
            ),
          ],
          if (!showPublishSuccess && showResubmit) ...[
            const SizedBox(height: 10),
            OhButton(
              key: ValueKey('my-articles-revise-${item.applicationId}'),
              label: manuscriptActionReviseAr,
              onPressed: onResubmitManuscript,
            ),
          ],
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({
    required this.label,
    required this.value,
    this.emphasize = false,
  });

  final String label;
  final String value;
  final bool emphasize;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label: ',
              style: const TextStyle(
                color: AppColors.textMuted,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
            TextSpan(
              text: value,
              style: TextStyle(
                color: emphasize ? AppColors.primaryDeep : AppColors.textInk,
                fontWeight: emphasize ? FontWeight.w800 : FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ],
        ),
        textAlign: TextAlign.right,
      ),
    );
  }
}

enum _BadgeTone { neutral, warn, info, ok, danger }

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.status});

  final String label;
  final String status;

  _BadgeTone get _tone {
    switch (status) {
      case 'published_on_bildazo':
      case 'accepted':
        return _BadgeTone.ok;
      case 'rejected':
        return _BadgeTone.danger;
      case 'revision_requested':
        return _BadgeTone.warn;
      case 'under_review':
        return _BadgeTone.info;
      default:
        return _BadgeTone.neutral;
    }
  }

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    switch (_tone) {
      case _BadgeTone.warn:
        bg = const Color(0xFFFFF4E5);
        fg = const Color(0xFFB54708);
      case _BadgeTone.info:
        bg = const Color(0xFFEFF8FF);
        fg = const Color(0xFF175CD3);
      case _BadgeTone.ok:
        bg = const Color(0xFFECFDF3);
        fg = const Color(0xFF027A48);
      case _BadgeTone.danger:
        bg = const Color(0xFFFEF3F2);
        fg = const Color(0xFFB42318);
      case _BadgeTone.neutral:
        bg = AppColors.primary.withValues(alpha: 0.08);
        fg = AppColors.primaryDeep;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 11),
      ),
    );
  }
}
