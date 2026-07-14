import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/network/json_helpers.dart';
import 'course_models.dart';

class FreelancerCoursesApi {
  FreelancerCoursesApi(this._dio);

  final Dio _dio;

  Future<List<FreelancerCourseSummary>> listMyCourses() async {
    final res = await _dio.get<Map<String, dynamic>>('/freelancer/courses');
    final data = res.data?['data'];
    final maps = extractList(data, nestedKey: 'courses');
    return maps.map(FreelancerCourseSummary.fromJson).where((c) => c.id.isNotEmpty).toList();
  }

  Future<FreelancerCourseDetails> getCourseDetails(String courseId) async {
    final res = await _dio.get<Map<String, dynamic>>('/freelancer/courses/$courseId');
    final data = res.data?['data'];
    if (data is! Map) {
      throw DioException(
        requestOptions: res.requestOptions,
        message: 'تعذر تحميل تفاصيل الدورة.',
      );
    }
    return FreelancerCourseDetails.fromJson(Map<String, dynamic>.from(data));
  }

  Future<CourseProgress> markLessonComplete({
    required String courseId,
    required String lessonId,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/freelancer/courses/$courseId/lessons/$lessonId/complete',
    );
    final data = res.data?['data'];
    final progress = data is Map ? data['progress'] : null;
    return CourseProgress.fromJson(
      progress is Map ? Map<String, dynamic>.from(progress) : null,
    );
  }

  Future<FreelancerCourseDetails> uploadCompletedExam({
    required String courseId,
    required File file,
  }) async {
    final form = FormData.fromMap({
      'completedExamFile': await MultipartFile.fromFile(
        file.path,
        filename: file.uri.pathSegments.isNotEmpty ? file.uri.pathSegments.last : 'exam.pdf',
      ),
    });
    final res = await _dio.post<Map<String, dynamic>>(
      '/freelancer/courses/$courseId/completed-exam-file',
      data: form,
      options: Options(receiveTimeout: const Duration(seconds: 120)),
    );
    final data = res.data?['data'];
    if (data is! Map) {
      throw DioException(requestOptions: res.requestOptions, message: 'تعذر رفع ملف الاختبار.');
    }
    return FreelancerCourseDetails.fromJson(Map<String, dynamic>.from(data));
  }

  Future<FreelancerCourseDetails> submitCourseCompletion({
    required String courseId,
    String? auditResponseText,
    String? auditNotes,
    List<num>? questionMarks,
    File? auditResponseFile,
  }) async {
    final hasFile = auditResponseFile != null;
    final hasMarks = questionMarks != null && questionMarks.isNotEmpty;

    if (hasFile || hasMarks) {
      final map = <String, dynamic>{};
      if (auditResponseText != null && auditResponseText.trim().isNotEmpty) {
        map['auditResponseText'] = auditResponseText.trim();
      }
      if (auditNotes != null && auditNotes.trim().isNotEmpty) {
        map['auditNotes'] = auditNotes.trim();
      }
      if (hasMarks) map['questionMarks'] = jsonEncode(questionMarks);
      if (hasFile) {
        map['auditResponseFile'] = await MultipartFile.fromFile(
          auditResponseFile.path,
          filename: auditResponseFile.uri.pathSegments.isNotEmpty
              ? auditResponseFile.uri.pathSegments.last
              : 'response.pdf',
        );
      }
      final res = await _dio.post<Map<String, dynamic>>(
        '/freelancer/courses/$courseId/complete',
        data: FormData.fromMap(map),
        options: Options(receiveTimeout: const Duration(seconds: 120)),
      );
      final data = res.data?['data'];
      if (data is! Map) {
        throw DioException(requestOptions: res.requestOptions, message: 'تعذر إرسال إكمال الدورة.');
      }
      return FreelancerCourseDetails.fromJson(Map<String, dynamic>.from(data));
    }

    final body = <String, dynamic>{};
    if (auditResponseText != null && auditResponseText.trim().isNotEmpty) {
      body['auditResponseText'] = auditResponseText.trim();
    }
    if (auditNotes != null && auditNotes.trim().isNotEmpty) {
      body['auditNotes'] = auditNotes.trim();
    }
    final res = await _dio.post<Map<String, dynamic>>(
      '/freelancer/courses/$courseId/complete',
      data: body,
    );
    final data = res.data?['data'];
    if (data is! Map) {
      throw DioException(requestOptions: res.requestOptions, message: 'تعذر إرسال إكمال الدورة.');
    }
    return FreelancerCourseDetails.fromJson(Map<String, dynamic>.from(data));
  }

  /// Authenticated PDF stream → temp file → open.
  Future<String> openCourseFile({
    required String courseId,
    required String fileKind,
    bool forceDownload = true,
  }) async {
    final res = await _dio.get<List<int>>(
      '/freelancer/courses/$courseId/files/$fileKind',
      queryParameters: forceDownload ? {'download': '1'} : null,
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 120),
        headers: const {'Accept': '*/*'},
      ),
    );
    final bytes = res.data;
    if (bytes == null || bytes.isEmpty) {
      throw DioException(requestOptions: res.requestOptions, message: 'الملف فارغ أو غير متاح.');
    }
    final dir = await getTemporaryDirectory();
    final localPath = '${dir.path}${Platform.pathSeparator}course_${courseId}_$fileKind.pdf';
    final file = File(localPath);
    await file.writeAsBytes(bytes, flush: true);
    final openResult = await OpenFilex.open(localPath);
    if (openResult.type != ResultType.done) {
      throw StateError(openResult.message.isNotEmpty ? openResult.message : 'تعذر فتح الملف.');
    }
    return localPath;
  }
}
