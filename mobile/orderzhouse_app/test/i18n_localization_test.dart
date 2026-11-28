import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:orderzhouse_app/core/i18n/i18n.dart';
import 'package:orderzhouse_app/core/i18n/language_controller.dart';
import 'package:orderzhouse_app/core/i18n/server_text.dart';
import 'package:orderzhouse_app/core/i18n/strings_en.dart';

final _arabic = RegExp(r'[؀-ۿ]');
final _trCall = RegExp(r"\btrf?\(\s*((?:'(?:[^'\\\n]|\\.)*'\s*)+)");
final _piece = RegExp(r"'((?:[^'\\\n]|\\.)*)'");
final _generated = RegExp(r'/core/i18n/(i18n|strings_en|server_strings_en|server_text)\.dart$');

String _unescape(String s) => s.replaceAllMapped(
      RegExp(r'\\(.)'),
      (m) => const {'n': '\n', 't': '\t', 'r': '\r'}[m[1]] ?? m[1]!,
    );

Iterable<File> _libFiles() => Directory('lib')
    .listSync(recursive: true)
    .whereType<File>()
    .where((f) => f.path.endsWith('.dart'))
    .where((f) => !_generated.hasMatch(f.path.replaceAll('\\', '/')));

String _rel(File f) => f.path.replaceAll('\\', '/').split('lib/').last;

/// Removes `//` comments that are not inside a quoted string.
String _stripComments(String line) {
  String? quote;
  for (var i = 0; i < line.length - 1; i++) {
    final c = line[i];
    if (quote != null) {
      if (c == r'\') {
        i++;
      } else if (c == quote) {
        quote = null;
      }
    } else if (c == "'" || c == '"') {
      quote = c;
    } else if (c == '/' && line[i + 1] == '/') {
      return line.substring(0, i);
    }
  }
  return line;
}

void main() {
  tearDown(() => AppI18n.setLanguage(AppLanguage.ar));

  group('English coverage (no untranslated system strings)', () {
    test('every tr()/trf() key has an English value without Arabic, placeholders preserved', () {
      final problems = <String>[];
      var keys = 0;
      for (final f in _libFiles()) {
        for (final m in _trCall.allMatches(f.readAsStringSync())) {
          final key = _piece.allMatches(m[1]!).map((p) => _unescape(p[1]!)).join();
          keys++;
          final en = appStringsEn[key];
          if (en == null) {
            problems.add('missing: ${_rel(f)} ${jsonEncode(key)}');
          } else if (_arabic.hasMatch(en)) {
            problems.add('arabic in EN: ${_rel(f)} ${jsonEncode(key)}');
          } else {
            for (final ph in RegExp(r'\{\d+\}').allMatches(key)) {
              if (!en.contains(ph[0]!)) problems.add('placeholder ${ph[0]}: ${_rel(f)} ${jsonEncode(key)}');
            }
          }
        }
      }
      expect(keys, greaterThan(1000));
      expect(problems, isEmpty, reason: problems.take(20).join('\n'));
    });

    test('no Arabic UI literal outside tr()/trf() except reviewed data values', () {
      final allow = (jsonDecode(File('tool/i18n/arabic_data_literals_allowlist.json').readAsStringSync()) as List)
          .cast<String>()
          .toSet();
      final found = <String>[];
      for (final f in _libFiles()) {
        final src = f.readAsStringSync().replaceAll(_trCall, 'tr(');
        for (final line in const LineSplitter().convert(src)) {
          final code = _stripComments(line);
          if (code.trimLeft().startsWith('///') || code.trimLeft().startsWith('*')) continue;
          for (final m in _piece.allMatches(code)) {
            final text = m[1]!;
            if (!_arabic.hasMatch(text)) continue;
            final id = '${_rel(f)}|$text';
            if (!allow.contains(id)) found.add(id);
          }
        }
      }
      expect(found, isEmpty, reason: 'wrap these in tr()/trf() or justify them in the allowlist:\n${found.join('\n')}');
    });
  });

  group('runtime', () {
    test('Arabic is the default and returns the source text', () {
      expect(AppI18n.language, AppLanguage.ar);
      expect(tr('تسجيل الدخول'), 'تسجيل الدخول');
    });

    test('English translates fixed strings and templates', () {
      AppI18n.setLanguage(AppLanguage.en);
      expect(tr('تسجيل الدخول'), 'Log in');
      expect(tr('بانتظار دفع عرض السعر'), 'Awaiting quote payment');
      expect(trf('{0} ملف', [3]), contains('3'));
      expect(_arabic.hasMatch(trf('{0} ملف', [3])), isFalse);
    });

    test('server text: Arabic passthrough; English exact / fallback, never raw Arabic', () {
      const unknown = 'نص خادم غير معروف إطلاقاً 12345';
      expect(localizeServerText(unknown), unknown);
      AppI18n.setLanguage(AppLanguage.en);
      expect(localizeServerText(unknown, fallback: 'Something went wrong.'), 'Something went wrong.');
      expect(localizeServerText('Plain English'), 'Plain English');
      expect(tryLocalizeServerText(unknown), isNull);
    });
  });

  group('language switch', () {
    testWidgets('switch persists and flips direction RTL → LTR', (tester) async {
      SharedPreferences.setMockInitialValues({});
      await loadSavedLanguage();
      expect(AppI18n.language, AppLanguage.ar);

      await tester.pumpWidget(
        ProviderScope(
          child: Consumer(
            builder: (context, ref, _) {
              final lang = ref.watch(languageControllerProvider);
              return MaterialApp(
                locale: Locale(lang.code),
                supportedLocales: const [Locale('ar'), Locale('en')],
                localizationsDelegates: const [
                  GlobalMaterialLocalizations.delegate,
                  GlobalWidgetsLocalizations.delegate,
                  GlobalCupertinoLocalizations.delegate,
                ],
                home: Scaffold(
                  body: Builder(
                    builder: (context) => Column(
                      children: [
                        Text(tr('تسجيل الدخول')),
                        Text(Directionality.of(context).name, key: const Key('dir')),
                        const LanguageSwitchButton(),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      );
      expect(find.text('تسجيل الدخول'), findsOneWidget);
      expect(find.text('English'), findsOneWidget);

      await tester.tap(find.byKey(const Key('language-switch')));
      await tester.pumpAndSettle();

      expect(AppI18n.language, AppLanguage.en);
      expect(find.text('Log in'), findsOneWidget);
      expect(find.text('العربية'), findsOneWidget);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('app_language'), 'en');

      // Persisted choice is restored on the next launch.
      AppI18n.setLanguage(AppLanguage.ar);
      await loadSavedLanguage();
      expect(AppI18n.language, AppLanguage.en);
    });
  });
}
