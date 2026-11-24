import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';

/// Smart Orders S3 — freelancer assignment offers (task + pay + deadline; no customer identity).
class AssignmentOffer {
  const AssignmentOffer({
    required this.id,
    required this.orderId,
    required this.orderCode,
    required this.title,
    required this.description,
    required this.status,
    required this.compensationAmount,
    required this.currency,
    this.durationValue,
    this.durationUnit,
    this.expiresAt,
    this.termsAmount,
    this.termsVersion,
    this.pendingChangeId,
    this.pendingChangeOld,
    this.pendingChangeNew,
    this.pendingChangeReason,
  });

  final String id;
  final String orderId;
  final String orderCode;
  final String title;
  final String description;
  final String status;
  final String compensationAmount;
  final String currency;
  final int? durationValue;
  final String? durationUnit;
  final DateTime? expiresAt;
  final String? termsAmount;
  final int? termsVersion;
  final String? pendingChangeId;
  final String? pendingChangeOld;
  final String? pendingChangeNew;
  final String? pendingChangeReason;

  /// Stale offers are never actionable, even if the list was loaded before the deadline passed.
  bool isActionable([DateTime? now]) =>
      status == 'pending' && (expiresAt == null || expiresAt!.isAfter(now ?? DateTime.now()));

  factory AssignmentOffer.fromJson(Map<String, dynamic> j) {
    final terms = j['terms'] is Map ? Map<String, dynamic>.from(j['terms'] as Map) : null;
    final change = j['pendingChange'] is Map ? Map<String, dynamic>.from(j['pendingChange'] as Map) : null;
    return AssignmentOffer(
      id: j['id']?.toString() ?? '',
      orderId: j['orderId']?.toString() ?? '',
      orderCode: j['orderCode']?.toString() ?? '',
      title: j['title']?.toString() ?? '',
      description: j['description']?.toString() ?? '',
      status: j['status']?.toString() ?? 'pending',
      compensationAmount: j['compensationAmount']?.toString() ?? '',
      currency: j['currency']?.toString() ?? 'JOD',
      durationValue: j['durationValue'] is num ? (j['durationValue'] as num).toInt() : int.tryParse('${j['durationValue']}'),
      durationUnit: j['durationUnit']?.toString(),
      expiresAt: DateTime.tryParse(j['expiresAt']?.toString() ?? ''),
      termsAmount: terms?['compensationAmount']?.toString(),
      termsVersion: terms?['termsVersion'] is num ? (terms!['termsVersion'] as num).toInt() : null,
      pendingChangeId: change?['id']?.toString(),
      pendingChangeOld: change?['oldAmount']?.toString(),
      pendingChangeNew: change?['newAmount']?.toString(),
      pendingChangeReason: change?['reason']?.toString(),
    );
  }
}

const List<String> kOfferRejectReasons = ['unavailable', 'outside_skills', 'deadline_too_short', 'compensation', 'other'];

const Map<String, String> kOfferRejectReasonLabelsAr = {
  'unavailable': 'غير متاح حاليًا',
  'outside_skills': 'خارج تخصصي',
  'deadline_too_short': 'المهلة قصيرة',
  'compensation': 'الأجر غير مناسب',
  'other': 'سبب آخر',
};

const Map<String, String> kOfferStatusLabelsAr = {
  'pending': 'بانتظار ردك',
  'accepted': 'مقبول',
  'rejected': 'مرفوض',
  'expired': 'منتهي',
  'cancelled': 'مسحوب',
};

class AssignmentOffersApi {
  AssignmentOffersApi(this._dio);
  final Dio _dio;

  Future<List<AssignmentOffer>> list() async {
    final res = await _dio.get<dynamic>('/freelancer/assignment-offers');
    final body = res.data;
    final data = body is Map && body['data'] is Map ? Map<String, dynamic>.from(body['data'] as Map) : const <String, dynamic>{};
    final raw = data['offers'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((e) => AssignmentOffer.fromJson(Map<String, dynamic>.from(e))).toList();
  }

  Future<void> accept(String id) => _dio.post<dynamic>('/freelancer/assignment-offers/$id/accept');
  Future<void> reject(String id, String reasonCode) =>
      _dio.post<dynamic>('/freelancer/assignment-offers/$id/reject', data: {'reasonCode': reasonCode});
  Future<void> respondToChange(String changeId, {required bool approve}) =>
      _dio.post<dynamic>('/freelancer/commercial-changes/$changeId/respond', data: {'approve': approve});
}

final assignmentOffersApiProvider = Provider<AssignmentOffersApi>((ref) => AssignmentOffersApi(ref.watch(dioProvider)));

final assignmentOffersProvider = FutureProvider.autoDispose<List<AssignmentOffer>>((ref) {
  return ref.watch(assignmentOffersApiProvider).list();
});
