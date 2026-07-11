import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../orders/data/order_display_helpers.dart';
import '../data/freelancer_my_order_models.dart';
import 'freelancer_eligibility_banner.dart';
import 'freelancer_my_orders_controller.dart';

class FreelancerMyOrdersScreen extends ConsumerStatefulWidget {
  const FreelancerMyOrdersScreen({super.key});

  @override
  ConsumerState<FreelancerMyOrdersScreen> createState() => _FreelancerMyOrdersScreenState();
}

class _FreelancerMyOrdersScreenState extends ConsumerState<FreelancerMyOrdersScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeLoad());
  }

  void _maybeLoad() {
    final auth = ref.read(authControllerProvider);
    if (auth.isAuthenticated && auth.user?.usesFreelancerExperience == true) {
      ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        appBar: AppBar(title: const Text('طلباتي')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                const Text(
                  'سجّل الدخول لعرض طلباتك كمستقل.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                const SizedBox(height: 16),
                OhButton(label: 'تسجيل الدخول', onPressed: () => context.push(AppRoutes.login)),
              ],
            ),
          ),
        ),
      );
    }

    if (auth.user?.usesFreelancerExperience != true) {
      return Scaffold(
        appBar: AppBar(title: const Text('طلباتي')),
        body: const OhEmptyBody(
          message: 'هذه الصفحة مخصصة لحسابات المستقلين.',
          icon: Icons.person_off_outlined,
        ),
      );
    }

    final state = ref.watch(freelancerMyOrdersControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(
        title: const Text('طلباتي'),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            onPressed: state.isLoading
                ? null
                : () => ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            const FreelancerEligibilityBanner(compact: true),
            const SizedBox(height: 12),
            if (state.isLoading && state.orders.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (state.error != null && state.orders.isEmpty)
              OhErrorBanner(message: state.error!)
            else if (state.orders.isEmpty)
              const OhEmptyBody(
                message: 'لا توجد طلبات مسندة إليك حالياً.\nتصفح السوق لاستكشاف الطلبات المتاحة.',
                icon: Icons.inbox_outlined,
              )
            else
              ...state.orders.map((order) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _FreelancerOrderCard(order: order),
                  )),
          ],
        ),
      ),
    );
  }
}

class _FreelancerOrderCard extends StatelessWidget {
  const _FreelancerOrderCard({required this.order});

  final FreelancerMyOrder order;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            order.title,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
          ),
          const SizedBox(height: 8),
          _MetaRow('الحالة', order.statusLabel),
          _MetaRow('النوع', order.projectTypeLabel),
          if (order.budgetLabel != null) _MetaRow('الميزانية', order.budgetLabel!),
          if (order.durationText != null) _MetaRow('المدة', order.durationText!),
          if (order.dueAt != null) _MetaRow('موعد التسليم', formatOrderDate(order.dueAt)),
          if (order.createdAt != null) _MetaRow('تاريخ الإنشاء', formatOrderDate(order.createdAt)),
          const SizedBox(height: 12),
          OhButton(
            label: 'التفاصيل',
            outlined: true,
            onPressed: () => context.push(AppRoutes.freelancerOrderPath(order.id)),
          ),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Text('$label: ', style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textInk),
            ),
          ),
        ],
      ),
    );
  }
}
