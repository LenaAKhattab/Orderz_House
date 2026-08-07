import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/stripe_checkout_launcher.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/client_orders_repository.dart';
import '../data/create_order_models.dart';
import '../data/payment_return_flow.dart';
import 'client_orders_controller.dart';

class CreateOrderSuccessView extends ConsumerStatefulWidget {
  const CreateOrderSuccessView({super.key, required this.result});

  final CreateOrderResult result;

  @override
  ConsumerState<CreateOrderSuccessView> createState() => _CreateOrderSuccessViewState();
}

class _CreateOrderSuccessViewState extends ConsumerState<CreateOrderSuccessView> {
  bool _checkoutOpened = false;
  bool _payLoading = false;
  String? _payError;

  CreateOrderResult get result => widget.result;

  bool get _isPaymentPending => result.needsPaymentFlow;

  Future<void> _openCheckout(String url) async {
    setState(() {
      _payLoading = true;
      _payError = null;
    });
    final launch = await launchStripeCheckoutUrl(url);
    if (!mounted) return;
    setState(() {
      _payLoading = false;
      _checkoutOpened = launch.launched || _checkoutOpened;
      if (launch.blockedLiveCheckout) {
        _payError = launch.message ?? StripeCheckoutLaunchResult.liveBlockedAr;
      } else if (!launch.launched) {
        _payError = 'تعذر فتح صفحة الدفع. تحقق من الاتصال وحاول مرة أخرى.';
      }
    });
  }

  Future<void> _payNowFromCreateResult() async {
    final url = result.checkoutUrl;
    if (url == null || url.trim().isEmpty) {
      setState(() => _payError = 'رابط الدفع غير متوفر.');
      return;
    }
    await _openCheckout(url);
  }

  void _refreshOrderStatus() {
    ref.invalidate(clientOrderDetailProvider(result.orderId));
    ref.invalidate(clientOrdersControllerProvider);
    context.push(AppRoutes.clientOrderPath(result.orderId));
  }

  @override
  Widget build(BuildContext context) {
    if (_isPaymentPending) {
      return _PaymentPendingSuccessBody(
        result: result,
        checkoutOpened: _checkoutOpened,
        payLoading: _payLoading,
        payError: _payError,
        onPayNow: _payNowFromCreateResult,
        onPayLater: () => context.go(AppRoutes.myOrders),
        onMyOrders: () => context.go(AppRoutes.myOrders),
        onRefreshStatus: _refreshOrderStatus,
      );
    }

    return _BiddingSuccessBody(
      orderId: result.orderId,
      onMyOrders: () => context.go(AppRoutes.myOrders),
      onDetails: () => context.push(AppRoutes.clientOrderPath(result.orderId)),
    );
  }
}

class _PaymentPendingSuccessBody extends StatelessWidget {
  const _PaymentPendingSuccessBody({
    required this.result,
    required this.checkoutOpened,
    required this.payLoading,
    required this.payError,
    required this.onPayNow,
    required this.onPayLater,
    required this.onMyOrders,
    required this.onRefreshStatus,
  });

  final CreateOrderResult result;
  final bool checkoutOpened;
  final bool payLoading;
  final String? payError;
  final VoidCallback onPayNow;
  final VoidCallback onPayLater;
  final VoidCallback onMyOrders;
  final VoidCallback onRefreshStatus;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تجهيز الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          OhCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.payments_outlined, color: AppColors.primary, size: 56),
                const SizedBox(height: 12),
                const Text(
                  'تم تجهيز الطلب بنجاح',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: AppColors.textInk),
                ),
                const SizedBox(height: 8),
                const Text(
                  'هذا الطلب يحتاج دفعًا قبل نشره أو تفعيله.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                if (checkoutOpened) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.iconChipBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      paymentCheckoutOpenedNoteAr,
                      textAlign: TextAlign.right,
                      style: TextStyle(color: AppColors.textMuted, height: 1.5, fontSize: 13),
                    ),
                  ),
                ],
                if (payError != null) ...[
                  const SizedBox(height: 12),
                  OhErrorBanner(message: payError!),
                ],
                const SizedBox(height: 16),
                const PaymentConfirmationNote(),
                const SizedBox(height: 20),
                OhButton(
                  label: 'الدفع الآن',
                  isLoading: payLoading,
                  onPressed: payLoading ? null : onPayNow,
                ),
                const SizedBox(height: 10),
                OhButton(label: 'الدفع لاحقًا', outlined: true, onPressed: onPayLater),
                const SizedBox(height: 10),
                OhButton(label: 'عرض طلباتي', outlined: true, onPressed: onMyOrders),
                const SizedBox(height: 10),
                OhButton(
                  label: 'تحديث حالة الطلب',
                  outlined: true,
                  onPressed: onRefreshStatus,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _BiddingSuccessBody extends StatelessWidget {
  const _BiddingSuccessBody({
    required this.orderId,
    required this.onMyOrders,
    required this.onDetails,
  });

  final String orderId;
  final VoidCallback onMyOrders;
  final VoidCallback onDetails;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تم إنشاء الطلب')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          OhCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Icon(Icons.check_circle_outline, color: AppColors.primary, size: 56),
                const SizedBox(height: 12),
                const Text(
                  'تم إنشاء الطلب بنجاح',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, color: AppColors.textInk),
                ),
                const SizedBox(height: 8),
                const Text(
                  'طلبك متاح الآن لاستقبال العروض من المستقلين.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                const SizedBox(height: 20),
                OhButton(label: 'عرض طلباتي', onPressed: onMyOrders),
                const SizedBox(height: 10),
                OhButton(label: 'عرض تفاصيل الطلب', outlined: true, onPressed: onDetails),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class PaymentConfirmationNote extends StatelessWidget {
  const PaymentConfirmationNote({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.iconChipBg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Text(
        'قد يستغرق تأكيد الدفع لحظات بعد إتمام العملية. استخدم «تحديث حالة الطلب» بعد العودة للتطبيق.',
        textAlign: TextAlign.right,
        style: TextStyle(color: AppColors.textMuted, height: 1.5, fontSize: 13),
      ),
    );
  }
}

/// Payment actions on client order details for unpaid fixed orders.
class ClientOrderPaymentSection extends ConsumerStatefulWidget {
  const ClientOrderPaymentSection({
    super.key,
    required this.orderId,
    required this.needsPayment,
    this.initialCheckoutUrl,
  });

  final String orderId;
  final bool needsPayment;
  final String? initialCheckoutUrl;

  @override
  ConsumerState<ClientOrderPaymentSection> createState() => _ClientOrderPaymentSectionState();
}

class _ClientOrderPaymentSectionState extends ConsumerState<ClientOrderPaymentSection> {
  bool _payLoading = false;
  bool _checkoutOpened = false;
  String? _payError;
  String? _cachedCheckoutUrl;

  @override
  void initState() {
    super.initState();
    _cachedCheckoutUrl = widget.initialCheckoutUrl;
  }

  Future<void> _payNow() async {
    setState(() {
      _payLoading = true;
      _payError = null;
    });

    try {
      var url = _cachedCheckoutUrl?.trim();
      if (url == null || url.isEmpty) {
        final session = await ref
            .read(clientOrdersRepositoryProvider)
            .requestFixedOrderPayCheckout(widget.orderId);
        url = session.checkoutUrl.trim();
        _cachedCheckoutUrl = url;
      }

      if (url.isEmpty) {
        setState(() {
          _payLoading = false;
          _payError = 'رابط الدفع غير متوفر.';
        });
        return;
      }

      final launch = await launchStripeCheckoutUrl(url);
      if (!mounted) return;
      setState(() {
        _payLoading = false;
        _checkoutOpened = launch.launched || _checkoutOpened;
        if (launch.blockedLiveCheckout) {
          _payError = launch.message ?? StripeCheckoutLaunchResult.liveBlockedAr;
        } else if (!launch.launched) {
          _payError = 'تعذر فتح صفحة الدفع.';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _payLoading = false;
        _payError = apiErrorMessage(e, fallback: 'تعذر تجهيز الدفع.');
      });
    }
  }

  void _refreshStatus() {
    ref.invalidate(clientOrderDetailProvider(widget.orderId));
    ref.invalidate(clientOrdersControllerProvider);
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.needsPayment) {
      return const SizedBox.shrink();
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_checkoutOpened) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.iconChipBg,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              paymentCheckoutOpenedNoteAr,
              textAlign: TextAlign.right,
              style: TextStyle(color: AppColors.textMuted, height: 1.5, fontSize: 13),
            ),
          ),
          const SizedBox(height: 10),
        ],
        if (_payError != null) ...[
          OhErrorBanner(message: _payError!),
          const SizedBox(height: 10),
        ],
        const PaymentConfirmationNote(),
        const SizedBox(height: 12),
        OhButton(
          label: 'الدفع الآن',
          isLoading: _payLoading,
          onPressed: _payLoading ? null : _payNow,
        ),
        const SizedBox(height: 8),
        OhButton(
          label: 'تحديث حالة الطلب',
          outlined: true,
          onPressed: _refreshStatus,
        ),
      ],
    );
  }
}
