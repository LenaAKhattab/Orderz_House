import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_error_message.dart';
import '../../categories/data/categories_repository.dart';
import '../../categories/data/category_models.dart';
import '../data/create_order_models.dart';
import '../data/create_order_repository.dart';
import '../data/order_attachment_limits.dart';
import '../data/order_attachment_models.dart';
import '../data/service_catalog_models.dart';
import '../data/service_catalog_repository.dart';
import '../data/service_form_logic.dart';

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
    this.catalog = ServiceCatalog.empty,
    this.serviceDraft = const ServiceFormDraft(),
    this.serviceErrors = const {},
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
  // Smart Orders S2: server catalog + dynamic service form.
  final ServiceCatalog catalog;
  final ServiceFormDraft serviceDraft;
  final Map<String, String> serviceErrors;

  bool get isSuccess => result != null;

  /// True once the customer entered anything beyond the initial order type — leaving the
  /// wizard then would silently discard their work (fields, service answers, attachments).
  bool get hasUserInput =>
      draft.categoryId != null ||
      draft.title.trim().isNotEmpty ||
      draft.description.trim().isNotEmpty ||
      draft.budget.trim().isNotEmpty ||
      draft.bidBudgetMin.trim().isNotEmpty ||
      draft.bidBudgetMax.trim().isNotEmpty ||
      attachments.isNotEmpty ||
      serviceDraft.serviceCode != null;

  CatalogService? get selectedService {
    final code = serviceDraft.serviceCode;
    if (code == null) return null;
    for (final s in catalog.services) {
      if (s.serviceCode == code) return s;
    }
    return null;
  }

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
    ServiceCatalog? catalog,
    ServiceFormDraft? serviceDraft,
    Map<String, String>? serviceErrors,
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
      catalog: catalog ?? this.catalog,
      serviceDraft: serviceDraft ?? this.serviceDraft,
      serviceErrors: serviceErrors ?? this.serviceErrors,
    );
  }
}

class CreateOrderController extends AutoDisposeNotifier<CreateOrderState> {
  @override
  CreateOrderState build() {
    Future.microtask(loadCategories);
    Future.microtask(loadCatalog);
    return const CreateOrderState(categoriesLoading: true);
  }

  /// Catalog failures never block ordering: "general request" (no service) stays available.
  Future<void> loadCatalog() async {
    try {
      final catalog = await ref.read(serviceCatalogRepositoryProvider).fetch();
      state = state.copyWith(catalog: catalog);
    } catch (_) {
      state = state.copyWith(catalog: ServiceCatalog.empty);
    }
  }

  void selectService(String? serviceCode) {
    final svc = serviceCode == null ? null : state.catalog.services.where((s) => s.serviceCode == serviceCode).firstOrNull;
    state = state.copyWith(
      serviceDraft: svc == null ? const ServiceFormDraft() : ServiceFormDraft(serviceCode: svc.serviceCode, version: svc.version),
      serviceErrors: const {},
      clearStepErrors: true,
    );
  }

  void setServiceValue(String key, Object? value) {
    state = state.copyWith(serviceDraft: state.serviceDraft.withValue(key, value), serviceErrors: const {});
  }

  void setServiceQuantity({String? quantity, bool? unspecified}) {
    state = state.copyWith(
      serviceDraft: state.serviceDraft.withQuantity(quantity: quantity, unspecified: unspecified),
      serviceErrors: const {},
    );
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
    final keepService = state.selectedService?.categoryId == category.id;
    state = state.copyWith(
      draft: nextDraft,
      clearStepErrors: true,
      serviceDraft: keepService ? state.serviceDraft : const ServiceFormDraft(),
      serviceErrors: const {},
    );
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
    final svc = state.selectedService;
    if (state.step == 1 && svc != null) {
      final errors = validateServiceForm(svc, state.serviceDraft);
      if (errors.isNotEmpty) {
        state = state.copyWith(serviceErrors: errors);
        return false;
      }
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

    // Files picked inside dynamic `file` fields travel with the general attachments (same limits).
    final allAttachments = [...state.attachments, ...serviceFormFiles(state.selectedService, state.serviceDraft)];
    final attachmentValidation = validateOrderAttachments(allAttachments.map((f) => f.draft).toList());
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
            attachments: allAttachments,
            serviceForm: buildServiceFormPayload(state.selectedService, state.serviceDraft),
          );
      state = state.copyWith(isSubmitting: false, result: result);
      return true;
    } catch (e) {
      if (isStaleServiceFormError(e)) {
        // The catalog changed on the server: drop the cache, reload, keep every compatible value,
        // and send the user back to review the refreshed form (the server validates the new version).
        final oldService = state.selectedService;
        final oldDraft = state.serviceDraft;
        ref.read(serviceCatalogRepositoryProvider).invalidate();
        await loadCatalog();
        final newService = state.catalog.services.where((s) => s.serviceCode == oldDraft.serviceCode).firstOrNull;
        final migration = migrateServiceDraft(oldService: oldService, newService: newService, draft: oldDraft);
        state = state.copyWith(
          isSubmitting: false,
          step: 1,
          serviceDraft: migration.draft,
          serviceErrors: const {},
          submitError: staleServiceFormMessage(migration),
        );
        return false;
      }
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
    loadCatalog();
  }
}

/// User-facing explanation after a stale-form refresh (AR app copy).
String staleServiceFormMessage(ServiceDraftMigration m) {
  if (!m.serviceAvailable) {
    return 'لم تعد هذه الخدمة متاحة. يرجى اختيار خدمة أخرى أو متابعة طلب عام.';
  }
  if (m.dropped.isEmpty) {
    return 'تم تحديث نموذج الخدمة واحتفظنا بكل القيم التي أدخلتها. يرجى المراجعة ثم الإرسال.';
  }
  return 'تم تحديث نموذج الخدمة. احتفظنا بالقيم المتوافقة، ويرجى مراجعة الحقول التي تغيّرت وتعبئتها من جديد.';
}

final createOrderControllerProvider =
    NotifierProvider.autoDispose<CreateOrderController, CreateOrderState>(CreateOrderController.new);
