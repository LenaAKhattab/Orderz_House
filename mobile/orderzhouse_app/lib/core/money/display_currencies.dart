import '../i18n/i18n.dart';
const String kBaseCurrency = 'JOD';

const List<String> kSupportedDisplayCurrencies = [
  'JOD',
  'USD',
  'SAR',
  'AED',
  'QAR',
  'KWD',
  'BHD',
  'OMR',
  'EGP',
  'EUR',
  'GBP',
];

Map<String, String> get kCurrencyLabels => {
  'JOD': tr('د.أ'),
  'SAR': tr('ر.س'),
  'AED': tr('د.إ'),
  'QAR': tr('ر.ق'),
  'KWD': tr('د.ك'),
  'BHD': tr('د.ب'),
  'OMR': tr('ر.ع'),
  'EGP': tr('ج.م'),
  'USD': 'USD',
  'EUR': 'EUR',
  'GBP': 'GBP',
};

const String kPreferredDisplayCurrencyStorageKey = 'orderzhouse_preferred_display_currency';

String get kDisplayDisclaimer => tr('القيمة تقريبية حسب سعر الصرف الحالي.');
String get kOfficialCurrencyCopy => tr('العملة الرسمية المعتمدة داخل Orderz House هي الدينار الأردني.');
String get kIndicativeCopy => tr('القيمة المحوّلة إرشادية فقط ولا تعتبر سعرًا نهائيًا أو التزامًا ماليًا.');
String get kPreferenceLabel => tr('العملة التقريبية المفضلة');
String get kPreferenceHint => tr('تُستخدم هذه العملة للعرض فقط، بينما تبقى جميع الحسابات بالدينار الأردني.');

class ManualPreferenceOption {
  const ManualPreferenceOption(this.value, this.label);
  final String value;
  final String label;
}

List<ManualPreferenceOption> get kManualPreferenceOptions => [
  ManualPreferenceOption('auto', tr('تلقائي حسب الدولة')),
  ManualPreferenceOption('USD', 'USD'),
  ManualPreferenceOption('SAR', tr('ر.س (SAR)')),
  ManualPreferenceOption('AED', tr('د.إ (AED)')),
  ManualPreferenceOption('QAR', tr('ر.ق (QAR)')),
  ManualPreferenceOption('KWD', tr('د.ك (KWD)')),
  ManualPreferenceOption('BHD', tr('د.ب (BHD)')),
  ManualPreferenceOption('OMR', tr('ر.ع (OMR)')),
  ManualPreferenceOption('EGP', tr('ج.م (EGP)')),
  ManualPreferenceOption('EUR', 'EUR'),
  ManualPreferenceOption('GBP', 'GBP'),
  ManualPreferenceOption('JOD', tr('د.أ (JOD)')),
];
