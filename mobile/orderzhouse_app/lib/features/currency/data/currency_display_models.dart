import '../../../core/i18n/i18n.dart';
import '../../../core/money/display_currencies.dart';

class CurrencyDisplaySettings {
  const CurrencyDisplaySettings({
    this.baseCurrency = kBaseCurrency,
    this.displayCurrency = kBaseCurrency,
    this.rate,
    this.detectedCountry,
    this.source = 'fallback',
    String? disclaimer,
    String? officialCurrencyCopy,
    String? indicativeCopy,
  })  : _disclaimer = disclaimer,
        _officialCurrencyCopy = officialCurrencyCopy,
        _indicativeCopy = indicativeCopy;

  final String baseCurrency;
  final String displayCurrency;
  final double? rate;
  final String? detectedCountry;
  final String source;
  // Server copy is Arabic; English uses the app's localized copy (no mixed-language UI).
  final String? _disclaimer;
  final String? _officialCurrencyCopy;
  final String? _indicativeCopy;

  String get disclaimer => AppI18n.isEnglish ? kDisplayDisclaimer : (_disclaimer ?? kDisplayDisclaimer);
  String get officialCurrencyCopy =>
      AppI18n.isEnglish ? kOfficialCurrencyCopy : (_officialCurrencyCopy ?? kOfficialCurrencyCopy);
  String get indicativeCopy => AppI18n.isEnglish ? kIndicativeCopy : (_indicativeCopy ?? kIndicativeCopy);

  static const jodOnly = CurrencyDisplaySettings();

  factory CurrencyDisplaySettings.fromResponse(dynamic body) {
    Map<String, dynamic>? row;
    if (body is Map<String, dynamic>) {
      final data = body['data'];
      if (data is Map<String, dynamic>) {
        row = data;
      } else if (data is Map) {
        row = Map<String, dynamic>.from(data);
      } else {
        row = body;
      }
    } else if (body is Map) {
      final map = Map<String, dynamic>.from(body);
      final data = map['data'];
      if (data is Map) {
        row = Map<String, dynamic>.from(data);
      } else {
        row = map;
      }
    }
    if (row == null) return jodOnly;
    final display = (row['displayCurrency'] ?? kBaseCurrency).toString().toUpperCase();
    final rateRaw = row['rate'];
    final rate = rateRaw is num ? rateRaw.toDouble() : double.tryParse('$rateRaw');
    return CurrencyDisplaySettings(
      baseCurrency: (row['baseCurrency'] ?? kBaseCurrency).toString().toUpperCase(),
      displayCurrency: display,
      rate: rate != null && rate > 0 ? rate : null,
      detectedCountry: row['detectedCountry']?.toString(),
      source: row['source']?.toString() ?? 'fallback',
      disclaimer: row['disclaimer']?.toString(),
      officialCurrencyCopy: row['officialCurrencyCopy']?.toString(),
      indicativeCopy: row['indicativeCopy']?.toString(),
    );
  }
}
