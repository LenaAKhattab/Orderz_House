// Bilingual SYSTEM content stored by the platform (categories, popup copy, CMS pages): Arabic in the
// base field, English in the `*_en` field. The web uses the same columns for its Arabic / English UI.
// User-generated content (order titles, descriptions, messages, names) is never routed through here.

import 'i18n.dart';
import 'server_text.dart';

/// Arabic: [ar] (falls back to [en]). English: [en] when present, otherwise [ar] only if it has no
/// Arabic script (e.g. a brand or a code); a name must never render blank, so [ar] is the last resort.
String localizedContent(String ar, String? en) {
  final e = en?.trim() ?? '';
  if (!AppI18n.isEnglish) return ar.trim().isNotEmpty ? ar : e;
  if (e.isNotEmpty) return e;
  return ar;
}

/// Optional copy (descriptions, popup bodies): in English, Arabic-only copy is omitted (null) so the
/// screen never mixes languages.
String? localizedOptionalContent(String? ar, String? en) {
  final a = ar?.trim() ?? '';
  final e = en?.trim() ?? '';
  if (!AppI18n.isEnglish) return a.isNotEmpty ? a : (e.isNotEmpty ? e : null);
  if (e.isNotEmpty) return e;
  if (a.isNotEmpty && !containsArabic(a)) return a;
  return null;
}
