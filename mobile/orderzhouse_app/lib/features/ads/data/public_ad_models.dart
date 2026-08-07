import '../../../core/network/json_helpers.dart';

/// Public banner/carousel ad from GET /public/ads.
class PublicAd {
  const PublicAd({
    required this.id,
    required this.title,
    this.subtitle,
    this.description,
    this.badgeText,
    this.ctaText,
    this.ctaUrl,
    this.secondaryCtaText,
    this.secondaryCtaUrl,
    this.openInNewTab = true,
    this.images = const [],
    this.placement = 'home_right_panel',
    this.isActive = true,
    this.startDate,
    this.endDate,
  });

  final String id;
  final String title;
  final String? subtitle;
  final String? description;
  final String? badgeText;
  final String? ctaText;
  final String? ctaUrl;
  final String? secondaryCtaText;
  final String? secondaryCtaUrl;
  final bool openInNewTab;
  final List<String> images;
  final String placement;
  final bool isActive;
  final DateTime? startDate;
  final DateTime? endDate;

  String? get primaryImageUrl => images.isEmpty ? null : images.first;

  bool get isCurrentlyVisible {
    if (!isActive) return false;
    final now = DateTime.now();
    if (startDate != null && startDate!.isAfter(now)) return false;
    if (endDate != null && endDate!.isBefore(now)) return false;
    return true;
  }

  factory PublicAd.fromJson(Map<String, dynamic> json) {
    final imagesRaw = json['images'];
    final images = <String>[];
    if (imagesRaw is List) {
      for (final item in imagesRaw) {
        if (item is String && item.trim().isNotEmpty) {
          images.add(resolveBackendAssetUrl(item.trim()));
        } else if (item is Map) {
          final map = Map<String, dynamic>.from(item);
          final url = readString(map, 'url', 'src').trim();
          if (url.isNotEmpty) images.add(resolveBackendAssetUrl(url));
        }
      }
    }

    return PublicAd(
      id: readString(json, 'id', 'id'),
      title: readString(json, 'title', 'title'),
      subtitle: _nullableTrim(readString(json, 'subtitle', 'subtitle')),
      description: _nullableTrim(readString(json, 'description', 'description')),
      badgeText: _nullableTrim(readString(json, 'badgeText', 'badge_text')),
      ctaText: _nullableTrim(readString(json, 'ctaText', 'cta_text')),
      ctaUrl: _nullableTrim(readString(json, 'ctaUrl', 'cta_url')),
      secondaryCtaText: _nullableTrim(readString(json, 'secondaryCtaText', 'secondary_cta_text')),
      secondaryCtaUrl: _nullableTrim(readString(json, 'secondaryCtaUrl', 'secondary_cta_url')),
      openInNewTab: readBool(json, 'openInNewTab', 'open_in_new_tab', fallback: true),
      images: images,
      placement: readString(json, 'placement', 'placement', fallback: 'home_right_panel'),
      isActive: readBool(json, 'isActive', 'is_active', fallback: true),
      startDate: _parseDate(readMapField<dynamic>(json, 'startDate', 'start_date')),
      endDate: _parseDate(readMapField<dynamic>(json, 'endDate', 'end_date')),
    );
  }
}

String? _nullableTrim(String value) {
  final t = value.trim();
  return t.isEmpty ? null : t;
}

DateTime? _parseDate(dynamic raw) {
  if (raw == null) return null;
  return DateTime.tryParse('$raw');
}
