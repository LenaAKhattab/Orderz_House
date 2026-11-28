import '../../../core/i18n/content_text.dart';
import '../../../core/network/json_helpers.dart';

class PublicSitePage {
  const PublicSitePage({
    required this.slug,
    required String title,
    String? menuLabel,
    String content = '',
    this.metaTitle,
    this.metaDescription,
    this.titleEn,
    this.menuLabelEn,
    this.contentEn,
  })  : titleAr = title,
        menuLabelAr = menuLabel,
        contentAr = content;

  final String slug;
  final String titleAr;
  final String? menuLabelAr;
  final String contentAr;
  final String? metaTitle;
  final String? metaDescription;
  // English CMS copy (same columns the web uses for its English UI).
  final String? titleEn;
  final String? menuLabelEn;
  final String? contentEn;

  String get title => localizedContent(titleAr, titleEn);
  String? get menuLabel => localizedOptionalContent(menuLabelAr, menuLabelEn);
  String get content => localizedOptionalContent(contentAr, contentEn) ?? '';

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
      titleEn: readMapField<String>(json, 'titleEn', 'title_en'),
      menuLabelEn: readMapField<String>(json, 'menuLabelEn', 'menu_label_en'),
      contentEn: readMapField<String>(json, 'contentEn', 'content_en'),
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
