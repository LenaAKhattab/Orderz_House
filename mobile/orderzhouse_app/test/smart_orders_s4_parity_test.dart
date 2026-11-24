import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/core/router/deep_link_normalization.dart';
import 'package:orderzhouse_app/core/router/routes.dart';
import 'package:orderzhouse_app/features/client_orders/data/client_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_attachment_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_flow.dart';
import 'package:orderzhouse_app/features/client_orders/data/payment_return_parser.dart';
import 'package:orderzhouse_app/features/client_orders/data/service_catalog_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/service_form_logic.dart';
import 'package:orderzhouse_app/features/client_orders/data/service_form_snapshot.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/create_order_controller.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/service_dynamic_fields.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/service_form_snapshot_view.dart';
import 'package:orderzhouse_app/features/notifications/data/notification_models.dart';
import 'package:orderzhouse_app/features/notifications/navigation/notification_action_resolver.dart';
import 'package:orderzhouse_app/features/orders/data/order_display_helpers.dart' as display;

SelectedOrderAttachment att(String name, {String? id}) =>
    SelectedOrderAttachment(id: id ?? name, name: name, size: 10, bytes: Uint8List.fromList([1, 2, 3]));

CatalogService svc({int version = 1, List<Map<String, dynamic>>? fields, String unit = 'pages'}) => CatalogService.fromJson({
      'serviceCode': 'translation',
      'categoryId': '3',
      'version': version,
      'name': {'ar': 'ترجمة', 'en': 'Translation'},
      'quantity': {'unit': unit, 'required': false, 'allowUnspecified': true},
      'fields': fields ??
          [
            {'key': 'source', 'type': 'file', 'label': {'ar': 'الملف المصدر', 'en': 'Source file'}, 'required': true, 'min': 1, 'max': 2},
            {'key': 'deadline', 'type': 'datetime', 'label': {'ar': 'موعد', 'en': 'Deadline'}},
            {
              'key': 'lang',
              'type': 'select',
              'label': {'ar': 'اللغة', 'en': 'Language'},
              'options': [
                {'value': 'en', 'label': {'ar': 'إنجليزية', 'en': 'English'}},
                {'value': 'fr', 'label': {'ar': 'فرنسية', 'en': 'French'}},
              ],
            },
            {'key': 'notes', 'type': 'text', 'label': {'ar': 'ملاحظات', 'en': 'Notes'}, 'maxLength': 50},
          ],
    });

Widget host(Widget child, {Locale locale = const Locale('ar')}) => MaterialApp(
      locale: locale,
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  group('file + datetime fields', () {
    test('app now advertises file and datetime support (server stops hiding those services)', () {
      expect(kMobileSupportedFieldTypes, containsAll(['file', 'datetime']));
      expect(svc().mobileRenderable, isTrue);
    });

    test('validation: required file, max files, invalid datetime', () {
      final s = svc();
      var d = ServiceFormDraft(serviceCode: s.serviceCode, version: 1);
      expect(validateServiceForm(s, d)['source'], 'required');
      d = d.withValue('source', [att('a.pdf'), att('b.pdf'), att('c.pdf')]);
      expect(validateServiceForm(s, d)['source'], 'above_max');
      d = d.withValue('source', [att('a.pdf')]).withValue('deadline', 'not-a-date');
      expect(validateServiceForm(s, d)['deadline'], 'invalid_date');
      d = d.withValue('deadline', DateTime.utc(2026, 12, 1, 9, 30).toIso8601String());
      expect(validateServiceForm(s, d), isEmpty);
    });

    test('payload references files by upload name; files are uploaded with the attachments', () {
      final s = svc();
      final d = ServiceFormDraft(serviceCode: s.serviceCode, version: 1)
          .withValue('source', [att('brief.pdf')])
          .withValue('deadline', '2026-12-01T09:30:00.000Z');
      final payload = buildServiceFormPayload(s, d)!;
      final values = payload['values'] as Map;
      expect(values['source'], ['brief.pdf']);
      expect(values['deadline'], '2026-12-01T09:30:00.000Z');
      expect(serviceFormFiles(s, d).map((f) => f.name), ['brief.pdf']);
    });

    testWidgets('file field: pick (injected), dedupe by name, remove', (tester) async {
      final s = svc();
      var draft = ServiceFormDraft(serviceCode: s.serviceCode, version: 1);
      late StateSetter setter;
      await tester.pumpWidget(host(StatefulBuilder(builder: (context, set) {
        setter = set;
        return ServiceDynamicFields(
          service: s,
          draft: draft,
          errors: const {},
          onValue: (k, v) => setter(() => draft = draft.withValue(k, v)),
          onQuantity: ({quantity, unspecified}) {},
          pickFiles: ({required multiple}) async => [att('a.pdf', id: '1'), att('a.pdf', id: '2')],
        );
      })));
      await tester.tap(find.byKey(const ValueKey('source-pick')));
      await tester.pumpAndSettle();
      expect((draft.values['source'] as List).length, 1, reason: 'same name never added twice');
      expect(find.text('a.pdf'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('source-remove-a.pdf')));
      await tester.pumpAndSettle();
      expect((draft.values['source'] as List), isEmpty);
    });

    testWidgets('datetime field shows the stored instant in local time', (tester) async {
      final s = svc();
      final iso = DateTime(2026, 12, 1, 14, 5).toUtc().toIso8601String();
      await tester.pumpWidget(host(ServiceDynamicFields(
        service: s,
        draft: ServiceFormDraft(serviceCode: s.serviceCode, version: 1).withValue('deadline', iso),
        errors: const {},
        onValue: (_, _) {},
        onQuantity: ({quantity, unspecified}) {},
      )));
      expect(find.text('2026-12-01 14:05'), findsOneWidget);
    });
  });

  group('stale schema refresh', () {
    test('keeps compatible values, drops changed type / removed option / removed field', () {
      final oldS = svc();
      final newS = svc(version: 2, fields: [
        {'key': 'source', 'type': 'file', 'label': {'ar': 'ملف'}},
        {'key': 'deadline', 'type': 'date', 'label': {'ar': 'تاريخ'}},
        {
          'key': 'lang',
          'type': 'select',
          'label': {'ar': 'اللغة'},
          'options': [
            {'value': 'en', 'label': {'ar': 'إنجليزية'}},
          ],
        },
      ]);
      final d = ServiceFormDraft(serviceCode: 'translation', version: 1, quantity: '4')
          .withValue('source', [att('a.pdf')])
          .withValue('deadline', '2026-12-01T09:30:00.000Z')
          .withValue('lang', 'fr')
          .withValue('notes', 'hi');
      final m = migrateServiceDraft(oldService: oldS, newService: newS, draft: d);
      expect(m.serviceAvailable, isTrue);
      expect(m.draft.version, 2);
      expect(m.kept, ['source']);
      expect(m.dropped, containsAll(['deadline', 'lang', 'notes']));
      expect(m.draft.quantity, '4', reason: 'same unit keeps quantity');
      expect(staleServiceFormMessage(m), contains('احتفظنا بالقيم المتوافقة'));
    });

    test('all values compatible → keeps everything; service removed → cleared', () {
      final s = svc();
      final d = ServiceFormDraft(serviceCode: 'translation', version: 1).withValue('lang', 'en').withValue('notes', 'ok');
      final same = migrateServiceDraft(oldService: s, newService: svc(version: 3), draft: d);
      expect(same.dropped, isEmpty);
      expect(same.draft.values['lang'], 'en');
      expect(staleServiceFormMessage(same), contains('احتفظنا بكل القيم'));
      final gone = migrateServiceDraft(oldService: s, newService: null, draft: d);
      expect(gone.serviceAvailable, isFalse);
      expect(gone.draft.hasService, isFalse);
      expect(staleServiceFormMessage(gone), contains('لم تعد هذه الخدمة متاحة'));
    });

    test('unit change clears quantity; text longer than new maxLength dropped', () {
      final d = ServiceFormDraft(serviceCode: 'translation', version: 1, quantity: '4').withValue('notes', 'x' * 40);
      final newS = svc(version: 2, unit: 'words', fields: [
        {'key': 'notes', 'type': 'text', 'label': {'ar': 'ملاحظات'}, 'maxLength': 10},
      ]);
      final m = migrateServiceDraft(oldService: svc(), newService: newS, draft: d);
      expect(m.draft.quantity, '');
      expect(m.dropped, ['notes']);
    });
  });

  group('quote payment return', () {
    test('kind=quote survives bridge deep link → normalization → route → parser', () {
      final uri = Uri.parse('orderzhouse://payment/success?orderId=77&kind=quote&session_id=cs_test_abc');
      final p = paymentParamsFromIncoming(uri)!;
      expect(p.isQuote, isTrue);
      expect(p.isSuccess, isTrue);
      expect(p.sessionId, 'cs_test_abc');
      final loc = rewriteIncomingDeepLinkUri(uri)!;
      expect(loc, startsWith(AppRoutes.paymentReturn));
      expect(PaymentReturnParams.fromRouteQuery(Uri.parse(loc).queryParameters)!.isQuote, isTrue);
      expect(p.toRouteLocation(), contains('kind=quote'));
    });

    test('fixed-order links unchanged; unknown kinds ignored', () {
      final fixed = paymentParamsFromIncoming(Uri.parse('orderzhouse://payment/cancel?orderId=5&session_id=cs_test_x'))!;
      expect(fixed.isQuote, isFalse);
      expect(fixed.toRouteLocation(), isNot(contains('kind=')));
      final evil = paymentParamsFromIncoming(Uri.parse('orderzhouse://payment/success?orderId=5&kind=admin'))!;
      expect(evil.isQuote, isFalse);
      expect(rewriteIncomingDeepLinkUri(Uri.parse('orderzhouse://payment/success?orderId=5&kind=admin')), isNot(contains('kind')));
    });

    test('cancel stays unpaid; success shows confirming until the server says paid', () {
      final cancel = PaymentReturnParams.fromRouteQuery({'status': 'cancel', 'orderId': '5', 'kind': 'quote'})!;
      expect(initialPaymentReturnUiState(isAuthenticated: true, isCancel: cancel.isCancel), PaymentReturnUiState.cancel);
      expect(shouldAttemptPaymentConfirmOnReturn(isAuthenticated: true, isCancel: cancel.isCancel), isFalse);
      expect(initialPaymentReturnUiState(isAuthenticated: true, isCancel: false), PaymentReturnUiState.confirming);
      expect(isQuotePaidFromBackend('unpaid'), isFalse);
      expect(isQuotePaidFromBackend(null), isFalse);
      expect(isQuotePaidFromBackend('paid'), isTrue);
      expect(paymentReturnStateAfterConfirmAttempts(paymentStatus: 'unpaid'), PaymentReturnUiState.pending);
    });
  });

  group('service snapshot (read-only)', () {
    final snapJson = {
      'serviceCode': 'translation',
      'version': 2,
      'name': {'ar': 'ترجمة', 'en': 'Translation'},
      'quantity': {'unit': 'pages', 'value': '4', 'unspecified': false},
      'fields': [
        {
          'key': 'lang',
          'type': 'select',
          'label': {'ar': 'اللغة', 'en': 'Language'},
          'options': [
            {'value': 'en', 'label': {'ar': 'إنجليزية', 'en': 'English'}},
          ],
        },
        {'key': 'source', 'type': 'file', 'label': {'ar': 'الملف', 'en': 'File'}},
        {'key': 'rush', 'type': 'checkbox', 'label': {'ar': 'مستعجل', 'en': 'Rush'}},
        {'key': 'future', 'type': 'signature', 'label': {'ar': 'توقيع', 'en': 'Signature'}},
      ],
      'values': {
        'lang': 'en',
        'source': [
          {'name': 'brief.pdf'},
        ],
        'rush': true,
        'future': 'raw-value',
      },
    };

    test('order model parses serviceForm; legacy orders have none', () {
      expect(ClientOrder.fromJson({'id': '1', 'title': 't', 'serviceForm': snapJson}).serviceForm!.version, 2);
      expect(ClientOrder.fromJson({'id': '1', 'title': 't'}).serviceForm, isNull);
    });

    test('rows use snapshot labels/options, never drop unknown field types', () {
      final rows = Map.fromEntries(ServiceFormSnapshot.tryParse(snapJson)!.displayRows('ar'));
      expect(rows['الكمية'], '4 صفحات');
      expect(rows['اللغة'], 'إنجليزية');
      expect(rows['الملف'], 'brief.pdf');
      expect(rows['مستعجل'], 'نعم');
      expect(rows['توقيع'], 'raw-value');
    });

    testWidgets('renders without any editable control', (tester) async {
      await tester.pumpWidget(host(ServiceFormSnapshotView(snapshot: ServiceFormSnapshot.tryParse(snapJson)!), locale: const Locale('en')));
      expect(find.byKey(const ValueKey('service-form-snapshot')), findsOneWidget);
      expect(find.text('Translation'), findsOneWidget);
      expect(find.text('English'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.byType(Checkbox), findsNothing);
    });
  });

  test('assignment-offer notifications open the offers screen (freelancer only)', () {
    const n = AppNotification(
      id: '1',
      title: 't',
      message: 'm',
      type: 'order.assignment.offered',
      actionUrl: '/dashboard/freelancer/assignment-offers',
      recipientRole: 'freelancer',
    );
    expect(resolveNotificationAction(n, currentUserRole: 'freelancer')?.route, AppRoutes.freelancerAssignmentOffers);
    expect(resolveNotificationAction(n, currentUserRole: 'client')?.route, isNot(AppRoutes.freelancerAssignmentOffers));
  });

  test('managed-order labels are localized (no raw draft / not_required)', () {
    expect(display.clientOrderStatusLabel('draft'), 'قيد الإعداد');
    expect(display.paymentStatusLabel('not_required'), 'غير مطلوب');
    expect(ClientOrder.fromJson({'id': '1', 'title': 't', 'orderStatus': 'draft', 'managedByAdmin': true}).statusLabel, 'قيد الإعداد');
  });
}
