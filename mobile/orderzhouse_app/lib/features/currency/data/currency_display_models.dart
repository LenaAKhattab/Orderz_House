import '../../../core/money/display_currencies.dart';

class CurrencyDisplaySettings {
  const CurrencyDisplaySettings({
    this.baseCurrency = kBaseCurrency,
    this.displayCurrency = kBaseCurrency,
    this.rate,
    this.detectedCountry,
    this.source = 'fallback',
    this.disclaimer = kDisplayDisclaimer,
    this.officialCurrencyCopy = kOfficialCurrencyCopy,
    this.indicativeCopy = kIndicativeCopy,
  });

  final String baseCurrency;
  final String displayCurrency;
  final double? rate;
  final String? detectedCountry;
  final String source;
  final String disclaimer;
  final String officialCurrencyCopy;
  final String indicativeCopy;

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
      disclaimer: row['disclaimer']?.toString() ?? kDisplayDisclaimer,
      officialCurrencyCopy: row['officialCurrencyCopy']?.toString() ?? kOfficialCurrencyCopy,
      indicativeCopy: row['indicativeCopy']?.toString() ?? kIndicativeCopy,
    );
  }
}
