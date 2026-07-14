import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../data/course_models.dart';
import 'courses_controllers.dart';
import 'youtube_lesson_player.dart';

class CourseDetailsScreen extends ConsumerStatefulWidget {
  const CourseDetailsScreen({super.key, required this.courseId});

  final String courseId;

  @override
  ConsumerState<CourseDetailsScreen> createState() => _CourseDetailsScreenState();
}

class _CourseDetailsScreenState extends ConsumerState<CourseDetailsScreen> {
  bool _busy = false;
  String? _activeLessonId;
  final _auditController = TextEditingController();
  final Map<int, TextEditingController> _markControllers = {};

  @override
  void dispose() {
    _auditController.dispose();
    for (final c in _markControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _markFor(int number) {
    return _markControllers.putIfAbsent(number, TextEditingController.new);
  }

  Future<void> _run(Future<void> Function() action, {String? okMessage}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      if (okMessage != null) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(okMessage)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(apiErrorMessage(e, fallback: 'تعذر إتمام العملية.'))),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toggleLessonPlayer(CourseLesson lesson) {
    if (lesson.youtubeEmbedUrl == null) return;
    setState(() {
      _activeLessonId = _activeLessonId == lesson.id ? null : lesson.id;
    });
  }

  Future<void> _openFile(String fileKind) async {
    await _run(() async {
      await ref.read(freelancerCoursesApiProvider).openCourseFile(
            courseId: widget.courseId,
            fileKind: fileKind,
          );
    });
  }

  Future<void> _pickAndUploadExam() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: false,
    );
    final path = result?.files.single.path;
    if (path == null) return;
    await _run(
      () => ref.read(freelancerCourseDetailsProvider(widget.courseId).notifier).uploadCompletedExam(File(path)),
      okMessage: 'تم رفع ملف الاختبار.',
    );
  }

  Future<void> _submitCompletion(FreelancerCourseDetails details) async {
    List<num>? marks;
    if (details.completion.testingEnabled && details.examQuestions.isNotEmpty) {
      marks = [];
      for (final q in details.examQuestions) {
        final raw = _markFor(q.number).text.trim().replaceAll(',', '.');
        final value = num.tryParse(raw);
        if (value == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('أدخل درجة صحيحة للسؤال ${q.number}.')),
          );
          return;
        }
        marks.add(value);
      }
    }

    final auditText = _auditController.text.trim();
    if (details.completion.needsAuditStep && details.completion.testingEnabled && auditText.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('أدخل نص مراجعة ChatGPT أو ملاحظات الإكمال.')),
      );
      return;
    }

    await _run(
      () => ref.read(freelancerCourseDetailsProvider(widget.courseId).notifier).submitCompletion(
            auditResponseText: auditText.isEmpty ? null : auditText,
            questionMarks: marks,
          ),
      okMessage: 'تم إكمال الدورة بنجاح.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(freelancerCourseDetailsProvider(widget.courseId));

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('تفاصيل الدورة')),
      body: async.when(
        loading: () => const OhLoadingBody(message: 'جاري التحميل...'),
        error: (e, _) => OhErrorBody(
          message: apiErrorMessage(e, fallback: 'تعذر تحميل الدورة.'),
          onRetry: () => ref.read(freelancerCourseDetailsProvider(widget.courseId).notifier).reload(),
        ),
        data: (details) => Stack(
          children: [
            ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
              children: [
                Text(
                  details.course.title,
                  style: const TextStyle(
                    color: AppColors.primaryDeep,
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    height: 1.3,
                  ),
                ),
                if (details.course.description != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    details.course.description!,
                    style: const TextStyle(color: AppColors.textMuted, height: 1.55),
                  ),
                ],
                const SizedBox(height: 14),
                _ProgressHeader(details: details),
                const SizedBox(height: 18),
                const Text(
                  'الدروس',
                  style: TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                  ),
                ),
                const SizedBox(height: 10),
                for (final lesson in details.lessons) ...[
                  _LessonTile(
                    lesson: lesson,
                    busy: _busy,
                    showPlayer: _activeLessonId == lesson.id,
                    onToggleVideo: () => _toggleLessonPlayer(lesson),
                    onComplete: lesson.isCompleted
                        ? null
                        : () => _run(
                              () => ref
                                  .read(freelancerCourseDetailsProvider(widget.courseId).notifier)
                                  .markLessonComplete(lesson.id),
                              okMessage: 'تم تعليم الدرس كمكتمل.',
                            ),
                  ),
                  const SizedBox(height: 10),
                ],
                if (details.completion.testingEnabled) ...[
                  const SizedBox(height: 10),
                  _FinalTestSection(
                    details: details,
                    busy: _busy,
                    auditController: _auditController,
                    markControllerFor: _markFor,
                    onOpenFile: _openFile,
                    onUploadExam: _pickAndUploadExam,
                    onSubmit: () => _submitCompletion(details),
                  ),
                ] else if (details.completion.allLessonsComplete && !details.completion.courseCompleted) ...[
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: _busy ? null : () => _submitCompletion(details),
                    child: const Text('إنهاء الدورة'),
                  ),
                ],
                if (details.completion.courseCompleted) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.success.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.verified_rounded, color: AppColors.success),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'أحسنت! تم إكمال هذه الدورة.',
                            style: TextStyle(
                              color: AppColors.success,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
            if (_busy)
              const Positioned.fill(
                child: ColoredBox(
                  color: Color(0x55FFFFFF),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ProgressHeader extends StatelessWidget {
  const _ProgressHeader({required this.details});

  final FreelancerCourseDetails details;

  @override
  Widget build(BuildContext context) {
    final p = details.progress;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                '${p.percentage}%',
                style: const TextStyle(
                  color: AppColors.primaryDeep,
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                ),
              ),
              const Spacer(),
              Text(
                '${p.completedLessons}/${p.totalLessons} دروس',
                style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: (p.percentage.clamp(0, 100)) / 100.0,
              minHeight: 9,
              backgroundColor: AppColors.primary.withValues(alpha: 0.08),
              color: AppColors.primary,
            ),
          ),
        ],
      ),
    );
  }
}

class _LessonTile extends StatelessWidget {
  const _LessonTile({
    required this.lesson,
    required this.busy,
    required this.showPlayer,
    required this.onToggleVideo,
    required this.onComplete,
  });

  final CourseLesson lesson;
  final bool busy;
  final bool showPlayer;
  final VoidCallback onToggleVideo;
  final VoidCallback? onComplete;

  @override
  Widget build(BuildContext context) {
    final embedUrl = lesson.youtubeEmbedUrl;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: lesson.isCompleted ? AppColors.success.withValues(alpha: 0.35) : AppColors.cardBorder,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(
                lesson.isCompleted ? Icons.check_circle_rounded : Icons.play_circle_outline_rounded,
                color: lesson.isCompleted ? AppColors.success : AppColors.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  lesson.title,
                  style: const TextStyle(
                    color: AppColors.primaryDeep,
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                  ),
                ),
              ),
            ],
          ),
          if (lesson.description != null && lesson.description!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(lesson.description!, style: const TextStyle(color: AppColors.textMuted, height: 1.45)),
          ],
          if (showPlayer && embedUrl != null) ...[
            const SizedBox(height: 12),
            YoutubeLessonPlayer(key: ValueKey('yt_${lesson.id}'), embedUrl: embedUrl),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              if (embedUrl != null)
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: busy ? null : onToggleVideo,
                    icon: Icon(
                      showPlayer ? Icons.close_rounded : Icons.ondemand_video_rounded,
                      size: 18,
                    ),
                    label: Text(showPlayer ? 'إخفاء' : 'مشاهدة'),
                  ),
                ),
              if (embedUrl != null && onComplete != null) const SizedBox(width: 8),
              if (onComplete != null)
                Expanded(
                  child: FilledButton(
                    onPressed: busy ? null : onComplete,
                    child: const Text('تم كمكتمل'),
                  ),
                ),
              if (onComplete == null && lesson.isCompleted)
                const Expanded(
                  child: Text(
                    'مكتمل',
                    textAlign: TextAlign.left,
                    style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w800),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FinalTestSection extends StatelessWidget {
  const _FinalTestSection({
    required this.details,
    required this.busy,
    required this.auditController,
    required this.markControllerFor,
    required this.onOpenFile,
    required this.onUploadExam,
    required this.onSubmit,
  });

  final FreelancerCourseDetails details;
  final bool busy;
  final TextEditingController auditController;
  final TextEditingController Function(int number) markControllerFor;
  final Future<void> Function(String fileKind) onOpenFile;
  final Future<void> Function() onUploadExam;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final unlocked = details.completion.allLessonsComplete;
    final completed = details.completion.courseCompleted;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'الاختبار النهائي',
            style: TextStyle(
              color: AppColors.primaryDeep,
              fontWeight: FontWeight.w800,
              fontSize: 17,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            unlocked
                ? 'أكملت الدروس — يمكنك الآن تنزيل الاختبار ورفعه ثم الإرسال.'
                : 'أكمل جميع الدروس أولاً لفتح الاختبار النهائي.',
            style: const TextStyle(color: AppColors.textMuted, height: 1.5),
          ),
          if (unlocked) ...[
            const SizedBox(height: 12),
            if (details.testFileUrl != null)
              OutlinedButton.icon(
                onPressed: busy ? null : () => onOpenFile('test'),
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('عرض ملف الاختبار'),
              ),
            if (details.testPromptFileUrl != null)
              OutlinedButton.icon(
                onPressed: busy ? null : () => onOpenFile('prompt'),
                icon: const Icon(Icons.description_outlined),
                label: const Text('عرض ملف الـ Prompt'),
              ),
            if (details.testModelAnswerFileUrl != null)
              OutlinedButton.icon(
                onPressed: busy ? null : () => onOpenFile('model-answer'),
                icon: const Icon(Icons.fact_check_outlined),
                label: const Text('عرض نموذج الإجابة'),
              ),
            const SizedBox(height: 8),
            FilledButton.tonalIcon(
              onPressed: busy ? null : onUploadExam,
              icon: const Icon(Icons.upload_file_rounded),
              label: Text(
                details.assignment.hasCompletedExamFile ? 'استبدال ملف الاختبار المرفوع' : 'رفع ملف الاختبار (PDF)',
              ),
            ),
            if (details.assignment.hasCompletedExamFile)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  '✓ تم رفع ملف الاختبار',
                  style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w700),
                ),
              ),
            if (details.examQuestions.isNotEmpty) ...[
              const SizedBox(height: 14),
              const Text(
                'درجات الأسئلة',
                style: TextStyle(fontWeight: FontWeight.w800, color: AppColors.primaryDeep),
              ),
              const SizedBox(height: 8),
              for (final q in details.examQuestions) ...[
                Text('س${q.number}: ${q.text}', style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
                TextField(
                  controller: markControllerFor(q.number),
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: q.maxMark != null ? 'الدرجة (حد أقصى ${q.maxMark})' : 'الدرجة',
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ],
            const SizedBox(height: 8),
            TextField(
              controller: auditController,
              minLines: 3,
              maxLines: 6,
              decoration: const InputDecoration(
                labelText: 'نص مراجعة ChatGPT / ملاحظات الإكمال',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 12),
            if (!completed)
              FilledButton(
                onPressed: busy || !details.assignment.hasCompletedExamFile ? null : onSubmit,
                child: const Text('إرسال وإكمال الدورة'),
              ),
          ],
        ],
      ),
    );
  }
}
