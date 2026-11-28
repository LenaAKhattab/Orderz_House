import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../freelancer/account_activation/data/account_activation_kyc_models.dart';
import '../../freelancer/data/freelancer_eligibility_models.dart';
import '../../freelancer/data/plan_upgrade_cta.dart';
import '../../freelancer/data/pool_order_participation_helpers.dart';
import '../../freelancer/presentation/freelancer_eligibility_provider.dart';
import '../../freelancer/presentation/freelancer_my_orders_controller.dart';
import '../../freelancer/presentation/freelancer_pool_actions_controller.dart';
import '../../freelancer/presentation/plan_upgrade_required_cta.dart';
import '../../freelancer/presentation/submit_pool_bid_sheet.dart';
import '../data/pool_order_models.dart';
import '../../currency/presentation/jod_money_display.dart';
import 'order_detail_widgets.dart';
import 'pool_order_detail_provider.dart';
import '../../../core/i18n/i18n.dart';

class PoolOrderDetailScreen extends ConsumerWidget {
  const PoolOrderDetailScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncOrder = ref.watch(poolOrderDetailProvider(orderId));
    final auth = ref.watch(authControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: Text(tr('تفاصيل الطلب'))),
      body: asyncOrder.when(
        loading: () => OhLoadingBody(message: tr('جاري تحميل التفاصيل...')),
        error: (error, _) => OhErrorBody(
          message: apiErrorMessage(error, fallback: tr('تعذر تحميل تفاصيل الطلب.')),
          onRetry: () => ref.invalidate(poolOrderDetailProvider(orderId)),
        ),
        data: (order) => _PoolOrderDetailBody(
          orderId: orderId,
          order: order,
          auth: auth,
        ),
      ),
    );
  }
}

class _PoolOrderDetailBody extends ConsumerWidget {
  const _PoolOrderDetailBody({
    required this.orderId,
    required this.order,
    required this.auth,
  });

  final String orderId;
  final PoolOrder order;
  final AuthState auth;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final participationLabel = poolParticipationStatusLabelAr(order);

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            children: [
              OrderDetailHeroCard(
                title: order.title,
                orderId: order.id,
                statusLabel: order.statusLabel,
                statusKey: order.orderStatus,
                projectTypeLabel: order.projectTypeLabel,
                budgetDisplay: JodOrderBudgetDisplay(
                  projectType: order.projectType,
                  amount: order.budget,
                  bidMin: order.bidBudgetMin,
                  bidMax: order.bidBudgetMax,
                  onDark: true,
                ),
                dateLabel: formatOrderDateLabel(order.publishedAtLabel),
                dateCaption: tr('تاريخ النشر'),
              ),
              const SizedBox(height: 12),
              OrderSectionCard(
                title: tr('معلومات الطلب'),
                icon: Icons.info_outline_rounded,
                children: [
                  OrderInfoGrid(
                    items: [
                      if (order.category?.name != null)
                        OrderMetaItem(
                          label: tr('التصنيف'),
                          value: order.category!.name!,
                          icon: Icons.category_outlined,
                        ),
                      OrderMetaItem(
                        label: tr('نوع الطلب'),
                        value: order.projectTypeLabel,
                        icon: Icons.layers_outlined,
                      ),
                      if (order.durationText != null)
                        OrderMetaItem(
                          label: tr('المدة'),
                          value: order.durationText!,
                          icon: Icons.schedule_outlined,
                        ),
                      if (order.dueAt != null)
                        OrderMetaItem(
                          label: tr('موعد التسليم'),
                          value: formatOrderDateLabel(order.dueAt),
                          icon: Icons.event_outlined,
                        ),
                      if (order.applicantsCount > 0)
                        OrderMetaItem(
                          label: tr('المتقدمون'),
                          value: '${order.applicantsCount}',
                          icon: Icons.people_outline,
                          accent: const Color(0xFFB54708),
                        ),
                      if (order.filesCount > 0)
                        OrderMetaItem(
                          label: tr('المرفقات'),
                          value: trf('{0} ملف', [order.filesCount]),
                          icon: Icons.attach_file,
                        ),
                      if (order.hasAssignedFreelancer)
                        OrderMetaItem(
                          label: tr('التنفيذ'),
                          value: tr('تم تعيين مستقل'),
                          icon: Icons.person_outline,
                        ),
                    ],
                  ),
                ],
              ),
              if (order.description != null && order.description!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                OrderSectionCard(
                  title: tr('الوصف'),
                  icon: Icons.notes_rounded,
                  children: [
                    Text(
                      order.description!.trim(),
                      style: const TextStyle(color: AppColors.textInk, height: 1.75, fontSize: 14),
                      textAlign: TextAlign.start,
                    ),
                  ],
                ),
              ],
              if (participationLabel != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppColors.secondary.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.secondary.withValues(alpha: 0.5)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.check_circle_outline, color: AppColors.primary),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          participationLabel,
                          style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.textInk, height: 1.4),
                          textAlign: TextAlign.start,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
        Material(
          color: Colors.white,
          elevation: 10,
          shadowColor: AppColors.primary.withValues(alpha: 0.18),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              child: _PoolOrderActions(orderId: orderId, order: order, auth: auth),
            ),
          ),
        ),
      ],
    );
  }
}

class _PoolOrderActions extends ConsumerStatefulWidget {
  const _PoolOrderActions({
    required this.orderId,
    required this.order,
    required this.auth,
  });

  final String orderId;
  final PoolOrder order;
  final AuthState auth;

  @override
  ConsumerState<_PoolOrderActions> createState() => _PoolOrderActionsState();
}

class _PoolOrderActionsState extends ConsumerState<_PoolOrderActions> {
  Future<void> _confirmAndTake() async {
    final eligibility = await ref.read(freelancerEligibilityProvider.future);
    if (!mounted) return;
    if (eligibility != null && !eligibility.eligible) {
      _showSnack(freelancerEligibilityMessageAr(eligibility), isError: true);
      return;
    }
    if (isPoolOrderLockedByPlan(widget.order)) {
      _showSnack(poolPlanLockUserMessage(widget.order), isError: true);
      return;
    }

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(tr('استلام الطلب')),
        content: Text(tr('هل تريد استلام هذا الطلب؟')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(tr('إلغاء'))),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(tr('تأكيد'))),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      final controller = ref.read(freelancerPoolActionsControllerProvider(widget.orderId).notifier);
      final updated = await controller.takeOrder();
      if (!mounted || updated == null) return;

      ref.invalidate(poolOrderDetailProvider(widget.orderId));
      ref.read(freelancerMyOrdersControllerProvider.notifier).load(refresh: true);

      final outcome = controller.classifyTakeOutcome(updated);
      if (outcome == TakeOrderOutcome.assigned) {
        _showSnack(tr('تم استلام الطلب بنجاح.'));
        context.go(AppRoutes.myOrders);
        return;
      }
      _showSnack(tr('تم تسجيل مشاركتك في الطلب.'));
    } catch (e) {
      if (!mounted) return;
      _showSnack(apiErrorMessage(e, fallback: tr('تعذر استلام الطلب.')), isError: true);
    }
  }

  Future<void> _openBidSheet() async {
    final eligibility = await ref.read(freelancerEligibilityProvider.future);
    if (!mounted) return;
    if (eligibility != null && !eligibility.eligible) {
      _showSnack(freelancerEligibilityMessageAr(eligibility), isError: true);
      return;
    }
    if (isPoolOrderLockedByPlan(widget.order)) {
      _showSnack(poolPlanLockUserMessage(widget.order), isError: true);
      return;
    }

    final actionsState = ref.read(freelancerPoolActionsControllerProvider(widget.orderId));
    final payload = await showSubmitPoolBidSheet(
      context,
      order: widget.order,
      isSubmitting: actionsState.isSubmittingBid,
    );
    if (payload == null || !mounted) return;

    try {
      await ref.read(freelancerPoolActionsControllerProvider(widget.orderId).notifier).submitBid(payload);
      if (!mounted) return;
      ref.invalidate(poolOrderDetailProvider(widget.orderId));
      _showSnack(tr('تم إرسال عرضك بنجاح.'));
    } catch (e) {
      if (!mounted) return;
      _showSnack(apiErrorMessage(e, fallback: tr('تعذر إرسال العرض.')), isError: true);
    }
  }

  void _showSnack(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? AppColors.error : null,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.auth;
    final order = widget.order;

    if (!auth.isAuthenticated) {
      return OrderPlaceholderAction(
        label: tr('سجّل الدخول للمتابعة'),
        onPressed: () => context.push(AppRoutes.login),
      );
    }

    if (auth.user?.usesClientExperience == true) {
      return OrderDisabledAction(label: tr('يمكنك استعراض الطلب فقط'));
    }

    if (auth.user?.usesFreelancerExperience != true) {
      return OrderDisabledAction(label: tr('هذه الميزة للمستقلين فقط'));
    }

    final eligibilityAsync = ref.watch(freelancerEligibilityProvider);
    final actionsState = ref.watch(freelancerPoolActionsControllerProvider(widget.orderId));
    final participationLabel = poolParticipationStatusLabelAr(order);
    final canAct = poolFreelancerCanTakeOrBid(order);

    return eligibilityAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, stackTrace) => _buildFreelancerButtons(
        order: order,
        actionsState: actionsState,
        canAct: canAct,
        participationLabel: participationLabel,
        blockMessage: null,
      ),
      data: (eligibility) {
        String? blockMessage;
        PlanUpgradeCtaProps? planUpgrade;
        final needsKyc = eligibility != null &&
            !eligibility.eligible &&
            freelancerEligibilityNeedsAccountActivation(eligibility);
        final eligibilityForCta = eligibility;

        if (eligibility != null && !eligibility.eligible) {
          blockMessage = freelancerEligibilityMessageAr(eligibility);
        } else if (isPoolOrderLockedByPlan(order)) {
          planUpgrade = poolOrderPlanUpgradeProps(order);
          if (planUpgrade?.mode == PlanUpgradeCtaMode.support) {
            blockMessage = poolPlanLockUserMessage(order);
            planUpgrade = null;
          }
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (blockMessage != null) ...[
              Text(
                blockMessage,
                style: const TextStyle(color: AppColors.error, height: 1.5, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 10),
            ],
            if (needsKyc && eligibilityForCta != null) ...[
              OhButton(
                label: freelancerEligibilityLooksRejected(eligibilityForCta)
                    ? accountActivationKycResubmitCtaAr
                    : accountActivationKycCompleteCtaAr,
                onPressed: () => context.push(AppRoutes.freelancerAccountActivation),
              ),
              const SizedBox(height: 10),
            ],
            if (planUpgrade != null) ...[
              PlanUpgradeRequiredCta(
                requiredTierCode: planUpgrade.requiredTierCode,
                requiredPlanLabel: planUpgrade.requiredPlanLabel,
                reason: planUpgrade.reason,
              ),
              const SizedBox(height: 10),
            ],
            _buildFreelancerButtons(
              order: order,
              actionsState: actionsState,
              canAct: canAct && blockMessage == null && planUpgrade == null && !needsKyc,
              participationLabel: participationLabel,
              blockMessage: blockMessage,
            ),
          ],
        );
      },
    );
  }

  Widget _buildFreelancerButtons({
    required PoolOrder order,
    required FreelancerPoolActionsState actionsState,
    required bool canAct,
    required String? participationLabel,
    required String? blockMessage,
  }) {
    if (participationLabel != null) {
      return OrderDisabledAction(label: participationLabel);
    }

    final isBidding = order.projectType == 'bidding';
    if (isBidding) {
      return OhButton(
        label: actionsState.isSubmittingBid ? tr('جارٍ الإرسال...') : tr('تقديم عرض'),
        isLoading: actionsState.isSubmittingBid,
        onPressed: !canAct || actionsState.isBusy ? null : _openBidSheet,
      );
    }

    return OhButton(
      label: actionsState.isTaking ? tr('جارٍ الاستلام...') : tr('استلام الطلب'),
      isLoading: actionsState.isTaking,
      onPressed: !canAct || actionsState.isBusy ? null : _confirmAndTake,
    );
  }
}
