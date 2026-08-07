import '../../../core/network/json_helpers.dart';

/// Public popup ad from GET /public/popup-ads.
class PopupAd {
  const PopupAd({
    required this.id,
    this.titleAr,
    this.titleEn,
    this.bodyAr,
    this.bodyEn,
    this.imageUrl,
    this.ctaText,
    this.ctaUrl,
    this.openInNewTab = true,
    this.frequency = 'session',
    this.audience = 'all',
    this.pageScope = 'all',
  });

  final String id;
  final String? titleAr;
  final String? titleEn;
  final String? bodyAr;
  final String? bodyEn;
  final String? imageUrl;
  final String? ctaText;
  final String? ctaUrl;
  final bool openInNewTab;
  final String frequency;
  final String audience;
  final String pageScope;

  String get titleArPreferred =>
      (titleAr?.trim().isNotEmpty == true) ? titleAr!.trim() : (titleEn?.trim() ?? '');

  String get bodyArPreferred =>
      (bodyAr?.trim().isNotEmpty == true) ? bodyAr!.trim() : (bodyEn?.trim() ?? '');

  factory PopupAd.fromJson(Map<String, dynamic> json) {
    final imageRaw = _nullableTrim(readString(json, 'imageUrl', 'image_url'));
    return PopupAd(
      id: readString(json, 'id', 'id'),
      titleAr: _nullableTrim(readString(json, 'titleAr', 'title_ar')),
      titleEn: _nullableTrim(readString(json, 'titleEn', 'title_en')),
      bodyAr: _nullableTrim(readString(json, 'bodyAr', 'body_ar')),
      bodyEn: _nullableTrim(readString(json, 'bodyEn', 'body_en')),
      imageUrl: imageRaw == null ? null : resolveBackendAssetUrl(imageRaw),
      ctaText: _nullableTrim(readString(json, 'ctaText', 'cta_text')),
      ctaUrl: _nullableTrim(readString(json, 'ctaUrl', 'cta_url')),
      openInNewTab: readBool(json, 'openInNewTab', 'open_in_new_tab', fallback: true),
      frequency: readString(json, 'frequency', 'frequency', fallback: 'session'),
      audience: readString(json, 'audience', 'audience', fallback: 'all'),
      pageScope: readString(json, 'pageScope', 'page_scope', fallback: 'all'),
    );
  }
}

String? _nullableTrim(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}
