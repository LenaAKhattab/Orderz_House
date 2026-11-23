import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:orderzhouse_app/features/client_orders/data/create_order_form_data.dart';
import 'package:orderzhouse_app/features/client_orders/data/create_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/service_catalog_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/service_catalog_repository.dart';
import 'package:orderzhouse_app/features/client_orders/data/service_form_logic.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/service_dynamic_fields.dart';

Map<String, dynamic> _l(String en) => {'ar': 'ع $en', 'en': en};

Map<String, dynamic> catalogJson({int pptVersion = 1, String catalogVersion = 'abc'}) => {
      'success': true,
      'data': {
        'catalogVersion': catalogVersion,
        'categories': [
          {'id': '2', 'name': 'تصميم', 'nameEn': 'Design'},
        ],
        'services': [
          {
            'serviceCode': 'presentation_design',
            'categoryId': '2',
            'version': pptVersion,
            'name': _l('Presentation'),
            'quantity': {'unit': 'slides', 'required': true, 'min': 1, 'max': 300},
            'fields': [
              {
                'key': 'presentation_type',
                'type': 'select',
                'label': _l('Type'),
                'required': true,
                'options': [
                  {'value': 'academic', 'label': _l('Academic')},
                  {'value': 'business', 'label': _l('Business')},
                ],
              },
              {'key': 'charts', 'type': 'checkbox', 'label': _l('Charts')},
              {
                'key': 'chart_count',
                'type': 'number',
                'label': _l('Chart count'),
                'min': 1,
                'max': 9,
                'showIf': {'field': 'charts', 'in': [true]},
              },
              {
                'key': 'output_formats',
                'type': 'multiselect',
                'label': _l('Formats'),
                'required': true,
                'min': 1,
                'options': [
                  {'value': 'pptx', 'label': _l('PPTX')},
                  {'value': 'pdf', 'label': _l('PDF')},
                ],
              },
            ],
          },
          {
            'serviceCode': 'excel_data',
            'categoryId': '1',
            'version': 1,
            'name': _l('Excel'),
            'quantity': {'unit': 'worksheets', 'required': true},
            'fields': [],
          },
          {
            'serviceCode': 'logo_design',
            'categoryId': '2',
            'version': 1,
            'name': _l('Logo'),
            'quantity': {'unit': 'concepts', 'required': true},
            // A file field is not renderable on mobile → the service must never be offered.
            'fields': [
              {'key': 'visual_references', 'type': 'file', 'label': _l('Refs')},
            ],
          },
        ],
      },
    };

class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.responder);
  final ResponseBody Function(RequestOptions options) responder;
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, {int status = 200, String etag = 'W/"cat-abc"'}) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: ['application/json'],
        'etag': [etag],
      },
    );

void main() {
  group('catalog parsing', () {
    final catalog = ServiceCatalog.fromResponse(catalogJson());

    test('server services drive the app; unsupported field types are hidden', () {
      expect(catalog.services.map((s) => s.serviceCode), ['presentation_design', 'excel_data']);
      expect(catalog.catalogVersion, 'abc');
    });

    test('category → service filtering and correct units', () {
      expect(catalog.forCategory('2').map((s) => s.serviceCode), ['presentation_design']);
      expect(catalog.forCategory('2').single.quantity.unit, 'slides');
      expect(unitLabel('slides', 'ar'), 'شرائح');
      expect(unitLabel('worksheets', 'en'), 'worksheets');
      expect(catalog.services.firstWhere((s) => s.serviceCode == 'excel_data').quantity.unit, 'worksheets');
    });

    test('mobile allowlist never includes file / datetime', () {
      expect(kMobileSupportedFieldTypes.contains('file'), isFalse);
      expect(kMobileSupportedFieldTypes.contains('datetime'), isFalse);
    });
  });

  group('validation + payload', () {
    final svc = ServiceCatalog.fromResponse(catalogJson(pptVersion: 4)).services.first;

    test('required fields, quantity, bounds and conditional visibility', () {
      expect(validateServiceForm(svc, const ServiceFormDraft(serviceCode: 'presentation_design')),
          {'presentation_type': 'required', 'output_formats': 'required', 'quantity': 'required'});
      const hidden = ServiceFormDraft(
        serviceCode: 'presentation_design',
        values: {'presentation_type': 'academic', 'output_formats': ['pptx'], 'charts': false, 'chart_count': '99'},
        quantity: '12',
      );
      expect(validateServiceForm(svc, hidden), isEmpty);
      const shown = ServiceFormDraft(
        serviceCode: 'presentation_design',
        values: {'presentation_type': 'academic', 'output_formats': ['pptx'], 'charts': true, 'chart_count': '99'},
        quantity: '12',
      );
      expect(validateServiceForm(svc, shown)['chart_count'], 'above_max');
      expect(validateServiceForm(svc, hidden.withQuantity(quantity: '1000'))['quantity'], 'above_max');
    });

    test('payload carries the exact schema version and only visible values', () {
      const draft = ServiceFormDraft(
        serviceCode: 'presentation_design',
        version: 4,
        values: {'presentation_type': 'business', 'output_formats': ['pdf'], 'charts': false, 'chart_count': '3'},
        quantity: '20',
      );
      final p = buildServiceFormPayload(svc, draft)!;
      expect(p['version'], 4);
      expect(p['quantity'], '20');
      expect((p['values'] as Map).containsKey('chart_count'), isFalse);
    });

    test('multipart body includes serviceForm JSON (same contract as web)', () async {
      const draft = CreateOrderDraft(
        projectType: 'bidding',
        categoryId: '2',
        title: 'Deck',
        description: 'A presentation for my course project',
        durationValue: '3',
        bidBudgetMin: '10',
        bidBudgetMax: '20',
      );
      final fd = await buildCreateOrderFormData(draft, const [], serviceForm: {'serviceCode': 'presentation_design', 'version': 4});
      final field = fd.fields.firstWhere((e) => e.key == 'serviceForm');
      expect(jsonDecode(field.value)['version'], 4);
    });

    test('stale-version server error is detected for cache invalidation', () {
      final err = DioException(
        requestOptions: RequestOptions(path: '/client/orders'),
        response: Response(
          requestOptions: RequestOptions(path: '/client/orders'),
          statusCode: 409,
          data: {'code': 'SMART_ORDER_FORM_STALE'},
        ),
      );
      expect(isStaleServiceFormError(err), isTrue);
      expect(isStaleServiceFormError(Exception('x')), isFalse);
    });
  });

  group('version-aware cache', () {
    test('uses If-None-Match / 304, and refetches after invalidate()', () async {
      var version = 1;
      final adapter = _FakeAdapter((o) {
        final inm = o.headers['If-None-Match'];
        if (inm == 'W/"cat-v$version"') return ResponseBody.fromString('', 304);
        return _json(catalogJson(pptVersion: version, catalogVersion: 'v$version'), etag: 'W/"cat-v$version"');
      });
      final dio = Dio(BaseOptions(baseUrl: 'https://example.test/api'))..httpClientAdapter = adapter;
      final repo = ServiceCatalogRepository(dio);
      final first = await repo.fetch();
      expect(first.services.first.version, 1);
      expect(adapter.requests.first.queryParameters['fieldTypes'], contains('multiselect'));
      final second = await repo.fetch(); // 304 → same cached catalog
      expect(identical(first, second), isTrue);
      version = 2; // catalog edited on the server
      repo.invalidate();
      final third = await repo.fetch();
      expect(third.services.first.version, 2);
    });
  });

  testWidgets('dynamic fields render slides unit, options and conditional field', (tester) async {
    final svc = ServiceCatalog.fromResponse(catalogJson()).services.first;
    var draft = const ServiceFormDraft(serviceCode: 'presentation_design', version: 1);
    await tester.pumpWidget(
      StatefulBuilder(
        builder: (context, setState) => MaterialApp(
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: SingleChildScrollView(
              child: ServiceDynamicFields(
                service: svc,
                draft: draft,
                errors: const {'presentation_type': 'required'},
                onValue: (k, v) => setState(() => draft = draft.withValue(k, v)),
                onQuantity: ({quantity, unspecified}) => setState(() => draft = draft.withQuantity(quantity: quantity, unspecified: unspecified)),
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('شرائح'), findsWidgets);
    expect(find.text('هذا الحقل مطلوب.'), findsOneWidget);
    expect(find.textContaining('ع Chart count'), findsNothing);
    await tester.tap(find.byType(CheckboxListTile).first);
    await tester.pumpAndSettle();
    expect(find.textContaining('ع Chart count'), findsOneWidget);
  });
}
