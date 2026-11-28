// Localization of SERVER-authored text (API error messages, notification titles/bodies, server
// status labels). The backend emits these in Arabic; in English the app translates them from a
// table generated from the backend sources (exact strings + parameterized templates).
//
// Rule: in English the UI never shows raw Arabic system text. If a server string is unknown the
// caller's localized fallback is shown instead. User-generated content must not be passed here.

import 'i18n.dart';
import 'server_strings_en.dart';

final RegExp _arabic = RegExp(r'[؀-ۿ]');

bool containsArabic(String text) => _arabic.hasMatch(text);

/// Translates one server-authored string for the current language.
///
/// Arabic: returned unchanged. English: exact match → template match → [fallback] → the text itself
/// when it has no Arabic at all (e.g. an English server message or a code).
String localizeServerText(String text, {String? fallback}) {
  if (!AppI18n.isEnglish) return text;
  final t = text.trim();
  if (t.isEmpty || !containsArabic(t)) return text;
  final exact = serverStringsEn[t] ?? serverStringsEn[_normalize(t)];
  if (exact != null) return exact;
  for (final tpl in serverTemplatesEn) {
    final m = tpl.pattern.firstMatch(t);
    if (m == null) continue;
    var out = tpl.english;
    for (var i = 0; i < m.groupCount; i++) {
      final value = m.group(i + 1) ?? '';
      // A captured value that is itself system text (e.g. a status label) is translated too.
      final translated = containsArabic(value) ? (serverStringsEn[value.trim()] ?? value) : value;
      out = out.replaceAll('{$i}', translated);
    }
    if (!containsArabic(out)) return out;
  }
  return fallback ?? text;
}

/// Same as [localizeServerText] but returns null when no English rendering exists.
String? tryLocalizeServerText(String text) {
  if (!AppI18n.isEnglish) return text;
  final out = localizeServerText(text, fallback: '\u0000');
  return out == '\u0000' ? null : out;
}

String _normalize(String s) => s.replaceAll(RegExp(r'\s+'), ' ').replaceAll('ـ', '');

class ServerTemplate {
  const ServerTemplate(this.source, this.english);

  /// Arabic template with `{0}`, `{1}` … placeholders (from backend template literals).
  final String source;
  final String english;

  RegExp get pattern => _patterns.putIfAbsent(source, () {
        final parts = source.split(RegExp(r'\{\d+\}'));
        final body = parts.map(RegExp.escape).join(r'(.+?)');
        return RegExp('^$body\$', dotAll: true);
      });

  static final Map<String, RegExp> _patterns = {};
}
