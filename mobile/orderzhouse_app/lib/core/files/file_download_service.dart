import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../errors/api_error_message.dart';
import '../network/dio_provider.dart';
import 'order_file_download_paths.dart';

final fileDownloadServiceProvider = Provider<FileDownloadService>((ref) {
  return FileDownloadService(ref.watch(dioProvider));
});

class FileDownloadService {
  FileDownloadService(this._dio);

  final Dio _dio;

  static const _downloadTimeout = Duration(seconds: 120);

  Future<String> downloadAndOpen({
    required OrderFileDownloadRole role,
    required String orderId,
    required String fileId,
    String? originalName,
  }) async {
    final path = buildOrderFileDownloadPath(role: role, orderId: orderId, fileId: fileId);
    try {
      final response = await _dio.get<List<int>>(
        path,
        options: Options(
          responseType: ResponseType.bytes,
          receiveTimeout: _downloadTimeout,
          headers: const {'Accept': '*/*'},
        ),
      );

      final bytes = response.data;
      if (bytes == null || bytes.isEmpty) {
        throw DioException(
          requestOptions: response.requestOptions,
          message: 'الملف فارغ أو غير متاح.',
        );
      }

      final fileName = sanitizeDownloadFileName(originalName, fileId: fileId);
      final dir = await getTemporaryDirectory();
      final localPath = '${dir.path}${Platform.pathSeparator}$fileName';
      final file = File(localPath);
      await file.writeAsBytes(bytes, flush: true);

      final openResult = await OpenFilex.open(localPath);
      if (openResult.type != ResultType.done) {
        throw StateError(openResult.message.isNotEmpty ? openResult.message : 'تعذر فتح الملف على الجهاز.');
      }

      return localPath;
    } on DioException catch (e) {
      throw DioException(
        requestOptions: e.requestOptions,
        response: e.response,
        type: e.type,
        message: orderFileDownloadErrorMessage(e),
        error: e.error,
      );
    }
  }
}

String orderFileDownloadErrorMessage(DioException error) {
  final status = error.response?.statusCode;
  if (status == 403) return 'لا تملك صلاحية الوصول لهذا الملف.';
  if (status == 404) return 'الملف غير متاح.';

  final data = error.response?.data;
  if (data is List<int> && data.isNotEmpty) {
    try {
      final text = utf8.decode(data);
      final decoded = jsonDecode(text);
      if (decoded is Map) {
        final message = decoded['message'];
        if (message is String && message.trim().isNotEmpty) {
          return message.trim();
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  return apiErrorMessage(error, fallback: 'تعذر تحميل الملف.');
}
