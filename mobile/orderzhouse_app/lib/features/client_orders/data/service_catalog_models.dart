/// Smart Orders S2 — server-driven service catalog (same API and schema as the web).
///
/// The app never bundles a catalog: services, units and fields come from `/catalog/services`.
/// Only the field types below are rendered by the app; the request sends them so the server
/// hides any service that would need an unsupported field (no field is ever silently dropped).
library;

const List<String> kMobileSupportedFieldTypes = [
  'text',
  'textarea',
  'number',
  'decimal',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'date',
  'url',
];

Map<String, String> _stringMap(dynamic raw) {
  if (raw is! Map) return const {};
  final out = <String, String>{};
  raw.forEach((k, v) {
    if (v != null && v.toString().trim().isNotEmpty) out[k.toString()] = v.toString();
  });
  return out;
}

num? _num(dynamic v) => v is num ? v : (v == null ? null : num.tryParse(v.toString()));

/// Localized catalog text: app locale → English → Arabic.
String pickLocalized(Map<String, String> m, String locale) =>
    m[locale] ?? m['en'] ?? m['ar'] ?? '';

class CatalogOption {
  const CatalogOption({required this.value, required this.label});
  final String value;
  final Map<String, String> label;

  factory CatalogOption.fromJson(Map<String, dynamic> j) =>
      CatalogOption(value: j['value']?.toString() ?? '', label: _stringMap(j['label']));
}

class CatalogField {
  const CatalogField({
    required this.key,
    required this.type,
    required this.label,
    this.placeholder = const {},
    this.help = const {},
    this.required = false,
    this.min,
    this.max,
    this.maxLength,
    this.options = const [],
    this.showIfField,
    this.showIfValues = const [],
  });

  final String key;
  final String type;
  final Map<String, String> label;
  final Map<String, String> placeholder;
  final Map<String, String> help;
  final bool required;
  final num? min;
  final num? max;
  final int? maxLength;
  final List<CatalogOption> options;
  final String? showIfField;
  final List<Object> showIfValues;

  factory CatalogField.fromJson(Map<String, dynamic> j) {
    final showIf = j['showIf'];
    return CatalogField(
      key: j['key']?.toString() ?? '',
      type: j['type']?.toString() ?? 'text',
      label: _stringMap(j['label']),
      placeholder: _stringMap(j['placeholder']),
      help: _stringMap(j['help']),
      required: j['required'] == true,
      min: _num(j['min']),
      max: _num(j['max']),
      maxLength: _num(j['maxLength'])?.toInt(),
      options: (j['options'] is List)
          ? (j['options'] as List).whereType<Map>().map((o) => CatalogOption.fromJson(Map<String, dynamic>.from(o))).toList()
          : const [],
      showIfField: showIf is Map ? showIf['field']?.toString() : null,
      showIfValues: showIf is Map && showIf['in'] is List ? List<Object>.from((showIf['in'] as List).whereType<Object>()) : const [],
    );
  }
}

class CatalogQuantity {
  const CatalogQuantity({
    required this.unit,
    this.required = false,
    this.allowUnspecified = false,
    this.decimals = false,
    this.min,
    this.max,
  });
  final String unit;
  final bool required;
  final bool allowUnspecified;
  final bool decimals;
  final num? min;
  final num? max;

  factory CatalogQuantity.fromJson(Map<String, dynamic> j) => CatalogQuantity(
        unit: j['unit']?.toString() ?? 'units',
        required: j['required'] == true,
        allowUnspecified: j['allowUnspecified'] == true,
        decimals: j['decimals'] == true,
        min: _num(j['min']),
        max: _num(j['max']),
      );
}

class CatalogService {
  const CatalogService({
    required this.serviceCode,
    required this.categoryId,
    required this.version,
    required this.name,
    required this.quantity,
    required this.fields,
  });
  final String serviceCode;
  final String categoryId;
  final int version;
  final Map<String, String> name;
  final CatalogQuantity quantity;
  final List<CatalogField> fields;

  bool get mobileRenderable => fields.every((f) => kMobileSupportedFieldTypes.contains(f.type));

  factory CatalogService.fromJson(Map<String, dynamic> j) => CatalogService(
        serviceCode: j['serviceCode']?.toString() ?? '',
        categoryId: j['categoryId']?.toString() ?? '',
        version: _num(j['version'])?.toInt() ?? 1,
        name: _stringMap(j['name']),
        quantity: CatalogQuantity.fromJson(j['quantity'] is Map ? Map<String, dynamic>.from(j['quantity'] as Map) : const {}),
        fields: (j['fields'] is List)
            ? (j['fields'] as List).whereType<Map>().map((f) => CatalogField.fromJson(Map<String, dynamic>.from(f))).toList()
            : const [],
      );
}

class ServiceCatalog {
  const ServiceCatalog({required this.catalogVersion, required this.services});
  final String catalogVersion;
  final List<CatalogService> services;

  static const empty = ServiceCatalog(catalogVersion: '', services: []);

  /// Defensive: even if the server returned an unsupported service, the app never shows it.
  factory ServiceCatalog.fromResponse(Map<String, dynamic> body) {
    final data = body['data'] is Map ? Map<String, dynamic>.from(body['data'] as Map) : body;
    final list = (data['services'] is List)
        ? (data['services'] as List).whereType<Map>().map((s) => CatalogService.fromJson(Map<String, dynamic>.from(s))).toList()
        : <CatalogService>[];
    return ServiceCatalog(
      catalogVersion: data['catalogVersion']?.toString() ?? '',
      services: list.where((s) => s.serviceCode.isNotEmpty && s.mobileRenderable).toList(),
    );
  }

  List<CatalogService> forCategory(String? categoryId) =>
      services.where((s) => s.categoryId == categoryId).toList();
}

/// Quantity unit labels (same codes as web `smartOrders.units.*`).
const Map<String, Map<String, String>> kUnitLabels = {
  'pages': {'ar': 'صفحات', 'en': 'pages'},
  'words': {'ar': 'كلمات', 'en': 'words'},
  'documents': {'ar': 'مستندات', 'en': 'documents'},
  'slides': {'ar': 'شرائح', 'en': 'slides'},
  'worksheets': {'ar': 'أوراق عمل', 'en': 'worksheets'},
  'files': {'ar': 'ملفات', 'en': 'files'},
  'dashboards': {'ar': 'لوحات', 'en': 'dashboards'},
  'concepts': {'ar': 'نماذج / مفاهيم', 'en': 'concepts'},
  'designs': {'ar': 'تصاميم', 'en': 'designs'},
  'screens': {'ar': 'شاشات', 'en': 'screens'},
  'features': {'ar': 'ميزات', 'en': 'features'},
  'projects': {'ar': 'مشاريع', 'en': 'projects'},
  'minutes': {'ar': 'دقائق', 'en': 'minutes'},
  'clips': {'ar': 'مقاطع', 'en': 'clips'},
  'posts': {'ar': 'منشورات', 'en': 'posts'},
  'campaigns': {'ar': 'حملات', 'en': 'campaigns'},
  'hours': {'ar': 'ساعات', 'en': 'hours'},
  'units': {'ar': 'وحدات', 'en': 'units'},
};

String unitLabel(String unit, String locale) {
  final m = kUnitLabels[unit];
  if (m == null) return unit;
  return m[locale] ?? m['ar'] ?? unit;
}

/// Field error messages (server reason codes → AR/EN text).
const Map<String, Map<String, String>> kServiceFormErrors = {
  'required': {'ar': 'هذا الحقل مطلوب.', 'en': 'This field is required.'},
  'invalid': {'ar': 'القيمة غير صالحة.', 'en': 'Invalid value.'},
  'invalid_number': {'ar': 'أدخل رقمًا صالحًا.', 'en': 'Enter a valid number.'},
  'below_min': {'ar': 'القيمة أقل من الحد الأدنى.', 'en': 'The value is below the minimum.'},
  'above_max': {'ar': 'القيمة أعلى من الحد الأقصى.', 'en': 'The value is above the maximum.'},
  'too_long': {'ar': 'النص أطول من المسموح.', 'en': 'The text is too long.'},
  'invalid_option': {'ar': 'اختر خيارًا من القائمة.', 'en': 'Choose an option from the list.'},
  'invalid_date': {'ar': 'أدخل تاريخًا صالحًا.', 'en': 'Enter a valid date.'},
  'invalid_url': {'ar': 'أدخل رابطًا صالحًا يبدأ بـ https://', 'en': 'Enter a valid link starting with https://'},
  'unspecified_not_allowed': {'ar': 'حدد الكمية لهذه الخدمة.', 'en': 'Enter a quantity for this service.'},
};

String serviceFormErrorText(String reason, String locale) {
  final m = kServiceFormErrors[reason] ?? kServiceFormErrors['invalid']!;
  return m[locale] ?? m['ar']!;
}
