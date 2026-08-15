import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/pantry_repository.dart';

String pantryBidErrorMessage(Object error) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    final data = error.response?.data;
    String? code;
    if (data is Map) {
      code = data['code']?.toString();
    }
    if (status == 409 && code == 'INVALID_STATUS') {
      return 'الطلب لم يعد مفتوحًا للعروض';
    }
    if (status == 409) {
      return apiErrorMessage(error, fallback: 'لا يمكن تقديم العرض');
    }
  }
  return apiErrorMessage(error, fallback: 'حدث خطأ، حاول مجددًا');
}

Future<bool> showPantryBidSheet(BuildContext context, WidgetRef ref, {required String requestId}) async {
  final amountController = TextEditingController();
  final daysController = TextEditingController();
  final messageController = TextEditingController();
  String? error;
  var submitting = false;
  var submitted = false;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: StatefulBuilder(
          builder: (context, setSheetState) {
            Future<void> submit() async {
              final amount = double.tryParse(amountController.text.trim().replaceAll(',', '.'));
              final days = int.tryParse(daysController.text.trim());
              final message = messageController.text.trim();
              if (amount == null || amount < 0) {
                setSheetState(() => error = 'أدخل مبلغاً صالحاً.');
                return;
              }
              if (days == null || days <= 0) {
                setSheetState(() => error = 'أدخل مدة التنفيذ بالأيام.');
                return;
              }
              if (message.isEmpty) {
                setSheetState(() => error = 'أدخل رسالة للفريق.');
                return;
              }
              setSheetState(() {
                submitting = true;
                error = null;
              });
              try {
                await ref.read(pantryRepositoryProvider).submitBid(
                      requestId: requestId,
                      amount: amount,
                      durationDays: days,
                      message: message,
                    );
                submitted = true;
                if (context.mounted) Navigator.of(ctx).pop();
              } catch (e) {
                setSheetState(() {
                  submitting = false;
                  error = pantryBidErrorMessage(e);
                });
              }
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'تقديم عرض',
                    textAlign: TextAlign.right,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primaryDeep),
                  ),
                  const SizedBox(height: 14),
                  if (error != null) ...[
                    OhErrorBanner(message: error!),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: amountController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(labelText: 'المبلغ (د.أ)'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: daysController,
                    keyboardType: TextInputType.number,
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(labelText: 'مدة التنفيذ بالأيام'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: messageController,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'رسالة للفريق'),
                  ),
                  const SizedBox(height: 16),
                  OhButton(
                    label: 'إرسال العرض',
                    isLoading: submitting,
                    onPressed: submitting ? null : submit,
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );

  amountController.dispose();
  daysController.dispose();
  messageController.dispose();
  return submitted;
}

Future<bool> showPantryDeliverySheet(BuildContext context, WidgetRef ref, {required String requestId}) async {
  final messageController = TextEditingController();
  final urlController = TextEditingController();
  final nameController = TextEditingController();
  String? error;
  var submitting = false;
  var submitted = false;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (ctx) {
      return Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
        child: StatefulBuilder(
          builder: (context, setSheetState) {
            Future<void> submit() async {
              final message = messageController.text.trim();
              if (message.isEmpty) {
                setSheetState(() => error = 'أدخل رسالة التسليم.');
                return;
              }
              setSheetState(() {
                submitting = true;
                error = null;
              });
              try {
                await ref.read(pantryRepositoryProvider).submitDelivery(
                      requestId: requestId,
                      message: message,
                      fileUrl: urlController.text,
                      fileName: nameController.text,
                    );
                submitted = true;
                if (context.mounted) Navigator.of(ctx).pop();
              } catch (e) {
                setSheetState(() {
                  submitting = false;
                  error = apiErrorMessage(e, fallback: 'حدث خطأ، حاول مجددًا');
                });
              }
            }

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'تسليم العمل',
                    textAlign: TextAlign.right,
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.primaryDeep),
                  ),
                  const SizedBox(height: 14),
                  if (error != null) ...[
                    OhErrorBanner(message: error!),
                    const SizedBox(height: 12),
                  ],
                  TextField(
                    controller: messageController,
                    maxLines: 4,
                    decoration: const InputDecoration(labelText: 'رسالة التسليم'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: urlController,
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(labelText: 'رابط ملف (اختياري)'),
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    controller: nameController,
                    decoration: const InputDecoration(labelText: 'اسم المرفق (اختياري)'),
                  ),
                  const SizedBox(height: 16),
                  OhButton(
                    label: 'إرسال التسليم',
                    isLoading: submitting,
                    onPressed: submitting ? null : submit,
                  ),
                ],
              ),
            );
          },
        ),
      );
    },
  );

  messageController.dispose();
  urlController.dispose();
  nameController.dispose();
  return submitted;
}
