import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/checkout_funnel_telemetry.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/client_order_models.dart';
import '../data/client_orders_repository.dart';
import '../data/payment_return_flow.dart';
import '../data/payment_return_parser.dart';
import 'client_orders_controller.dart';
import 'order_payment_actions.dart';
import '../../../core/i18n/i18n.dart';

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
  bool _confirmInFlight = false;

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

    final sid = widget.params.sessionId?.trim() ?? '';
    if (sid.isNotEmpty && isAuth) {
      final locale = Localizations.maybeLocaleOf(context)?.languageCode ?? 'ar';
      // ignore: unawaited_futures
      CheckoutFunnelTelemetry.record(
        eventType: widget.params.isCancel
            ? 'checkout_cancel_returned'
            : 'checkout_success_returned',
        stripeCheckoutSessionId: sid,
        // Server derives canonical paymentFlow from session ownership.
        paymentFlow: widget.params.isQuote ? 'client_quote' : null,
        locale: locale,
      );
    }

    if (shouldAttemptPaymentConfirmOnReturn(
      isAuthenticated: isAuth,
      isCancel: widget.params.isCancel,
    )) {
      _confirmAndRefresh();
    }
  }

  Future<void> _confirmAndRefresh({bool poll = true}) async {
    if (!ref.read(authControllerProvider).isAuthenticated) {
      setState(() => _state = PaymentReturnUiState.guestNeedsLogin);
      return;
    }
    if (_confirmInFlight) return;
    _confirmInFlight = true;

    setState(() {
      _state = PaymentReturnUiState.confirming;
      _errorMessage = null;
    });

    final attempts = poll ? paymentConfirmPollAttempts : 1;
    final repo = ref.read(clientOrdersRepositoryProvider);
    final orderId = widget.params.orderId;
    final sessionId = widget.params.sessionId;

    try {
      ClientOrder? order;
      final isQuote = widget.params.isQuote;
      for (var i = 0; i < attempts; i++) {
        if (!isQuote) {
          try {
            await repo.confirmFixedOrderPayment(orderId, sessionId: sessionId);
          } on DioException catch (e) {
            final status = e.response?.statusCode;
            if (status != 402) {
              rethrow;
            }
          }
        }

        // Quote payments are confirmed by the Stripe webhook only; the app just re-reads the order.
        order = await repo.fetchMyOrderById(orderId);
        if (isQuote ? isQuotePaidFromBackend(order.quote?.paymentStatus) : isOrderPaidFromBackend(order.paymentStatus)) {
          break;
        }
        if (i < attempts - 1) {
          await Future<void>.delayed(paymentConfirmPollInterval);
          if (!mounted) return;
        }
      }

      ref.invalidate(clientOrderDetailProvider(orderId));
      ref.invalidate(clientOrdersControllerProvider);
      // Reload now: a mounted "My orders" screen would otherwise keep showing the reset (empty) list.
      // ignore: unawaited_futures
      ref.read(clientOrdersControllerProvider.notifier).load(refresh: true);

      if (!mounted) return;
      setState(() {
        _order = order;
        _state = paymentReturnStateAfterConfirmAttempts(
          paymentStatus: widget.params.isQuote ? order?.quote?.paymentStatus : order?.paymentStatus,
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _state = PaymentReturnUiState.error;
        _errorMessage = apiErrorMessage(e, fallback: tr('تعذر تأكيد حالة الدفع.'));
      });
    } finally {
      _confirmInFlight = false;
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
      appBar: AppBar(title: Text(tr('العودة من الدفع'))),
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
        return Column(
          children: [
            SizedBox(height: 24),
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text(
              tr('جارٍ تأكيد الدفع...'),
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
            ),
            SizedBox(height: 8),
            Text(
              tr('يرجى الانتظار بينما نتحقق من حالة الدفع مع الخادم.'),
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
            Text(
              tr('تأكيد حالة الدفع'),
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            Text(
              paymentReturnGuestMessageAr,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            const SizedBox(height: 20),
            OhButton(
              label: tr('تسجيل الدخول لتأكيد الدفع'),
              onPressed: _goToLoginForConfirm,
            ),
            const SizedBox(height: 10),
            OhButton(
              label: tr('تسجيل الدخول'),
              outlined: true,
              onPressed: () => context.go(AppRoutes.login),
            ),
          ],
        );
      case PaymentReturnUiState.paid:
        final adminReview = !widget.params.isQuote && _order?.requiresAdminReview == true;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              adminReview ? Icons.hourglass_top_outlined : Icons.check_circle_outline,
              color: AppColors.primary,
              size: 56,
            ),
            const SizedBox(height: 12),
            Text(
              adminReview ? tr('تم استلام الدفع') : tr('تم تأكيد الدفع'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            Text(
              widget.params.isQuote
                  ? tr('تم تأكيد دفع عرض السعر. سيتابع فريقنا تنفيذ طلبك.')
                  : adminReview
                      ? tr('تم استلام الدفع، وسيتم نشر الطلب بعد مراجعته من الإدارة.')
                      : tr('تم استلام الدفع وفتح الطلب للمستقلين.'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            if (adminReview) ...[
              const SizedBox(height: 8),
              Text(
                _order?.statusLabel ?? tr('بانتظار مراجعة الإدارة'),
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary),
              ),
            ],
            const SizedBox(height: 20),
            OhButton(
              label: tr('عرض تفاصيل الطلب'),
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: tr('عرض طلباتي'),
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
            Text(
              tr('بانتظار تأكيد الدفع'),
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            Text(
              paymentReturnPendingMessageAr,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            const SizedBox(height: 12),
            const PaymentConfirmationNote(),
            if (_order?.paymentStatusLabel != null) ...[
              const SizedBox(height: 8),
              Text(
                trf('الحالة الحالية: {0}', [_order!.paymentStatusLabel]),
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textMuted),
              ),
            ],
            const SizedBox(height: 20),
            OhButton(
              label: tr('تحديث حالة الطلب'),
              onPressed: () => _confirmAndRefresh(poll: true),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: tr('عرض تفاصيل الطلب'),
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
            Text(
              paymentReturnCancelTitleAr,
              textAlign: TextAlign.center,
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20),
            ),
            const SizedBox(height: 8),
            Text(
              paymentReturnCancelBodyAr,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
            ),
            const SizedBox(height: 20),
            OhButton(
              label: tr('المحاولة مرة أخرى'),
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: tr('العودة إلى الطلب'),
              outlined: true,
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: tr('عرض طلباتي'),
              outlined: true,
              onPressed: () => context.go(AppRoutes.myOrders),
            ),
          ],
        );
      case PaymentReturnUiState.error:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            OhErrorBanner(message: _errorMessage ?? tr('حدث خطأ.')),
            const SizedBox(height: 16),
            OhButton(
              label: tr('إعادة المحاولة'),
              onPressed: () => _confirmAndRefresh(poll: true),
            ),
            const SizedBox(height: 10),
            OhButton(
              label: tr('عرض تفاصيل الطلب'),
              outlined: true,
              onPressed: () => context.go(AppRoutes.clientOrderPath(widget.params.orderId)),
            ),
          ],
        );
    }
  }
}
