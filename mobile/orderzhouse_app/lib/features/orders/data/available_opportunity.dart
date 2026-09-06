import '../../orders/data/order_display_helpers.dart' as display;
import '../../orders/data/pool_order_models.dart';
import '../../pantry/data/pantry_models.dart';
import '../../pantry/presentation/pantry_display.dart';

enum OpportunitySource { normalOrder, pantryRequest }

class AvailableOpportunity {
  const AvailableOpportunity({
    required this.id,
    required this.source,
    required this.title,
    this.description,
    this.budgetLabel,
    this.deliveryDaysLabel,
    this.categoryName,
    this.skills = const [],
    this.applicantsCount = 0,
    this.status,
    this.projectType,
    this.isBidding = false,
    this.createdAt,
    this.budgetValue,
    this.budgetMin,
    this.budgetMax,
    this.poolOrder,
    this.pantryRequest,
  });

  final String id;
  final OpportunitySource source;
  final String title;
  final String? description;
  final String? budgetLabel;
  final String? deliveryDaysLabel;
  final String? categoryName;
  final List<String> skills;
  final int applicantsCount;
  final String? status;
  final String? projectType;
  final bool isBidding;
  final String? createdAt;
  final double? budgetValue;
  final double? budgetMin;
  final double? budgetMax;
  final PoolOrder? poolOrder;
  final PantryRequest? pantryRequest;

  bool get isPantryRequest => source == OpportunitySource.pantryRequest;

  String get projectTypeLabel => display.projectTypeLabel(projectType);

  String? get publishedAtLabel => createdAt;

  factory AvailableOpportunity.fromPool(PoolOrder order) {
    return AvailableOpportunity(
      id: order.id,
      source: OpportunitySource.normalOrder,
      title: order.title,
      description: order.description,
      budgetLabel: order.budgetLabel,
      deliveryDaysLabel: order.durationText,
      categoryName: order.category?.name,
      applicantsCount: order.applicantsCount,
      status: order.orderStatus,
      projectType: order.projectType ?? (order.isBidding ? 'bidding' : 'fixed'),
      isBidding: order.isBidding,
      createdAt: order.publishedAtLabel,
      budgetValue: order.budget,
      budgetMin: order.bidBudgetMin,
      budgetMax: order.bidBudgetMax,
      poolOrder: order,
    );
  }

  factory AvailableOpportunity.fromPantry(PantryRequest request) {
    final pricing = (request.pricingType ?? 'fixed').toLowerCase();
    final bidding = pricing == 'bidding';
    final budget = pantryBudgetLabel(request);
    final duration = pantryDurationLabel(request);
    return AvailableOpportunity(
      id: request.id,
      source: OpportunitySource.pantryRequest,
      title: request.title.trim().isEmpty ? 'طلب' : request.title,
      description: request.description,
      budgetLabel: budget == '—' ? null : budget,
      deliveryDaysLabel: duration == '—' ? null : duration,
      skills: request.skills,
      applicantsCount: request.bidsCount ?? 0,
      status: request.status,
      projectType: bidding ? 'bidding' : 'fixed',
      isBidding: bidding,
      createdAt: request.createdAt,
      budgetValue: request.fixedBudget,
      budgetMin: request.budgetMin,
      budgetMax: request.budgetMax,
      pantryRequest: request,
    );
  }

  DateTime? get sortDate => DateTime.tryParse(createdAt ?? '');
}

List<AvailableOpportunity> mergeAvailableOpportunities({
  required List<PoolOrder> poolOrders,
  required List<PantryRequest> pantryRequests,
}) {
  final items = [
    ...poolOrders.map(AvailableOpportunity.fromPool),
    ...pantryRequests.map(AvailableOpportunity.fromPantry),
  ];
  items.sort((a, b) {
    final da = a.sortDate;
    final db = b.sortDate;
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return db.compareTo(da);
  });
  return items;
}
