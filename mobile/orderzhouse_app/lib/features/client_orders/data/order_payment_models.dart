import '../../../core/network/json_helpers.dart';

/// Stripe Checkout session returned by backend (create order or pay-checkout).
class OrderCheckoutSession {
  const OrderCheckoutSession({
    required this.checkoutUrl,
    this.sessionId,
  });

  final String checkoutUrl;
  final String? sessionId;

  bool get hasCheckoutUrl => checkoutUrl.trim().isNotEmpty;

  factory OrderCheckoutSession.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      return OrderCheckoutSession.fromData(Map<String, dynamic>.from(data));
    }
    return OrderCheckoutSession.fromData(json);
  }

  factory OrderCheckoutSession.fromData(Map<String, dynamic> data) {
    final url = readMapField<String>(data, 'checkoutUrl', 'checkout_url') ?? '';
    return OrderCheckoutSession(
      checkoutUrl: url,
      sessionId: readMapField<String>(data, 'sessionId', 'session_id'),
    );
  }
}

bool orderNeedsPayment({
  required String? projectType,
  required String? paymentStatus,
  String? orderStatus,
}) {
  if (projectType != 'fixed') return false;
  if (paymentStatus == 'paid') return false;
  if (orderStatus == 'pending_payment') return true;
  return paymentStatus == 'pending' || paymentStatus == 'unpaid';
}
