import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/freelancer/data/freelancer_my_order_models.dart';
import 'package:orderzhouse_app/features/freelancer/presentation/submit_freelancer_delivery_sheet.dart';

void main() {
  // Regression (8112 emulator QA): the sheet put a full-width OhButton inside a Row, which
  // failed layout and left an empty barrier — freelancers could not deliver from the app.
  testWidgets('delivery sheet lays out and shows its actions', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                onPressed: () => showSubmitFreelancerDeliverySheet(
                  context,
                  order: const FreelancerMyOrder(id: '1', title: 'طلب اختبار', orderStatus: 'in_progress'),
                  isSubmitting: false,
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('ملفات التسليم'), findsOneWidget);
    expect(find.text('إضافة ملفات'), findsOneWidget);
    expect(find.text('إرسال التسليم'), findsOneWidget);
    expect(find.text('إلغاء'), findsOneWidget);
  });
}
