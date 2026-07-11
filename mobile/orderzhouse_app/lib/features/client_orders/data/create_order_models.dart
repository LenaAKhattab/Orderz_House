import '../../../core/network/json_helpers.dart';

class CreateOrderDraft {
  const CreateOrderDraft({
    this.projectType,
    this.categoryId,
    this.subSubcategoryId,
    this.title = '',
    this.description = '',
    this.durationValue = '',
    this.durationUnit = 'days',
    this.budget = '',
    this.bidBudgetMin = '',
    this.bidBudgetMax = '',
  });

  final String? projectType;
  final String? categoryId;
  final String? subSubcategoryId;
  final String title;
  final String description;
  final String durationValue;
  final String durationUnit;
  final String budget;
  final String bidBudgetMin;
  final String bidBudgetMax;

  bool get isFixed => projectType == 'fixed';
  bool get isBidding => projectType == 'bidding';

  CreateOrderDraft copyWith({
    String? projectType,
    String? categoryId,
    String? subSubcategoryId,
    bool clearSubSubcategory = false,
    String? title,
    String? description,
    String? durationValue,
    String? durationUnit,
    String? budget,
    String? bidBudgetMin,
    String? bidBudgetMax,
  }) {
    return CreateOrderDraft(
      projectType: projectType ?? this.projectType,
      categoryId: categoryId ?? this.categoryId,
      subSubcategoryId: clearSubSubcategory ? null : (subSubcategoryId ?? this.subSubcategoryId),
      title: title ?? this.title,
      description: description ?? this.description,
      durationValue: durationValue ?? this.durationValue,
      durationUnit: durationUnit ?? this.durationUnit,
      budget: budget ?? this.budget,
      bidBudgetMin: bidBudgetMin ?? this.bidBudgetMin,
      bidBudgetMax: bidBudgetMax ?? this.bidBudgetMax,
    );
  }
}

class CreateOrderValidation {
  const CreateOrderValidation({this.fieldErrors = const {}});

  final Map<String, String> fieldErrors;

  bool get isValid => fieldErrors.isEmpty;

  String? errorFor(String key) => fieldErrors[key];
}

double? _parseAmount(String raw) {
  final normalized = raw.trim().replaceAll(',', '.');
  if (normalized.isEmpty) return null;
  return double.tryParse(normalized);
}

int? _parseDuration(String raw) {
  final normalized = raw.trim();
  if (normalized.isEmpty) return null;
  final asDouble = double.tryParse(normalized.replaceAll(',', '.'));
  if (asDouble == null || asDouble != asDouble.roundToDouble()) return null;
  return asDouble.toInt();
}

CreateOrderValidation validateCreateOrderDraft(CreateOrderDraft draft) {
  final errors = <String, String>{};

  if (draft.projectType != 'fixed' && draft.projectType != 'bidding') {
    errors['projectType'] = 'يرجى اختيار نوع الطلب.';
  }

  final categoryId = int.tryParse(draft.categoryId ?? '');
  if (categoryId == null || categoryId < 1) {
    errors['categoryId'] = 'يرجى اختيار التصنيف.';
  }

  final title = draft.title.trim();
  if (title.length < 2) {
    errors['title'] = 'عنوان الطلب مطلوب (حرفان على الأقل).';
  } else if (title.length > 200) {
    errors['title'] = 'العنوان طويل جداً.';
  }

  final description = draft.description.trim();
  if (description.length < 10) {
    errors['description'] = 'الوصف مطلوب (10 أحرف على الأقل).';
  } else if (description.length > 5000) {
    errors['description'] = 'الوصف طويل جداً.';
  }

  final duration = _parseDuration(draft.durationValue);
  if (duration == null || duration < 1) {
    errors['durationValue'] = 'يرجى إدخال مدة تنفيذ صحيحة.';
  }

  if (!['days', 'hours', 'minutes'].contains(draft.durationUnit)) {
    errors['durationUnit'] = 'وحدة المدة غير صالحة.';
  }

  if (draft.isFixed) {
    final budget = _parseAmount(draft.budget);
    if (budget == null || budget <= 0) {
      errors['budget'] = 'الميزانية مطلوبة ويجب أن تكون أكبر من صفر.';
    }
  }

  if (draft.isBidding) {
    final min = _parseAmount(draft.bidBudgetMin);
    final max = _parseAmount(draft.bidBudgetMax);
    if (min == null || min <= 0) {
      errors['bidBudgetMin'] = 'الحد الأدنى مطلوب ويجب أن يكون أكبر من صفر.';
    }
    if (max == null || max <= 0) {
      errors['bidBudgetMax'] = 'الحد الأعلى مطلوب ويجب أن يكون أكبر من صفر.';
    }
    if (min != null && max != null && max < min) {
      errors['bidBudgetMax'] = 'الحد الأعلى يجب أن يكون أكبر من أو يساوي الحد الأدنى.';
    }
  }

  return CreateOrderValidation(fieldErrors: errors);
}

CreateOrderValidation validateCreateOrderStep(int step, CreateOrderDraft draft) {
  switch (step) {
    case 0:
      if (draft.projectType != 'fixed' && draft.projectType != 'bidding') {
        return const CreateOrderValidation(fieldErrors: {'projectType': 'يرجى اختيار نوع الطلب.'});
      }
      return const CreateOrderValidation();
    case 1:
      final categoryId = int.tryParse(draft.categoryId ?? '');
      if (categoryId == null || categoryId < 1) {
        return const CreateOrderValidation(fieldErrors: {'categoryId': 'يرجى اختيار التصنيف.'});
      }
      return const CreateOrderValidation();
    case 2:
      final errors = <String, String>{};
      final title = draft.title.trim();
      if (title.length < 2) errors['title'] = 'عنوان الطلب مطلوب.';
      final description = draft.description.trim();
      if (description.length < 10) errors['description'] = 'الوصف مطلوب (10 أحرف على الأقل).';
      final duration = _parseDuration(draft.durationValue);
      if (duration == null || duration < 1) errors['durationValue'] = 'مدة التنفيذ مطلوبة.';
      return CreateOrderValidation(fieldErrors: errors);
    case 3:
      if (draft.isFixed) {
        final budget = _parseAmount(draft.budget);
        if (budget == null || budget <= 0) {
          return const CreateOrderValidation(fieldErrors: {'budget': 'الميزانية مطلوبة.'});
        }
      } else if (draft.isBidding) {
        final min = _parseAmount(draft.bidBudgetMin);
        final max = _parseAmount(draft.bidBudgetMax);
        final errors = <String, String>{};
        if (min == null || min <= 0) errors['bidBudgetMin'] = 'الحد الأدنى مطلوب.';
        if (max == null || max <= 0) errors['bidBudgetMax'] = 'الحد الأعلى مطلوب.';
        if (min != null && max != null && max < min) {
          errors['bidBudgetMax'] = 'الحد الأعلى يجب أن يكون >= الحد الأدنى.';
        }
        return CreateOrderValidation(fieldErrors: errors);
      }
      return const CreateOrderValidation();
    default:
      return validateCreateOrderDraft(draft);
  }
}

/// Builds API JSON body — never includes userId, status, or payment fields.
Map<String, dynamic> buildCreateOrderPayload(CreateOrderDraft draft) {
  final validation = validateCreateOrderDraft(draft);
  if (!validation.isValid) {
    throw ArgumentError('Create order draft is invalid.');
  }

  final categoryId = int.parse(draft.categoryId!);
  final durationValue = _parseDuration(draft.durationValue)!;

  final payload = <String, dynamic>{
    'title': draft.title.trim(),
    'description': draft.description.trim(),
    'categoryId': categoryId,
    'projectType': draft.projectType,
    'durationValue': durationValue,
    'durationUnit': draft.durationUnit,
  };

  final subSubId = int.tryParse(draft.subSubcategoryId ?? '');
  if (subSubId != null && subSubId > 0) {
    payload['subSubcategoryId'] = subSubId;
  }

  if (draft.isFixed) {
    payload['budget'] = _parseAmount(draft.budget);
  } else if (draft.isBidding) {
    payload['bidBudgetMin'] = _parseAmount(draft.bidBudgetMin);
    payload['bidBudgetMax'] = _parseAmount(draft.bidBudgetMax);
  }

  return payload;
}

class CreateOrderResult {
  const CreateOrderResult({
    required this.orderId,
    this.requiresPayment = false,
    this.projectType,
    this.checkoutUrl,
    this.sessionId,
  });

  final String orderId;
  final bool requiresPayment;
  final String? projectType;
  final String? checkoutUrl;
  final String? sessionId;

  bool get isFixed => projectType == 'fixed';

  bool get needsPaymentFlow => requiresPayment || (isFixed && checkoutUrl != null);

  bool get canPayNow => checkoutUrl != null && checkoutUrl!.trim().isNotEmpty;

  factory CreateOrderResult.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is! Map) {
      throw FormatException('استجابة إنشاء الطلب غير متوقعة.');
    }
    final map = Map<String, dynamic>.from(data);
    final order = map['order'];
    if (order is! Map) {
      throw FormatException('استجابة إنشاء الطلب بدون order.');
    }
    final orderMap = Map<String, dynamic>.from(order);
    final requiresPayment = map['requiresPayment'] == true;
    final checkoutUrl = readMapField<String>(map, 'checkoutUrl', 'checkout_url');
    final sessionId = readMapField<String>(map, 'sessionId', 'session_id');

    return CreateOrderResult(
      orderId: readString(orderMap, 'id', 'id'),
      requiresPayment: requiresPayment,
      projectType: readMapField<String>(orderMap, 'projectType', 'project_type'),
      checkoutUrl: checkoutUrl,
      sessionId: sessionId,
    );
  }
}
