import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/order_display_helpers.dart';
import '../data/pool_order_models.dart';
import 'pool_orders_controller.dart';

enum MarketplaceProjectFilter { all, bidding, fixed }

class OrdersMarketplaceScreen extends ConsumerStatefulWidget {
  const OrdersMarketplaceScreen({super.key});

  @override
  ConsumerState<OrdersMarketplaceScreen> createState() => _OrdersMarketplaceScreenState();
}

class _OrdersMarketplaceScreenState extends ConsumerState<OrdersMarketplaceScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  MarketplaceProjectFilter _filter = MarketplaceProjectFilter.all;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<PoolOrder> _filtered(List<PoolOrder> orders) {
    final q = _query.trim().toLowerCase();
    return orders.where((order) {
      if (_filter == MarketplaceProjectFilter.bidding && !order.isBidding) return false;
      if (_filter == MarketplaceProjectFilter.fixed && order.isBidding) return false;
      if (q.isEmpty) return true;
      final haystack = [
        order.title,
        order.description ?? '',
        order.category?.name ?? '',
        order.projectTypeLabel,
        order.statusLabel,
        order.budgetLabel ?? '',
      ].join(' ').toLowerCase();
      return haystack.contains(q);
    }).toList();
  }

  Future<void> _openFilterSheet() async {
    final selected = await showModalBottomSheet<MarketplaceProjectFilter>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 42,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.cardBorder,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'تصفية الطلبات',
                  textAlign: TextAlign.right,
                  style: TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 18,
                  ),
                ),
                const SizedBox(height: 12),
                _FilterOption(
                  label: 'كل الأنواع',
                  selected: _filter == MarketplaceProjectFilter.all,
                  onTap: () => Navigator.of(ctx).pop(MarketplaceProjectFilter.all),
                ),
                _FilterOption(
                  label: 'مناقصة',
                  selected: _filter == MarketplaceProjectFilter.bidding,
                  onTap: () => Navigator.of(ctx).pop(MarketplaceProjectFilter.bidding),
                ),
                _FilterOption(
                  label: 'سعر ثابت',
                  selected: _filter == MarketplaceProjectFilter.fixed,
                  onTap: () => Navigator.of(ctx).pop(MarketplaceProjectFilter.fixed),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (selected != null && mounted) {
      setState(() => _filter = selected);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(poolOrdersControllerProvider);
    final notifier = ref.read(poolOrdersControllerProvider.notifier);
    final filtered = _filtered(state.orders);
    final hasActiveFilter = _filter != MarketplaceProjectFilter.all || _query.trim().isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'سوق الطلبات',
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      color: AppColors.primaryDeep,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    hasActiveFilter
                        ? '${filtered.length} نتيجة مطابقة'
                        : 'استكشف الفرص وقدّم عروضك',
                    textAlign: TextAlign.right,
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: _SearchField(
                          controller: _searchController,
                          onChanged: (value) => setState(() => _query = value),
                          onClear: () {
                            _searchController.clear();
                            setState(() => _query = '');
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      _FilterButton(
                        active: _filter != MarketplaceProjectFilter.all,
                        onTap: _openFilterSheet,
                      ),
                    ],
                  ),
                  if (_filter != MarketplaceProjectFilter.all) ...[
                    const SizedBox(height: 10),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: InputChip(
                        label: Text(
                          _filter == MarketplaceProjectFilter.bidding ? 'مناقصة' : 'سعر ثابت',
                        ),
                        onDeleted: () => setState(() => _filter = MarketplaceProjectFilter.all),
                        deleteIconColor: AppColors.primary,
                        backgroundColor: AppColors.secondary.withValues(alpha: 0.18),
                        side: BorderSide.none,
                        labelStyle: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(child: _buildBody(context, state, notifier, filtered)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    PoolOrdersState state,
    PoolOrdersController notifier,
    List<PoolOrder> filtered,
  ) {
    if (state.isLoading && state.orders.isEmpty) {
      return const OhLoadingBody(message: 'جاري تحميل الطلبات...');
    }

    if (state.error != null && state.orders.isEmpty) {
      return OhErrorBody(
        message: apiErrorMessage(state.error!, fallback: 'تعذر تحميل سوق الطلبات.'),
        onRetry: () => notifier.load(refresh: true),
      );
    }

    if (state.orders.isEmpty) {
      return const OhEmptyBody(
        message: 'لا توجد طلبات في السوق حالياً.',
        icon: Icons.storefront_outlined,
      );
    }

    if (filtered.isEmpty) {
      return const OhEmptyBody(
        message: 'لا توجد نتائج مطابقة للبحث أو التصفية.',
        icon: Icons.search_off_rounded,
      );
    }

    final showLoadMore = !(_query.trim().isNotEmpty || _filter != MarketplaceProjectFilter.all) &&
        state.hasMore;

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () => notifier.load(refresh: true),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        itemCount: filtered.length + (showLoadMore ? 1 : 0),
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          if (index >= filtered.length) {
            if (state.isLoadingMore) {
              return const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              );
            }
            return OhButton(
              label: 'تحميل المزيد',
              outlined: true,
              onPressed: () => notifier.load(),
            );
          }
          return _PoolOrderCard(order: filtered[index]);
        },
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.onChanged,
    required this.onClear,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: AppColors.cardBorder),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.06),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        textAlign: TextAlign.right,
        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        decoration: InputDecoration(
          hintText: 'ابحث عن طلب أو تصنيف...',
          hintStyle: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w500),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
          prefixIcon: const Icon(Icons.search_rounded, color: AppColors.textMuted),
          suffixIcon: controller.text.isNotEmpty
              ? IconButton(
                  onPressed: onClear,
                  icon: const Icon(Icons.close_rounded, color: AppColors.textMuted, size: 20),
                )
              : null,
        ),
      ),
    );
  }
}

class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.active, required this.onTap});

  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            color: active ? AppColors.primary : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: active ? AppColors.primary : AppColors.cardBorder),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: active ? 0.22 : 0.06),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Icon(
            Icons.tune_rounded,
            color: active ? Colors.white : AppColors.primary,
          ),
        ),
      ),
    );
  }
}

class _FilterOption extends StatelessWidget {
  const _FilterOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      onTap: onTap,
      contentPadding: EdgeInsets.zero,
      title: Text(
        label,
        textAlign: TextAlign.right,
        style: TextStyle(
          fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
          color: selected ? AppColors.primary : AppColors.textInk,
        ),
      ),
      trailing: selected
          ? const Icon(Icons.check_circle_rounded, color: AppColors.primary)
          : const Icon(Icons.circle_outlined, color: AppColors.textMuted),
    );
  }
}

class _PoolOrderCard extends StatelessWidget {
  const _PoolOrderCard({required this.order});

  final PoolOrder order;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.push(AppRoutes.poolOrderPath(order.id)),
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: AppColors.cardBorder.withValues(alpha: 0.55)),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.06),
                blurRadius: 12,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      order.title,
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                        color: AppColors.textInk,
                        height: 1.3,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _TypeChip(label: order.projectTypeLabel, bidding: order.isBidding),
                ],
              ),
              if (order.category?.name != null) ...[
                const SizedBox(height: 5),
                Text(
                  order.category!.name!,
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    color: AppColors.primaryMid,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ],
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                alignment: WrapAlignment.end,
                children: [
                  if (order.budgetLabel != null)
                    _MetaPill(
                      icon: Icons.payments_outlined,
                      label: order.budgetLabel!,
                      color: AppColors.success,
                      background: AppColors.success.withValues(alpha: 0.12),
                    ),
                  _MetaPill(
                    icon: Icons.calendar_today_outlined,
                    label: formatOrderDate(order.publishedAtLabel),
                    color: AppColors.primaryMid,
                    background: AppColors.iconChipBg,
                  ),
                  if (order.applicantsCount > 0)
                    _MetaPill(
                      icon: Icons.people_outline,
                      label: '${order.applicantsCount} متقدم',
                      color: const Color(0xFFB54708),
                      background: const Color(0xFFFFF4E5),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.label, required this.bidding});

  final String label;
  final bool bidding;

  @override
  Widget build(BuildContext context) {
    final bg = bidding
        ? AppColors.secondary.withValues(alpha: 0.22)
        : AppColors.iconChipBg;
    final fg = bidding ? AppColors.primary : AppColors.primaryDeep;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 11),
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill({
    required this.icon,
    required this.label,
    required this.color,
    required this.background,
  });

  final IconData icon;
  final String label;
  final Color color;
  final Color background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

