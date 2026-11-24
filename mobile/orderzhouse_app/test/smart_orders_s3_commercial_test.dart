import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/customer_quote.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/customer_quote_card.dart';
import 'package:orderzhouse_app/features/freelancer/assignment_offers/assignment_offers.dart';
import 'package:orderzhouse_app/features/freelancer/assignment_offers/assignment_offers_screen.dart';

Map<String, dynamic> offerJson({String status = 'pending', DateTime? expiresAt, Map<String, dynamic>? terms, Map<String, dynamic>? change}) => {
      'id': '11',
      'orderId': '501',
      'orderCode': 'ORD-20261124-ABC123',
      'title': 'عرض تقديمي',
      'description': 'متطلبات المهمة',
      'status': status,
      'compensationAmount': '55.00',
      'currency': 'JOD',
      'durationValue': 3,
      'durationUnit': 'days',
      'expiresAt': (expiresAt ?? DateTime.now().add(const Duration(hours: 5))).toIso8601String(),
      'terms': ?terms,
      'pendingChange': ?change,
    };

Widget host(Widget child) => ProviderScope(
      child: MaterialApp(
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(body: SingleChildScrollView(child: child)),
      ),
    );

void main() {
  group('assignment offers', () {
    test('parses offer, terms and pending change; no customer fields exist', () {
      final o = AssignmentOffer.fromJson(offerJson(
        status: 'accepted',
        terms: {'compensationAmount': '60.00', 'termsVersion': 2},
        change: {'id': '9', 'oldAmount': '60.00', 'newAmount': '45.00', 'reason': 'Scope'},
      ));
      expect(o.termsAmount, '60.00');
      expect(o.termsVersion, 2);
      expect(o.pendingChangeId, '9');
      expect(o.isActionable(), isFalse);
    });

    test('stale offers are not actionable even if listed as pending', () {
      final stale = AssignmentOffer.fromJson(offerJson(expiresAt: DateTime.now().subtract(const Duration(minutes: 1))));
      expect(stale.status, 'pending');
      expect(stale.isActionable(), isFalse);
      expect(AssignmentOffer.fromJson(offerJson()).isActionable(), isTrue);
    });

    testWidgets('pending offer shows accept/reject; expired shows none', (tester) async {
      await tester.pumpWidget(host(AssignmentOfferCard(offer: AssignmentOffer.fromJson(offerJson()))));
      expect(find.byKey(const ValueKey('offer-accept')), findsOneWidget);
      expect(find.byKey(const ValueKey('offer-reject')), findsOneWidget);
      expect(find.textContaining('55.00 JOD'), findsOneWidget);
      await tester.pumpWidget(host(AssignmentOfferCard(
        offer: AssignmentOffer.fromJson(offerJson(expiresAt: DateTime.now().subtract(const Duration(hours: 1)))),
      )));
      expect(find.byKey(const ValueKey('offer-accept')), findsNothing);
      expect(find.text('منتهي'), findsOneWidget);
    });

    testWidgets('accepted offer shows agreed terms', (tester) async {
      await tester.pumpWidget(host(AssignmentOfferCard(
        offer: AssignmentOffer.fromJson(offerJson(status: 'accepted', terms: {'compensationAmount': '60.00', 'termsVersion': 1})),
      )));
      expect(find.byKey(const ValueKey('offer-terms')), findsOneWidget);
      expect(find.textContaining('60.00 JOD'), findsOneWidget);
    });
  });

  group('customer quote', () {
    final quoteJson = {
      'version': 2,
      'status': 'issued',
      'paymentStatus': 'unpaid',
      'currency': 'AED',
      'baseAmount': '100.00',
      'adjustments': [
        {'label': 'Rush', 'amount': '20.00'},
      ],
      'totalAmount': '120.00',
      'canAccept': true,
      'canPay': true,
      'expiresAt': DateTime.now().add(const Duration(days: 3)).toIso8601String(),
    };

    test('order model parses the managed quote', () {
      final order = ClientOrder.fromJson({'id': '7', 'title': 't', 'managedByAdmin': true, 'quote': quoteJson});
      expect(order.managedByAdmin, isTrue);
      expect(order.quote!.totalAmount, '120.00');
      expect(order.quote!.adjustments.single.label, 'Rush');
    });

    testWidgets('issued quote: accept + pay; paid quote: no actions', (tester) async {
      await tester.pumpWidget(host(CustomerQuoteCard(orderId: '7', quote: CustomerQuote.tryParse(quoteJson)!)));
      expect(find.byKey(const ValueKey('quote-accept')), findsOneWidget);
      expect(find.byKey(const ValueKey('quote-pay')), findsOneWidget);
      expect(find.textContaining('120.00 AED'), findsOneWidget);
      final paid = CustomerQuote.tryParse({...quoteJson, 'paymentStatus': 'paid', 'canAccept': false, 'canPay': false})!;
      await tester.pumpWidget(host(CustomerQuoteCard(orderId: '7', quote: paid)));
      expect(find.byKey(const ValueKey('quote-paid')), findsOneWidget);
      expect(find.byKey(const ValueKey('quote-pay')), findsNothing);
    });
  });
}
