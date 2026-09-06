import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../orders/data/order_display_helpers.dart';
import '../../pantry/data/pantry_models.dart';
import '../../pantry/data/pantry_status.dart';
import '../../pantry/presentation/pantry_controllers.dart';
import '../../pantry/presentation/pantry_display.dart';
import 'freelancer_eligibility_banner.dart';
import 'freelancer_my_orders_controller.dart';
import '../../currency/presentation/jod_money_display.dart';

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
    final pantryWork = ref.watch(pantryMyWorkProvider).maybeWhen(
          data: (items) => items
              .where((r) => (r.assignedFreelancerId ?? '').trim().isNotEmpty)
              .toList(),
          orElse: () => const <PantryRequest>[],
        );
    final hasAny = state.orders.isNotEmpty || pantryWork.isNotEmpty;

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(
        title: const Text('طلباتي'),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            onPressed: state.isLoading
                ? null
                : () {
                    ref.invalidate(pantryMyWorkProvider);
                    ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true);
                  },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(pantryMyWorkProvider);
          await ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true);
          await ref.read(pantryMyWorkProvider.future);
        },
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
            else if (state.error != null && state.orders.isEmpty && pantryWork.isEmpty)
              OhErrorBanner(message: state.error!)
            else if (!hasAny)
              const OhEmptyBody(
                message: 'لا توجد طلبات مسندة إليك حالياً.\nتصفح السوق لاستكشاف الطلبات المتاحة.',
                icon: Icons.inbox_outlined,
              )
            else ...[
              ...pantryWork.map(
                (request) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ListedWorkCard(
                    title: request.title.trim().isEmpty ? 'طلب' : request.title,
                    statusLabel: pantryStatusLabelAr(request.status),
                    typeLabel: pantryPricingLabel(request),
                    budgetWidget: JodOrderBudgetDisplay(
                      projectType: (request.pricingType ?? '').toLowerCase() == 'bidding' ? 'bidding' : 'fixed',
                      amount: request.acceptedBid?.amount ?? request.myBid?.amount ?? request.fixedBudget,
                      bidMin: request.budgetMin,
                      bidMax: request.budgetMax,
                    ),
                    durationLabel: pantryDurationLabel(request),
                    dateLabel: formatOrderDate(request.updatedAt ?? request.createdAt),
                    onDetails: () => context.push(AppRoutes.freelancerPantryDetail(request.id)),
                  ),
                ),
              ),
              ...state.orders.map(
                (order) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _ListedWorkCard(
                    title: order.title,
                    statusLabel: order.statusLabel,
                    typeLabel: order.projectTypeLabel,
                    budgetWidget: JodOrderBudgetDisplay(
                      projectType: order.projectType,
                      amount: order.budget ?? order.paymentAmount,
                      bidMin: order.bidBudgetMin,
                      bidMax: order.bidBudgetMax,
                    ),
                    durationLabel: order.durationText,
                    dateLabel: order.createdAt != null ? formatOrderDate(order.createdAt) : null,
                    dueLabel: order.dueAt != null ? formatOrderDate(order.dueAt) : null,
                    onDetails: () => context.push(AppRoutes.freelancerOrderPath(order.id)),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ListedWorkCard extends StatelessWidget {
  const _ListedWorkCard({
    required this.title,
    required this.statusLabel,
    required this.typeLabel,
    required this.onDetails,
    this.budgetWidget,
    this.durationLabel,
    this.dateLabel,
    this.dueLabel,
  });

  final String title;
  final String statusLabel;
  final String typeLabel;
  final Widget? budgetWidget;
  final String? durationLabel;
  final String? dateLabel;
  final String? dueLabel;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) {
    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
          ),
          const SizedBox(height: 8),
          _MetaRow('الحالة', statusLabel),
          _MetaRow('النوع', typeLabel),
          if (budgetWidget != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  const Text('الميزانية', style: TextStyle(color: AppColors.textMuted, fontSize: 13)),
                  const SizedBox(width: 12),
                  Expanded(child: Align(alignment: Alignment.centerLeft, child: budgetWidget)),
                ],
              ),
            ),
          if (durationLabel != null && durationLabel != '—') _MetaRow('المدة', durationLabel!),
          if (dueLabel != null) _MetaRow('موعد التسليم', dueLabel!),
          if (dateLabel != null) _MetaRow('تاريخ الإنشاء', dateLabel!),
          const SizedBox(height: 12),
          OhButton(
            label: 'التفاصيل',
            outlined: true,
            onPressed: onDetails,
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
