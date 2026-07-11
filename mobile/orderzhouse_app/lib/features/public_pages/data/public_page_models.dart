import '../../../core/network/json_helpers.dart';

class PublicSitePage {
  const PublicSitePage({
    required this.slug,
    required this.title,
    this.menuLabel,
    this.content = '',
    this.metaTitle,
    this.metaDescription,
  });

  final String slug;
  final String title;
  final String? menuLabel;
  final String content;
  final String? metaTitle;
  final String? metaDescription;

  List<String> get paragraphs {
    final text = content.trim();
    if (text.isEmpty) return const [];
    return text.split(RegExp(r'\n\s*\n')).map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
  }

  factory PublicSitePage.fromJson(Map<String, dynamic> json) {
    return PublicSitePage(
      slug: readString(json, 'slug', 'slug'),
      title: readString(json, 'title', 'title'),
      menuLabel: readMapField<String>(json, 'menuLabel', 'menu_label'),
      content: readString(json, 'content', 'content'),
      metaTitle: readMapField<String>(json, 'metaTitle', 'meta_title'),
      metaDescription: readMapField<String>(json, 'metaDescription', 'meta_description'),
    );
  }

  factory PublicSitePage.fromResponse(Map<String, dynamic> json) {
    final data = json['data'];
    if (data is Map) {
      final map = Map<String, dynamic>.from(data);
      final page = map['page'];
      if (page is Map) {
        return PublicSitePage.fromJson(Map<String, dynamic>.from(page));
      }
    }
    throw const FormatException('Missing page in response');
  }
}
