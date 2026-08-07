import '../../../core/network/json_helpers.dart';

/// Bid row from `GET /client/orders/:id/bids` (sanitized for client).
class ClientOrderBid {
  const ClientOrderBid({
    required this.id,
    this.orderId,
    this.amount,
    this.message,
    this.status,
    this.createdAt,
    this.updatedAt,
    this.displayName,
  });

  final String id;
  final String? orderId;
  final double? amount;
  final String? message;
  final String? status;
  final String? createdAt;
  final String? updatedAt;
  final String? displayName;

  String get freelancerLabel {
    final name = displayName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return 'مستقل';
  }

  String get statusLabel {
    switch ((status ?? '').trim().toLowerCase()) {
      case 'pending':
        return 'قيد الانتظار';
      case 'selected_pending_payment':
        return 'مختار — بانتظار الدفع';
      case 'accepted':
      case 'selected':
        return 'مقبول';
      case 'rejected':
        return 'مرفوض';
      default:
        return status?.trim().isNotEmpty == true ? status!.trim() : '—';
    }
  }

  bool get canAccept {
    final s = (status ?? '').trim().toLowerCase();
    return s == 'pending' || s == 'selected_pending_payment';
  }

  bool get canReject => (status ?? '').trim().toLowerCase() == 'pending';

  factory ClientOrderBid.fromJson(Map<String, dynamic> json) {
    final id = readMapField<dynamic>(json, 'id', 'id') ??
        readMapField<dynamic>(json, 'bidId', 'bid_id');
    return ClientOrderBid(
      id: id == null ? '' : '$id',
      orderId: () {
        final v = readMapField<dynamic>(json, 'orderId', 'order_id');
        return v == null ? null : '$v';
      }(),
      amount: readDouble(json, 'amount', 'amount'),
      message: readMapField<String>(json, 'message', 'message') ??
          readMapField<String>(json, 'proposalMessage', 'proposal_message'),
      status: readMapField<String>(json, 'status', 'status'),
      createdAt: readMapField<String>(json, 'createdAt', 'created_at'),
      updatedAt: readMapField<String>(json, 'updatedAt', 'updated_at'),
      displayName: readMapField<String>(json, 'displayName', 'display_name'),
    );
  }
}

class ClientOrderBidsResult {
  const ClientOrderBidsResult({
    this.bids = const [],
    this.hasOpenPool = false,
    this.currencyCode,
  });

  final List<ClientOrderBid> bids;
  final bool hasOpenPool;
  final String? currencyCode;

  factory ClientOrderBidsResult.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    final map = data is Map ? Map<String, dynamic>.from(data) : json;
    final bidsRaw = map['bids'];
    final bids = bidsRaw is List
        ? bidsRaw
            .whereType<Map>()
            .map((e) => ClientOrderBid.fromJson(Map<String, dynamic>.from(e)))
            .where((b) => b.id.isNotEmpty)
            .toList()
        : <ClientOrderBid>[];

    final summary = map['orderSummary'] ?? map['order_summary'];
    var hasOpenPool = false;
    String? currency;
    if (summary is Map) {
      final s = Map<String, dynamic>.from(summary);
      hasOpenPool = readBool(s, 'hasOpenPool', 'has_open_pool');
      currency = readMapField<String>(s, 'currencyCode', 'currency_code');
    }

    return ClientOrderBidsResult(
      bids: bids,
      hasOpenPool: hasOpenPool,
      currencyCode: currency,
    );
  }
}

/// Accept-bid response — creates Stripe Checkout for selected bid payment.
class AcceptBidResult {
  const AcceptBidResult({
    this.requiresPayment = false,
    this.paymentPurpose,
    this.checkoutUrl,
    this.sessionId,
  });

  final bool requiresPayment;
  final String? paymentPurpose;
  final String? checkoutUrl;
  final String? sessionId;

  bool get hasCheckoutUrl => (checkoutUrl ?? '').trim().isNotEmpty;

  factory AcceptBidResult.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    final map = data is Map ? Map<String, dynamic>.from(data) : json;
    return AcceptBidResult(
      requiresPayment: readBool(map, 'requiresPayment', 'requires_payment'),
      paymentPurpose: readMapField<String>(map, 'paymentPurpose', 'payment_purpose'),
      checkoutUrl: readMapField<String>(map, 'checkoutUrl', 'checkout_url'),
      sessionId: readMapField<String>(map, 'sessionId', 'session_id'),
    );
  }
}

/// Whether client details should show the freelancers' bids section.
bool clientOrderShowsBidsSection({
  required String? projectType,
  required String? orderStatus,
  int bidsCount = 0,
}) {
  final type = (projectType ?? '').trim().toLowerCase();
  if (type == 'bidding') return true;
  final status = (orderStatus ?? '').trim().toLowerCase();
  if (status == 'open_for_bids') return true;
  return bidsCount > 0;
}
