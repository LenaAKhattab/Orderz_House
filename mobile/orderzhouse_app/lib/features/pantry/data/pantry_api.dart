import 'package:dio/dio.dart';

import 'pantry_models.dart';

class PantryApi {
  PantryApi(this._dio);

  final Dio _dio;

  Future<List<PantryRequest>> fetchOpenRequests() async {
    final response = await _dio.get<dynamic>('/freelancer/pantry/requests');
    return unwrapRequestMaps(response.data).map(PantryRequest.fromJson).toList();
  }

  Future<PantryRequestDetail> fetchRequest(String id) async {
    final response = await _dio.get<dynamic>('/freelancer/pantry/requests/$id');
    final data = unwrapDataMap(response.data) ?? {};
    final requestJson = data['request'];
    if (requestJson is! Map) {
      throw DioException(
        requestOptions: response.requestOptions,
        message: 'تعذر قراءة تفاصيل طلب بيت المونة.',
      );
    }
    var request = PantryRequest.fromJson(Map<String, dynamic>.from(requestJson));
    final myBid = request.myBid ??
        (data['myBid'] is Map ? PantryBid.fromJson(Map<String, dynamic>.from(data['myBid'] as Map)) : null);
    PantryDelivery? delivery = request.delivery;
    final deliveries = data['deliveries'];
    if (delivery == null && deliveries is List && deliveries.isNotEmpty && deliveries.first is Map) {
      delivery = PantryDelivery.fromJson(Map<String, dynamic>.from(deliveries.first as Map));
    }
    if (data['delivery'] is Map) {
      delivery = PantryDelivery.fromJson(Map<String, dynamic>.from(data['delivery'] as Map));
    }
    request = request.mergeDetail(myBid: myBid, delivery: delivery);
    return PantryRequestDetail(request: request, myBid: myBid, delivery: delivery);
  }

  Future<PantryBid> submitBid({
    required String requestId,
    required double amount,
    required int durationDays,
    required String message,
  }) async {
    final response = await _dio.post<dynamic>(
      '/freelancer/pantry/requests/$requestId/bids',
      data: {
        'amount': amount,
        'durationDays': durationDays,
        'message': message,
      },
    );
    final data = unwrapDataMap(response.data) ?? {};
    final bid = data['bid'];
    if (bid is Map) return PantryBid.fromJson(Map<String, dynamic>.from(bid));
    return const PantryBid(id: '');
  }

  Future<List<PantryRequest>> fetchMyWork() async {
    final response = await _dio.get<dynamic>('/freelancer/pantry/my-work');
    return unwrapRequestMaps(response.data).map(PantryRequest.fromJson).toList();
  }

  Future<PantryDelivery> submitDelivery({
    required String requestId,
    required String message,
    String? fileUrl,
    String? fileName,
  }) async {
    final files = <Map<String, String>>[];
    final url = fileUrl?.trim() ?? '';
    if (url.isNotEmpty) {
      files.add({
        'fileUrl': url,
        'fileName': (fileName ?? '').trim().isEmpty ? 'file' : fileName!.trim(),
      });
    }
    final response = await _dio.post<dynamic>(
      '/freelancer/pantry/requests/$requestId/deliveries',
      data: {
        'message': message,
        if (files.isNotEmpty) 'files': files,
      },
    );
    final data = unwrapDataMap(response.data) ?? {};
    final delivery = data['delivery'];
    if (delivery is Map) return PantryDelivery.fromJson(Map<String, dynamic>.from(delivery));
    throw DioException(
      requestOptions: response.requestOptions,
      message: 'تم إرسال التسليم.',
    );
  }
}
