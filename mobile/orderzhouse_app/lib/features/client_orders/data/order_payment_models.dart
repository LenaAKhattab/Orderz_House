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
  bool? requiresPaymentFlag,
}) {
  if (requiresPaymentFlag == true) return true;
  if (requiresPaymentFlag == false) return false;
  if (paymentStatus == 'paid' || paymentStatus == 'skipped_by_admin') return false;
  if (orderStatus == 'pending_payment' || orderStatus == 'awaiting_payment_after_bid_selection') {
    return true;
  }
  if (projectType != 'fixed') return false;
  return paymentStatus == 'pending' || paymentStatus == 'unpaid';
}

bool orderRequiresAdminReview({
  required String? paymentStatus,
  required bool? isPublished,
  required bool? isOpenForPool,
  String? orderStatus,
  bool? requiresAdminReviewFlag,
  String? clientDisplayStatus,
}) {
  if (requiresAdminReviewFlag == true) return true;
  if (clientDisplayStatus == 'pending_admin_review') return true;
  if (requiresAdminReviewFlag == false) return false;
  final paid = paymentStatus == 'paid' || paymentStatus == 'skipped_by_admin';
  if (!paid) return false;
  final st = orderStatus ?? '';
  if (st == 'open_for_freelancers' || st == 'open_for_bids' || st == 'published') return false;
  if (isPublished == true && isOpenForPool == true) return false;
  if (isPublished == false || isOpenForPool == false) return true;
  return false;
}

bool orderCanPayNow({
  required bool needsPayment,
  bool? canPayNowFlag,
}) {
  if (canPayNowFlag == true) return true;
  if (canPayNowFlag == false) return false;
  return needsPayment;
}
