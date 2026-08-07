import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/oh_widgets.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../orders/data/order_display_helpers.dart' as display;
import 'client_orders_controller.dart';
import 'create_order_controller.dart';
import 'order_attachments_section.dart';
import 'order_payment_actions.dart';

class CreateClientOrderScreen extends ConsumerWidget {
  const CreateClientOrderScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        appBar: AppBar(title: const Text('إنشاء طلب')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, size: 48, color: AppColors.textMuted),
                const SizedBox(height: 12),
                const Text(
                  'سجّل الدخول لإنشاء طلب جديد.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AppColors.textMuted, height: 1.6),
                ),
                const SizedBox(height: 16),
                OhButton(label: 'تسجيل الدخول', onPressed: () => context.push(AppRoutes.login)),
              ],
            ),
          ),
        ),
      );
    }

    if (auth.user?.usesClientExperience != true) {
      return Scaffold(
        appBar: AppBar(title: const Text('إنشاء طلب')),
        body: const OhEmptyBody(
          message: 'إنشاء الطلبات متاح لحسابات العملاء فقط.',
          icon: Icons.person_off_outlined,
        ),
      );
    }

    final state = ref.watch(createOrderControllerProvider);
    if (state.isSuccess && state.result != null) {
      return CreateOrderSuccessView(result: state.result!);
    }

    return Scaffold(
      backgroundColor: AppColors.homeMobileBg,
      resizeToAvoidBottomInset: true,
      appBar: AppBar(
        title: const Text('إنشاء طلب'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            if (state.step > 0) {
              ref.read(createOrderControllerProvider.notifier).previousStep();
            } else {
              context.pop();
            }
          },
        ),
      ),
      body: Column(
        children: [
          _StepProgress(current: state.step, total: CreateOrderState.stepCount),
          Expanded(
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                16,
                12,
                16,
                24 + MediaQuery.viewInsetsOf(context).bottom,
              ),
              children: [
                if (state.submitError != null) ...[
                  OhErrorBanner(message: state.submitError!),
                  const SizedBox(height: 12),
                ],
                switch (state.step) {
                  0 => _StepProjectType(state: state),
                  1 => _StepCategory(state: state),
                  2 => _StepDetails(state: state),
                  3 => _StepBudget(state: state),
                  _ => _StepReview(state: state),
                },
              ],
            ),
          ),
          _BottomActions(state: state),
        ],
      ),
    );
  }
}

class _StepProgress extends StatelessWidget {
  const _StepProgress({required this.current, required this.total});

  final int current;
  final int total;

  static const _labels = [
    'نوع الطلب',
    'التصنيف',
    'التفاصيل',
    'الميزانية',
    'المراجعة',
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LinearProgressIndicator(
            value: (current + 1) / total,
            borderRadius: BorderRadius.circular(4),
            minHeight: 6,
          ),
          const SizedBox(height: 8),
          Text(
            'الخطوة ${current + 1} من $total — ${_labels[current]}',
            style: const TextStyle(color: AppColors.textMuted, fontWeight: FontWeight.w600),
            textAlign: TextAlign.right,
          ),
        ],
      ),
    );
  }
}

class _BottomActions extends ConsumerWidget {
  const _BottomActions({required this.state});

  final CreateOrderState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(createOrderControllerProvider.notifier);
    final isLast = state.step >= CreateOrderState.stepCount - 1;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
        child: Row(
          children: [
            if (state.step > 0)
              Expanded(
                child: OhButton(
                  label: 'السابق',
                  outlined: true,
                  onPressed: state.isSubmitting ? null : notifier.previousStep,
                ),
              ),
            if (state.step > 0) const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: OhButton(
                label: isLast ? 'إنشاء الطلب' : 'التالي',
                isLoading: isLast && state.isSubmitting,
                onPressed: state.isSubmitting
                    ? null
                    : () async {
                        if (isLast) {
                          final ok = await notifier.submit();
                          if (ok && context.mounted) {
                            ref.invalidate(clientOrdersControllerProvider);
                          }
                        } else {
                          notifier.nextStep();
                        }
                      },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepProjectType extends ConsumerWidget {
  const _StepProjectType({required this.state});

  final CreateOrderState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(createOrderControllerProvider.notifier);
    final error = state.stepErrors['projectType'];

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'اختر نوع الطلب',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: AppColors.textInk),
          ),
          const SizedBox(height: 12),
          _TypeOptionCard(
            title: 'ثابت السعر',
            subtitle: 'حدد ميزانية ثابتة للمشروع.',
            icon: Icons.price_check_outlined,
            selected: state.draft.projectType == 'fixed',
            onTap: () => notifier.setProjectType('fixed'),
          ),
          const SizedBox(height: 10),
          _TypeOptionCard(
            title: 'مناقصة / استقبال عروض',
            subtitle: 'حدد نطاق ميزانية واستقبل عروض المستقلين.',
            icon: Icons.gavel_outlined,
            selected: state.draft.projectType == 'bidding',
            onTap: () => notifier.setProjectType('bidding'),
          ),
          if (error != null) ...[
            const SizedBox(height: 10),
            Text(error, style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}

class _TypeOptionCard extends StatelessWidget {
  const _TypeOptionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? AppColors.primary : AppColors.cardBorder,
            width: selected ? 2 : 1,
          ),
          color: selected ? AppColors.secondary.withValues(alpha: 0.12) : null,
        ),
        child: Row(
          children: [
            Icon(icon, color: AppColors.primary, size: 28),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textInk)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(color: AppColors.textMuted, height: 1.4)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StepCategory extends ConsumerWidget {
  const _StepCategory({required this.state});

  final CreateOrderState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(createOrderControllerProvider.notifier);
    final error = state.stepErrors['categoryId'];

    if (state.categoriesLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircularProgressIndicator(),
              SizedBox(height: 12),
              Text('جاري تحميل التصنيفات...', style: TextStyle(color: AppColors.textMuted)),
            ],
          ),
        ),
      );
    }
    if (state.categoriesError != null) {
      return OhErrorBody(message: state.categoriesError!, onRetry: notifier.loadCategories);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OhCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'التصنيف الرئيسي',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
              ),
              const SizedBox(height: 12),
              ...state.categories.map(
                (c) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _SelectableTile(
                    label: c.name,
                    selected: state.draft.categoryId == c.id,
                    onTap: () => notifier.selectCategory(c),
                  ),
                ),
              ),
              if (error != null)
                Text(error, style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
        if (state.draft.categoryId != null) ...[
          const SizedBox(height: 12),
          OhCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'التصنيف الفرعي (اختياري)',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
                ),
                const SizedBox(height: 8),
                if (state.subSubcategoriesLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                  )
                else if (state.subSubcategories.isEmpty)
                  const Text(
                    'لا توجد تصنيفات فرعية — يمكنك المتابعة.',
                    style: TextStyle(color: AppColors.textMuted),
                  )
                else ...[
                  _SelectableTile(
                    label: 'بدون تصنيف فرعي',
                    selected: state.draft.subSubcategoryId == null,
                    onTap: () => notifier.selectSubSubcategory(null),
                  ),
                  const SizedBox(height: 8),
                  ...state.subSubcategories.map(
                    (ss) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _SelectableTile(
                        label: ss.name,
                        selected: state.draft.subSubcategoryId == ss.id,
                        onTap: () => notifier.selectSubSubcategory(ss),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _SelectableTile extends StatelessWidget {
  const _SelectableTile({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          color: selected ? AppColors.secondary.withValues(alpha: 0.15) : AppColors.iconChipBg,
          border: Border.all(color: selected ? AppColors.primary : Colors.transparent),
        ),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600))),
            if (selected) const Icon(Icons.check_circle, color: AppColors.primary, size: 20),
          ],
        ),
      ),
    );
  }
}

class _StepDetails extends ConsumerStatefulWidget {
  const _StepDetails({required this.state});

  final CreateOrderState state;

  @override
  ConsumerState<_StepDetails> createState() => _StepDetailsState();
}

class _StepDetailsState extends ConsumerState<_StepDetails> {
  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _duration;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.state.draft.title);
    _description = TextEditingController(text: widget.state.draft.description);
    _duration = TextEditingController(text: widget.state.draft.durationValue);
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _duration.dispose();
    super.dispose();
  }

  void _sync() {
    ref.read(createOrderControllerProvider.notifier).updateDraft(
          widget.state.draft.copyWith(
            title: _title.text,
            description: _description.text,
            durationValue: _duration.text,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final errors = widget.state.stepErrors;

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'تفاصيل الطلب',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
          ),
          const SizedBox(height: 12),
          OhTextField(
            controller: _title,
            label: 'عنوان الطلب',
            hint: 'مثال: تصميم شعار احترافي',
            textInputAction: TextInputAction.next,
            onChanged: (_) => _sync(),
          ),
          if (errors['title'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(errors['title']!, style: const TextStyle(color: AppColors.error)),
            ),
          const SizedBox(height: 12),
          OhTextField(
            controller: _description,
            label: 'وصف الطلب',
            hint: 'اشرح المطلوب بوضوح...',
            keyboardType: TextInputType.multiline,
            textInputAction: TextInputAction.newline,
            minLines: 4,
            maxLines: 8,
            onChanged: (_) => _sync(),
          ),
          if (errors['description'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(errors['description']!, style: const TextStyle(color: AppColors.error)),
            ),
          const SizedBox(height: 12),
          OhTextField(
            controller: _duration,
            label: 'مدة التنفيذ (بالأيام)',
            hint: 'مثال: 5',
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            onChanged: (_) => _sync(),
          ),
          if (errors['durationValue'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(errors['durationValue']!, style: const TextStyle(color: AppColors.error)),
            ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 16),
          const OrderAttachmentsSection(),
        ],
      ),
    );
  }
}

class _StepBudget extends ConsumerStatefulWidget {
  const _StepBudget({required this.state});

  final CreateOrderState state;

  @override
  ConsumerState<_StepBudget> createState() => _StepBudgetState();
}

class _StepBudgetState extends ConsumerState<_StepBudget> {
  late final TextEditingController _budget;
  late final TextEditingController _min;
  late final TextEditingController _max;

  @override
  void initState() {
    super.initState();
    _budget = TextEditingController(text: widget.state.draft.budget);
    _min = TextEditingController(text: widget.state.draft.bidBudgetMin);
    _max = TextEditingController(text: widget.state.draft.bidBudgetMax);
  }

  @override
  void dispose() {
    _budget.dispose();
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  void _sync() {
    ref.read(createOrderControllerProvider.notifier).updateDraft(
          widget.state.draft.copyWith(
            budget: _budget.text,
            bidBudgetMin: _min.text,
            bidBudgetMax: _max.text,
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    final errors = widget.state.stepErrors;
    final isFixed = widget.state.draft.isFixed;

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            isFixed ? 'الميزانية' : 'نطاق الميزانية',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
          ),
          const SizedBox(height: 12),
          if (isFixed) ...[
            OhTextField(
              controller: _budget,
              label: 'الميزانية (JOD)',
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => _sync(),
            ),
            if (errors['budget'] != null)
              Text(errors['budget']!, style: const TextStyle(color: AppColors.error)),
          ] else ...[
            OhTextField(
              controller: _min,
              label: 'الحد الأدنى (JOD)',
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => _sync(),
            ),
            if (errors['bidBudgetMin'] != null)
              Text(errors['bidBudgetMin']!, style: const TextStyle(color: AppColors.error)),
            const SizedBox(height: 12),
            OhTextField(
              controller: _max,
              label: 'الحد الأعلى (JOD)',
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => _sync(),
            ),
            if (errors['bidBudgetMax'] != null)
              Text(errors['bidBudgetMax']!, style: const TextStyle(color: AppColors.error)),
          ],
        ],
      ),
    );
  }
}

class _StepReview extends ConsumerWidget {
  const _StepReview({required this.state});

  final CreateOrderState state;

  String? _categoryName() {
    final id = state.draft.categoryId;
    if (id == null) return null;
    for (final c in state.categories) {
      if (c.id == id) return c.name;
    }
    return null;
  }

  String? _subSubName() {
    final id = state.draft.subSubcategoryId;
    if (id == null) return null;
    for (final ss in state.subSubcategories) {
      if (ss.id == id) return ss.name;
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = state.draft;
    final budgetLabel = draft.isFixed
        ? display.budgetLabel(projectType: 'fixed', budget: double.tryParse(draft.budget.replaceAll(',', '.')), currencyCode: 'JOD')
        : display.budgetLabel(
            projectType: 'bidding',
            bidBudgetMin: double.tryParse(draft.bidBudgetMin.replaceAll(',', '.')),
            bidBudgetMax: double.tryParse(draft.bidBudgetMax.replaceAll(',', '.')),
            currencyCode: 'JOD',
          );

    return OhCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'مراجعة الطلب',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.textInk),
          ),
          const SizedBox(height: 12),
          _ReviewRow('نوع الطلب', display.projectTypeLabel(draft.projectType)),
          _ReviewRow('التصنيف', _categoryName() ?? '—'),
          if (_subSubName() != null) _ReviewRow('التصنيف الفرعي', _subSubName()!),
          _ReviewRow('العنوان', draft.title.trim().isEmpty ? '—' : draft.title.trim()),
          _ReviewRow('المدة', '${draft.durationValue} يوم'),
          if (budgetLabel != null) _ReviewRow('الميزانية', budgetLabel),
          _ReviewRow(
            'المرفقات',
            state.attachments.isEmpty ? 'لا توجد مرفقات' : '${state.attachments.length} ملف',
          ),
          const SizedBox(height: 8),
          Text(
            draft.isFixed
                ? 'بعد الإنشاء ستنتقل لخطوة الدفع عبر Stripe.'
                : 'بعد الإنشاء سيكون طلبك متاحًا لاستقبال العروض.',
            style: const TextStyle(color: AppColors.textMuted, height: 1.5),
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 12),
          const OrderAttachmentsSection(),
        ],
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label, style: const TextStyle(color: AppColors.textMuted)),
          ),
          Expanded(
            flex: 3,
            child: Text(value, style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.textInk)),
          ),
        ],
      ),
    );
  }
}
