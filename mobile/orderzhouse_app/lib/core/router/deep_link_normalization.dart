import '../../features/client_orders/data/payment_return_parser.dart';
import 'routes.dart';

/// Converts `orderzhouse://payment/success|cancel` into an in-app go_router location.
///
/// Only forwards whitelisted query keys: orderId, session_id / sessionId, status.
/// Returns null when the URI is not an orderzhouse payment success/cancel link.
String? normalizeOrderzhousePaymentDeepLink(Uri uri) {
  if (uri.scheme.toLowerCase() != 'orderzhouse') return null;
  if (uri.host.toLowerCase() != 'payment') return null;

  final path = uri.path.toLowerCase();
  final isSuccess = path.contains('success');
  final isCancel = path.contains('cancel');
  if (!isSuccess && !isCancel) return null;

  final status = isSuccess ? 'success' : 'cancel';
  final orderId = (uri.queryParameters['orderId'] ?? '').trim();
  final sessionId = (
        uri.queryParameters['session_id'] ??
        uri.queryParameters['sessionId'] ??
        ''
      ).trim();

  final query = <String, String>{'status': status};
  if (orderId.isNotEmpty) query['orderId'] = orderId;
  if (sessionId.isNotEmpty) query['session_id'] = sessionId;

  return Uri(path: AppRoutes.paymentReturn, queryParameters: query).toString();
}

/// Resolves any incoming platform/deep-link [uri] to a safe in-app location.
///
/// - Payment success/cancel → `/payment/return?...`
/// - Other `orderzhouse://…` → `/login` (authenticated users are redirected home by policy)
/// - In-app paths → null (no rewrite)
String? rewriteIncomingDeepLinkUri(Uri uri) {
  final payment = normalizeOrderzhousePaymentDeepLink(uri);
  if (payment != null) return payment;

  if (uri.scheme.toLowerCase() == 'orderzhouse') {
    return AppRoutes.login;
  }

  return null;
}

/// Parses a location string that may be a raw scheme URI or an in-app path.
String? rewriteIncomingDeepLinkLocation(String location) {
  final trimmed = location.trim();
  if (trimmed.isEmpty) return null;

  // Path-only in-app routes — leave alone.
  if (trimmed.startsWith('/')) return null;

  final uri = Uri.tryParse(trimmed);
  if (uri == null) return null;
  return rewriteIncomingDeepLinkUri(uri);
}

/// Fallback when a location cannot be matched by go_router.
String safeFallbackLocation({required bool isAuthenticated}) {
  return isAuthenticated ? AppRoutes.home : AppRoutes.login;
}

/// Payment params from a raw deep link after normalization (test helper).
PaymentReturnParams? paymentParamsFromIncoming(Uri uri) {
  final rewritten = normalizeOrderzhousePaymentDeepLink(uri);
  if (rewritten == null) return PaymentReturnParams.fromUri(uri);
  return PaymentReturnParams.fromRouteQuery(Uri.parse(rewritten).queryParameters);
}
