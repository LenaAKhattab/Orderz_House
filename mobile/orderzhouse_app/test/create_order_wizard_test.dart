import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/core/theme/app_theme.dart';
import 'package:orderzhouse_app/core/widgets/oh_widgets.dart';
import 'package:orderzhouse_app/features/auth/domain/auth_user.dart';
import 'package:orderzhouse_app/features/auth/presentation/auth_controller.dart';
import 'package:orderzhouse_app/features/client_orders/data/create_order_models.dart';
import 'package:orderzhouse_app/features/client_orders/data/order_attachment_limits.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/create_order_controller.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/create_order_screen.dart';
import 'package:orderzhouse_app/features/client_orders/presentation/order_attachments_section.dart';

const _client = AuthUser(
  id: '10',
  email: 'client@example.com',
  primaryRole: 'client',
  roles: ['client'],
);

const _validFixed = CreateOrderDraft(
  projectType: 'fixed',
  categoryId: '3',
  title: 'تصميم شعار',
  description: 'وصف كافٍ للطلب هنا',
  durationValue: '5',
  budget: '150',
);

const _validBidding = CreateOrderDraft(
  projectType: 'bidding',
  categoryId: '2',
  title: 'تطوير موقع',
  description: 'وصف كافٍ للطلب هنا',
  durationValue: '7',
  bidBudgetMin: '100',
  bidBudgetMax: '300',
);

class _SeededAuthController extends AuthController {
  @override
  AuthState build() {
    return const AuthState(status: AuthStatus.authenticated, user: _client);
  }
}

class _SeededCreateOrderController extends CreateOrderController {
  _SeededCreateOrderController({this.initial});

  final CreateOrderState? initial;

  @override
  CreateOrderState build() {
    return initial ??
        const CreateOrderState(
          step: 2,
          draft: CreateOrderDraft(projectType: 'fixed', categoryId: '1'),
          categoriesLoading: false,
        );
  }
}

void main() {
  group('validateCreateOrderStep', () {
    test('step 0 requires project type', () {
      final result = validateCreateOrderStep(0, const CreateOrderDraft());
      expect(result.isValid, isFalse);
      expect(result.errorFor('projectType'), isNotNull);
    });

    test('step 1 requires category', () {
      final result = validateCreateOrderStep(
        1,
        const CreateOrderDraft(projectType: 'fixed'),
      );
      expect(result.isValid, isFalse);
      expect(result.errorFor('categoryId'), isNotNull);
    });

    test('step 2 (details) requires title description duration', () {
      final result = validateCreateOrderStep(
        2,
        const CreateOrderDraft(projectType: 'fixed', categoryId: '1'),
      );
      expect(result.isValid, isFalse);
      expect(result.errorFor('title'), isNotNull);
      expect(result.errorFor('description'), isNotNull);
      expect(result.errorFor('durationValue'), isNotNull);
    });

    test('step 2 accepts filled details', () {
      final result = validateCreateOrderStep(2, _validFixed);
      expect(result.isValid, isTrue);
    });

    test('step 3 fixed requires budget', () {
      final result = validateCreateOrderStep(
        3,
        _validFixed.copyWith(budget: ''),
      );
      expect(result.isValid, isFalse);
      expect(result.errorFor('budget'), isNotNull);
    });

    test('step 3 bidding requires min/max', () {
      final result = validateCreateOrderStep(
        3,
        _validBidding.copyWith(bidBudgetMin: '', bidBudgetMax: ''),
      );
      expect(result.isValid, isFalse);
      expect(result.errorFor('bidBudgetMin'), isNotNull);
      expect(result.errorFor('bidBudgetMax'), isNotNull);
    });
  });

  group('create order payloads', () {
    test('fixed payload is correct', () {
      final payload = buildCreateOrderPayload(_validFixed);
      expect(payload['projectType'], 'fixed');
      expect(payload['title'], 'تصميم شعار');
      expect(payload['description'], 'وصف كافٍ للطلب هنا');
      expect(payload['categoryId'], 3);
      expect(payload['budget'], 150.0);
      expect(payload['durationValue'], 5);
      expect(payload['durationUnit'], 'days');
      expect(payload.containsKey('bidBudgetMin'), isFalse);
      expect(payload.containsKey('userId'), isFalse);
    });

    test('bidding payload is correct', () {
      final payload = buildCreateOrderPayload(_validBidding);
      expect(payload['projectType'], 'bidding');
      expect(payload['bidBudgetMin'], 100.0);
      expect(payload['bidBudgetMax'], 300.0);
      expect(payload.containsKey('budget'), isFalse);
    });
  });

  group('attachments validation', () {
    test('rejects unsupported extension', () {
      final result = validateOrderAttachments([
        const OrderAttachmentDraft(name: 'malware.exe', size: 100),
      ]);
      expect(result.isValid, isFalse);
      expect(result.message, isNotNull);
    });

    test('accepts allowed attachment within limits', () {
      final result = validateOrderAttachments([
        const OrderAttachmentDraft(name: 'brief.pdf', size: 1024),
      ]);
      expect(result.isValid, isTrue);
    });
  });

  group('CreateOrderController navigation', () {
    test('nextStep blocked on empty details; previous preserves draft', () {
      final container = ProviderContainer(
        overrides: [
          createOrderControllerProvider.overrideWith(
            () => _SeededCreateOrderController(
              initial: const CreateOrderState(
                step: 2,
                draft: CreateOrderDraft(
                  projectType: 'fixed',
                  categoryId: '1',
                  title: 'عنوان محفوظ',
                  description: 'وصف محفوظ بما يكفي هنا',
                  durationValue: '3',
                ),
                categoriesLoading: false,
              ),
            ),
          ),
        ],
      );
      addTearDown(container.dispose);

      final notifier = container.read(createOrderControllerProvider.notifier);

      // Empty details block next when cleared
      notifier.updateDraft(
        const CreateOrderDraft(projectType: 'fixed', categoryId: '1'),
      );
      expect(notifier.nextStep(), isFalse);
      expect(container.read(createOrderControllerProvider).step, 2);
      expect(container.read(createOrderControllerProvider).stepErrors['title'], isNotNull);

      notifier.updateDraft(
        const CreateOrderDraft(
          projectType: 'fixed',
          categoryId: '1',
          title: 'عنوان محفوظ',
          description: 'وصف محفوظ بما يكفي هنا',
          durationValue: '3',
        ),
      );
      expect(notifier.nextStep(), isTrue);
      expect(container.read(createOrderControllerProvider).step, 3);

      notifier.previousStep();
      final afterBack = container.read(createOrderControllerProvider);
      expect(afterBack.step, 2);
      expect(afterBack.draft.title, 'عنوان محفوظ');
      expect(afterBack.draft.description, 'وصف محفوظ بما يكفي هنا');
      expect(afterBack.draft.durationValue, '3');
    });
  });

  group('Create order UI — details step', () {
    testWidgets('step 3 label shows details fields and is not blank', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(_SeededAuthController.new),
            createOrderControllerProvider.overrideWith(
              () => _SeededCreateOrderController(),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const CreateClientOrderScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('الخطوة 3 من 5'), findsOneWidget);
      expect(find.textContaining('التفاصيل'), findsWidgets);
      expect(find.text('تفاصيل الطلب'), findsOneWidget);
      expect(find.text('عنوان الطلب'), findsOneWidget);
      expect(find.text('وصف الطلب'), findsOneWidget);
      expect(find.text('مدة التنفيذ (بالأيام)'), findsOneWidget);
      expect(find.text('المرفقات'), findsOneWidget);
      expect(find.text('إضافة ملفات'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('next from empty details shows validation errors', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authControllerProvider.overrideWith(_SeededAuthController.new),
            createOrderControllerProvider.overrideWith(
              () => _SeededCreateOrderController(),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const CreateClientOrderScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('التالي'));
      await tester.pumpAndSettle();

      expect(find.text('عنوان الطلب مطلوب.'), findsOneWidget);
      expect(find.textContaining('الخطوة 3 من 5'), findsOneWidget);
    });

    testWidgets('attachments OhButton does not force infinite width in theme', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            createOrderControllerProvider.overrideWith(
              () => _SeededCreateOrderController(),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const Scaffold(
              body: SingleChildScrollView(
                padding: EdgeInsets.all(16),
                child: OrderAttachmentsSection(),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('إضافة ملفات'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('OhButton expand:false is safe inside Row', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          home: Scaffold(
            body: Row(
              children: [
                const Expanded(child: Text('label')),
                OhButton(
                  label: 'إضافة',
                  outlined: true,
                  expand: false,
                  onPressed: () {},
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('إضافة'), findsOneWidget);
    });
  });
}
