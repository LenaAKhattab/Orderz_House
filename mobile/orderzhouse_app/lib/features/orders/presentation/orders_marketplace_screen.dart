import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../currency/presentation/jod_money_display.dart';
import '../../freelancer/data/pool_order_participation_helpers.dart';
import '../../pantry/data/pantry_models.dart';
import '../../pantry/presentation/pantry_controllers.dart';
import '../../pantry/presentation/pantry_display.dart';
import '../data/available_opportunity.dart';
import '../data/order_display_helpers.dart';
import '../data/pool_order_models.dart';
import 'pool_orders_controller.dart';

enum MarketplaceProjectFilter { all, bidding, fixed }

enum MarketplaceBudgetFilter {
  all,
  upTo100,
  from100To500,
  from500To1000,
  over1000;

  String get labelAr => switch (this) {
        MarketplaceBudgetFilter.all => 'كل الأسعار',
        MarketplaceBudgetFilter.upTo100 => 'من 0 إلى 100 د.أ',
        MarketplaceBudgetFilter.from100To500 => 'من 100 إلى 500 د.أ',
        MarketplaceBudgetFilter.from500To1000 => 'من 500 إلى 1000 د.أ',
        MarketplaceBudgetFilter.over1000 => 'أكثر من 1000 د.أ',
      };

  String get chipLabelAr => switch (this) {
        MarketplaceBudgetFilter.all => '',
        MarketplaceBudgetFilter.upTo100 => '0–100 د.أ',
        MarketplaceBudgetFilter.from100To500 => '100–500 د.أ',
        MarketplaceBudgetFilter.from500To1000 => '500–1000 د.أ',
        MarketplaceBudgetFilter.over1000 => '+1000 د.أ',
      };

  bool containsValue(double value) => switch (this) {
        MarketplaceBudgetFilter.all => true,
        MarketplaceBudgetFilter.upTo100 => value >= 0 && value <= 100,
        MarketplaceBudgetFilter.from100To500 => value > 100 && value <= 500,
        MarketplaceBudgetFilter.from500To1000 => value > 500 && value <= 1000,
        MarketplaceBudgetFilter.over1000 => value > 1000,
      };

  /// Selected band as [min, max] with null max = open-ended.
  (double, double?) get band => switch (this) {
        MarketplaceBudgetFilter.all => (0, null),
        MarketplaceBudgetFilter.upTo100 => (0, 100),
        MarketplaceBudgetFilter.from100To500 => (100, 500),
        MarketplaceBudgetFilter.from500To1000 => (500, 1000),
        MarketplaceBudgetFilter.over1000 => (1000, null),
      };
}

class _MarketplaceFilters {
  const _MarketplaceFilters({
    required this.project,
    required this.budget,
  });

  final MarketplaceProjectFilter project;
  final MarketplaceBudgetFilter budget;
}

bool _opportunityMatchesBudgetFilter(AvailableOpportunity order, MarketplaceBudgetFilter filter) {
  if (filter == MarketplaceBudgetFilter.all) return true;

  if (order.isBidding) {
    final oMin = order.budgetMin;
    final oMax = order.budgetMax;
    if (oMin == null && oMax == null) return false;
    final rangeMin = oMin ?? oMax!;
    final rangeMax = oMax ?? oMin!;
    final (bandMin, bandMax) = filter.band;
    if (filter == MarketplaceBudgetFilter.upTo100) {
      return rangeMin <= 100 && rangeMax >= 0;
    }
    if (bandMax == null) {
      return rangeMax > bandMin;
    }
    return rangeMin <= bandMax && rangeMax > bandMin;
  }

  final budget = order.budgetValue;
  if (budget == null) return false;
  return filter.containsValue(budget);
}

class OrdersMarketplaceScreen extends ConsumerStatefulWidget {
  const OrdersMarketplaceScreen({super.key});

  @override
  ConsumerState<OrdersMarketplaceScreen> createState() => _OrdersMarketplaceScreenState();
}

class _OrdersMarketplaceScreenState extends ConsumerState<OrdersMarketplaceScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  MarketplaceProjectFilter _filter = MarketplaceProjectFilter.all;
  MarketplaceBudgetFilter _budgetFilter = MarketplaceBudgetFilter.all;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<AvailableOpportunity> _filtered(List<PoolOrder> orders, List<PantryRequest> pantry) {
    final q = _query.trim().toLowerCase();
    return mergeAvailableOpportunities(poolOrders: orders, pantryRequests: pantry).where((order) {
      if (_filter == MarketplaceProjectFilter.bidding && !order.isBidding) return false;
      if (_filter == MarketplaceProjectFilter.fixed && order.isBidding) return false;
      if (!_opportunityMatchesBudgetFilter(order, _budgetFilter)) return false;
      if (q.isEmpty) return true;
      final haystack = [
        order.title,
        order.description ?? '',
        order.categoryName ?? '',
        ...order.skills,
        order.projectTypeLabel,
        order.budgetLabel ?? '',
      ].join(' ').toLowerCase();
      return haystack.contains(q);
    }).toList();
  }

  Future<void> _openFilterSheet() async {
    var draftProject = _filter;
    var draftBudget = _budgetFilter;

    final selected = await showModalBottomSheet<_MarketplaceFilters>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: StatefulBuilder(
            builder: (context, setSheetState) {
              return SingleChildScrollView(
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
                      const SizedBox(height: 16),
                      const Text(
                        'نوع الطلب',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 4),
                      _FilterOption(
                        label: 'كل الأنواع',
                        selected: draftProject == MarketplaceProjectFilter.all,
                        onTap: () => setSheetState(() => draftProject = MarketplaceProjectFilter.all),
                      ),
                      _FilterOption(
                        label: 'مناقصة',
                        selected: draftProject == MarketplaceProjectFilter.bidding,
                        onTap: () => setSheetState(() => draftProject = MarketplaceProjectFilter.bidding),
                      ),
                      _FilterOption(
                        label: 'سعر ثابت',
                        selected: draftProject == MarketplaceProjectFilter.fixed,
                        onTap: () => setSheetState(() => draftProject = MarketplaceProjectFilter.fixed),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'نطاق السعر',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          color: AppColors.textMuted,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 4),
                      for (final option in MarketplaceBudgetFilter.values)
                        _FilterOption(
                          label: option.labelAr,
                          selected: draftBudget == option,
                          onTap: () => setSheetState(() => draftBudget = option),
                        ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.of(ctx).pop(
                                const _MarketplaceFilters(
                                  project: MarketplaceProjectFilter.all,
                                  budget: MarketplaceBudgetFilter.all,
                                ),
                              ),
                              child: const Text('إعادة ضبط'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton(
                              onPressed: () => Navigator.of(ctx).pop(
                                _MarketplaceFilters(project: draftProject, budget: draftBudget),
                              ),
                              style: FilledButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                              ),
                              child: const Text('تطبيق'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );

    if (selected != null && mounted) {
      setState(() {
        _filter = selected.project;
        _budgetFilter = selected.budget;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(poolOrdersControllerProvider);
    final notifier = ref.read(poolOrdersControllerProvider.notifier);
    final pantry = ref.watch(pantryOpenRequestsProvider).maybeWhen(
          data: (value) => value,
          orElse: () => const <PantryRequest>[],
        );
    final filtered = _filtered(state.orders, pantry);
    final hasProjectFilter = _filter != MarketplaceProjectFilter.all;
    final hasBudgetFilter = _budgetFilter != MarketplaceBudgetFilter.all;
    final hasActiveFilter = hasProjectFilter || hasBudgetFilter || _query.trim().isNotEmpty;

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
                        active: hasProjectFilter || hasBudgetFilter,
                        onTap: _openFilterSheet,
                      ),
                    ],
                  ),
                  if (hasProjectFilter || hasBudgetFilter) ...[
                    const SizedBox(height: 10),
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (hasProjectFilter)
                            InputChip(
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
                          if (hasBudgetFilter)
                            InputChip(
                              label: Text(_budgetFilter.chipLabelAr),
                              onDeleted: () =>
                                  setState(() => _budgetFilter = MarketplaceBudgetFilter.all),
                              deleteIconColor: AppColors.primary,
                              backgroundColor: AppColors.secondary.withValues(alpha: 0.18),
                              side: BorderSide.none,
                              labelStyle: const TextStyle(
                                color: AppColors.primary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(child: _buildBody(context, state, notifier, filtered, pantry)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(
    BuildContext context,
    PoolOrdersState state,
    PoolOrdersController notifier,
    List<AvailableOpportunity> filtered,
    List<PantryRequest> pantry,
  ) {
    if (state.isLoading && state.orders.isEmpty && pantry.isEmpty) {
      return const OhLoadingBody(message: 'جاري تحميل الطلبات...');
    }

    if (state.error != null && state.orders.isEmpty && pantry.isEmpty) {
      return OhErrorBody(
        message: apiErrorMessage(state.error!, fallback: 'تعذر تحميل سوق الطلبات.'),
        onRetry: () {
          ref.invalidate(pantryOpenRequestsProvider);
          notifier.load(refresh: true);
        },
      );
    }

    if (state.orders.isEmpty && pantry.isEmpty) {
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

    final clientFilterActive = _query.trim().isNotEmpty ||
        _filter != MarketplaceProjectFilter.all ||
        _budgetFilter != MarketplaceBudgetFilter.all;
    final showLoadMore = !clientFilterActive && state.hasMore;

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: () async {
        ref.invalidate(pantryOpenRequestsProvider);
        await notifier.load(refresh: true);
        await ref.read(pantryOpenRequestsProvider.future);
      },
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
          return _PoolOrderCard(opportunity: filtered[index]);
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
  const _PoolOrderCard({required this.opportunity});

  final AvailableOpportunity opportunity;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () {
          if (opportunity.isPantryRequest) {
            context.push(AppRoutes.freelancerPantryDetail(opportunity.id));
          } else {
            context.push(AppRoutes.poolOrderPath(opportunity.id));
          }
        },
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
                      opportunity.title,
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
                  _TypeChip(label: opportunity.projectTypeLabel, bidding: opportunity.isBidding),
                ],
              ),
              if (opportunity.categoryName != null) ...[
                const SizedBox(height: 5),
                Text(
                  opportunity.categoryName!,
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
                  if (opportunity.budgetMin != null ||
                      opportunity.budgetMax != null ||
                      opportunity.budgetValue != null)
                    _MetaPill(
                      icon: Icons.payments_outlined,
                      color: AppColors.success,
                      background: AppColors.success.withValues(alpha: 0.12),
                      child: JodOrderBudgetDisplay(
                        projectType: opportunity.projectType,
                        amount: opportunity.budgetValue,
                        bidMin: opportunity.budgetMin,
                        bidMax: opportunity.budgetMax,
                      ),
                    )
                  else if (opportunity.budgetLabel != null)
                    _MetaPill(
                      icon: Icons.payments_outlined,
                      label: opportunity.budgetLabel!,
                      color: AppColors.success,
                      background: AppColors.success.withValues(alpha: 0.12),
                    ),
                  if (opportunity.deliveryDaysLabel != null)
                    _MetaPill(
                      icon: Icons.schedule_outlined,
                      label: opportunity.deliveryDaysLabel!,
                      color: AppColors.primaryDeep,
                      background: AppColors.iconChipBg,
                    ),
                  _MetaPill(
                    icon: Icons.calendar_today_outlined,
                    label: formatOrderDate(opportunity.publishedAtLabel),
                    color: AppColors.primaryMid,
                    background: AppColors.iconChipBg,
                  ),
                  if (opportunity.applicantsCount > 0)
                    _MetaPill(
                      icon: Icons.people_outline,
                      label: opportunity.pantryRequest != null &&
                              pantryPublicBidProgressLabel(opportunity.pantryRequest!) != null
                          ? pantryPublicBidProgressLabel(opportunity.pantryRequest!)!
                          : '${opportunity.applicantsCount} متقدم',
                      color: const Color(0xFFB54708),
                      background: const Color(0xFFFFF4E5),
                    ),
                  if (opportunity.applicantsCount == 0 &&
                      opportunity.pantryRequest != null &&
                      pantryPublicBidProgressLabel(opportunity.pantryRequest!) != null)
                    _MetaPill(
                      icon: Icons.people_outline,
                      label: pantryPublicBidProgressLabel(opportunity.pantryRequest!)!,
                      color: const Color(0xFFB54708),
                      background: const Color(0xFFFFF4E5),
                    ),
                  if (opportunity.poolOrder != null &&
                      poolOrderPlanUpgradeProps(opportunity.poolOrder!) != null)
                    const _MetaPill(
                      icon: Icons.lock_outline,
                      label: 'يتطلب ترقية الباقة',
                      color: AppColors.primaryDeep,
                      background: Color(0xFFE8EEF8),
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
    this.label,
    this.child,
    required this.color,
    required this.background,
  });

  final IconData icon;
  final String? label;
  final Widget? child;
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
          child ??
              Text(
                label ?? '',
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

