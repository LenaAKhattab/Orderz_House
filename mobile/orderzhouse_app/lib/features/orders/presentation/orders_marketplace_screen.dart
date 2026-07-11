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

class OrdersMarketplaceScreen extends ConsumerWidget {
  const OrdersMarketplaceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(poolOrdersControllerProvider);
    final notifier = ref.read(poolOrdersControllerProvider.notifier);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('سوق الطلبات')),
      body: _buildBody(context, state, notifier),
    );
  }

  Widget _buildBody(
    BuildContext context,
    PoolOrdersState state,
    PoolOrdersController notifier,
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

    return RefreshIndicator(
      onRefresh: () => notifier.load(refresh: true),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: state.orders.length + (state.hasMore ? 1 : 0),
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          if (index >= state.orders.length) {
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
          final order = state.orders[index];
          return _PoolOrderCard(order: order);
        },
      ),
    );
  }
}

class _PoolOrderCard extends StatelessWidget {
  const _PoolOrderCard({required this.order});

  final PoolOrder order;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      onTap: () => context.push(AppRoutes.poolOrderPath(order.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  order.title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: AppColors.textInk,
                  ),
                ),
              ),
              _Chip(label: order.projectTypeLabel),
            ],
          ),
          if (order.category?.name != null) ...[
            const SizedBox(height: 8),
            Text(
              order.category!.name!,
              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w600),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Meta(icon: Icons.flag_outlined, label: order.statusLabel),
              if (order.budgetLabel != null)
                _Meta(icon: Icons.payments_outlined, label: order.budgetLabel!),
              _Meta(icon: Icons.calendar_today_outlined, label: formatOrderDate(order.publishedAtLabel)),
              if (order.applicantsCount > 0)
                _Meta(icon: Icons.people_outline, label: '${order.applicantsCount} متقدم'),
            ],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.secondary.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: AppColors.primary,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppColors.textMuted),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
      ],
    );
  }
}
