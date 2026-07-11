/// User-facing app branding (Phase 5B). Package name stays `orderzhouse_app`.
abstract final class AppBranding {
  static const displayNameAr = 'أوردرز هاوس';
  static const displayNameEn = 'Orderz House';
  static const versionLabel = '1.0.0';
  static const buildNumber = '1';

  static const aboutBody =
      '$displayNameAr\nالإصدار $versionLabel\n\nمنصة لإدارة الطلبات بين العملاء والمستقلين.';

  /// Temporary in-repo icon until official brand assets arrive (Phase 5B).
  static const temporaryIconNote =
      'Temporary OH mark — replace with official logo when brand assets are ready.';
}
