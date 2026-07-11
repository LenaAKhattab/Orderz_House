import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/utils/freelancer_plans_web_launcher.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../orders/data/order_display_helpers.dart';
import '../data/freelancer_plans_models.dart';
import 'freelancer_eligibility_provider.dart';
import 'freelancer_plans_controller.dart';

class FreelancerPlansScreen extends ConsumerStatefulWidget {
  const FreelancerPlansScreen({super.key});

  @override
  ConsumerState<FreelancerPlansScreen> createState() => _FreelancerPlansScreenState();
}

class _FreelancerPlansScreenState extends ConsumerState<FreelancerPlansScreen> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      _refreshSubscriptionState(showSnackBar: false);
    }
  }

  Future<void> _openFreelancerPlansOnWeb() async {
    final result = await launchFreelancerPlansOnWeb();
    if (!mounted) return;
    if (!result.launched) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تعذر فتح صفحة الاشتراك في المتصفح.'),
          backgroundColor: AppColors.error,
        ),
      );
    }
  }

  void _refreshSubscriptionState({bool showSnackBar = true}) {
    ref.invalidate(freelancerPlansControllerProvider);
    ref.invalidate(freelancerEligibilityProvider);
    if (showSnackBar && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم تحديث حالة الاشتراك')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final snapshotAsync = ref.watch(freelancerPlansControllerProvider);

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('باقات المستقل')),
      body: snapshotAsync.when(
        loading: () => const OhLoadingBody(message: 'جارٍ تحميل الباقات...'),
        error: (error, _) => OhErrorBody(
          message: 'تعذر تحميل الباقات. حاول مرة أخرى.',
          onRetry: () => _refreshSubscriptionState(showSnackBar: false),
        ),
        data: (snapshot) => _FreelancerPlansBody(
          snapshot: snapshot,
          onOpenWeb: _openFreelancerPlansOnWeb,
          onRefresh: () => _refreshSubscriptionState(),
        ),
      ),
    );
  }
}

class _FreelancerPlansBody extends StatelessWidget {
  const _FreelancerPlansBody({
    required this.snapshot,
    required this.onOpenWeb,
    required this.onRefresh,
  });

  final FreelancerPlansSnapshot snapshot;
  final VoidCallback onOpenWeb;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    if (snapshot.plans.isEmpty) {
      return const OhEmptyBody(
        message: 'لا توجد باقات متاحة حالياً.',
        icon: Icons.card_membership_outlined,
      );
    }

    final currentPlan = findPlanForSubscription(snapshot.plans, snapshot.subscription);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        const _WebSubscriptionNotice(),
        const SizedBox(height: 12),
        OhButton(
          label: 'تحديث حالة الاشتراك',
          outlined: true,
          onPressed: onRefresh,
        ),
        const SizedBox(height: 16),
        if (snapshot.subscription != null || snapshot.eligibility != null)
          _SubscriptionStatusCard(
            snapshot: snapshot,
            currentPlan: currentPlan,
          ),
        if (snapshot.subscription != null || snapshot.eligibility != null) const SizedBox(height: 16),
        const Text(
          'الباقات المتاحة',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: 18,
            color: AppColors.textInk,
          ),
          textAlign: TextAlign.right,
        ),
        const SizedBox(height: 10),
        ...snapshot.plans.map(
          (plan) {
            final isCurrent = isCurrentPlanForSubscription(plan, snapshot.subscription);
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _PlanCard(
                plan: plan,
                isCurrent: isCurrent,
                showWebButton: shouldShowWebSubscriptionButton(
                  plan: plan,
                  isCurrentPlan: isCurrent,
                  subscription: snapshot.subscription,
                  activationFeeStatus: snapshot.activationFeeStatus,
                ),
                onOpenWeb: onOpenWeb,
              ),
            );
          },
        ),
      ],
    );
  }
}

class _WebSubscriptionNotice extends StatelessWidget {
  const _WebSubscriptionNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.primary.withValues(alpha: 0.2)),
      ),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.open_in_browser, color: AppColors.primary, size: 20),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              freelancerWebSubscriptionNoticeAr,
              style: TextStyle(
                color: AppColors.textInk,
                height: 1.55,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }
}

class _SubscriptionStatusCard extends StatelessWidget {
  const _SubscriptionStatusCard({
    required this.snapshot,
    required this.currentPlan,
  });

  final FreelancerPlansSnapshot snapshot;
  final PublicPlan? currentPlan;

  @override
  Widget build(BuildContext context) {
    final subscription = snapshot.subscription;
    final activationFee = snapshot.activationFeeStatus;
    final eligibility = snapshot.eligibility;
    final rangeLabel = formatPlanOrderValueRangeLabel(
      minJod: currentPlan?.orderValueMinJod,
      maxJod: currentPlan?.orderValueMaxJod,
    );

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'اشتراكك الحالي',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: AppColors.textInk),
            textAlign: TextAlign.right,
          ),
          const SizedBox(height: 12),
          if (subscription != null) ...[
            _StatusRow(
              label: 'الباقة',
              value: subscription.displayPlanTitle,
              emphasized: true,
            ),
            _StatusRow(
              label: 'حالة الاشتراك',
              value: freelancerSubscriptionStatusLabelAr(subscription.status),
            ),
            if (subscription.expiryDate != null)
              _StatusRow(
                label: 'تاريخ الانتهاء',
                value: formatOrderDate(subscription.expiryDate),
              ),
            _StatusRow(
              label: 'تفعيل الشركة',
              value: freelancerActivationStatusLabelAr(subscription.activationStatus),
            ),
          ] else
            const _StatusRow(label: 'الباقة', value: 'لا يوجد اشتراك حالياً'),
          if (activationFee != null) ...[
            _StatusRow(
              label: 'رسوم التفعيل',
              value: freelancerActivationFeeStatusLabelAr(activationFee),
            ),
            if (activationFee.validUntil != null && activationFee.isCurrent)
              _StatusRow(
                label: 'صلاحية رسوم التفعيل',
                value: formatOrderDate(activationFee.validUntil),
              ),
          ],
          if (rangeLabel != null) _StatusRow(label: 'حدود الباقة', value: rangeLabel),
          if (eligibility != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: eligibility.eligible
                    ? AppColors.secondary.withValues(alpha: 0.12)
                    : AppColors.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: eligibility.eligible
                      ? AppColors.secondary.withValues(alpha: 0.35)
                      : AppColors.error.withValues(alpha: 0.25),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(
                    eligibility.eligible ? Icons.verified_outlined : Icons.info_outline,
                    color: eligibility.eligible ? AppColors.primary : AppColors.error,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      freelancerPlansEligibilityHeadlineAr(eligibility),
                      style: const TextStyle(
                        color: AppColors.textInk,
                        fontWeight: FontWeight.w600,
                        height: 1.5,
                        fontSize: 13,
                      ),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusRow extends StatelessWidget {
  const _StatusRow({
    required this.label,
    required this.value,
    this.emphasized = false,
  });

  final String label;
  final String value;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                color: AppColors.textInk,
                fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
                height: 1.4,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            label,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.plan,
    required this.isCurrent,
    required this.showWebButton,
    required this.onOpenWeb,
  });

  final PublicPlan plan;
  final bool isCurrent;
  final bool showWebButton;
  final VoidCallback onOpenWeb;

  @override
  Widget build(BuildContext context) {
    final priceLabel = formatPlanPriceLabel(plan);
    final durationLabel = formatPlanDurationLabel(plan);
    final rangeLabel = formatPlanOrderValueRangeLabel(
      minJod: plan.orderValueMinJod,
      maxJod: plan.orderValueMaxJod,
    );
    final previewFeatures = plan.features.take(5).toList();

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  plan.displayTitle,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                    color: AppColors.textInk,
                    height: 1.35,
                  ),
                  textAlign: TextAlign.right,
                ),
              ),
              if (isCurrent) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.secondary.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'باقتك الحالية',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ] else if (plan.isPopular || plan.isFeatured) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    plan.isPopular ? 'الأكثر شيوعاً' : 'مميزة',
                    style: const TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (priceLabel != null) ...[
            const SizedBox(height: 8),
            Text(
              priceLabel,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 20,
                color: AppColors.primary,
              ),
              textAlign: TextAlign.right,
            ),
          ],
          if (durationLabel != null)
            _PlanMetaLine(label: 'المدة', value: durationLabel),
          if (rangeLabel != null) _PlanMetaLine(label: 'حدود الطلب', value: rangeLabel),
          if (previewFeatures.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text(
              'المميزات',
              style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.textInk),
              textAlign: TextAlign.right,
            ),
            const SizedBox(height: 6),
            ...previewFeatures.map(
              (feature) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        feature,
                        style: const TextStyle(color: AppColors.textInk, height: 1.45, fontSize: 13),
                        textAlign: TextAlign.right,
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.check_circle_outline, size: 16, color: AppColors.secondary),
                  ],
                ),
              ),
            ),
            if (plan.features.length > previewFeatures.length)
              Text(
                '+${plan.features.length - previewFeatures.length} ميزة أخرى',
                style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                textAlign: TextAlign.right,
              ),
          ],
          if (showWebButton) ...[
            const SizedBox(height: 12),
            OhButton(
              label: 'إكمال الاشتراك عبر الموقع',
              onPressed: onOpenWeb,
            ),
          ] else if (isCurrent) ...[
            const SizedBox(height: 12),
            const Text(
              'هذه باقتك الحالية — استخدم الموقع فقط عند الحاجة للترقية أو رسوم التفعيل.',
              style: TextStyle(color: AppColors.textMuted, height: 1.5, fontSize: 12),
              textAlign: TextAlign.right,
            ),
          ],
        ],
      ),
    );
  }
}

class _PlanMetaLine extends StatelessWidget {
  const _PlanMetaLine({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Text(
        '$label: $value',
        style: const TextStyle(color: AppColors.textMuted, height: 1.4, fontSize: 13),
        textAlign: TextAlign.right,
      ),
    );
  }
}
