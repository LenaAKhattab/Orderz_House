import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/web_constants.dart';
import '../../../core/errors/api_error_message.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/course_access.dart';
import '../data/course_models.dart';
import 'courses_controllers.dart';

/// Shell tab — freelancer courses list (clients see a role notice).
class CoursesScreen extends ConsumerWidget {
  const CoursesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authControllerProvider).user;
    final isFreelancer = user?.usesFreelancerExperience == true;

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      appBar: AppBar(title: const Text('الدورات')),
      body: isFreelancer ? const _FreelancerCoursesBody() : const _ClientCoursesNotice(),
    );
  }
}

class _ClientCoursesNotice extends StatelessWidget {
  const _ClientCoursesNotice();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: AppColors.secondary.withValues(alpha: 0.25),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.school_rounded, color: AppColors.primary, size: 36),
            ),
            const SizedBox(height: 16),
            const Text(
              'الدورات للمستقلين',
              style: TextStyle(
                color: AppColors.primaryDeep,
                fontSize: 20,
                fontWeight: FontWeight.w800,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            const Text(
              'نظام الدورات التدريبية مخصّص لحسابات المستقلين. يمكنك تصفح الخدمات من حسابك أو الصفحة الرئيسية.',
              style: TextStyle(color: AppColors.textMuted, height: 1.6),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => context.push(AppRoutes.services),
              child: const Text('تصفح الخدمات'),
            ),
          ],
        ),
      ),
    );
  }
}

class _FreelancerCoursesBody extends ConsumerWidget {
  const _FreelancerCoursesBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(freelancerCoursesListProvider);

    return async.when(
      loading: () => const OhLoadingBody(message: 'جاري تحميل الدورات...'),
      error: (e, _) => OhErrorBody(
        message: mapCourseAccessErrorMessage(e) ??
            apiErrorMessage(e, fallback: 'تعذر تحميل الدورات.'),
        onRetry: () => ref.read(freelancerCoursesListProvider.notifier).refresh(),
      ),
      data: (courses) {
        if (courses.isEmpty) {
          return const OhEmptyBody(
            message: 'لا توجد دورات مخصّصة لك حالياً.',
            icon: Icons.school_outlined,
          );
        }
        final accessibleCount = countAccessibleFreelancerCourses(courses);
        return RefreshIndicator(
          onRefresh: () => ref.read(freelancerCoursesListProvider.notifier).refresh(),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            itemCount: courses.length + 1,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              if (index == 0) {
                return _CoursesSummaryHeader(
                  total: courses.length,
                  accessible: accessibleCount,
                );
              }
              final course = courses[index - 1];
              return FreelancerCourseCard(
                course: course,
                onOpen: course.isAccessible
                    ? () => context.push(AppRoutes.courseDetailsPath(course.id))
                    : null,
              );
            },
          ),
        );
      },
    );
  }
}

class _CoursesSummaryHeader extends StatelessWidget {
  const _CoursesSummaryHeader({required this.total, required this.accessible});

  final int total;
  final int accessible;

  @override
  Widget build(BuildContext context) {
    return Text(
      'المتاح لك: $accessible من $total',
      key: const ValueKey('courses-accessible-summary'),
      textAlign: TextAlign.right,
      style: const TextStyle(
        color: AppColors.textMuted,
        fontWeight: FontWeight.w700,
        fontSize: 13,
      ),
    );
  }
}

/// Public for widget tests — list card with locked / unlocked states.
class FreelancerCourseCard extends StatelessWidget {
  const FreelancerCourseCard({
    super.key,
    required this.course,
    this.onOpen,
  });

  final FreelancerCourseSummary course;
  final VoidCallback? onOpen;

  Future<void> _openPlans(BuildContext context) async {
    final url = WebConstants.freelancerPlansUrl;
    final uri = Uri.tryParse(url);
    if (uri == null) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(courseLockOpenPlansFailedAr)),
      );
      return;
    }
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text(courseLockOpenPlansFailedAr)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final locked = !course.isAccessible;
    final progress = course.progress.percentage.clamp(0, 100) / 100.0;
    final statusColor = locked
        ? AppColors.primaryMid
        : course.isCompleted
            ? AppColors.success
            : course.progress.completedLessons > 0
                ? AppColors.primary
                : AppColors.textMuted;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: locked ? null : onOpen,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: locked ? AppColors.primary.withValues(alpha: 0.03) : Colors.white,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: locked ? AppColors.primary.withValues(alpha: 0.35) : AppColors.cardBorder,
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.06),
                blurRadius: 14,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: AppColors.secondary.withValues(alpha: 0.28),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: locked
                        ? const Icon(Icons.lock_rounded, color: AppColors.primaryMid)
                        : course.coverImage != null
                            ? ClipRRect(
                                borderRadius: BorderRadius.circular(14),
                                child: Image.network(
                                  course.coverImage!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (c, e, s) =>
                                      const Icon(Icons.school_rounded, color: AppColors.primary),
                                ),
                              )
                            : const Icon(Icons.school_rounded, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          course.title,
                          style: const TextStyle(
                            color: AppColors.primaryDeep,
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            height: 1.3,
                          ),
                        ),
                        if (course.description != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            course.description!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppColors.textMuted,
                              fontSize: 13,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (!locked)
                    Icon(Icons.chevron_left_rounded, color: AppColors.textMuted.withValues(alpha: 0.7)),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Container(
                    key: locked ? const ValueKey('course-lock-badge') : null,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      course.statusLabelAr,
                      style: TextStyle(
                        color: statusColor,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  if (!locked && course.isTestingEnabled) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.secondary.withValues(alpha: 0.25),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        'اختبار نهائي',
                        style: TextStyle(
                          color: AppColors.primaryDeep,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                  if (!locked) ...[
                    const Spacer(),
                    Text(
                      '${course.progress.percentage}%',
                      style: const TextStyle(
                        color: AppColors.primaryDeep,
                        fontWeight: FontWeight.w800,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ],
              ),
              if (locked) ...[
                const SizedBox(height: 12),
                Text(
                  course.lockCopyAr.messageOrDefault,
                  key: const ValueKey('course-lock-message'),
                  textAlign: TextAlign.right,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 12),
                OhButton(
                  key: const ValueKey('course-lock-cta'),
                  label: course.lockCopyAr.ctaOrDefault,
                  onPressed: () => _openPlans(context),
                ),
              ] else ...[
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.08),
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${course.progress.completedLessons} من ${course.progress.totalLessons} دروس',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  textAlign: TextAlign.left,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
