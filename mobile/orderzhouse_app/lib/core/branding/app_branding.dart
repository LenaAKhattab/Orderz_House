/// User-facing app branding (Phase 5B). Package name stays `orderzhouse_app`.
abstract final class AppBranding {
  static const displayNameAr = 'أوردرز هاوس';
  static const displayNameEn = 'Orderz House';
  /// Wordmark under the logo on splash / auth headers.
  static const markWordmark = 'ORDERZHOUSE';
  static const versionLabel = '8.1.4';
  static const buildNumber = '8107';

  /// Official mark synced from `frontend/public/logo.png`.
  static const logoAsset = 'assets/branding/company_logo.png';

  /// Full vertical logo (mark + Arabic wordmark + tagline) from `frontend/public/hero/fullLogp.png`.
  static const fullLogoAsset = 'assets/branding/full_logo.png';

  static const aboutBody =
      '$displayNameAr\nالإصدار $versionLabel\n\nمنصة لإدارة الطلبات بين العملاء والمستقلين.';

  /// Public marketing website (always production — not the local Vite URL).
  static const publicWebsiteUrl = 'https://orderzhouse.com/';

  /// Support WhatsApp — E.164 without `+` for `wa.me` links.
  static const supportWhatsappE164 = '962791433341';
  static const supportWhatsappDisplay = '+962 7 9143 3341';
  static const whatsappContactUrl = 'https://wa.me/$supportWhatsappE164';
}
