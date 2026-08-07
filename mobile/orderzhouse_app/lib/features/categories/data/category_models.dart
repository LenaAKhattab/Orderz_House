import '../../../core/network/json_helpers.dart';

class ServiceCategory {
  const ServiceCategory({
    required this.id,
    required this.slug,
    required this.name,
    this.nameEn,
    this.description,
    this.imageUrl,
    this.sortOrder = 0,
    this.isServiceCategory = true,
  });

  final String id;
  final String slug;
  final String name;
  final String? nameEn;
  final String? description;
  final String? imageUrl;
  final int sortOrder;
  final bool isServiceCategory;

  String get resolvedImageUrl => resolveBackendAssetUrl(imageUrl);

  factory ServiceCategory.fromJson(Map<String, dynamic> json) {
    return ServiceCategory(
      id: readString(json, 'id', 'id'),
      slug: readString(json, 'slug', 'slug'),
      name: readString(json, 'name', 'name'),
      nameEn: readMapField<String>(json, 'nameEn', 'name_en'),
      description: readMapField<String>(json, 'description', 'description'),
      imageUrl: readMapField<String>(json, 'imageUrl', 'image_url'),
      sortOrder: readInt(json, 'sortOrder', 'sort_order') ?? 0,
      isServiceCategory: readBool(json, 'isServiceCategory', 'is_service_category', fallback: true),
    );
  }

  static List<ServiceCategory> parseList(dynamic data) {
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      if (map['data'] is List) {
        return extractList(map['data']).map(ServiceCategory.fromJson).toList();
      }
    }
    return extractList(data).map(ServiceCategory.fromJson).toList();
  }

  static bool isBrowsable(ServiceCategory c) {
    if (!c.isServiceCategory) return false;
    return c.name.isNotEmpty;
  }
}

class ServiceSubcategory {
  const ServiceSubcategory({
    required this.id,
    required this.name,
    this.slug,
    this.description,
  });

  final String id;
  final String name;
  final String? slug;
  final String? description;

  factory ServiceSubcategory.fromJson(Map<String, dynamic> json) {
    return ServiceSubcategory(
      id: readString(json, 'id', 'id'),
      name: readString(json, 'name', 'name'),
      slug: readMapField<String>(json, 'slug', 'slug'),
      description: readMapField<String>(json, 'description', 'description'),
    );
  }

  static List<ServiceSubcategory> parseList(dynamic data) {
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      return extractList(map['subcategories']).map(ServiceSubcategory.fromJson).toList();
    }
    return extractList(data, nestedKey: 'subcategories').map(ServiceSubcategory.fromJson).toList();
  }
}

class ServiceSubSubcategory {
  const ServiceSubSubcategory({
    required this.id,
    required this.name,
    this.slug,
    this.subcategoryId,
  });

  final String id;
  final String name;
  final String? slug;
  final String? subcategoryId;

  factory ServiceSubSubcategory.fromJson(Map<String, dynamic> json) {
    return ServiceSubSubcategory(
      id: readString(json, 'id', 'id'),
      name: readString(json, 'name', 'name'),
      slug: readMapField<String>(json, 'slug', 'slug'),
      subcategoryId: readMapField<String>(json, 'subcategoryId', 'subcategory_id'),
    );
  }

  static List<ServiceSubSubcategory> parseList(dynamic data) {
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      return extractList(map['subSubcategories']).map(ServiceSubSubcategory.fromJson).toList();
    }
    return extractList(data, nestedKey: 'subSubcategories').map(ServiceSubSubcategory.fromJson).toList();
  }
}

class CategoryWithSubcategories {
  const CategoryWithSubcategories({
    required this.category,
    this.subcategories = const [],
    this.subcategoriesLoading = false,
    this.subcategoriesError,
  });

  final ServiceCategory category;
  final List<ServiceSubcategory> subcategories;
  final bool subcategoriesLoading;
  final String? subcategoriesError;

  CategoryWithSubcategories copyWith({
    List<ServiceSubcategory>? subcategories,
    bool? subcategoriesLoading,
    String? subcategoriesError,
    bool clearSubError = false,
  }) {
    return CategoryWithSubcategories(
      category: category,
      subcategories: subcategories ?? this.subcategories,
      subcategoriesLoading: subcategoriesLoading ?? this.subcategoriesLoading,
      subcategoriesError: clearSubError ? null : (subcategoriesError ?? this.subcategoriesError),
    );
  }
}
