import '../../../core/network/json_helpers.dart';

class CourseProgress {
  const CourseProgress({
    required this.totalLessons,
    required this.completedLessons,
    required this.percentage,
  });

  final int totalLessons;
  final int completedLessons;
  final int percentage;

  factory CourseProgress.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const CourseProgress(totalLessons: 0, completedLessons: 0, percentage: 0);
    }
    return CourseProgress(
      totalLessons: readInt(json, 'totalLessons', 'total_lessons') ?? 0,
      completedLessons: readInt(json, 'completedLessons', 'completed_lessons') ?? 0,
      percentage: readInt(json, 'percentage', 'percentage') ?? 0,
    );
  }

  bool get isComplete => totalLessons > 0 && completedLessons >= totalLessons;
}

class FreelancerCourseSummary {
  const FreelancerCourseSummary({
    required this.id,
    required this.title,
    this.description,
    this.coverImage,
    this.isTestingEnabled = false,
    this.courseCompletedAt,
    this.accessMode = 'assigned',
    this.progress = const CourseProgress(totalLessons: 0, completedLessons: 0, percentage: 0),
  });

  final String id;
  final String title;
  final String? description;
  final String? coverImage;
  final bool isTestingEnabled;
  final DateTime? courseCompletedAt;
  final String accessMode;
  final CourseProgress progress;

  bool get isCompleted =>
      courseCompletedAt != null || (!isTestingEnabled && progress.isComplete && progress.totalLessons > 0);

  String get statusLabelAr {
    if (isCompleted) return 'مكتملة';
    if (progress.completedLessons > 0) return 'قيد التقدّم';
    return 'لم تبدأ';
  }

  factory FreelancerCourseSummary.fromJson(Map<String, dynamic> json) {
    final cover = readString(json, 'coverImage', 'cover_image').trim();
    final completedRaw = readMapField<dynamic>(json, 'courseCompletedAt', 'course_completed_at');
    return FreelancerCourseSummary(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: _nullIfEmpty(readString(json, 'description', 'description')),
      coverImage: cover.isEmpty ? null : resolveBackendAssetUrl(cover),
      isTestingEnabled: readBool(json, 'isTestingEnabled', 'is_testing_enabled'),
      courseCompletedAt: completedRaw == null ? null : DateTime.tryParse('$completedRaw'),
      accessMode: readString(json, 'accessMode', 'access_mode', fallback: 'assigned'),
      progress: CourseProgress.fromJson(
        json['progress'] is Map ? Map<String, dynamic>.from(json['progress'] as Map) : null,
      ),
    );
  }
}

class CourseLesson {
  const CourseLesson({
    required this.id,
    required this.title,
    this.description,
    this.youtubeVideoId,
    this.youtubeUrl,
    this.sortOrder = 0,
    this.isCompleted = false,
  });

  final String id;
  final String title;
  final String? description;
  final String? youtubeVideoId;
  final String? youtubeUrl;
  final int sortOrder;
  final bool isCompleted;

  String? get playableUrl {
    final id = resolvedYoutubeVideoId;
    if (id == null) return null;
    return 'https://www.youtube.com/watch?v=$id';
  }

  /// Same embed host/query as the web freelancer course player.
  String? get youtubeEmbedUrl {
    final id = resolvedYoutubeVideoId;
    if (id == null) return null;
    return 'https://www.youtube-nocookie.com/embed/${Uri.encodeComponent(id)}'
        '?rel=0&modestbranding=1&playsinline=1';
  }

  String? get resolvedYoutubeVideoId {
    final direct = youtubeVideoId?.trim();
    if (direct != null && direct.isNotEmpty) return direct;
    return extractYoutubeVideoId(youtubeUrl);
  }

  factory CourseLesson.fromJson(Map<String, dynamic> json) {
    return CourseLesson(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      description: _nullIfEmpty(readString(json, 'description', 'description')),
      youtubeVideoId: _nullIfEmpty(readString(json, 'youtubeVideoId', 'youtube_video_id')),
      youtubeUrl: _nullIfEmpty(readString(json, 'youtubeUrl', 'youtube_url')),
      sortOrder: readInt(json, 'sortOrder', 'sort_order') ?? 0,
      isCompleted: readBool(json, 'isCompleted', 'is_completed'),
    );
  }
}

class CourseExamQuestion {
  const CourseExamQuestion({
    required this.number,
    required this.text,
    this.maxMark,
  });

  final int number;
  final String text;
  final num? maxMark;

  factory CourseExamQuestion.fromJson(Map<String, dynamic> json) {
    return CourseExamQuestion(
      number: readInt(json, 'number', 'number') ?? 0,
      text: readString(json, 'text', 'text'),
      maxMark: readDouble(json, 'maxMark', 'max_mark'),
    );
  }
}

class CourseAssignmentState {
  const CourseAssignmentState({
    this.completedExamFileUrl,
    this.completedAt,
    this.auditResponseText,
    this.examQuestionMarks = const [],
    this.examFinalGrade,
  });

  final String? completedExamFileUrl;
  final DateTime? completedAt;
  final String? auditResponseText;
  final List<num> examQuestionMarks;
  final num? examFinalGrade;

  bool get hasCompletedExamFile =>
      completedExamFileUrl != null && completedExamFileUrl!.trim().isNotEmpty;

  factory CourseAssignmentState.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const CourseAssignmentState();
    final marksRaw = json['examQuestionMarks'] ?? json['exam_question_marks'];
    final marks = <num>[];
    if (marksRaw is List) {
      for (final m in marksRaw) {
        if (m is num) {
          marks.add(m);
          continue;
        }
        final parsed = num.tryParse('$m');
        if (parsed != null) marks.add(parsed);
      }
    }
    final completedRaw = readMapField<dynamic>(json, 'completedAt', 'completed_at');
    return CourseAssignmentState(
      completedExamFileUrl: _nullIfEmpty(readString(json, 'completedExamFileUrl', 'completed_exam_file_url')),
      completedAt: completedRaw == null ? null : DateTime.tryParse('$completedRaw'),
      auditResponseText: _nullIfEmpty(readString(json, 'auditResponseText', 'audit_response_text')),
      examQuestionMarks: marks,
      examFinalGrade: readDouble(json, 'examFinalGrade', 'exam_final_grade'),
    );
  }
}

class CourseCompletionState {
  const CourseCompletionState({
    this.allLessonsComplete = false,
    this.courseCompleted = false,
    this.needsAuditStep = false,
    this.testingEnabled = false,
  });

  final bool allLessonsComplete;
  final bool courseCompleted;
  final bool needsAuditStep;
  final bool testingEnabled;

  factory CourseCompletionState.fromJson(Map<String, dynamic>? json) {
    if (json == null) return const CourseCompletionState();
    return CourseCompletionState(
      allLessonsComplete: readBool(json, 'allLessonsComplete', 'all_lessons_complete'),
      courseCompleted: readBool(json, 'courseCompleted', 'course_completed'),
      needsAuditStep: readBool(json, 'needsAuditStep', 'needs_audit_step'),
      testingEnabled: readBool(json, 'testingEnabled', 'testing_enabled'),
    );
  }
}

class FreelancerCourseDetails {
  const FreelancerCourseDetails({
    required this.course,
    required this.lessons,
    required this.progress,
    required this.completion,
    required this.assignment,
    this.examQuestions = const [],
    this.testFileUrl,
    this.testPromptFileUrl,
    this.testModelAnswerFileUrl,
  });

  final FreelancerCourseSummary course;
  final List<CourseLesson> lessons;
  final CourseProgress progress;
  final CourseCompletionState completion;
  final CourseAssignmentState assignment;
  final List<CourseExamQuestion> examQuestions;
  final String? testFileUrl;
  final String? testPromptFileUrl;
  final String? testModelAnswerFileUrl;

  factory FreelancerCourseDetails.fromJson(Map<String, dynamic> data) {
    final courseMap = data['course'] is Map
        ? Map<String, dynamic>.from(data['course'] as Map)
        : <String, dynamic>{};
    final lessonsRaw = data['lessons'];
    final lessons = <CourseLesson>[];
    if (lessonsRaw is List) {
      for (final item in lessonsRaw) {
        if (item is Map) lessons.add(CourseLesson.fromJson(Map<String, dynamic>.from(item)));
      }
    }
    lessons.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

    final questionsRaw = courseMap['examQuestions'] ?? courseMap['exam_questions'];
    final questions = <CourseExamQuestion>[];
    if (questionsRaw is List) {
      for (final q in questionsRaw) {
        if (q is Map) questions.add(CourseExamQuestion.fromJson(Map<String, dynamic>.from(q)));
      }
    }

    return FreelancerCourseDetails(
      course: FreelancerCourseSummary.fromJson(courseMap),
      lessons: lessons,
      progress: CourseProgress.fromJson(
        data['progress'] is Map ? Map<String, dynamic>.from(data['progress'] as Map) : null,
      ),
      completion: CourseCompletionState.fromJson(
        data['completion'] is Map ? Map<String, dynamic>.from(data['completion'] as Map) : null,
      ),
      assignment: CourseAssignmentState.fromJson(
        data['assignment'] is Map ? Map<String, dynamic>.from(data['assignment'] as Map) : null,
      ),
      examQuestions: questions,
      testFileUrl: _nullIfEmpty(readString(courseMap, 'testFileUrl', 'test_file_url')),
      testPromptFileUrl: _nullIfEmpty(readString(courseMap, 'testPromptFileUrl', 'test_prompt_file_url')),
      testModelAnswerFileUrl:
          _nullIfEmpty(readString(courseMap, 'testModelAnswerFileUrl', 'test_model_answer_file_url')),
    );
  }
}

String? _nullIfEmpty(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}

/// Mirrors web `extractYoutubeVideoId` for lesson URLs when id is not stored.
String? extractYoutubeVideoId(String? input) {
  final raw = input?.trim();
  if (raw == null || raw.isEmpty) return null;
  if (RegExp(r'^[\w-]{11}$').hasMatch(raw)) return raw;

  final uri = Uri.tryParse(raw);
  if (uri == null) return null;
  final host = uri.host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');

  if (host == 'youtu.be') {
    final id = uri.pathSegments.isNotEmpty ? uri.pathSegments.first : '';
    return RegExp(r'^[\w-]{11}$').hasMatch(id) ? id : null;
  }

  if (!const {'youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'}
      .contains(host)) {
    return null;
  }

  if (uri.path == '/watch') {
    final v = uri.queryParameters['v'];
    if (v != null && RegExp(r'^[\w-]{11}$').hasMatch(v)) return v;
  }

  final embedMatch = RegExp(r'^/(?:embed|shorts|v)/([\w-]{11})').firstMatch(uri.path);
  if (embedMatch != null) return embedMatch.group(1);

  return null;
}
