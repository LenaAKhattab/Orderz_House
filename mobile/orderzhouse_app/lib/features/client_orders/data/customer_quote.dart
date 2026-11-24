import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';

/// Smart Orders S3 — the customer's own quote on an Admin-managed order (never freelancer pay).
class CustomerQuoteLine {
  const CustomerQuoteLine({required this.label, required this.amount});
  final String label;
  final String amount;
}

/// S5: an additional service frozen into the quote (multi-service order).
class CustomerQuoteItem {
  const CustomerQuoteItem({required this.itemNo, required this.name, this.quantity, this.unit, this.unspecified = false, this.priceAmount, this.priceCurrency});
  final int itemNo;
  final Map<String, String> name;
  final String? quantity;
  final String? unit;
  final bool unspecified;
  final String? priceAmount;
  final String? priceCurrency;

  String localizedName(String locale) => name[locale] ?? name['en'] ?? name['ar'] ?? '';

  static CustomerQuoteItem? tryParse(dynamic raw) {
    if (raw is! Map) return null;
    final j = Map<String, dynamic>.from(raw);
    final n = <String, String>{};
    if (j['name'] is Map) {
      (j['name'] as Map).forEach((k, v) {
        if (v != null && v.toString().isNotEmpty) n[k.toString()] = v.toString();
      });
    }
    final price = j['price'] is Map ? Map<String, dynamic>.from(j['price'] as Map) : null;
    return CustomerQuoteItem(
      itemNo: j['itemNo'] is num ? (j['itemNo'] as num).toInt() : int.tryParse('${j['itemNo']}') ?? 0,
      name: n,
      quantity: j['quantity']?.toString(),
      unit: j['unit']?.toString(),
      unspecified: j['unspecified'] == true,
      priceAmount: price?['amount']?.toString(),
      priceCurrency: price?['currency']?.toString(),
    );
  }
}

class CustomerQuote {
  const CustomerQuote({
    required this.version,
    required this.status,
    required this.paymentStatus,
    required this.currency,
    required this.baseAmount,
    required this.totalAmount,
    this.adjustments = const [],
    this.items = const [],
    this.termsNote,
    this.expiresAt,
    this.canAccept = false,
    this.canPay = false,
  });

  final int version;
  final String status;
  final String paymentStatus;
  final String currency;
  final String baseAmount;
  final String totalAmount;
  final List<CustomerQuoteLine> adjustments;
  final List<CustomerQuoteItem> items;
  final String? termsNote;
  final DateTime? expiresAt;
  final bool canAccept;
  final bool canPay;

  bool get isPaid => paymentStatus == 'paid';
  bool get isExpired => status == 'expired';

  static CustomerQuote? tryParse(dynamic raw) {
    if (raw is! Map) return null;
    final j = Map<String, dynamic>.from(raw);
    final adj = (j['adjustments'] is List)
        ? (j['adjustments'] as List)
            .whereType<Map>()
            .map((a) => CustomerQuoteLine(label: a['label']?.toString() ?? '', amount: a['amount']?.toString() ?? ''))
            .toList()
        : const <CustomerQuoteLine>[];
    return CustomerQuote(
      version: (j['version'] is num) ? (j['version'] as num).toInt() : int.tryParse('${j['version']}') ?? 1,
      status: j['status']?.toString() ?? 'issued',
      paymentStatus: j['paymentStatus']?.toString() ?? 'unpaid',
      currency: j['currency']?.toString() ?? 'JOD',
      baseAmount: j['baseAmount']?.toString() ?? '',
      totalAmount: j['totalAmount']?.toString() ?? '',
      adjustments: adj,
      items: (j['items'] is List) ? (j['items'] as List).map(CustomerQuoteItem.tryParse).whereType<CustomerQuoteItem>().toList() : const [],
      termsNote: j['termsNote']?.toString(),
      expiresAt: DateTime.tryParse(j['expiresAt']?.toString() ?? ''),
      canAccept: j['canAccept'] == true,
      canPay: j['canPay'] == true,
    );
  }
}

class CustomerQuoteApi {
  CustomerQuoteApi(this._dio);
  final Dio _dio;

  Future<void> accept(String orderId) async {
    await _dio.post<dynamic>('/client/orders/$orderId/quote/accept', data: {'channel': 'customer_app'});
  }

  /// Amount is derived on the server; the app only receives the Stripe Checkout URL.
  Future<String?> checkout(String orderId) async {
    final res = await _dio.post<dynamic>('/client/orders/$orderId/quote/checkout', data: {'channel': 'mobile'});
    final body = res.data;
    if (body is Map && body['data'] is Map) return (body['data'] as Map)['checkoutUrl']?.toString();
    return null;
  }
}

final customerQuoteApiProvider = Provider<CustomerQuoteApi>((ref) => CustomerQuoteApi(ref.watch(dioProvider)));
