import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_provider.dart';
import '../data/course_models.dart';
import '../data/freelancer_courses_api.dart';

final freelancerCoursesApiProvider = Provider<FreelancerCoursesApi>((ref) {
  return FreelancerCoursesApi(ref.watch(dioProvider));
});

final freelancerCoursesListProvider =
    AsyncNotifierProvider.autoDispose<FreelancerCoursesListController, List<FreelancerCourseSummary>>(
  FreelancerCoursesListController.new,
);

class FreelancerCoursesListController
    extends AutoDisposeAsyncNotifier<List<FreelancerCourseSummary>> {
  @override
  Future<List<FreelancerCourseSummary>> build() => _load();

  Future<List<FreelancerCourseSummary>> _load() {
    return ref.read(freelancerCoursesApiProvider).listMyCourses();
  }

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(_load);
  }
}

final freelancerCourseDetailsProvider = AsyncNotifierProvider.autoDispose
    .family<FreelancerCourseDetailsController, FreelancerCourseDetails, String>(
  FreelancerCourseDetailsController.new,
);

class FreelancerCourseDetailsController
    extends AutoDisposeFamilyAsyncNotifier<FreelancerCourseDetails, String> {
  @override
  Future<FreelancerCourseDetails> build(String courseId) {
    return ref.read(freelancerCoursesApiProvider).getCourseDetails(courseId);
  }

  Future<void> reload() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(freelancerCoursesApiProvider).getCourseDetails(arg),
    );
  }

  Future<void> markLessonComplete(String lessonId) async {
    await ref.read(freelancerCoursesApiProvider).markLessonComplete(
          courseId: arg,
          lessonId: lessonId,
        );
    await reload();
    ref.invalidate(freelancerCoursesListProvider);
  }

  Future<void> uploadCompletedExam(File file) async {
    await ref.read(freelancerCoursesApiProvider).uploadCompletedExam(
          courseId: arg,
          file: file,
        );
    await reload();
  }

  Future<void> submitCompletion({
    String? auditResponseText,
    List<num>? questionMarks,
  }) async {
    await ref.read(freelancerCoursesApiProvider).submitCourseCompletion(
          courseId: arg,
          auditResponseText: auditResponseText,
          questionMarks: questionMarks,
        );
    await reload();
    ref.invalidate(freelancerCoursesListProvider);
  }
}
