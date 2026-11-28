// App localization (Arabic default, English).
//
// UI strings are written in Arabic in source and wrapped in `tr(...)` / `trf(...)`; the Arabic text
// is the lookup key into the generated English table (`strings_en.dart`). This keeps the Arabic
// copy reviewable in place, works outside widgets (models, validators, status helpers) and lets a
// static test enforce that every wrapped string has an English translation.
//
// Server-authored text (API errors, notifications) goes through `server_text.dart`.
// User-generated content (titles, descriptions, messages) is never passed through these helpers.

import 'strings_en.dart';

enum AppLanguage {
  ar('ar'),
  en('en');

  const AppLanguage(this.code);

  final String code;

  static AppLanguage fromCode(String? code) => code == 'en' ? AppLanguage.en : AppLanguage.ar;
}

class AppI18n {
  AppI18n._();

  static AppLanguage _language = AppLanguage.ar;

  static AppLanguage get language => _language;

  static bool get isEnglish => _language == AppLanguage.en;

  /// Only [LanguageController] should call this (it also persists and rebuilds the app).
  static void setLanguage(AppLanguage language) => _language = language;
}

/// Translate a fixed Arabic UI string.
String tr(String ar) {
  if (!AppI18n.isEnglish) return ar;
  return appStringsEn[ar] ?? ar;
}

/// Translate an Arabic template with positional placeholders `{0}`, `{1}` …
String trf(String ar, List<Object?> args) {
  var out = tr(ar);
  for (var i = 0; i < args.length; i++) {
    out = out.replaceAll('{$i}', '${args[i] ?? ''}');
  }
  return out;
}
