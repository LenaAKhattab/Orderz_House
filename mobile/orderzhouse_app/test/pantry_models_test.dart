import 'package:flutter_test/flutter_test.dart';

import 'package:orderzhouse_app/features/pantry/data/pantry_models.dart';
import 'package:orderzhouse_app/features/pantry/data/pantry_status.dart';

void main() {
  test('pantry status labels', () {
    expect(pantryStatusLabelAr('open_for_bids'), 'مفتوح للعروض');
    expect(pantryStatusLabelAr('assigned'), 'قيد التنفيذ');
    expect(pantryStatusLabelAr('in_progress'), 'قيد التنفيذ');
    expect(pantryStatusLabelAr('submitted'), 'بانتظار المراجعة');
    expect(pantryStatusLabelAr('revision_requested'), 'طلب تعديل');
    expect(pantryStatusLabelAr('approved'), 'مكتمل');
    expect(pantryStatusLabelAr('archived'), 'مؤرشف');
  });

  test('pantry request parses null extras without failing', () {
    final request = PantryRequest.fromJson({
      'id': 9,
      'title': 'عنوان',
      'status': 'open_for_bids',
      'pricingType': 'fixed',
      'fixedBudget': '50',
      'skills': null,
      'attachments': null,
      'acceptedBid': null,
      'delivery': null,
      'userBidCreditsBalance': 3,
    });
    expect(request.id, '9');
    expect(request.fixedBudget, 50);
    expect(request.skills, isEmpty);
    expect(request.acceptedBid, isNull);
    expect(pantryCanBid(request.status), isTrue);
  });
}
