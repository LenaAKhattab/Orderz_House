import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import 'categories_controller.dart';
import '../data/category_models.dart';

class ServicesScreen extends ConsumerWidget {
  const ServicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(categoriesControllerProvider);
    final notifier = ref.read(categoriesControllerProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('الخدمات')),
      body: _buildBody(context, state, notifier),
    );
  }

  Widget _buildBody(
    BuildContext context,
    CategoriesState state,
    CategoriesController notifier,
  ) {
    if (state.isLoading && state.items.isEmpty) {
      return const OhLoadingBody(message: 'جاري تحميل التصنيفات...');
    }

    if (state.error != null && state.items.isEmpty) {
      return OhErrorBody(
        message: apiErrorMessage(state.error!, fallback: 'تعذر تحميل التصنيفات. حاول لاحقاً.'),
        onRetry: notifier.load,
      );
    }

    if (state.items.isEmpty) {
      return const OhEmptyBody(
        message: 'لا توجد تصنيفات متاحة حالياً.',
        icon: Icons.category_outlined,
      );
    }

    return RefreshIndicator(
      onRefresh: notifier.load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: state.items.length,
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final item = state.items[index];
          return _CategoryCard(
            item: item,
            onExpand: () => notifier.loadSubcategories(item.category.id),
          );
        },
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.item, required this.onExpand});

  final CategoryWithSubcategories item;
  final VoidCallback onExpand;

  @override
  Widget build(BuildContext context) {
    final category = item.category;
    final imageUrl = category.resolvedImageUrl;

    return OhCard(
      padding: EdgeInsets.zero,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          onExpansionChanged: (open) {
            if (open) onExpand();
          },
          leading: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: imageUrl.isNotEmpty
                ? Image.network(
                    imageUrl,
                    width: 48,
                    height: 48,
                    fit: BoxFit.cover,
                    errorBuilder: (context, error, stackTrace) => _iconPlaceholder(),
                  )
                : _iconPlaceholder(),
          ),
          title: Text(
            category.name,
            style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textInk),
          ),
          subtitle: category.description != null && category.description!.trim().isNotEmpty
              ? Text(
                  category.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: AppColors.textMuted, height: 1.5),
                )
              : null,
          children: [
            if (item.subcategoriesLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 12),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              )
            else if (item.subcategoriesError != null)
              OhErrorBanner(message: apiErrorMessage(item.subcategoriesError!))
            else if (item.subcategories.isEmpty)
              const Text(
                'لا توجد تصنيفات فرعية.',
                style: TextStyle(color: AppColors.textMuted),
              )
            else
              ...item.subcategories.map(
                (sub) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.iconChipBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      sub.name,
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _iconPlaceholder() {
    return Container(
      width: 48,
      height: 48,
      color: AppColors.iconChipBg,
      child: const Icon(Icons.category_outlined, color: AppColors.primary),
    );
  }
}
