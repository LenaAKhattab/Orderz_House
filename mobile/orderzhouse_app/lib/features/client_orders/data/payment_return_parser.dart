/// Parses `orderzhouse://payment/success|cancel` deep links from Stripe bridge.
class PaymentReturnParams {
  const PaymentReturnParams({
    required this.orderId,
    required this.isSuccess,
    this.sessionId,
    this.isQuote = false,
  });

  final String orderId;
  final String? sessionId;
  final bool isSuccess;

  /// Smart Orders S4: return from a managed-order quote checkout (`kind=quote`). The app then waits for
  /// the server to mark the quote paid (webhook) instead of confirming a fixed-order payment.
  final bool isQuote;

  bool get isCancel => !isSuccess;

  /// Route path + query for go_router (HTTPS bridge uses same query shape).
  static PaymentReturnParams? fromUri(Uri uri) {
    if (uri.scheme != 'orderzhouse') return null;
    if (uri.host != 'payment') return null;

    final path = uri.path;
    final isSuccess = path.contains('success');
    final isCancel = path.contains('cancel');
    if (!isSuccess && !isCancel) return null;

    final orderId = uri.queryParameters['orderId']?.trim();
    if (orderId == null || orderId.isEmpty) return null;

    return PaymentReturnParams(
      orderId: orderId,
      isSuccess: isSuccess,
      sessionId: _sessionIdFromQuery(uri.queryParameters),
      isQuote: _isQuote(uri.queryParameters),
    );
  }

  static PaymentReturnParams? fromRouteQuery(Map<String, String> query) {
    final status = query['status']?.trim().toLowerCase();
    final orderId = query['orderId']?.trim();
    if (orderId == null || orderId.isEmpty) return null;
    final sessionId = _sessionIdFromQuery(query);
    final isQuote = _isQuote(query);
    if (status == 'success') {
      return PaymentReturnParams(
        orderId: orderId,
        isSuccess: true,
        sessionId: sessionId,
        isQuote: isQuote,
      );
    }
    if (status == 'cancel') {
      return PaymentReturnParams(
        orderId: orderId,
        isSuccess: false,
        sessionId: sessionId,
        isQuote: isQuote,
      );
    }
    return null;
  }

  static bool _isQuote(Map<String, String> query) => query['kind']?.trim().toLowerCase() == 'quote';

  static String? _sessionIdFromQuery(Map<String, String> query) {
    final fromSnake = query['session_id']?.trim();
    if (fromSnake != null && fromSnake.isNotEmpty) return fromSnake;
    final fromCamel = query['sessionId']?.trim();
    if (fromCamel != null && fromCamel.isNotEmpty) return fromCamel;
    return null;
  }

  String toRouteLocation() {
    final status = isSuccess ? 'success' : 'cancel';
    final buffer = StringBuffer('/payment/return?status=$status&orderId=${Uri.encodeComponent(orderId)}');
    if (isQuote) buffer.write('&kind=quote');
    final sid = sessionId;
    if (sid != null && sid.isNotEmpty) {
      buffer.write('&session_id=${Uri.encodeComponent(sid)}');
    }
    return buffer.toString();
  }
}

bool isPaymentDeepLink(Uri uri) => PaymentReturnParams.fromUri(uri) != null;
