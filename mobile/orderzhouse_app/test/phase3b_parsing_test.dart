import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/categories/data/category_models.dart';
import 'package:orderzhouse_app/features/orders/data/pool_order_models.dart';
import 'package:orderzhouse_app/features/public_pages/data/public_page_models.dart';

void main() {
  group('ServiceCategory parsing', () {
    test('parses snake_case API row', () {
      final category = ServiceCategory.fromJson({
        'id': 3,
        'slug': 'programming',
        'name': 'خدمات البرمجة',
        'name_en': 'Programming',
        'description': 'وصف',
        'image_url': '/images/programming.jpg',
        'sort_order': 2,
        'is_service_category': true,
      });

      expect(category.id, '3');
      expect(category.slug, 'programming');
      expect(category.name, 'خدمات البرمجة');
      expect(category.isServiceCategory, isTrue);
    });

    test('parseList reads success wrapper data array', () {
      final list = ServiceCategory.parseList({
        'success': true,
        'data': [
          {'id': 1, 'slug': 'design', 'name': 'تصميم', 'is_service_category': true},
        ],
      });
      expect(list, hasLength(1));
      expect(list.first.slug, 'design');
    });
  });

  group('PoolOrder parsing', () {
    test('parses public pool order camelCase', () {
      final order = PoolOrder.fromJson({
        'id': '101',
        'title': 'تطوير موقع',
        'projectType': 'bidding',
        'orderStatus': 'open_for_bids',
        'bidBudgetMin': 50,
        'bidBudgetMax': 200,
        'currencyCode': 'JOD',
        'createdAt': '2026-01-15T10:00:00.000Z',
        'category': {'id': '3', 'name': 'برمجة'},
        'applicantsCount': 4,
      });

      expect(order.id, '101');
      expect(order.projectTypeLabel, 'مناقصة');
      expect(order.statusLabel, 'مفتوح للعروض');
      expect(order.budgetLabel, contains('50'));
      expect(order.applicantsCount, 4);
    });

    test('PoolOrdersPage reads nested orders + pagination', () {
      final page = PoolOrdersPage.fromResponse({
        'success': true,
        'data': {
          'orders': [
            {'id': '1', 'title': 'طلب', 'projectType': 'fixed', 'budget': 100},
          ],
          'pagination': {'page': 1, 'totalPages': 3, 'total': 25},
        },
      });

      expect(page.orders, hasLength(1));
      expect(page.totalPages, 3);
      expect(page.hasMore, isTrue);
    });
  });

  group('PublicSitePage parsing', () {
    test('splits content paragraphs', () {
      final page = PublicSitePage.fromJson({
        'slug': 'privacy-policy',
        'title': 'الخصوصية',
        'content': 'فقرة أولى.\n\nفقرة ثانية.',
      });

      expect(page.paragraphs, hasLength(2));
      expect(page.paragraphs.first, 'فقرة أولى.');
    });

    test('fromResponse reads data.page', () {
      final page = PublicSitePage.fromResponse({
        'success': true,
        'data': {
          'page': {
            'slug': 'terms-conditions',
            'title': 'الشروط',
            'content': 'نص',
          },
        },
      });
      expect(page.slug, 'terms-conditions');
      expect(page.title, 'الشروط');
    });
  });
}
