import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/utils/stripe_checkout_launcher.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../orders/presentation/order_detail_widgets.dart';
import '../../currency/presentation/jod_money_display.dart';
import '../data/client_order_bid_models.dart';
import '../data/client_orders_repository.dart';
import 'client_orders_controller.dart';

class ClientOrderBidsSection extends ConsumerStatefulWidget {
  const ClientOrderBidsSection({
    super.key,
    required this.orderId,
    this.currencyCode,
  });

  final String orderId;
  final String? currencyCode;

  @override
  ConsumerState<ClientOrderBidsSection> createState() => _ClientOrderBidsSectionState();
}

class _ClientOrderBidsSectionState extends ConsumerState<ClientOrderBidsSection> {
  bool _actionBusy = false;
  String? _actionError;

  Future<void> _acceptBid(ClientOrderBid bid) async {
    if (_actionBusy) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('قبول العرض'),
        content: const Text('هل تريد قبول هذا العرض؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('قبول'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _actionBusy = true;
      _actionError = null;
    });

    try {
      final result = await ref.read(clientOrdersRepositoryProvider).acceptOrderBid(
            orderId: widget.orderId,
            bidId: bid.id,
          );

      ref.invalidate(clientOrderBidsProvider(widget.orderId));
      ref.invalidate(clientOrderDetailProvider(widget.orderId));
      ref.invalidate(clientOrdersControllerProvider);

      if (!mounted) return;

      final checkoutUrl = result.checkoutUrl?.trim() ?? '';
      if (checkoutUrl.isNotEmpty) {
        final launch = await launchStripeCheckoutUrl(checkoutUrl);
        if (!mounted) return;
        setState(() => _actionBusy = false);

        if (launch.blockedLiveCheckout) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(launch.message ?? StripeCheckoutLaunchResult.liveBlockedAr),
              backgroundColor: AppColors.error,
              duration: const Duration(seconds: 6),
            ),
          );
          return;
        }

        if (launch.launched) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('تم قبول العرض. أكمل الدفع في المتصفح.')),
          );
        } else {
          setState(() {
            _actionError = 'تم قبول العرض، لكن تعذر فتح صفحة الدفع.';
          });
        }
        return;
      }

      setState(() => _actionBusy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم قبول العرض بنجاح.')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _actionBusy = false;
        _actionError = apiErrorMessage(e, fallback: 'تعذر قبول العرض.');
      });
    }
  }

  Future<void> _rejectBid(ClientOrderBid bid) async {
    if (_actionBusy) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('رفض العرض'),
        content: const Text('هل تريد رفض هذا العرض؟'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('إلغاء'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('رفض'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _actionBusy = true;
      _actionError = null;
    });

    try {
      await ref.read(clientOrdersRepositoryProvider).rejectOrderBid(
            orderId: widget.orderId,
            bidId: bid.id,
          );

      ref.invalidate(clientOrderBidsProvider(widget.orderId));
      ref.invalidate(clientOrderDetailProvider(widget.orderId));
      ref.invalidate(clientOrdersControllerProvider);

      if (!mounted) return;
      setState(() => _actionBusy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم رفض العرض.')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _actionBusy = false;
        _actionError = apiErrorMessage(e, fallback: 'تعذر رفض العرض.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final asyncBids = ref.watch(clientOrderBidsProvider(widget.orderId));

    return OrderSectionCard(
      title: 'عروض المستقلين',
      icon: Icons.handshake_outlined,
      children: [
        if (_actionError != null) ...[
          OhErrorBanner(message: _actionError!),
          const SizedBox(height: 10),
        ],
        asyncBids.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
          error: (error, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                apiErrorMessage(error, fallback: 'تعذر تحميل العروض.'),
                style: const TextStyle(color: AppColors.error, height: 1.5),
                textAlign: TextAlign.right,
              ),
              const SizedBox(height: 8),
              OhButton(
                label: 'إعادة المحاولة',
                outlined: true,
                onPressed: _actionBusy
                    ? null
                    : () => ref.invalidate(clientOrderBidsProvider(widget.orderId)),
              ),
            ],
          ),
          data: (result) {
            if (!result.hasOpenPool && result.bids.isEmpty) {
              return const OrderEmptyHint(
                message: 'لا يمكن عرض العروض حاليًا (الطلب ليس مفتوحًا للمزايدة، أو تم إسناده).',
                icon: Icons.lock_outline_rounded,
              );
            }
            if (result.bids.isEmpty) {
              return const OrderEmptyHint(
                message: 'لم تصل عروض بعد',
                icon: Icons.inbox_outlined,
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < result.bids.length; i++) ...[
                  if (i > 0) const SizedBox(height: 10),
                  _BidCard(
                    bid: result.bids[i],
                    busy: _actionBusy,
                    onAccept: () => _acceptBid(result.bids[i]),
                    onReject: () => _rejectBid(result.bids[i]),
                  ),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _BidCard extends StatelessWidget {
  const _BidCard({
    required this.bid,
    required this.busy,
    required this.onAccept,
    required this.onReject,
  });

  final ClientOrderBid bid;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onReject;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder.withValues(alpha: 0.65)),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  bid.freelancerLabel,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: AppColors.primaryDeep,
                  ),
                  textAlign: TextAlign.right,
                ),
              ),
              const SizedBox(width: 8),
              OrderStatusBadge(label: bid.statusLabel, statusKey: bid.status, compact: true),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.success.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.payments_outlined, color: AppColors.success, size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: bid.amount != null
                      ? JodMoneyDisplay(amount: bid.amount)
                      : const Text('—', textAlign: TextAlign.right),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'تاريخ العرض: ${formatOrderDateLabel(bid.createdAt)}',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
            textAlign: TextAlign.right,
          ),
          if (bid.message != null && bid.message!.trim().isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              bid.message!.trim(),
              style: const TextStyle(color: AppColors.textInk, height: 1.55, fontSize: 13),
              textAlign: TextAlign.right,
            ),
          ],
          if (bid.canAccept || bid.canReject) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                if (bid.canReject)
                  Expanded(
                    child: OhButton(
                      label: 'رفض العرض',
                      outlined: true,
                      isLoading: busy,
                      onPressed: busy ? null : onReject,
                    ),
                  ),
                if (bid.canReject && bid.canAccept) const SizedBox(width: 8),
                if (bid.canAccept)
                  Expanded(
                    child: OhButton(
                      label: 'قبول العرض',
                      isLoading: busy,
                      onPressed: busy ? null : onAccept,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
