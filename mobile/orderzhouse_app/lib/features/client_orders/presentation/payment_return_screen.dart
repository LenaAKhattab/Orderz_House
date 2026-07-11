import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/client_order_models.dart';
import '../data/client_orders_repository.dart';
import '../data/payment_return_flow.dart';
import '../data/payment_return_parser.dart';
import 'client_orders_controller.dart';
import 'order_payment_actions.dart';

class PaymentReturnScreen extends ConsumerStatefulWidget {
  const PaymentReturnScreen({super.key, required this.params});

  final PaymentReturnParams params;

  @override
  ConsumerState<PaymentReturnScreen> createState() => _PaymentReturnScreenState();
}

class _PaymentReturnScreenState extends ConsumerState<PaymentReturnScreen> {
  PaymentReturnUiState _state = PaymentReturnUiState.confirming;
  String? _errorMessage;
  ClientOrder? _order;
  bool _bootstrapDone = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_bootstrap);
  }

  void _bootstrap() {
    if (!mounted || _bootstrapDone) return;

    final auth = ref.read(authControllerProvider);
    if (auth.status == AuthStatus.unknown) {
      return;
    }

    _bootstrapDone = true;
    final isAuth = auth.isAuthenticated;
    final initial = initialPaymentReturnUiState(
      isAuthenticated: isAuth,
      isCancel: widget.params.isCancel,
    );
    setState(() => _state = initial);

    if (shouldAttemptPaymentConfirmOnReturn(
      isAuthenticated: isAuth,
      isCancel: widget.params.isCancel,
    )) {
      _confirmAndRefresh();
    }
  }

  Future<void> _confirmAndRefresh() async {
    if (!ref.read(authControllerProvider).isAuthenticated) {
      setState(() => _state = PaymentReturnUiState.guestNeedsLogin);
      return;
    }

    setState(() {
      _state = PaymentReturnUiState.confirming;
      _errorMessage = null;
    });

    try {
      try {
        await ref.read(clientOrdersRepositoryProvider).confirmFixedOrderPayment(widget.params.orderId);
      } on DioException catch (e) {
        final status = e.response?.statusCode;
        if (status != 402) {
          rethrow;
        }
      }

      final order = await ref.read(clientOrdersRepositoryProvider).fetchMyOrderById(widget.params.orderId);
      ref.invalidate(clientOrderDetailProvider(widget.params.orderId));
      ref.invalidate(clientOrdersControllerProvider);

      if (!mounted) return;
      setState(() {
        _order = order;
        _state = isOrderPaidFromBackend(order.paymentStatus)
            ? PaymentReturnUiState.paid
            : PaymentReturnUiState.pending;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _state = PaymentReturnUiState.error;
        _errorMessage = apiErrorMessage(e, fallback: 'تعذر تأكيد حالة الدفع.');
      });
    }
  }

  void _goToLoginForConfirm() {
    context.push(AppRoutes.loginWithRedirect(widget.params.toRouteLocation()));
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (previous, next) {
      if (!_bootstrapDone && next.status != AuthStatus.unknown) {
        _bootstrap();
      }
    });

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('العودة من الدفع')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          OhCard(child: _buildBody(context)),
        ],
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    switch (_state) {
      case PaymentReturnUiState.confirming:
        return const Column(
          children: [
            SizedBox(height: 24),
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text(
              'جارٍ تأكيد الدفع...',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            SizedBox(height: 8),
            Text(
              'يرجى الانتظار بينما نتحقق من حالة الدفع مع الخادم.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
          ],
        );
      case PaymentReturnUiState.guestNeedsLogin:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.login_rounded, color: AppColors.primary, size: 56),
            const SizedBox(height: 12),
            const Text(
              'تأكيد حالة الدفع',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            const Text(
              paymentReturnGuestMessageAr,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            const SizedBox(height: 20),
            OhButton(
              label: 'تسجيل الدخول لتأكيد الدفع',
              onPressed: _goToLoginForConfirm,
            ),
            const SizedBox(height: 10),
            OhButton(
              label: 'تسجيل الدخول',
              outlined: true,
              onPressed: () => context.go(AppRoutes.login),
            ),
          ],
        );
      case PaymentReturnUiState.paid:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.check_circle_outline, color: AppColors.primary, size: 56),
            const SizedBox(height: 12),
            const Text(
              'تم تأكيد الدفع',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            const Text(
              'تم استلام الدفع وفتح الطلب للمستقلين.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            const SizedBox(height: 20),
            OhButton(
              label: 'عرض تفاصيل الطلب',
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: 'عرض طلباتي',
              outlined: true,
              onPressed: () => context.go(AppRoutes.myOrders),
            ),
          ],
        );
      case PaymentReturnUiState.pending:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.hourglass_top_outlined, color: AppColors.primary, size: 56),
            const SizedBox(height: 12),
            const Text(
              'بانتظار تأكيد الدفع',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            const PaymentConfirmationNote(),
            if (_order?.paymentStatusLabel != null) ...[
              const SizedBox(height: 8),
              Text(
                'الحالة الحالية: ${_order!.paymentStatusLabel}',
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textMuted),
              ),
            ],
            const SizedBox(height: 20),
            OhButton(
              label: 'تحديث حالة الطلب',
              onPressed: _confirmAndRefresh,
            ),
            const SizedBox(height: 10),
            OhButton(
              label: 'عرض تفاصيل الطلب',
              outlined: true,
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
          ],
        );
      case PaymentReturnUiState.cancel:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Icon(Icons.info_outline, color: AppColors.textMuted, size: 56),
            const SizedBox(height: 12),
            const Text(
              'لم يتم تأكيد الدفع',
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            const Text(
              'لم يتم تأكيد الدفع بعد. يمكنك المحاولة لاحقًا من تفاصيل الطلب.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            const SizedBox(height: 20),
            OhButton(
              label: 'العودة لتفاصيل الطلب',
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: 'عرض طلباتي',
              outlined: true,
              onPressed: () => context.go(AppRoutes.myOrders),
            ),
          ],
        );
      case PaymentReturnUiState.error:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OhErrorBanner(message: _errorMessage ?? 'حدث خطأ.'),
            const SizedBox(height: 16),
            OhButton(label: 'إعادة المحاولة', onPressed: _confirmAndRefresh),
            const SizedBox(height: 10),
            OhButton(
              label: 'عرض تفاصيل الطلب',
              outlined: true,
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
          ],
        );
    }
  }
}
