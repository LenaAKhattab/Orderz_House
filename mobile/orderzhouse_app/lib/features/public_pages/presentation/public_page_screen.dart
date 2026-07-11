import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/public_pages_repository.dart';

class PublicPageScreen extends ConsumerWidget {
  const PublicPageScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pageAsync = ref.watch(publicPageProvider(slug));

    return Scaffold(
      backgroundColor: AppColors.pageBg,
      appBar: AppBar(
        title: pageAsync.maybeWhen(
          data: (page) => Text(page.menuLabel ?? page.title),
          orElse: () => const Text('صفحة'),
        ),
      ),
      body: pageAsync.when(
        loading: () => const OhLoadingBody(),
        error: (e, _) => OhErrorBody(
          message: apiErrorMessage(e, fallback: 'تعذر تحميل الصفحة.'),
          onRetry: () => ref.invalidate(publicPageProvider(slug)),
        ),
        data: (page) {
          if (page.content.trim().isEmpty) {
            return const OhEmptyBody(message: 'لا يوجد محتوى لهذه الصفحة.');
          }
          final paragraphs = page.paragraphs;
          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              Text(
                page.title,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.textInk,
                    ),
                textAlign: TextAlign.right,
              ),
              const SizedBox(height: 16),
              OhCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final p in paragraphs) ...[
                      Text(
                        p,
                        style: const TextStyle(height: 1.8, color: AppColors.textMain),
                        textAlign: TextAlign.right,
                      ),
                      const SizedBox(height: 14),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
