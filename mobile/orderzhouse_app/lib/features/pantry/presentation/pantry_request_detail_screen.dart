import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../orders/data/order_display_helpers.dart';
import '../../orders/presentation/order_detail_widgets.dart';
import '../../currency/presentation/jod_money_display.dart';
import '../data/pantry_status.dart';
import 'pantry_controllers.dart';
import 'pantry_display.dart';
import 'pantry_sheets.dart';

class PantryRequestDetailScreen extends ConsumerWidget {
  const PantryRequestDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (!auth.isAuthenticated || auth.user?.usesFreelancerExperience != true) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: const Text('تفاصيل الطلب')),
        body: const OhEmptyBody(
          message: 'هذه الصفحة مخصصة لحسابات المستقلين.',
          icon: Icons.lock_outline,
        ),
      );
    }

    final async = ref.watch(pantryRequestDetailProvider(requestId));

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تفاصيل الطلب')),
      body: async.when(
        loading: () => const OhLoadingBody(message: 'جاري تحميل التفاصيل...'),
        error: (error, _) => OhErrorBody(
          message: apiErrorMessage(error, fallback: 'تعذر تحميل تفاصيل الطلب.'),
          onRetry: () => ref.invalidate(pantryRequestDetailProvider(requestId)),
        ),
        data: (detail) {
          final request = detail.request;
          final myBid = detail.myBid ?? request.myBid;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              OrderDetailHeroCard(
                title: request.title.trim().isEmpty ? 'طلب' : request.title,
                orderId: request.id,
                statusLabel: pantryStatusLabelAr(request.status),
                statusKey: request.status,
                projectTypeLabel: pantryPricingLabel(request),
                budgetDisplay: JodOrderBudgetDisplay(
                  projectType: (request.pricingType ?? '').toLowerCase() == 'bidding' ? 'bidding' : 'fixed',
                  amount: request.acceptedBid?.amount ?? request.myBid?.amount ?? request.fixedBudget,
                  bidMin: request.budgetMin,
                  bidMax: request.budgetMax,
                  onDark: true,
                ),
                dateLabel: formatOrderDate(request.createdAt),
                dateCaption: 'تاريخ النشر',
              ),
              const SizedBox(height: 12),
              OrderSectionCard(
                title: 'معلومات الطلب',
                icon: Icons.info_outline_rounded,
                children: [
                  OrderInfoGrid(
                    items: [
                      OrderMetaItem(
                        label: 'نوع الطلب',
                        value: pantryPricingLabel(request),
                        icon: Icons.layers_outlined,
                      ),
                      OrderMetaItem(
                        label: 'الميزانية',
                        valueWidget: JodOrderBudgetDisplay(
                          projectType: (request.pricingType ?? '').toLowerCase() == 'bidding' ? 'bidding' : 'fixed',
                          amount: request.acceptedBid?.amount ?? request.myBid?.amount ?? request.fixedBudget,
                          bidMin: request.budgetMin,
                          bidMax: request.budgetMax,
                        ),
                        icon: Icons.payments_outlined,
                      ),
                      OrderMetaItem(
                        label: 'مدة التنفيذ',
                        value: pantryDurationLabel(request),
                        icon: Icons.schedule_outlined,
                      ),
                      if (request.bidsCount != null || pantryPublicBidProgressLabel(request) != null)
                        OrderMetaItem(
                          label: 'المتقدمون',
                          value: pantryPublicBidProgressLabel(request) ?? '${request.bidsCount}',
                          icon: Icons.people_outline,
                          accent: const Color(0xFFB54708),
                        ),
                    ],
                  ),
                ],
              ),
              if (request.description.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                OrderSectionCard(
                  title: 'الوصف',
                  icon: Icons.notes_rounded,
                  children: [
                    Text(
                      request.description.trim(),
                      style: const TextStyle(color: AppColors.textInk, height: 1.75, fontSize: 14),
                      textAlign: TextAlign.right,
                    ),
                  ],
                ),
              ],
              if (request.requirements != null && request.requirements!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                OrderSectionCard(
                  title: 'المتطلبات',
                  icon: Icons.checklist_outlined,
                  children: [
                    Text(
                      request.requirements!.trim(),
                      textAlign: TextAlign.right,
                      style: const TextStyle(height: 1.6),
                    ),
                  ],
                ),
              ],
              if (myBid != null) ...[
                const SizedBox(height: 12),
                OrderSectionCard(
                  title: 'عرضك',
                  icon: Icons.gavel_outlined,
                  children: [
                    if (myBid.amount != null) JodMoneyDisplay(amount: myBid.amount),
                    if (myBid.durationDays != null)
                      Text(
                        '${myBid.durationDays} يوم',
                        textAlign: TextAlign.right,
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 18),
              if (pantryCanBid(request.status) && myBid == null)
                OhButton(
                  label: 'تقديم عرض',
                  onPressed: () async {
                    final ok = await showPantryBidSheet(context, ref, requestId: requestId);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('تم تقديم العرض بنجاح')),
                      );
                      ref.invalidate(pantryRequestDetailProvider(requestId));
                      ref.invalidate(pantryOpenRequestsProvider);
                    }
                  },
                ),
              if (pantryCanDeliver(request.status)) ...[
                const SizedBox(height: 10),
                OhButton(
                  label: 'تسليم العمل',
                  onPressed: () async {
                    final ok = await showPantryDeliverySheet(context, ref, requestId: requestId);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('تم إرسال التسليم')),
                      );
                      ref.invalidate(pantryRequestDetailProvider(requestId));
                      ref.invalidate(pantryMyWorkProvider);
                    }
                  },
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
