import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/network/dio_provider.dart';
import 'account_activation_kyc_models.dart';

final accountActivationKycApiProvider = Provider<AccountActivationKycApi>((ref) {
  return AccountActivationKycApi(ref.watch(dioProvider));
});

class AccountActivationKycApi {
  AccountActivationKycApi(this._dio);

  final Dio _dio;

  Future<AccountActivationKycStatus> fetchStatus() async {
    final response = await _dio.get<dynamic>('/freelancer/account-activation');
    return AccountActivationKycStatus.fromResponse(response.data);
  }

  Future<AccountActivationKycStatus> submit({
    required File idFront,
    required File idBack,
    required bool termsAccepted,
    String? termsVersion,
  }) async {
    final form = FormData.fromMap({
      'idFront': await MultipartFile.fromFile(
        idFront.path,
        filename: _fileName(idFront, fallback: 'id-front.jpg'),
      ),
      'idBack': await MultipartFile.fromFile(
        idBack.path,
        filename: _fileName(idBack, fallback: 'id-back.jpg'),
      ),
      'termsAccepted': termsAccepted ? 'true' : 'false',
      if (termsVersion != null && termsVersion.trim().isNotEmpty) 'termsVersion': termsVersion.trim(),
    });

    final response = await _dio.post<dynamic>(
      '/freelancer/account-activation/submit',
      data: form,
      options: Options(
        contentType: 'multipart/form-data',
        receiveTimeout: const Duration(seconds: 120),
        sendTimeout: const Duration(seconds: 120),
      ),
    );
    return AccountActivationKycStatus.fromResponse(response.data);
  }

  static String _fileName(File file, {required String fallback}) {
    final segments = file.uri.pathSegments;
    if (segments.isEmpty) return fallback;
    final name = segments.last.trim();
    return name.isEmpty ? fallback : name;
  }
}
