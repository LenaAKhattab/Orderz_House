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
import '../../../core/i18n/i18n.dart';

class PantryRequestDetailScreen extends ConsumerWidget {
  const PantryRequestDetailScreen({super.key, required this.requestId});

  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (!auth.isAuthenticated || auth.user?.usesFreelancerExperience != true) {
      return Scaffold(
        backgroundColor: AppColors.homeMobileBg,
        appBar: AppBar(title: Text(tr('تفاصيل الطلب'))),
        body: OhEmptyBody(
          message: tr('هذه الصفحة مخصصة لحسابات المستقلين.'),
          icon: Icons.lock_outline,
        ),
      );
    }

    final async = ref.watch(pantryRequestDetailProvider(requestId));

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: Text(tr('تفاصيل الطلب'))),
      body: async.when(
        loading: () => OhLoadingBody(message: tr('جاري تحميل التفاصيل...')),
        error: (error, _) => OhErrorBody(
          message: apiErrorMessage(error, fallback: tr('تعذر تحميل تفاصيل الطلب.')),
          onRetry: () => ref.invalidate(pantryRequestDetailProvider(requestId)),
        ),
        data: (detail) {
          final request = detail.request;
          final myBid = detail.myBid ?? request.myBid;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              OrderDetailHeroCard(
                title: request.title.trim().isEmpty ? tr('طلب') : request.title,
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
                dateCaption: tr('تاريخ النشر'),
              ),
              const SizedBox(height: 12),
              OrderSectionCard(
                title: tr('معلومات الطلب'),
                icon: Icons.info_outline_rounded,
                children: [
                  OrderInfoGrid(
                    items: [
                      OrderMetaItem(
                        label: tr('نوع الطلب'),
                        value: pantryPricingLabel(request),
                        icon: Icons.layers_outlined,
                      ),
                      OrderMetaItem(
                        label: tr('الميزانية'),
                        valueWidget: JodOrderBudgetDisplay(
                          projectType: (request.pricingType ?? '').toLowerCase() == 'bidding' ? 'bidding' : 'fixed',
                          amount: request.acceptedBid?.amount ?? request.myBid?.amount ?? request.fixedBudget,
                          bidMin: request.budgetMin,
                          bidMax: request.budgetMax,
                        ),
                        icon: Icons.payments_outlined,
                      ),
                      OrderMetaItem(
                        label: tr('مدة التنفيذ'),
                        value: pantryDurationLabel(request),
                        icon: Icons.schedule_outlined,
                      ),
                      if (request.bidsCount != null || pantryPublicBidProgressLabel(request) != null)
                        OrderMetaItem(
                          label: tr('المتقدمون'),
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
                  title: tr('الوصف'),
                  icon: Icons.notes_rounded,
                  children: [
                    Text(
                      request.description.trim(),
                      style: const TextStyle(color: AppColors.textInk, height: 1.75, fontSize: 14),
                      textAlign: TextAlign.start,
                    ),
                  ],
                ),
              ],
              if (request.requirements != null && request.requirements!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                OrderSectionCard(
                  title: tr('المتطلبات'),
                  icon: Icons.checklist_outlined,
                  children: [
                    Text(
                      request.requirements!.trim(),
                      textAlign: TextAlign.start,
                      style: const TextStyle(height: 1.6),
                    ),
                  ],
                ),
              ],
              if (myBid != null) ...[
                const SizedBox(height: 12),
                OrderSectionCard(
                  title: tr('عرضك'),
                  icon: Icons.gavel_outlined,
                  children: [
                    if (myBid.amount != null) JodMoneyDisplay(amount: myBid.amount),
                    if (myBid.durationDays != null)
                      Text(
                        trf('{0} يوم', [myBid.durationDays]),
                        textAlign: TextAlign.start,
                      ),
                  ],
                ),
              ],
              const SizedBox(height: 18),
              if (pantryCanBid(request.status) && myBid == null)
                OhButton(
                  label: tr('تقديم عرض'),
                  onPressed: () async {
                    final ok = await showPantryBidSheet(context, ref, requestId: requestId);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(tr('تم تقديم العرض بنجاح'))),
                      );
                      ref.invalidate(pantryRequestDetailProvider(requestId));
                      ref.invalidate(pantryOpenRequestsProvider);
                    }
                  },
                ),
              if (pantryCanDeliver(request.status)) ...[
                const SizedBox(height: 10),
                OhButton(
                  label: tr('تسليم العمل'),
                  onPressed: () async {
                    final ok = await showPantryDeliverySheet(context, ref, requestId: requestId);
                    if (ok && context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(tr('تم إرسال التسليم'))),
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
