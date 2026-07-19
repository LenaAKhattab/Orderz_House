import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../categories/data/categories_repository.dart';
import '../../categories/data/category_models.dart';
import '../data/create_order_models.dart';
import '../data/create_order_repository.dart';
import '../data/order_attachment_limits.dart';
import '../data/order_attachment_models.dart';

class CreateOrderState {
  const CreateOrderState({
    this.step = 0,
    this.draft = const CreateOrderDraft(),
    this.categories = const [],
    this.categoriesLoading = false,
    this.categoriesError,
    this.subSubcategories = const [],
    this.subSubcategoriesLoading = false,
    this.isSubmitting = false,
    this.submitError,
    this.result,
    this.stepErrors = const {},
    this.attachments = const [],
    this.attachmentsError,
  });

  static const stepCount = 5;

  final int step;
  final CreateOrderDraft draft;
  final List<ServiceCategory> categories;
  final bool categoriesLoading;
  final String? categoriesError;
  final List<ServiceSubSubcategory> subSubcategories;
  final bool subSubcategoriesLoading;
  final bool isSubmitting;
  final String? submitError;
  final CreateOrderResult? result;
  final Map<String, String> stepErrors;
  final List<SelectedOrderAttachment> attachments;
  final String? attachmentsError;

  bool get isSuccess => result != null;

  CreateOrderState copyWith({
    int? step,
    CreateOrderDraft? draft,
    List<ServiceCategory>? categories,
    bool? categoriesLoading,
    String? categoriesError,
    List<ServiceSubSubcategory>? subSubcategories,
    bool? subSubcategoriesLoading,
    bool? isSubmitting,
    String? submitError,
    CreateOrderResult? result,
    Map<String, String>? stepErrors,
    List<SelectedOrderAttachment>? attachments,
    String? attachmentsError,
    bool clearSubmitError = false,
    bool clearResult = false,
    bool clearStepErrors = false,
    bool clearAttachmentsError = false,
  }) {
    return CreateOrderState(
      step: step ?? this.step,
      draft: draft ?? this.draft,
      categories: categories ?? this.categories,
      categoriesLoading: categoriesLoading ?? this.categoriesLoading,
      categoriesError: categoriesError ?? this.categoriesError,
      subSubcategories: subSubcategories ?? this.subSubcategories,
      subSubcategoriesLoading: subSubcategoriesLoading ?? this.subSubcategoriesLoading,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      submitError: clearSubmitError ? null : (submitError ?? this.submitError),
      result: clearResult ? null : (result ?? this.result),
      stepErrors: clearStepErrors ? const {} : (stepErrors ?? this.stepErrors),
      attachments: attachments ?? this.attachments,
      attachmentsError: clearAttachmentsError ? null : (attachmentsError ?? this.attachmentsError),
    );
  }
}

class CreateOrderController extends AutoDisposeNotifier<CreateOrderState> {
  @override
  CreateOrderState build() {
    Future.microtask(loadCategories);
    return const CreateOrderState(categoriesLoading: true);
  }

  Future<void> loadCategories() async {
    state = state.copyWith(categoriesLoading: true, categoriesError: null);
    try {
      final categories = await ref.read(categoriesRepositoryProvider).fetchBrowsableCategories();
      state = state.copyWith(categories: categories, categoriesLoading: false);
    } catch (e) {
      state = state.copyWith(
        categoriesLoading: false,
        categoriesError: apiErrorMessage(e, fallback: 'تعذر تحميل التصنيفات.'),
      );
    }
  }

  Future<void> loadSubSubcategories(String categoryId) async {
    state = state.copyWith(subSubcategoriesLoading: true, subSubcategories: []);
    try {
      final items = await ref.read(categoriesRepositoryProvider).fetchSubSubcategories(categoryId);
      state = state.copyWith(subSubcategories: items, subSubcategoriesLoading: false);
    } catch (_) {
      state = state.copyWith(subSubcategories: [], subSubcategoriesLoading: false);
    }
  }

  void setProjectType(String type) {
    state = state.copyWith(
      draft: state.draft.copyWith(projectType: type),
      clearStepErrors: true,
    );
  }

  void selectCategory(ServiceCategory category) {
    final nextDraft = state.draft.copyWith(categoryId: category.id, clearSubSubcategory: true);
    state = state.copyWith(draft: nextDraft, clearStepErrors: true);
    loadSubSubcategories(category.id);
  }

  void selectSubSubcategory(ServiceSubSubcategory? item) {
    state = state.copyWith(
      draft: item == null
          ? state.draft.copyWith(clearSubSubcategory: true)
          : state.draft.copyWith(subSubcategoryId: item.id),
      clearStepErrors: true,
    );
  }

  void updateDraft(CreateOrderDraft draft) {
    state = state.copyWith(draft: draft, clearStepErrors: true);
  }

  void setAttachmentsError(String message) {
    state = state.copyWith(attachmentsError: message);
  }

  void addAttachments(List<SelectedOrderAttachment> incoming) {
    if (incoming.isEmpty) return;
    final merged = [...state.attachments, ...incoming];
    final validation = validateOrderAttachments(merged.map((f) => f.draft).toList());
    state = state.copyWith(
      attachments: merged,
      attachmentsError: validation.message,
      clearAttachmentsError: validation.isValid,
    );
  }

  void removeAttachment(String id) {
    final next = state.attachments.where((f) => f.id != id).toList();
    final validation = validateOrderAttachments(next.map((f) => f.draft).toList());
    state = state.copyWith(
      attachments: next,
      attachmentsError: validation.message,
      clearAttachmentsError: validation.isValid,
    );
  }

  bool nextStep() {
    final validation = validateCreateOrderStep(state.step, state.draft);
    if (!validation.isValid) {
      state = state.copyWith(stepErrors: validation.fieldErrors);
      return false;
    }
    if (state.step < CreateOrderState.stepCount - 1) {
      state = state.copyWith(step: state.step + 1, clearStepErrors: true, clearSubmitError: true);
    }
    return true;
  }

  void previousStep() {
    if (state.step > 0) {
      state = state.copyWith(step: state.step - 1, clearStepErrors: true, clearSubmitError: true);
    }
  }

  Future<bool> submit() async {
    final validation = validateCreateOrderDraft(state.draft);
    if (!validation.isValid) {
      state = state.copyWith(stepErrors: validation.fieldErrors, step: CreateOrderState.stepCount - 1);
      return false;
    }

    final attachmentValidation = validateOrderAttachments(state.attachments.map((f) => f.draft).toList());
    if (!attachmentValidation.isValid) {
      state = state.copyWith(
        attachmentsError: attachmentValidation.message,
        step: CreateOrderState.stepCount - 1,
      );
      return false;
    }

    state = state.copyWith(isSubmitting: true, clearSubmitError: true, clearAttachmentsError: true);
    try {
      final result = await ref.read(createOrderRepositoryProvider).createOrder(
            state.draft,
            attachments: state.attachments,
          );
      state = state.copyWith(isSubmitting: false, result: result);
      return true;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        submitError: apiErrorMessage(e, fallback: 'تعذر إنشاء الطلب.'),
      );
      return false;
    }
  }

  void reset() {
    state = const CreateOrderState(categoriesLoading: true);
    loadCategories();
  }
}

final createOrderControllerProvider =
    NotifierProvider.autoDispose<CreateOrderController, CreateOrderState>(CreateOrderController.new);
