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

const Map<String, String> kCurrencyLabels = {
  'JOD': 'د.أ',
  'SAR': 'ر.س',
  'AED': 'د.إ',
  'QAR': 'ر.ق',
  'KWD': 'د.ك',
  'BHD': 'د.ب',
  'OMR': 'ر.ع',
  'EGP': 'ج.م',
  'USD': 'USD',
  'EUR': 'EUR',
  'GBP': 'GBP',
};

const String kPreferredDisplayCurrencyStorageKey = 'orderzhouse_preferred_display_currency';

const String kDisplayDisclaimer = 'القيمة تقريبية حسب سعر الصرف الحالي.';
const String kOfficialCurrencyCopy = 'العملة الرسمية المعتمدة داخل Orderz House هي الدينار الأردني.';
const String kIndicativeCopy = 'القيمة المحوّلة إرشادية فقط ولا تعتبر سعرًا نهائيًا أو التزامًا ماليًا.';
const String kPreferenceLabel = 'العملة التقريبية المفضلة';
const String kPreferenceHint = 'تُستخدم هذه العملة للعرض فقط، بينما تبقى جميع الحسابات بالدينار الأردني.';

class ManualPreferenceOption {
  const ManualPreferenceOption(this.value, this.label);
  final String value;
  final String label;
}

const List<ManualPreferenceOption> kManualPreferenceOptions = [
  ManualPreferenceOption('auto', 'تلقائي حسب الدولة'),
  ManualPreferenceOption('USD', 'USD'),
  ManualPreferenceOption('SAR', 'ر.س (SAR)'),
  ManualPreferenceOption('AED', 'د.إ (AED)'),
  ManualPreferenceOption('QAR', 'ر.ق (QAR)'),
  ManualPreferenceOption('KWD', 'د.ك (KWD)'),
  ManualPreferenceOption('BHD', 'د.ب (BHD)'),
  ManualPreferenceOption('OMR', 'ر.ع (OMR)'),
  ManualPreferenceOption('EGP', 'ج.م (EGP)'),
  ManualPreferenceOption('EUR', 'EUR'),
  ManualPreferenceOption('GBP', 'GBP'),
  ManualPreferenceOption('JOD', 'د.أ (JOD)'),
];
