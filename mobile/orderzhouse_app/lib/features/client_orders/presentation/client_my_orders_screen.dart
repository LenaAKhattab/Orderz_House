import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/client_order_models.dart';
import '../../orders/data/order_display_helpers.dart' as display;
import '../../currency/presentation/jod_money_display.dart';
import 'client_orders_controller.dart';

bool _isClientRole(AuthState auth) => auth.user?.usesClientExperience == true;

class ClientMyOrdersScreen extends ConsumerStatefulWidget {
  const ClientMyOrdersScreen({super.key});

  @override
  ConsumerState<ClientMyOrdersScreen> createState() => _ClientMyOrdersScreenState();
}

class _ClientMyOrdersScreenState extends ConsumerState<ClientMyOrdersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoad());
  }

  void _maybeLoad() {
    final auth = ref.read(authControllerProvider);
    if (auth.isAuthenticated && _isClientRole(auth)) {
      ref.read(clientOrdersControllerProvider.notifier).load(refresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    final isClient = _isClientRole(auth);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(
        title: const Text('طلباتي'),
        actions: [
          if (isClient)
            IconButton(
              tooltip: 'إنشاء طلب',
              icon: const Icon(Icons.add_circle_outline),
              onPressed: () => context.push(AppRoutes.clientCreateOrder),
            ),
        ],
      ),
      floatingActionButton: isClient
          ? FloatingActionButton.extended(
              onPressed: () => context.push(AppRoutes.clientCreateOrder),
              icon: const Icon(Icons.add),
              label: const Text('إنشاء طلب'),
            )
          : null,
      body: _buildBody(context, auth),
    );
  }

  Widget _buildBody(BuildContext context, AuthState auth) {
    if (!auth.isAuthenticated) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_outline, size: 48, color: AppColors.textMuted),
              const SizedBox(height: 12),
              const Text(
                'سجّل الدخول لعرض طلباتك.',
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
      );
    }

    if (!_isClientRole(auth)) {
      return const OhEmptyBody(
        message: 'هذه الصفحة مخصصة لحسابات العملاء فقط.',
        icon: Icons.person_off_outlined,
      );
    }

    final state = ref.watch(clientOrdersControllerProvider);
    final notifier = ref.read(clientOrdersControllerProvider.notifier);

    if (state.isLoading && state.orders.isEmpty) {
      return const OhLoadingBody(message: 'جاري تحميل طلباتك...');
    }

    if (state.error != null && state.orders.isEmpty) {
      return OhErrorBody(
        message: state.error!,
        onRetry: () => notifier.load(refresh: true),
      );
    }

    if (state.orders.isEmpty) {
      return RefreshIndicator(
        onRefresh: () => notifier.load(refresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 80),
            const OhEmptyBody(
              message: 'لا توجد طلبات بعد.',
              icon: Icons.receipt_long_outlined,
            ),
            const SizedBox(height: 20),
            OhButton(
              label: 'إنشاء طلب جديد',
              onPressed: () => context.push(AppRoutes.clientCreateOrder),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => notifier.load(refresh: true),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        itemCount: state.orders.length,
        separatorBuilder: (context, index) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          return _ClientOrderCard(order: state.orders[index]);
        },
      ),
    );
  }
}

class _ClientOrderCard extends StatelessWidget {
  const _ClientOrderCard({required this.order});

  final ClientOrder order;

  Color get _chipBg {
    if (order.needsPayment) return const Color(0xFFFFF4E5);
    if (order.requiresAdminReview) return AppColors.secondary.withValues(alpha: 0.18);
    return AppColors.secondary.withValues(alpha: 0.18);
  }

  Color get _chipFg {
    if (order.needsPayment) return const Color(0xFFB45309);
    return AppColors.primary;
  }

  @override
  Widget build(BuildContext context) {
    return OhCard(
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
              _StatusChip(label: order.statusLabel, background: _chipBg, foreground: _chipFg),
            ],
          ),
          if (order.statusHintAr != null) ...[
            const SizedBox(height: 8),
            Text(
              order.statusHintAr!,
              style: const TextStyle(color: AppColors.textMuted, height: 1.45, fontSize: 13),
            ),
          ],
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Meta(icon: Icons.layers_outlined, label: order.projectTypeLabel),
              if (order.budget != null || order.bidBudgetMin != null)
                _Meta(
                  icon: Icons.payments_outlined,
                  child: JodOrderBudgetDisplay(
                    projectType: order.projectType,
                    amount: order.budget,
                    bidMin: order.bidBudgetMin,
                    bidMax: order.bidBudgetMax,
                  ),
                )
              else if (order.budgetLabel != null)
                _Meta(icon: Icons.payments_outlined, label: order.budgetLabel!),
              _Meta(
                icon: Icons.calendar_today_outlined,
                label: display.formatOrderDate(order.createdAt),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (order.canPayNow) ...[
            OhButton(
              label: 'ادفع الآن',
              onPressed: () => context.push(AppRoutes.clientOrderPath(order.id)),
            ),
            const SizedBox(height: 8),
            OhButton(
              label: 'التفاصيل',
              outlined: true,
              onPressed: () => context.push(AppRoutes.clientOrderPath(order.id)),
            ),
          ] else
            OhButton(
              label: 'التفاصيل',
              outlined: true,
              onPressed: () => context.push(AppRoutes.clientOrderPath(order.id)),
            ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, this.label, this.child});

  final IconData icon;
  final String? label;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: AppColors.textMuted),
        const SizedBox(width: 4),
        child ??
            Text(label ?? '', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
      ],
    );
  }
}
