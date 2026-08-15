import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../orders/data/order_display_helpers.dart';
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
        appBar: AppBar(title: const Text('بيت المونة')),
        body: const OhEmptyBody(
          message: 'بيت المونة متاح للمستقلين المسجّلين فقط.',
          icon: Icons.lock_outline,
        ),
      );
    }

    final async = ref.watch(pantryRequestDetailProvider(requestId));

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تفاصيل طلب بيت المونة')),
      body: async.when(
        loading: () => const OhLoadingBody(message: 'جارٍ تحميل التفاصيل...'),
        error: (error, _) => OhErrorBody(
          message: apiErrorMessage(error, fallback: 'تعذر تحميل التفاصيل.'),
          onRetry: () => ref.invalidate(pantryRequestDetailProvider(requestId)),
        ),
        data: (detail) {
          final request = detail.request;
          final myBid = detail.myBid ?? request.myBid;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              Text(
                request.title.trim().isEmpty ? 'طلب بيت المونة' : request.title,
                textAlign: TextAlign.right,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                  color: AppColors.primaryDeep,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                pantryStatusLabelAr(request.status),
                textAlign: TextAlign.right,
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary),
              ),
              const SizedBox(height: 14),
              if (request.description.trim().isNotEmpty)
                Text(request.description, textAlign: TextAlign.right, style: const TextStyle(height: 1.5)),
              const SizedBox(height: 16),
              OhCard(
                child: Column(
                  children: [
                    _row('نوع التسعير', pantryPricingLabel(request)),
                    _row('الميزانية', pantryBudgetLabel(request)),
                    _row('مدة التنفيذ', pantryDurationLabel(request)),
                    if (request.bidsCount != null) _row('عدد العروض', '${request.bidsCount}'),
                    _row('تاريخ الإنشاء', formatOrderDate(request.createdAt)),
                  ],
                ),
              ),
              if (request.requirements != null && request.requirements!.trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                OhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('المتطلبات', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Text(request.requirements!, textAlign: TextAlign.right),
                    ],
                  ),
                ),
              ],
              if (request.skills.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  alignment: WrapAlignment.end,
                  children: [for (final skill in request.skills) Chip(label: Text(skill))],
                ),
              ],
              if (myBid != null) ...[
                const SizedBox(height: 12),
                OhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('عرضك', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      _row('المبلغ', myBid.amount != null ? '${myBid.amount} د.أ' : '—'),
                      _row('المدة', myBid.durationDays != null ? '${myBid.durationDays} يوم' : '—'),
                      _row('حالة العرض', myBid.status ?? '—'),
                    ],
                  ),
                ),
              ],
              if (detail.delivery != null || request.delivery != null) ...[
                const SizedBox(height: 12),
                OhCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('التسليم', textAlign: TextAlign.right, style: TextStyle(fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Text((detail.delivery ?? request.delivery)?.message ?? '—', textAlign: TextAlign.right),
                      if ((detail.delivery ?? request.delivery)?.adminFeedback != null)
                        Text(
                          'ملاحظة الفريق: ${(detail.delivery ?? request.delivery)!.adminFeedback}',
                          textAlign: TextAlign.right,
                        ),
                    ],
                  ),
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

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(child: Text(value, textAlign: TextAlign.left, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text(label, style: const TextStyle(color: AppColors.textMuted)),
        ],
      ),
    );
  }
}
